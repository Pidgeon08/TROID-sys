"""Cleanup drives: which request a robot is working on, and what it counted there."""
import re

from .models import DeploymentSchedule, Request

# What the trash report counts: the Shoreline and Recreational items of the International
# Coastal Cleanup data card, plus anything else (TRASH_ITEMS in frontend/src/constants/trashReport.js).
TRASH_ITEMS = [
    'Bags (paper or plastic)',
    'Balloons',
    'Beverage bottles (plastic)',
    'Beverage bottles (glass)',
    'Beverage cans',
    'Caps, lids',
    'Clothing, shoes',
    'Cups, plates, forks, knives, spoons',
    'Food wrappers, containers',
    'Pull tabs',
    '6-pack holders',
    'Shotgun shells, wadding',
    'Straws, stirrers',
    'Toys',
    'Other items',
]
OTHER = 'Other items'

# The robot's model has its own class names (e.g. "Clear plastic bottle", "Drink can",
# "Plastic film"); each is counted as the first item whose pattern it matches.
_PATTERNS = [
    (r'six[\s-]?pack|6[\s-]?pack', '6-pack holders'),
    (r'pop[\s-]?tab|pull[\s-]?tab', 'Pull tabs'),
    (r'straw|stirrer', 'Straws, stirrers'),
    (r'balloon', 'Balloons'),
    (r'shotgun|wadding', 'Shotgun shells, wadding'),
    (r'\btoys?\b', 'Toys'),
    (r'shoe|sandal|slipper|cloth|shirt|fabric', 'Clothing, shoes'),
    (r'\bcaps?\b|\blids?\b', 'Caps, lids'),
    (r'\bcups?\b|plate|fork|knife|knives|spoon|utensil|cutlery', 'Cups, plates, forks, knives, spoons'),
    (r'\bbags?\b|sack', 'Bags (paper or plastic)'),
    (r'glass', 'Beverage bottles (glass)'),
    (r'bottle', 'Beverage bottles (plastic)'),
    (r'food\s*can', 'Food wrappers, containers'),
    (r'\bcans?\b', 'Beverage cans'),
    (r'wrapper|packet|film|container|carton|styrofoam|foam|foil|food|tray', 'Food wrappers, containers'),
]
_COMPILED = [(re.compile(pattern, re.IGNORECASE), item) for pattern, item in _PATTERNS]


def report_category(label):
    """The trash report item for one of the robot's class names."""
    label = str(label)
    if label in TRASH_ITEMS:
        return label
    return next((item for pattern, item in _COMPILED if pattern.search(label)), OTHER)


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
