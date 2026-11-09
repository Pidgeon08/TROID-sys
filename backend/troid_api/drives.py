"""Cleanup drives: which request a robot is working on, and what it counted there."""
from .models import DeploymentSchedule, Request

# The robot's model has its own class names; the trash report uses these
# (TRASH_CATEGORIES in frontend/src/constants/requests.js).
OTHER = 'Other'
_KEYWORDS = (
    ('plastic', 'Plastic'),
    ('metal', 'Metal'),
    ('glass', 'Glass'),
    ('paper', 'Paper/Cardboard'),
    ('cardboard', 'Paper/Cardboard'),
    ('organic', 'Organic/Biodegradable'),
)


def report_category(label):
    """The trash report category for one of the robot's class names."""
    lowered = str(label).lower()
    return next((category for keyword, category in _KEYWORDS if keyword in lowered), OTHER)


def troid_counts(detections):
    """Pieces counted per trash report category, from a request's detection events."""
    counts = {}
    for detection in detections:
        for label, count in (detection.categories or {}).items():
            if isinstance(count, int) and not isinstance(count, bool) and count > 0:
                category = report_category(label)
                counts[category] = counts.get(category, 0) + count
    return counts


def scheduled_request_ids(boat):
    """Request ids of the TROID-supported deployments this robot is scheduled for."""
    return DeploymentSchedule.objects.filter(
        bot=boat, cleanup_type='troid_supported', request_id__isnull=False,
    ).exclude(request_id='').values_list('request_id', flat=True)


def active_drive(boat):
    """The cleanup drive this robot is on right now, or None."""
    return (
        Request.objects.filter(status='ongoing', archived=False, request_id__in=scheduled_request_ids(boat))
        .order_by('-drive_started_at')
        .first()
    )
