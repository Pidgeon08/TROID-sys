"""Priority-area detection: identifies barangays whose recent filed trash reports cross a
volume threshold, and books a follow-up cleanup drive for them automatically."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db.models import Sum
from django.utils import timezone

# Same local-time zone DeploymentSchedule.day is chosen in (see views.py's APP_TIMEZONE).
APP_TIMEZONE = ZoneInfo('Asia/Manila')

# A barangay is flagged as a priority area once its recent filed trash reports collectively
# cross this many bags — tuned to the demo/seeded data's scale, not a real-world calibration.
PRIORITY_WINDOW_DAYS = 30
PRIORITY_BAG_THRESHOLD = 80
PRIORITY_FOLLOWUP_LEAD_DAYS = 3


def check_and_schedule_priority_followup(barangay):
    """Runs every time a trash collection report is filed. If the barangay's total bags
    over the trailing window crosses the threshold and it doesn't already have a pending
    auto-scheduled follow-up, this books the next available bot for a follow-up drive and
    records the finding as a PriorityArea (so it can be surfaced on the dashboard and audited)."""
    from .models import Boat, DeploymentSchedule, PriorityArea, Request

    if not barangay:
        return None

    window_start = timezone.now() - timedelta(days=PRIORITY_WINDOW_DAYS)
    total_bags = Request.objects.filter(
        barangay=barangay, archived=False, date_submitted__gte=window_start, bags__isnull=False,
    ).aggregate(total=Sum('bags'))['total'] or 0

    if total_bags < PRIORITY_BAG_THRESHOLD:
        return None

    # Don't stack a second follow-up on top of one already booked for this barangay.
    already_has_followup = PriorityArea.objects.filter(
        barangay=barangay, identified_at__gte=window_start, deployment_schedule__isnull=False,
    ).exists()
    if already_has_followup:
        return None

    target_day = (timezone.now().astimezone(APP_TIMEZONE) + timedelta(days=PRIORITY_FOLLOWUP_LEAD_DAYS)).strftime('%Y-%m-%d')
    busy_bot_ids = DeploymentSchedule.objects.filter(day=target_day).values_list('bot_id', flat=True)
    bot = Boat.objects.filter(archived=False).exclude(id__in=busy_bot_ids).order_by('id').first()

    schedule = None
    if bot:
        schedule = DeploymentSchedule.objects.create(
            bot=bot,
            day=target_day,
            status='scheduled',
            label='9:00 AM',
            zone=f'{barangay} (Priority Follow-up)',
            cleanup_type='troid_supported',
        )

    return PriorityArea.objects.create(
        barangay=barangay,
        total_bags=total_bags,
        window_days=PRIORITY_WINDOW_DAYS,
        deployment_schedule=schedule,
        bot=bot,
        scheduled_day=target_day if schedule else '',
    )
