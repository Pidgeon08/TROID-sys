"""Barangay boundaries of the City of San Fernando, La Union, and where a collection area may go.

data/san_fernando_boundaries.json is the same file as the website's
frontend/src/data/sanFernandoBoundaries.json, and these rules mirror
frontend/src/utils/barangayBoundaries.js. Change both together.

A point belongs to a barangay's collection area when it is
  - inside the barangay, or
  - just across its border inside a neighbouring barangay (border creeks and rivers), or
  - out on the water near the barangay's coast or riverbank (outside every barangay and every
    neighbouring town).
"""
import json
import math
import re
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / 'data' / 'san_fernando_boundaries.json'

# How far across a border into a neighbouring barangay a point may sit (creeks and rivers often are the border).
BORDER_SLACK_M = 30
# How far out on the water from the barangay a point may sit.
WATER_REACH_M = 1000

_M_PER_DEG_LAT = 110_540
_M_PER_DEG_LNG_EQUATOR = 111_320


@lru_cache(maxsize=1)
def _data():
    return json.loads(DATA_FILE.read_text(encoding='utf-8'))


def barangay_names():
    return [b['name'] for b in _data()['barangays']]


def _key(name):
    text = re.sub(r'[^a-z0-9 ]+', ' ', str(name or '').lower())
    text = re.sub(r'^\s*(brgy|bgy)\s+', '', text)
    return ' '.join(text.split())


def canonical_barangay(name):
    """The official name for a barangay typed any reasonable way ("poro", "Brgy. Poro"), else None."""
    key = _key(name)
    if not key:
        return None
    return next((b['name'] for b in _data()['barangays'] if _key(b['name']) == key), None)


def _ring(name):
    return next(b['ring'] for b in _data()['barangays'] if b['name'] == name)


def _inside(point, ring):
    lat, lng = point
    hit = False
    for i in range(len(ring)):
        lat1, lng1 = ring[i]
        lat2, lng2 = ring[i - 1]
        if (lat1 > lat) != (lat2 > lat) and lng < (lng2 - lng1) * (lat - lat1) / (lat2 - lat1) + lng1:
            hit = not hit
    return hit


def _distance_to_ring_m(point, ring):
    lat0, lng0 = point
    kx = _M_PER_DEG_LNG_EQUATOR * math.cos(math.radians(lat0))
    best = math.inf
    for i in range(len(ring)):
        ax, ay = (ring[i - 1][1] - lng0) * kx, (ring[i - 1][0] - lat0) * _M_PER_DEG_LAT
        bx, by = (ring[i][1] - lng0) * kx, (ring[i][0] - lat0) * _M_PER_DEG_LAT
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        t = 0 if length2 == 0 else max(0, min(1, -(ax * dx + ay * dy) / length2))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def barangay_at(point):
    return next((b['name'] for b in _data()['barangays'] if _inside(point, b['ring'])), None)


def place_point(point, barangay):
    """None when the point may be part of barangay's collection area, else the reason it may not."""
    ring = _ring(barangay)
    if _inside(point, ring):
        return None
    near = _distance_to_ring_m(point, ring)
    other = barangay_at(point)
    if other:
        return None if near <= BORDER_SLACK_M else f'is in {other}, not {barangay}'
    town = next((m['name'] for m in _data()['neighbors'] if _inside(point, m['ring'])), None)
    if town:
        return f'is in {town}, outside San Fernando'
    return None if near <= WATER_REACH_M else f'is more than {WATER_REACH_M:,} m out from {barangay}'


def check_area(points, barangay):
    """None when every point fits barangay, else a message naming the first point that doesn't."""
    for number, point in enumerate(points, start=1):
        problem = place_point(point, barangay)
        if problem:
            return f'Point {number} {problem}.'
    return None
