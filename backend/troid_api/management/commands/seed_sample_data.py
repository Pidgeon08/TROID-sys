"""Fills a local database with sample data, to see how the system looks in use.

    python manage.py seed_sample_data            # replace any earlier sample data with a fresh set
    python manage.py seed_sample_data --clear    # remove the sample data only

It makes sign-in accounts for every role, three robots and their operators, an approved
collection area inside each of seven real barangays, and a little over a year of cleanup
requests in every state: finished drives with trash reports and robot detections (so the
Reports, Heatmap and Dashboard pages have numbers and comparisons to show, even against last
year), requests waiting on the City Admin or CENRO (two of them old enough to resend),
ongoing, parked, declined, merged and archived ones, and TROID and non-TROID cleanups booked
over the coming weeks. Some collection areas collect more bags per cleanup lately than the
month before, so they show as priority areas.

The local backend keeps all of it dated around today by itself (troid_api/sample_data.py), so
it doesn't go stale as days pass.

Everything it creates is tagged so --clear (and the next run) removes exactly that and
nothing else. It refuses to run against anything but a local SQLite database unless
--allow-remote is given, because backend/.env may point at the live database.
"""
import base64
import math
import random
from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from troid_api import boundaries
from troid_api.models import (
    Boat, CollectionArea, DeploymentSchedule, DetectionEvent, LetterFile, Operator,
    Request, StatusHistory, User,
)
from troid_api.sample_data import (
    BOAT_PREFIX, EMAIL_DOMAIN, MANILA, MARKER, OPERATOR_PREFIX, PASSWORD, SUBMITTER,
)
CATEGORIES = ['Plastic', 'Metal', 'Glass', 'Paper/Cardboard', 'Organic/Biodegradable', 'Other']
# Typical share of each kind of trash in a haul; plastic dominates.
CATEGORY_MIX = [0.46, 0.08, 0.07, 0.12, 0.19, 0.08]

# The barangays with a collection area. `weight` is how often they request a cleanup and
# `trend` how that changes toward today (above 1: more often lately; below 1: less often).
# `load` is how many bags a cleanup brings in over the last month against earlier: above 1
# makes the area a priority (more per cleanup than the month before), below 1 makes it fine.
BARANGAYS = [
    {'name': 'Poro', 'weight': 5, 'trend': 1.3, 'load': 1.35, 'area': 'Poro Point Shoreline', 'water': ('coast', 'Poro Point Bay'),
     'landmarks': ['Near the fish port', 'Beside the old lighthouse road', 'Behind the barangay hall']},
    {'name': 'Catbangen', 'weight': 4, 'trend': 1.2, 'load': 1.4, 'area': 'Catbangen River Mouth', 'water': ('estuary', 'Catbangen River'),
     'landmarks': ['Under the Catbangen bridge', 'Beside the public market', 'Near the boat landing']},
    {'name': 'Carlatan', 'weight': 3, 'trend': 1.0, 'load': 0.85, 'area': 'Carlatan Creek', 'water': ('creek', 'Carlatan Creek'),
     'landmarks': ['Near the elementary school', 'Behind the chapel', 'At the creek outfall']},
    {'name': 'Lingsat', 'weight': 3, 'trend': 0.55, 'load': 0.75, 'area': 'Lingsat Coastline', 'water': ('coast', 'Lingsat Beach'),
     'landmarks': ['In front of the resort row', 'Near the seawall', 'At the end of the beach road']},
    {'name': 'Pagdaraoan', 'weight': 2, 'trend': 1.1, 'load': 0.95, 'area': 'Pagdaraoan Drainage Canal', 'water': ('canal', 'Pagdaraoan Main Canal'),
     'landmarks': ['Beside the highway culvert', 'Behind the covered court']},
    {'name': 'San Vicente', 'weight': 2, 'trend': 1.4, 'load': 1.3, 'area': 'San Vicente Creek', 'water': ('creek', 'San Vicente Creek'),
     'landmarks': ['Near the rice mill', 'At the footbridge']},
    {'name': 'Biday', 'weight': 1, 'trend': 0.9, 'load': 0.9, 'area': 'Biday River Bend', 'water': ('river', 'Biday River'),
     'landmarks': ['Below the irrigation dam', 'Near the sitio road']},
]
# Barangays with their own sign-in account; the others' requests come from their offices on paper.
ACCOUNT_BARANGAYS = ['Poro', 'Catbangen', 'Carlatan', 'Lingsat']
NGO = {'name': 'Coastal Care Volunteers', 'barangay': 'Pagdaraoan'}
OPERATORS = ['Mark Dela Cruz', 'Liza Bautista', 'Ramon Ilagan']
UNSUPPORTED_SITES = ['Seawall steps', 'Market drainage', 'School grounds creek', 'Chapel riverbank']


def letter_pdf(lines):
    """A one-page PDF letter, so request pages have a letter to preview."""
    def esc(text):
        return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    stream = 'BT /F1 12 Tf 16 TL 72 740 Td ' + ' '.join(f"({esc(line)}) '" for line in lines) + ' ET'
    objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream',
    ]
    out = '%PDF-1.4\n'
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f'{number} 0 obj\n{body}\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'
    out += ''.join(f'{offset:010d} 00000 n \n' for offset in offsets)
    out += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'
    return out.encode('latin-1')


def inside(point, ring):
    return boundaries._inside(point, ring)


def area_polygon(rng, barangay):
    """A collection area polygon inside the barangay that passes the same check the app uses."""
    ring = boundaries._ring(barangay)
    lats = [p[0] for p in ring]
    lngs = [p[1] for p in ring]
    center = (sum(lats) / len(lats), sum(lngs) / len(lngs))
    while not inside(center, ring):
        center = (rng.uniform(min(lats), max(lats)), rng.uniform(min(lngs), max(lngs)))
    radius = 0.0025
    while True:
        sides = 6
        points = []
        for i in range(sides):
            angle = 2 * math.pi * i / sides + rng.uniform(-0.15, 0.15)
            r = radius * rng.uniform(0.7, 1.0)
            points.append([round(center[0] + r * math.cos(angle), 6), round(center[1] + r * 1.1 * math.sin(angle), 6)])
        if boundaries.check_area(points, barangay) is None:
            return points
        radius *= 0.8
        if radius < 0.0003:
            return [[round(center[0], 6), round(center[1], 6)]] * 3


def point_in(rng, polygon):
    lats = [p[0] for p in polygon]
    lngs = [p[1] for p in polygon]
    for _ in range(200):
        point = (rng.uniform(min(lats), max(lats)), rng.uniform(min(lngs), max(lngs)))
        if inside(point, polygon):
            return round(point[0], 6), round(point[1], 6)
    return lats[0], lngs[0]


def manila(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute), tzinfo=MANILA)


class Command(BaseCommand):
    help = 'Fills a local database with sample data to see how the system looks (see the module docstring).'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Only remove the sample data.')
        parser.add_argument('--days', type=int, default=400,
                            help='How many days back the finished cleanups go (default 400, so there is a last year to compare with).')
        parser.add_argument('--weeks-ahead', type=int, default=8,
                            help='How many weeks of upcoming cleanups to book (default 8).')
        parser.add_argument('--seed', type=int, default=7, help='Random seed, for the same data every run (default 7).')
        parser.add_argument('--allow-remote', action='store_true',
                            help='Run even though the database is not a local SQLite file.')

    def handle(self, *args, **options):
        if connection.vendor != 'sqlite' and not options['allow_remote']:
            raise CommandError(
                f'This database is {connection.vendor}, not the local SQLite file, so it may be the live one. '
                "Run with DATABASE_URL='' to use db.sqlite3, or pass --allow-remote if you really mean it."
            )
        with transaction.atomic():
            removed = self.clear()
            if options['clear']:
                self.stdout.write(self.style.SUCCESS(f'Removed the sample data ({removed} requests).'))
                return
            self.rng = random.Random(options['seed'])
            self.now = timezone.now()
            self.today = self.now.astimezone(MANILA).date()
            self.seed(options['days'], options['weeks_ahead'])

    # --- removing ---------------------------------------------------------------------

    def clear(self):
        boats = Boat.objects.filter(name__startswith=BOAT_PREFIX)
        sample = Request.objects.filter(notes__startswith=MARKER)
        # Non-TROID cleanups are booked without a bot, so they don't go with the robots.
        DeploymentSchedule.objects.filter(request_id__in=sample.values_list('request_id', flat=True)).delete()
        removed, _ = sample.delete()
        boats.delete()  # their schedules and detections go with them
        Operator.objects.filter(operator_id__startswith=OPERATOR_PREFIX).delete()
        CollectionArea.objects.filter(submitted_by=SUBMITTER).delete()
        User.objects.filter(email__iendswith=f'@{EMAIL_DOMAIN}').delete()
        return removed

    # --- creating ---------------------------------------------------------------------

    def seed(self, days, weeks_ahead):
        self.make_accounts()
        self.make_fleet()
        self.make_areas(days)
        self.schedule_days = set()  # (bot id, day) already booked

        specs = self.finished_specs(days) + self.open_specs() + self.upcoming_specs(weeks_ahead)
        specs.sort(key=lambda s: s['submitted'])
        created = {}
        for spec in specs:
            created[spec['key']] = self.make_request(spec)

        self.merge(created, 'merge-open-main', ['merge-open-a', 'merge-open-b'])
        self.merge(created, 'merge-done-main', ['merge-done-a'])

        finished = sum(1 for s in specs if s['status'] in ('completed', 'segregated', 'verified'))
        upcoming = DeploymentSchedule.objects.filter(
            request_id__in=[r.request_id for r in created.values()], day__gt=self.today.isoformat(),
        ).count()
        self.stdout.write(self.style.SUCCESS(
            f'Created {len(specs)} sample requests ({finished} finished cleanups over the last {days} days, '
            f'{upcoming} cleanups booked over the next {weeks_ahead} weeks), '
            f'{len(self.areas)} collection areas, {len(self.boats)} robots and {len(self.operators)} operators.'
        ))
        self.stdout.write('Sign in with any of these (password ' + PASSWORD + '):')
        for user in self.users.values():
            self.stdout.write(f'  {user.email:<36} {user.get_role_display()}')

    def make_accounts(self):
        def account(key, name, role, location=''):
            user = User(name=name, email=f'{key}@{EMAIL_DOMAIN}', role=role, status='active',
                        location=location, password=PASSWORD)
            user.save()
            return user

        self.users = {
            'cenro': account('cenro', 'Sample CENRO Admin', 'admin'),
            'city': account('cityadmin', 'Sample City Admin', 'mayorsoffice'),
        }
        for barangay in ACCOUNT_BARANGAYS:
            key = barangay.lower().replace(' ', '')
            self.users[barangay] = account(key, f'Brgy. {barangay} Office', 'barangay', barangay)
        self.users['ngo'] = account('ngo', NGO['name'], 'ngo', NGO['barangay'])

    def make_fleet(self):
        self.boats = []
        for letter, battery in zip('ABC', (92, 78, 64)):
            self.boats.append(Boat.objects.create(name=f'{BOAT_PREFIX}-{letter}', is_active=True, battery_level=battery))
        self.operators = []
        for number, name in enumerate(OPERATORS, start=1):
            self.operators.append(Operator.objects.create(
                operator_id=f'{OPERATOR_PREFIX}{number:02d}', name=name,
                assigned_bot=self.boats[number - 1], availability='assigned',
            ))

    def make_areas(self, days):
        rng = self.rng
        self.areas = {}
        for info in BARANGAYS:
            name = info['name']
            water_type, water_name = info['water']
            # Approved before the first sample cleanup was requested for it.
            reviewed = self.now - timedelta(days=days + rng.randint(25, 50))
            area = CollectionArea.objects.create(
                name=info['area'], barangay=name, submitted_by=SUBMITTER,
                points=area_polygon(rng, name), closed=True,
                color=rng.choice(['#1b4de4', '#0ea5e9', '#16a34a', '#d97706', '#9333ea']),
                description=f'Stretch of {water_name} where trash collects after heavy rain.',
                water_body_type=water_type, water_body_name=water_name,
                hazards=rng.choice(['', 'Strong current after rain.', 'Slippery rocks near the bank.']),
                status='approved', reviewed_by='Sample CENRO Admin', date_reviewed=reviewed,
            )
            CollectionArea.objects.filter(pk=area.pk).update(date_submitted=reviewed - timedelta(days=3))
            self.areas[name] = area
        # One area still under review and one declined, for the Collection Areas page.
        for barangay, name, area_status, reason in (
            ('Poro', 'Poro Fish Port Basin', 'pending', ''),
            ('Catbangen', 'Catbangen Upper Riverbank', 'declined',
             'Part of this stretch is private property. Redraw it along the public easement.'),
        ):
            CollectionArea.objects.create(
                name=name, barangay=barangay, submitted_by=SUBMITTER, points=area_polygon(rng, barangay),
                closed=True, status=area_status, decline_reason=reason,
                reviewed_by='Sample CENRO Admin' if reason else '',
                date_reviewed=self.now - timedelta(days=4) if reason else None,
                description='Submitted for review.', water_body_type='river', water_body_name=f'{barangay} River',
            )

    # --- what to create --------------------------------------------------------------

    def requester(self, barangay):
        """Who sends a barangay's request: its account, its office on paper, or now and then the NGO."""
        if barangay == NGO['barangay'] and self.rng.random() < 0.6:
            user = self.users['ngo']
            return {'name': user.name, 'role': 'ngo', 'email': user.email, 'barangay': barangay}
        user = self.users.get(barangay)
        if user:
            return {'name': user.name, 'role': 'barangay', 'email': user.email, 'barangay': barangay}
        return {'name': f'Brgy. {barangay} Office', 'role': 'barangay', 'email': '', 'barangay': barangay}

    def pick_barangay(self, recency):
        """recency is 0 for the oldest day and 1 for today."""
        weights = [b['weight'] * (1 + (b['trend'] - 1) * (2 * recency - 1)) for b in BARANGAYS]
        return self.rng.choices(BARANGAYS, weights=weights, k=1)[0]

    def finished_specs(self, days):
        """Finished cleanups, more of them lately, so this month compares well against the last."""
        rng = self.rng
        specs = []
        for back in range(days, 0, -1):
            recency = 1 - back / days
            drives = sum(1 for _ in range(3) if rng.random() < 0.13 + 0.17 * recency)
            for _ in range(drives):
                day = self.today - timedelta(days=back)
                info = self.pick_barangay(recency)
                troid = rng.random() < 0.8
                if back > 14:
                    status = rng.choices(['verified', 'segregated', 'completed'], weights=[75, 15, 10])[0]
                else:
                    status = rng.choices(['verified', 'segregated', 'completed'], weights=[20, 30, 50])[0]
                specs.append({
                    'key': f'done-{len(specs)}', 'status': status, 'barangay': info, 'troid': troid,
                    'drive_day': day, 'submitted': manila(day, 9) - timedelta(days=rng.randint(6, 18), hours=rng.randint(0, 8)),
                })
        # A finished cleanup another request was merged into, to show a merged request's results.
        catbangen = next(b for b in BARANGAYS if b['name'] == 'Catbangen')
        day = self.today - timedelta(days=9)
        specs.append({'key': 'merge-done-main', 'status': 'completed', 'barangay': catbangen, 'troid': True,
                      'drive_day': day, 'submitted': manila(day, 10) - timedelta(days=12)})
        specs.append({'key': 'merge-done-a', 'status': 'pending_admin_approval', 'barangay': catbangen, 'troid': True,
                      'submitted': manila(day, 14) - timedelta(days=11), 'force_ngo': True})
        return specs

    def open_specs(self):
        """Requests still on their way, a few of each state the request lists show."""
        rng = self.rng
        by_name = {b['name']: b for b in BARANGAYS}
        now = self.now.astimezone(MANILA)
        specs = []

        def add(key, status, barangay, days_ago, troid=True, **extra):
            specs.append({'key': key, 'status': status, 'barangay': by_name[barangay], 'troid': troid,
                          'submitted': now - timedelta(days=days_ago, hours=rng.randint(1, 6)), **extra})

        add('pend-city-old', 'pending_mayor_approval', 'Carlatan', 26)  # can be resent
        add('pend-city-1', 'pending_mayor_approval', 'Poro', 2)
        add('pend-city-2', 'pending_mayor_approval', 'San Vicente', 4, troid=False)
        add('pend-city-3', 'pending_mayor_approval', 'Lingsat', 0.3)
        add('pend-cenro-old', 'pending_admin_approval', 'Pagdaraoan', 23)  # can be resent
        add('pend-cenro-1', 'pending_admin_approval', 'Catbangen', 5)
        add('pend-cenro-2', 'pending_admin_approval', 'Biday', 3)
        add('sched-1', 'approved', 'Poro', 8, scheduled=3)
        add('sched-2', 'approved', 'Carlatan', 6, scheduled=6)
        add('unsched-1', 'approved', 'Lingsat', 7)
        add('unsched-2', 'approved', 'San Vicente', 4, troid=False)
        add('sched-manual', 'approved', 'Carlatan', 5, troid=False, scheduled=2)
        add('ongoing', 'ongoing', 'Catbangen', 9, drive_today=True)
        add('parked', 'parked', 'Biday', 15, parked_from='pending_admin_approval',
            reason='The river is too high after the typhoon. We will schedule it once the water goes down.')
        add('declined-1', 'declined', 'Pagdaraoan', 18, by='city',
            reason='The canal is under DPWH desilting works this month. Please send it again after.')
        add('declined-2', 'declined', 'Lingsat', 33, by='cenro', troid=False,
            reason='This stretch is private resort frontage; the resort handles its own cleanup.')
        add('archived', 'declined', 'Carlatan', 70, by='city', archived=True, reason='Sent twice by mistake.')
        # Three requests for the same Poro area; CENRO merges two into the first.
        add('merge-open-main', 'approved', 'Poro', 6, scheduled=5)
        add('merge-open-a', 'pending_admin_approval', 'Poro', 4, force_ngo=True)
        add('merge-open-b', 'pending_mayor_approval', 'Poro', 3)
        return specs

    def upcoming_specs(self, weeks):
        """Approved cleanups booked over the coming weeks, so the schedule has something ahead.
        Mostly TROID-supported; about one a week is a non-TROID (manual) cleanup."""
        rng = self.rng
        now = self.now.astimezone(MANILA)
        specs = []
        for week in range(1, weeks + 1):
            for n in range(rng.randint(2, 4)):
                ahead = (week - 1) * 7 + rng.randint(1, 7)
                info = self.pick_barangay(1)
                specs.append({
                    'key': f'upcoming-{week}-{n}', 'status': 'approved', 'barangay': info,
                    'troid': n > 0 or rng.random() < 0.3, 'scheduled': ahead,
                    # Asked for one to three weeks before the day, approved since.
                    'submitted': now - timedelta(days=max(6, rng.randint(7, 21) - ahead), hours=rng.randint(1, 8)),
                })
        return specs

    # --- one request ------------------------------------------------------------------

    def make_request(self, spec):
        rng = self.rng
        info = spec['barangay']
        barangay = info['name']
        who = self.requester(barangay)
        if spec.get('force_ngo'):
            ngo = self.users['ngo']
            who = {'name': ngo.name, 'role': 'ngo', 'email': ngo.email, 'barangay': NGO['barangay']}
        troid = spec['troid']
        drive_day = spec.get('drive_day')
        if spec.get('drive_today'):
            drive_day = self.today
        if drive_day:
            preferred = drive_day
        elif spec.get('scheduled'):
            preferred = self.today + timedelta(days=spec['scheduled'])
        else:
            preferred = spec['submitted'].date() + timedelta(days=rng.randint(7, 21))
        status = spec['status']
        req = Request.objects.create(
            cleanup_type='troid_supported' if troid else 'unsupported',
            status=status,
            requested_by_name=who['name'],
            requested_by_role=who['role'],
            requested_by_barangay=who['barangay'],
            email=who['email'],
            contact=f'0917-{rng.randint(100, 999)}-{rng.randint(1000, 9999)}',
            location_name=rng.choice(info['landmarks']) if troid else rng.choice(UNSUPPORTED_SITES),
            barangay=barangay,
            municipality='San Fernando',
            province='La Union',
            preferred_date=preferred.isoformat(),
            preferred_time=rng.choice(['07:00', '08:00', '09:00']),
            notes=f'{MARKER} ' + rng.choice([
                'Trash piles up here after every heavy rain.',
                'Residents reported floating plastic near the bank.',
                'Monthly cleanup requested by the barangay council.',
                'Clogged section is causing flooding in the nearby purok.',
            ]),
            collection_area=self.areas[barangay] if troid else None,
            archived=spec.get('archived', False),
            decline_reason=spec.get('reason', ''),
            parked_from_status=spec.get('parked_from', ''),
            letter_file_name=f'Letter of Request - {barangay}.pdf',
            letter_content_type='application/pdf',
        )
        pdf = letter_pdf([
            f'Barangay {barangay}, City of San Fernando, La Union', '',
            'The City Environment and Natural Resources Office', '',
            'Dear Sir/Madam:', '',
            f'We respectfully request a cleanup of {req.location_name} in Barangay {barangay}.',
            f'Preferred date: {req.preferred_date}.', '',
            'Thank you for your assistance.', '',
            who['name'],
            '(Sample letter generated for demonstration)',
        ])
        LetterFile.objects.create(request=req, data=base64.b64encode(pdf).decode())
        size = f'{max(1, round(len(pdf) / 1024))} KB'
        fields = {'date_submitted': spec['submitted'], 'letter_size': size}
        history = []
        submitted = spec['submitted']

        def step(label, when, actor, role, details=''):
            history.append((label, when, actor, role, details))

        city = self.users['city'].name
        cenro = self.users['cenro'].name
        approved_city = submitted + timedelta(days=rng.uniform(0.5, 3))
        approved_cenro = approved_city + timedelta(days=rng.uniform(0.3, 2))

        if status in ('pending_admin_approval', 'approved', 'ongoing', 'completed', 'segregated', 'verified') or \
                spec.get('parked_from') == 'pending_admin_approval':
            step('Approved by City Admin', approved_city, city, 'City Admin')
        if status in ('approved', 'ongoing', 'completed', 'segregated', 'verified'):
            step('Approved by Admin', approved_cenro, cenro, 'Admin')
        if status == 'parked':
            step('Parked', approved_city + timedelta(days=2), cenro, 'Admin', spec['reason'])
        if status == 'declined':
            when = submitted + timedelta(days=rng.uniform(1, 4))
            if spec['by'] == 'city':
                step('Declined', when, city, 'City Admin', spec['reason'])
            else:
                step('Approved by City Admin', approved_city, city, 'City Admin')
                step('Declined', approved_city + timedelta(days=1), cenro, 'Admin', spec['reason'])
        if spec.get('scheduled'):
            day = self.today + timedelta(days=spec['scheduled'])
            if troid:
                self.book(req, day, barangay)
            else:
                # A non-TROID cleanup is booked without a bot, so it never takes up a robot's day.
                DeploymentSchedule.objects.create(
                    bot=None, day=day.isoformat(), status='scheduled', label=req.preferred_time or '08:00',
                    zone=barangay, request_id=req.request_id, cleanup_type='unsupported',
                )

        if status == 'ongoing' or drive_day:
            boat, operator = self.crew()
            if troid:
                req.bot_id, req.operator = boat, operator
            start = manila(drive_day, rng.choice([7, 8, 9]), rng.choice([0, 15, 30]))
            if status == 'ongoing':
                start = min(start, self.now.astimezone(MANILA) - timedelta(hours=1))
            if troid:
                self.book(req, drive_day, barangay, boat)
                fields['drive_started_at'] = start
                step('Cleanup Drive Started', start, operator.name, 'Operator', f'{boat.name} started the cleanup.')
            if status != 'ongoing':
                finished = start + timedelta(hours=rng.uniform(2, 4.5))
                report = self.trash_report(info, (self.today - drive_day).days)
                req.bags = report['bags']
                req.weight_kg = report['weight_kg']
                req.non_usable_kg = report['non_usable_kg']
                req.recyclable_kg = report['recyclable_kg']
                req.trash_categories = report['categories']
                fields['session_completed_at'] = finished
                step('Session Completed by CENRO', finished, cenro, 'Admin')
                step('Trash Report Filed by CENRO', finished + timedelta(minutes=40), cenro, 'Admin',
                     rng.choice(['', 'Mostly plastic bottles and wrappers.', 'Heavy load near the outfall.']))
                if troid:
                    self.detections(req, boat, report['categories'], start, finished)
                if status == 'verified':
                    verified_at = finished + timedelta(days=rng.uniform(1, 4))
                    req.verified_categories = {c: max(0, n + rng.randint(-2, 2)) for c, n in report['categories'].items()}
                    fields['verified_at'] = verified_at
                    step('Detection Verified by CENRO', verified_at, cenro, 'Admin')
            req.save()

        for i, (label, when, actor, role, details) in enumerate(history):
            StatusHistory.objects.create(
                request=req, label=label, date=when, actor=actor, role=role, details=details,
                state='current' if i == len(history) - 1 else 'done',
            )
        Request.objects.filter(pk=req.pk).update(**fields)
        req.refresh_from_db()
        return req

    def crew(self):
        number = self.rng.randrange(len(self.boats))
        return self.boats[number], self.operators[number]

    def book(self, req, day, barangay, boat=None):
        """A deployment schedule for the request, on a robot that is free that day."""
        boats = [boat] if boat else self.rng.sample(self.boats, len(self.boats))
        for candidate in boats:
            if (candidate.id, day) in self.schedule_days:
                continue
            self.schedule_days.add((candidate.id, day))
            DeploymentSchedule.objects.create(
                bot=candidate, day=day.isoformat(), status='scheduled', label=req.preferred_time or '08:00',
                zone=self.areas[barangay].name, request_id=req.request_id, cleanup_type=req.cleanup_type,
            )
            return

    def trash_report(self, info, days_ago):
        rng = self.rng
        # The area's load applies in full over the last month, partly the month before.
        load = info['load'] if days_ago <= 30 else 1 + (info['load'] - 1) * 0.2 if days_ago <= 60 else 1
        base = rng.gauss(11, 3) * (1.25 if info['water'][0] in ('estuary', 'coast') else 1)
        bags = max(2, round(base * load))
        items = bags * rng.randint(6, 11)
        categories = {}
        for name, share in zip(CATEGORIES, CATEGORY_MIX):
            categories[name] = max(0, round(items * share * rng.uniform(0.6, 1.4)))
        weight = round(bags * rng.uniform(3.4, 5.6), 1)
        recyclable = round(weight * rng.uniform(0.32, 0.55), 1)
        return {'bags': bags, 'weight_kg': weight, 'recyclable_kg': recyclable,
                'non_usable_kg': round(weight - recyclable, 1), 'categories': categories}

    def detections(self, req, boat, categories, start, finished):
        """What the robot counted along the drive: close to the filed report, spread over the area."""
        rng = self.rng
        polygon = self.areas[req.barangay].points
        stops = rng.randint(8, 14)
        counts = [dict() for _ in range(stops)]
        for name, total in categories.items():
            for _ in range(round(total * rng.uniform(0.85, 1.05))):
                bucket = counts[rng.randrange(stops)]
                bucket[name] = bucket.get(name, 0) + 1
        span = (finished - start) / stops
        lat = lng = None
        for i, found in enumerate(counts):
            if not found:
                continue
            lat, lng = point_in(rng, polygon)
            event = DetectionEvent.objects.create(
                boat=boat, request=req, latitude=lat, longitude=lng, trash_count=sum(found.values()),
                categories=found, confidence=round(rng.uniform(0.72, 0.97), 2), is_verified=True,
            )
            DetectionEvent.objects.filter(pk=event.pk).update(timestamp=start + span * (i + rng.random()))
        if lat is not None:
            Boat.objects.filter(pk=boat.pk).update(last_latitude=lat, last_longitude=lng)

    # --- merging -----------------------------------------------------------------------

    def merge(self, created, main_key, other_keys):
        """What CENRO's Merge does: the others follow the main request and lose their own schedule."""
        main = created[main_key]
        cenro = self.users['cenro'].name
        when = max(created[k].date_submitted for k in [main_key, *other_keys]) + timedelta(hours=20)
        if main.session_completed_at:
            when = min(when, main.session_completed_at - timedelta(days=1))
        for key in other_keys:
            other = Request.objects.get(pk=created[key].pk)
            DeploymentSchedule.objects.filter(request_id=other.request_id).delete()
            other.merged_from_status = other.status
            other.status = 'merged'
            other.merged_into = main
            other.merged_at = when
            other.save()
            StatusHistory.objects.filter(request=other).update(state='done')
            StatusHistory.objects.create(
                request=other, label=f'Merged into {main.request_id} by CENRO', date=when, actor=cenro,
                role='Admin', state='current', details='Same stretch of the same area, so one cleanup covers both.',
            )
        StatusHistory.objects.create(
            request=main, label='Requests Merged by CENRO', date=when, actor=cenro, role='Admin', state='done',
            details=f'Merged into this request: {", ".join(created[k].request_id for k in other_keys)}.',
        )
