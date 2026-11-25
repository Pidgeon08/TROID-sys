"""Sample collection areas drawn over real waterways (rivers, creeks, canals: TROID doesn't work
the coast), with the path a robot would take in each.

    build_samples.py <osm water.json> <water map json> <backend dir> <out json>

Each sample barangay gets:
  points   the area as a person would draw it: a rough outline around the water, banks included
  path     the robot's sweep, [lat, lng] every few metres, all on the water
  pockets  where trash gathers along the path: [fraction along the path, strength]
"""
import importlib.util
import json
import math
import random
import sys

from shapely.affinity import rotate
from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import linemerge, nearest_points, unary_union

osm_path, water_path, backend_dir, out_path = sys.argv[1:5]
spec = importlib.util.spec_from_file_location('boundaries', f'{backend_dir}/troid_api/boundaries.py')
boundaries = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boundaries)
spec = importlib.util.spec_from_file_location('water', f'{backend_dir}/troid_api/water.py')
water_rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(water_rules)

M_LAT = 111320.0
M_LNG = M_LAT * math.cos(math.radians(16.61))
xy = lambda lat, lng: (lng * M_LNG, lat * M_LAT)
ll = lambda x, y: [round(y / M_LAT, 6), round(x / M_LNG, 6)]

rings = {b['name']: Polygon([xy(*p) for p in b['ring']]).buffer(0) for b in boundaries._data()['barangays']}
land = unary_union(list(rings.values()))
water = unary_union([Polygon([xy(*p) for p in poly[0]], [[xy(*p) for p in r] for r in poly[1:]]).buffer(0)
                     for poly in json.load(open(water_path, encoding='utf-8'))['polygons']])
# The coastline, to find which end of a river is its mouth.
coastline = unary_union([LineString([xy(g['lat'], g['lon']) for g in e['geometry']])
                         for e in json.load(open(osm_path, encoding='utf-8'))['elements']
                         if e['type'] == 'way' and e.get('geometry') and e.get('tags', {}).get('natural') == 'coastline'])
# Ponds (fishponds and the like) are water, but a robot in the river can't get into them.
ponds = unary_union([Polygon([xy(g['lat'], g['lon']) for g in e['geometry']]).buffer(0)
                     for e in json.load(open(osm_path, encoding='utf-8'))['elements']
                     if e['type'] == 'way' and e.get('geometry') and len(e['geometry']) > 3
                     and e.get('tags', {}).get('natural') in ('water', 'wetland') and e['tags'].get('water') != 'river'])
inland = water.intersection(land).difference(ponds.buffer(1))
lines = [LineString([xy(g['lat'], g['lon']) for g in e['geometry']])
         for e in json.load(open(osm_path, encoding='utf-8'))['elements']
         if e['type'] == 'way' and e.get('geometry') and len(e['geometry']) > 1
         and e.get('tags', {}).get('waterway') in ('river', 'stream', 'canal', 'drain')]

SWEEP_M = 9       # between sweep lines: the robot clears 5 m either side of its path, so the lanes just meet
STEP_M = 6        # between path nodes
# Each sample area: (name the seed knows it by, its barangay, where on the barangay's waterway it
# is, and how far it reaches from there in metres). 'mouth' is the stretch nearest the sea, 'upper'
# the one furthest from it, 'middle' the middle of what is left. The first seven are the barangays'
# main areas (keyed by barangay); the rest are the extra pending/approved/declined ones.
SPECS = [
    # key, barangay, where, reach (m), margin (m of bank drawn around the water)
    ('Poro', 'Poro', 'middle', 170, 24), ('Tanqui', 'Tanqui', 'middle', 230, 30), ('Catbangen', 'Catbangen', 'mouth', 230, 26),
    ('Carlatan', 'Carlatan', 'middle', 230, 32), ('Pagdaraoan', 'Pagdaraoan', 'middle', 230, 28),
    # Drawn loosely around a narrow creek: mostly land, so it shows the warning when it is reshaped.
    ('San Vicente', 'San Vicente', 'middle', 200, 48),
    ('Biday', 'Biday', 'middle', 230, 30),
    ('Biday Tributary', 'Biday', 'upper', 200, 22), ('Carlatan Upper Creek', 'Carlatan', 'upper', 180, 26),
    ('Catbangen Upper Riverbank', 'Catbangen', 'upper', 200, 24),
]


def largest(geom):
    parts = list(getattr(geom, 'geoms', [geom]))
    return max(parts, key=lambda g: g.area) if parts else geom


def resample(line, step=STEP_M):
    n = max(2, int(line.length // step) + 1)
    return [line.interpolate(i * line.length / (n - 1)) for i in range(n)]


def sweep(poly):
    """Back-and-forth lines across a polygon along its long side, joined end to end."""
    rect = poly.minimum_rotated_rectangle
    xs, ys = rect.exterior.coords.xy
    edges = [((xs[i], ys[i]), (xs[i + 1], ys[i + 1])) for i in range(4)]
    (ax, ay), (bx, by) = max(edges, key=lambda e: math.dist(*e))
    angle = math.degrees(math.atan2(by - ay, bx - ax))
    c = poly.centroid
    flat = rotate(poly, -angle, origin=c)
    minx, miny, maxx, maxy = flat.bounds
    nodes, flip = [], False
    y = miny + SWEEP_M / 2
    while y < maxy:
        cut = flat.intersection(LineString([(minx - 1, y), (maxx + 1, y)]))
        segs = sorted(getattr(cut, 'geoms', [cut]), key=lambda s: s.bounds[0]) if not cut.is_empty else []
        segs = [s for s in segs if s.length > 4]
        if segs:
            seg = max(segs, key=lambda s: s.length)
            pts = resample(seg)
            nodes += reversed(pts) if flip else pts
            flip = not flip
        y += SWEEP_M
    return [rotate(p, angle, origin=c) for p in nodes]


def along(poly):
    """Up the channel and back, following the waterway's own line through the area."""
    inside = [l.intersection(poly.buffer(2)) for l in lines if l.intersects(poly)]
    merged = linemerge([g for l in inside for g in getattr(l, 'geoms', [l]) if g.length > 0])
    path = max(getattr(merged, 'geoms', [merged]), key=lambda g: g.length) if not merged.is_empty else None
    if path is None or path.length < 40:
        return sweep(poly)
    out = resample(path)
    back = resample(path.parallel_offset(min(4, poly.area / path.length / 4), 'left'))  # the other side on the way back
    return out + list(reversed(back)) if back and len(back) > 2 else out + list(reversed(out))


used = []  # areas already laid out, so two barangays sharing a river get different stretches


def crude(wet, margin, rng):
    """The water outlined as a person would with a few clicks on a map: a rough margin of bank
    around it, few corners, none of them exactly placed."""
    rough = largest(wet.buffer(margin, join_style='mitre').simplify(margin * 0.7))
    corners = list(rough.exterior.coords)[:-1]
    wobble = margin * 0.25
    moved = [(x + rng.uniform(-wobble, wobble), y + rng.uniform(-wobble, wobble)) for x, y in corners]
    shape = Polygon(moved).buffer(0)
    # A wobble that leaves the water partly outside is redrawn wider, as a person would.
    return largest(shape.union(wet.buffer(4)).simplify(margin * 0.4)) if not shape.contains(wet.buffer(-1)) else largest(shape)


def build(name, where, reach, margin, rng):
    ring = rings[name]
    taken = unary_union(used).buffer(40) if used else None
    river = inland.intersection(ring.buffer(10))
    river = largest(river.difference(taken) if taken is not None else river)
    if where == 'middle':
        anchor = river.representative_point()
    else:
        # The ends of the waterway in the barangay: its points nearest and furthest from the sea.
        corners = [Point(c) for g in getattr(river, 'geoms', [river]) for c in g.exterior.coords]
        corners.sort(key=lambda c: c.distance(coastline))
        anchor = corners[0] if where == 'mouth' else corners[-1]
    wet = largest(river.intersection(anchor.buffer(reach)))
    outline = crude(wet, margin, rng)
    points = [ll(x, y) for x, y in list(outline.exterior.coords)[:-1]]
    problem = boundaries.check_area(points, name)
    if problem:
        outline = largest(outline.intersection(ring.buffer(25)).simplify(5))
        points = [ll(x, y) for x, y in list(outline.exterior.coords)[:-1]]
        problem = boundaries.check_area(points, name)
    measured = water_rules.area_water(points)
    problem = problem or ('no waterway inside' if measured['status'] == 'none' else None)
    used.append(outline)
    on_water = largest(outline.intersection(water).difference(ponds.buffer(1)))
    nodes = along(on_water)
    nodes = [p for p in nodes if water.buffer(1).contains(p)] or nodes
    pockets = [[round(rng.uniform(0.05, 0.95), 3), round(rng.uniform(0.6, 1.0), 2)] for _ in range(rng.randint(2, 4))]
    return {
        'kind': where, 'points': points, 'problem': problem, 'status': measured['status'],
        'water_m2': round(on_water.area), 'outline_m2': round(outline.area),
        'path': [ll(p.x, p.y) for p in nodes], 'pockets': pockets,
    }


rng = random.Random(7)
result = {}
for key, name, where, reach, margin in SPECS:
    area = build(name, where, reach, margin, rng)
    print(f"{key[:24]:24} {area['kind']:8} pts {len(area['points']):3} water {area['water_m2']:7} m2 of {area['outline_m2']:7} "
          f"| path nodes {len(area['path']):4} | {area['status']:11} | check: {area['problem'] or 'ok'}")
    area.pop('problem')
    area.pop('status')
    area.pop('outline_m2')
    result[key] = area
json.dump(result, open(out_path, 'w', encoding='utf-8'), separators=(',', ':'))
