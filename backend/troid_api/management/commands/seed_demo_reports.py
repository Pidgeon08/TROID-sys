import math
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from troid_api.models import Boat, CollectionArea, DeploymentSchedule, Operator, PriorityArea, Request
from troid_api.priority import check_and_schedule_priority_followup

DEMO_MARKER = '[DEMO DATA]'
DEMO_SUBMITTER = 'Demo Barangay Officer'

TRASH_CATEGORIES = ['Plastic', 'Metal', 'Glass', 'Paper/Cardboard', 'Organic/Biodegradable', 'Other']

# Approximate barangay centers within San Fernando, La Union, spread out enough that
# each polygon (and its heatmap marker) lands in a visually distinct spot on the map.
BARANGAY_CENTERS = {
    'Carlatan': (16.6400, 120.3160),
    'Catbangen': (16.6280, 120.3200),
    'Biday': (16.6338, 120.3275),
    'Poro': (16.6150, 120.3100),
    'San Vicente': (16.6450, 120.3300),
    'Pagdaraoan': (16.6100, 120.3250),
}

# Weighted so most demo requests land in the statuses Reports.jsx actually counts
# (anything with a filed trash report), with a handful still in-flight for variety.
STATUS_WEIGHTS = [
    ('verified', 55),
    ('completed', 15),
    ('segregated', 10),
    ('approved', 12),
    ('pending_mayor_approval', 8),
]


def weighted_status():
    statuses, weights = zip(*STATUS_WEIGHTS)
    return random.choices(statuses, weights=weights, k=1)[0]


def random_trash_categories():
    picked = random.sample(TRASH_CATEGORIES, k=random.randint(3, len(TRASH_CATEGORIES)))
    return {cat: random.randint(2, 18) for cat in picked}


def random_polygon(center_lat, center_lng, radius=0.0035):
    """A jittered, roughly-circular polygon around a center point — same shape of data
    the barangay-side "draw an area" tool produces (a list of [lat, lng] pairs)."""
    n_points = random.randint(4, 6)
    points = []
    for i in range(n_points):
        angle = (2 * math.pi * i / n_points) + random.uniform(-0.2, 0.2)
        r = radius * random.uniform(0.6, 1.0)
        points.append([
            round(center_lat + r * random.uniform(0.8, 1.2) * math.cos(angle), 6),
            round(center_lng + r * random.uniform(0.8, 1.2) * math.sin(angle), 6),
        ])
    return points


class Command(BaseCommand):
    help = (
        'Seeds realistic demo cleanup requests (spread across the last N days, with varied '
        'barangays/statuses/trash categories) plus matching Collection Area polygons, so the '
        'Report Generation, Heatmap post-cleanup comparison, and Collection Areas pages all have '
        'real data to work with. Demo rows are tagged so they can be cleared later with --clear.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=50, help='Number of demo requests to create (default: 50)')
        parser.add_argument('--days', type=int, default=60, help='Spread demo requests across the last N days (default: 60)')
        parser.add_argument('--clear', action='store_true', help='Delete previously seeded demo data instead of creating new ones')

    def handle(self, *args, **options):
        if options['clear']:
            deleted_reqs, _ = Request.objects.filter(notes__contains=DEMO_MARKER).delete()
            deleted_areas, _ = CollectionArea.objects.filter(submitted_by=DEMO_SUBMITTER).delete()
            # Priority follow-ups are only identifiable by their generated zone label and by
            # being for one of the demo barangays (the feature has no other data sources yet).
            DeploymentSchedule.objects.filter(zone__endswith=' (Priority Follow-up)').delete()
            deleted_priority, _ = PriorityArea.objects.filter(barangay__in=BARANGAY_CENTERS.keys()).delete()
            self.stdout.write(self.style.SUCCESS(
                f'Removed {deleted_reqs} demo request(s), {deleted_areas} demo collection area(s), '
                f'and {deleted_priority} demo priority-area record(s).'
            ))
            return

        count = options['count']
        days = options['days']

        boats = list(Boat.objects.all())
        operators = list(Operator.objects.all())
        now = timezone.now()

        # One approved collection area per barangay, so completed/verified demo requests have
        # a real polygon to carry — this is what HeatmapView draws on the post-cleanup map.
        areas_by_barangay = {}
        for barangay, (lat, lng) in BARANGAY_CENTERS.items():
            area = CollectionArea.objects.create(
                name=f'{barangay} Cleanup Zone',
                barangay=barangay,
                submitted_by=DEMO_SUBMITTER,
                points=random_polygon(lat, lng),
                closed=True,
                color=random.choice(['#1b4de4', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7']),
                status='approved',
            )
            areas_by_barangay[barangay] = area

        # A couple of areas still in the review workflow, to exercise the Collection Areas
        # admin page's pending/declined states too.
        pending_lat, pending_lng = BARANGAY_CENTERS['Poro']
        CollectionArea.objects.create(
            name='Poro Extension Zone', barangay='Poro', submitted_by=DEMO_SUBMITTER,
            points=random_polygon(pending_lat + 0.006, pending_lng + 0.006), closed=True,
            color='#1b4de4', status='pending',
        )
        declined_lat, declined_lng = BARANGAY_CENTERS['Pagdaraoan']
        CollectionArea.objects.create(
            name='Pagdaraoan Riverside Zone', barangay='Pagdaraoan', submitted_by=DEMO_SUBMITTER,
            points=random_polygon(declined_lat + 0.006, declined_lng - 0.006), closed=True,
            color='#1b4de4', status='declined', decline_reason='Overlaps an existing private easement — resubmit with adjusted boundary.',
            reviewed_by='CENRO Admin',
        )

        created = []
        for _ in range(count):
            barangay = random.choice(list(BARANGAY_CENTERS.keys()))
            status = weighted_status()
            has_report = status in ('verified', 'completed', 'segregated')

            trash_categories = random_trash_categories() if has_report else {}
            bags = sum(trash_categories.values()) if trash_categories else None
            weight_kg = round(bags * random.uniform(3.0, 6.5), 1) if bags else None
            non_usable_kg = round(weight_kg * random.uniform(0.3, 0.5), 1) if weight_kg else None
            recyclable_kg = round(weight_kg - non_usable_kg, 1) if weight_kg and non_usable_kg else None

            verified_categories = {}
            if status == 'verified':
                verified_categories = {
                    cat: max(0, count_ + random.randint(-2, 2))
                    for cat, count_ in trash_categories.items()
                }

            bot = random.choice(boats) if boats and has_report else None
            lat, lng = BARANGAY_CENTERS[barangay]

            req = Request.objects.create(
                request_type='Cleanup',
                status=status,
                requested_by_name=DEMO_SUBMITTER,
                requested_by_role='barangay',
                requested_by_barangay=barangay,
                contact='0900-000-0000',
                location_name=f'{barangay} Creek',
                barangay=barangay,
                municipality='San Fernando',
                province='La Union',
                notes=f'{DEMO_MARKER} Seeded for report preview.',
                bot_id=bot,
                operator=random.choice(operators) if operators and has_report else None,
                collection_area=areas_by_barangay[barangay] if has_report else None,
                bags=bags,
                weight_kg=weight_kg,
                non_usable_kg=non_usable_kg,
                recyclable_kg=recyclable_kg,
                trash_categories=trash_categories,
                verified_categories=verified_categories,
            )

            # A bot that worked this request should be sitting somewhere near its collection
            # area's polygon, not wherever it last happened to be — keeps the live heatmap and
            # bot-tracking map from showing markers scattered outside San Fernando.
            if bot and has_report:
                Boat.objects.filter(pk=bot.pk).update(
                    last_latitude=round(lat + random.uniform(-0.002, 0.002), 6),
                    last_longitude=round(lng + random.uniform(-0.002, 0.002), 6),
                )

            # date_submitted is auto_now_add, so backdate it with a direct update() call
            # (update() bypasses the auto_now_add-on-save behavior that create() triggers).
            submitted_at = now - timedelta(
                days=random.randint(0, days),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
            )
            update_fields = {'date_submitted': submitted_at}
            if has_report:
                update_fields['session_completed_at'] = submitted_at + timedelta(hours=random.randint(1, 4))
            if status == 'verified':
                update_fields['verified_at'] = update_fields['session_completed_at'] + timedelta(hours=random.randint(1, 24))

            Request.objects.filter(pk=req.pk).update(**update_fields)
            created.append(req.request_id)

            # Same trigger the live "submit trash report" endpoint fires after every filed
            # report — lets the demo data actually exercise priority-area auto-scheduling.
            if has_report:
                check_and_schedule_priority_followup(barangay)

        flagged = PriorityArea.objects.filter(barangay__in=BARANGAY_CENTERS.keys()).count()
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(created)} demo request(s) across the last {days} days, '
            f'plus {len(areas_by_barangay) + 2} demo collection areas. '
            f'{flagged} barangay(s) crossed the priority-area threshold and got a follow-up drive scheduled.'
        ))
