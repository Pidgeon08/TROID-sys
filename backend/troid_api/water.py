"""Where San Fernando's waterways are (rivers, creeks, canals and ponds; TROID doesn't work the
sea), and how much of a collection area is waterway.

data/san_fernando_water.json is the same file as the website's frontend/src/data/sanFernandoWater.json
(built from OpenStreetMap by backend/tools/water_map), and area_water mirrors areaWater in
frontend/src/utils/coverage.js, so the browser and the server agree on an area. Change both together.

A collection area must have mapped waterway inside it: an area with none can't be cleaned by a
boat. One that is mostly land is allowed, but its creator is warned.
"""
import json
import math
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / 'data' / 'san_fernando_water.json'

M_PER_DEG_LAT = 111_320
# Latitude bands each polygon's edges are filed under (about 45 m), as in utils/water.js.
BAND_DEG = 0.0004
# A drawn line counts as on the waterway where it comes this close to it (it is drawn by hand on a map).
LINE_REACH_M = 8
# Less waterway than this inside an area is none: the outline only grazes a bank.
MIN_WATER_M2 = 20
# More than this much land for each square metre of waterway, and the creator is warned.
MOSTLY_LAND_RATIO = 10
# The grid an area is sampled on, and the steps a line is sampled at.
MAX_CELLS = 4000
LINE_STEP_M = 2
MAX_LINE_SAMPLES = 2000


@lru_cache(maxsize=1)
def _polygons():
    polygons = []
    for rings in json.loads(DATA_FILE.read_text(encoding='utf-8'))['polygons']:
        lats = [p[0] for p in rings[0]]
        lngs = [p[1] for p in rings[0]]
        min_lat = min(lats)
        bands = {}
        for ring in rings:
            for i in range(len(ring)):
                a, b = ring[i - 1], ring[i]
                first = math.floor((min(a[0], b[0]) - min_lat) / BAND_DEG)
                last = math.floor((max(a[0], b[0]) - min_lat) / BAND_DEG)
                for band in range(first, last + 1):
                    bands.setdefault(band, []).append((a, b))
        polygons.append((min_lat, max(lats), min(lngs), max(lngs), bands))
    return polygons


def on_water(point):
    """Whether a [lat, lng] point is on a mapped waterway. An island is a hole in its polygon."""
    lat, lng = point
    for min_lat, max_lat, min_lng, max_lng, bands in _polygons():
        if lat < min_lat or lat > max_lat or lng < min_lng or lng > max_lng:
            continue
        inside = False
        for (ay, ax), (by, bx) in bands.get(math.floor((lat - min_lat) / BAND_DEG), ()):
            if (ay > lat) != (by > lat) and lng < (bx - ax) * (lat - ay) / (by - ay) + ax:
                inside = not inside
        if inside:
            return True
    return False


def near_water(point, reach_m):
    """Whether a point is on a waterway or within reach_m of one (checked four ways)."""
    if on_water(point):
        return True
    lat, lng = point
    d_lat = reach_m / M_PER_DEG_LAT
    d_lng = reach_m / (M_PER_DEG_LAT * math.cos(math.radians(lat)))
    return any(on_water(p) for p in ((lat + d_lat, lng), (lat - d_lat, lng), (lat, lng + d_lng), (lat, lng - d_lng)))


def _inside(x, y, ring):
    hit = False
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[i - 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
    return hit


def area_water(points, closed=True):
    """How much of an area (or, for a line, of its length) is waterway.

    Returns {'size', 'water', 'land', 'unit', 'status'}: size, water and land in square metres for
    an area or metres for a line; status 'none' (no waterway: refused), 'mostly_land' (land more
    than MOSTLY_LAND_RATIO times the waterway: allowed with a warning) or 'ok'.
    """
    lat0 = points[0][0]
    m_per_deg_lng = M_PER_DEG_LAT * math.cos(math.radians(lat0))
    xy = [(lng * m_per_deg_lng, lat * M_PER_DEG_LAT) for lat, lng in points]
    to_point = lambda x, y: (y / M_PER_DEG_LAT, x / m_per_deg_lng)  # noqa: E731

    if closed:
        unit = 'm2'
        size = abs(sum(xy[i - 1][0] * xy[i][1] - xy[i][0] * xy[i - 1][1] for i in range(len(xy)))) / 2
        xs, ys = [p[0] for p in xy], [p[1] for p in xy]
        min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
        cell = max(math.sqrt((max_x - min_x) * (max_y - min_y) / MAX_CELLS), 0.25)
        cells = wet = 0
        x = min_x + cell / 2
        while x < max_x:
            y = min_y + cell / 2
            while y < max_y:
                if _inside(x, y, xy):
                    cells += 1
                    if on_water(to_point(x, y)):
                        wet += 1
                y += cell
            x += cell
        water = size * wet / cells if cells else 0
    else:
        unit = 'm'
        size = sum(math.dist(xy[i - 1], xy[i]) for i in range(1, len(xy)))
        step = max(LINE_STEP_M, size / MAX_LINE_SAMPLES)
        samples = wet = 0
        for i in range(1, len(xy)):
            (ax, ay), (bx, by) = xy[i - 1], xy[i]
            n = max(1, math.ceil(math.dist(xy[i - 1], xy[i]) / step))
            # Each stretch from its start up to (not including) its end; the line's last point after.
            for k in range(n):
                samples += 1
                wet += near_water(to_point(ax + k / n * (bx - ax), ay + k / n * (by - ay)), LINE_REACH_M)
        samples += 1
        wet += near_water(points[-1], LINE_REACH_M)
        water = size * wet / samples if samples else 0

    land = max(size - water, 0)
    minimum = MIN_WATER_M2 if closed else LINE_REACH_M
    if water < minimum:
        status = 'none'
    elif land > MOSTLY_LAND_RATIO * water:
        status = 'mostly_land'
    else:
        status = 'ok'
    return {'size': size, 'water': water, 'land': land, 'unit': unit, 'status': status}


NO_WATER = ('No mapped waterway lies inside this area. Draw it over a river, creek, canal or pond '
            '(shown in blue on the map while drawing).')
