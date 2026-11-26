"""Cleanup drives: which request a robot is working on, and what it counted there."""
import re

from .models import DeploymentSchedule, Request

# The TROID classes: what the robot sorts trash into, and the trash report's categories
# (TROID_CLASSES in frontend/src/constants/trashReport.js). Reports, the Post-Cleanup Comparison
# and the robot's counts all use these, so the robot's read can be checked against the report.
TROID_CLASSES = ['Plastic', 'Metal', 'Glass', 'Paper/Cardboard', 'Organic/Biodegradable', 'Other']
OTHER = 'Other'

# The items the report counts, after the International Coastal Cleanup data card (Shoreline and
# Recreational), grouped under the class each belongs to. A class's count is the sum of its items.
TRASH_GROUPS = [
    ('Plastic', ['Plastic bags', 'Beverage bottles (plastic)', 'Caps, lids', 'Cups, plates, forks, knives, spoons',
                 'Food wrappers, containers', 'Straws, stirrers', '6-pack holders', 'Toys', 'Shotgun shells, wadding',
                 'Other plastic']),
    ('Metal', ['Beverage cans', 'Pull tabs', 'Other metal']),
    ('Glass', ['Beverage bottles (glass)', 'Other glass']),
    ('Paper/Cardboard', ['Paper bags', 'Other paper or cardboard']),
    ('Organic/Biodegradable', ['Organic waste']),
    ('Other', ['Clothing, shoes', 'Balloons', 'Other items']),
]
TRASH_ITEMS = [item for _, items in TRASH_GROUPS for item in items]
CLASS_OF_ITEM = {item: cls for cls, items in TRASH_GROUPS for item in items}


def class_totals(items):
    """A class's count for each TROID class: the sum of its items' counts."""
    totals = {cls: 0 for cls in TROID_CLASSES}
    for item, count in items.items():
        totals[CLASS_OF_ITEM[item]] += count
    return totals


# The robot's model reports its own label names (e.g. "Clear plastic bottle", "Drink can",
# "Plastic film"); each is counted under the first class whose pattern it matches.
_PATTERNS = [
    (r'glass', 'Glass'),
    (r'metal|\bcans?\b|\btins?\b|alumin|foil|pop[\s-]?tab|pull[\s-]?tab|scrap', 'Metal'),
    (r'paper|cardboard|carton|newspaper|magazine', 'Paper/Cardboard'),
    (r'organic|biodegradable|food\s*(waste|scrap)|leaf|leaves|wood|branch|plant|fruit|vegetable', 'Organic/Biodegradable'),
    (r'plastic|bottle|\bbags?\b|film|wrapper|packet|straw|stirrer|\bcups?\b|\blids?\b|\bcaps?\b|container|styrofoam'
     r'|foam|six[\s-]?pack|6[\s-]?pack|utensil|cutlery|\btoys?\b|shotgun|wadding|tray|sachet', 'Plastic'),
]
_COMPILED = [(re.compile(pattern, re.IGNORECASE), cls) for pattern, cls in _PATTERNS]


def report_category(label):
    """The TROID class for one of the robot's label names."""
    label = str(label)
    if label in TROID_CLASSES:
        return label
    return next((cls for pattern, cls in _COMPILED if pattern.search(label)), OTHER)


def class_counts(categories, counts=None):
    """One detection's pieces per TROID class, from the robot's own labels (added into `counts`)."""
    counts = {} if counts is None else counts
    for label, count in (categories or {}).items():
        if isinstance(count, int) and not isinstance(count, bool) and count > 0:
            category = report_category(label)
            counts[category] = counts.get(category, 0) + count
    return counts


def troid_counts(detections):
    """Pieces counted per TROID class, from a request's detection events."""
    counts = {}
    for detection in detections:
        class_counts(detection.categories, counts)
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
