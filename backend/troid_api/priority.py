"""Priority collection areas.

A collection area is a priority when its cleanups lately bring in more trash per visit than
they did the month before: the average bags per finished cleanup over the last 30 days is
higher than the average over the 30 days before that. Lower or the same is fine.

It is worked out from the filed trash reports every time it is asked for, so it is never out
of date and needs nothing stored. Passing `as_of` gives the answer as it stood at the end of
that moment (the Reports page compares periods this way).
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

APP_TIMEZONE = ZoneInfo('Asia/Manila')
WINDOW_DAYS = 30

# What an area's two windows say about it.
PRIORITY = 'priority'      # more bags per cleanup than the month before
STEADY = 'steady'          # the same or fewer
NO_BASELINE = 'no_baseline'  # cleanups lately, but none the month before to compare with
NO_RECENT = 'no_recent'    # cleanups the month before, none lately


def end_of_day(day):
    """The last moment of a Manila calendar day (a date), as an aware datetime."""
    return datetime.combine(day + timedelta(days=1), time.min, tzinfo=APP_TIMEZONE) - timedelta(microseconds=1)


def _window(bags):
    total = sum(bags)
    return {
        'cleanups': len(bags),
        'bags': total,
        'average': round(total / len(bags), 1) if bags else None,
    }


def evaluate_priority_areas(as_of=None, barangay=None):
    """Every collection area with a finished cleanup in the last two windows before `as_of`
    (default now), priority areas first (the biggest rise first), then the rest by name.

    A finished cleanup is a request with a filed trash report and a finish time that isn't
    archived or merged into another (a merged request's cleanup is the other one's)."""
    from .models import Request

    as_of = as_of or timezone.now()
    current_start = as_of - timedelta(days=WINDOW_DAYS)
    previous_start = current_start - timedelta(days=WINDOW_DAYS)

    cleanups = (
        Request.objects.filter(
            archived=False, bags__isnull=False, collection_area__isnull=False, collection_area__archived=False,
            session_completed_at__gt=previous_start, session_completed_at__lte=as_of,
        )
        .exclude(status='merged')
        .select_related('collection_area')
    )
    if barangay:
        cleanups = cleanups.filter(collection_area__barangay__iexact=barangay)

    areas = {}
    for req in cleanups:
        entry = areas.setdefault(req.collection_area_id, {'area': req.collection_area, 'current': [], 'previous': []})
        entry['current' if req.session_completed_at > current_start else 'previous'].append(req.bags)

    results = []
    for entry in areas.values():
        area = entry['area']
        current = _window(entry['current'])
        previous = _window(entry['previous'])
        if not current['cleanups']:
            state = NO_RECENT
        elif not previous['cleanups']:
            state = NO_BASELINE
        else:
            # Compared exactly; the rounded averages are only for showing.
            now_avg = current['bags'] / current['cleanups']
            before_avg = previous['bags'] / previous['cleanups']
            state = PRIORITY if now_avg > before_avg else STEADY
        change = None
        if current['average'] is not None and previous['average']:
            change = round((current['bags'] / current['cleanups'] / (previous['bags'] / previous['cleanups']) - 1) * 100, 1)
        results.append({
            'collection_area': {
                'id': area.id, 'area_id': area.area_id, 'name': area.name,
                'barangay': area.barangay, 'color': area.color,
            },
            'barangay': area.barangay,
            'status': state,
            'is_priority': state == PRIORITY,
            'current': current,
            'previous': previous,
            'change_pct': change,
            'window_days': WINDOW_DAYS,
            'as_of': as_of,
        })

    results.sort(key=lambda r: (not r['is_priority'], -(r['change_pct'] or 0) if r['is_priority'] else 0,
                                r['collection_area']['name'].lower()))
    return results
