"""Sample collection areas drawn over real water, with the path a robot would sweep in each.

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

M_LAT = 111320.0
M_LNG = M_LAT * math.cos(math.radians(16.61))
xy = lambda lat, lng: (lng * M_LNG, lat * M_LAT)
ll = lambda x, y: [round(y / M_LAT, 6), round(x / M_LNG, 6)]

rings = {b['name']: Polygon([xy(*p) for p in b['ring']]).buffer(0) for b in boundaries._data()['barangays']}
land = unary_union(list(rings.values()))
water = unary_union([Polygon([xy(*p) for p in poly[0]], [[xy(*p) for p in r] for r in poly[1:]]).buffer(0)
                     for poly in json.load(open(water_path, encoding='utf-8'))['polygons']])
sea = water.difference(land)
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

SWEEP_M = 18      # between sweep lines, so a 10 m coverage radius just about meets the next line
STEP_M = 6        # between path nodes
# Each sample area: (name the seed knows it by, its barangay, how it is laid out). The first seven
# are the barangays' main areas (keyed by barangay); the rest are the extra pending/declined/new ones.
SPECS = [
    ('Poro', 'Poro', 'coast'), ('Lingsat', 'Lingsat', 'coast'), ('Catbangen', 'Catbangen', 'estuary'),
    ('Carlatan', 'Carlatan', 'river'), ('Pagdaraoan', 'Pagdaraoan', 'river'), ('San Vicente', 'San Vicente', 'river'),
    ('Biday', 'Biday', 'river'),
    ('Poro Fish Port Basin', 'Poro', 'coast'), ('Poro Seawall Outfall', 'Poro', 'coast'),
    ('Catbangen Upper Riverbank', 'Catbangen', 'river'),
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


def coast_window(name, reach, taken=None):
    ring = rings[name]
    shore = ring.boundary.intersection(sea.buffer(5))
    if taken is not None:
        shore = shore.difference(taken.buffer(120))
    anchor = nearest_points(shore, ring.centroid)[0] if not shore.is_empty else ring.centroid
    return sea.intersection(land.buffer(reach)).intersection(anchor.buffer(190)), anchor


used = []  # areas already laid out, so two barangays sharing a river get different stretches


def build(name, kind, rng):
    ring = rings[name]
    taken = unary_union(used).buffer(120) if used else None
    if kind == 'coast':
        wet, _ = coast_window(name, 110, taken)
        wet = largest(wet)
    elif kind == 'estuary':
        river = largest(inland.intersection(ring.buffer(20)))
        mouth = nearest_points(river, sea)[0]
        wet = largest(unary_union([river.intersection(mouth.buffer(220)), sea.intersection(land.buffer(70)).intersection(mouth.buffer(140))]))
    else:
        river = inland.intersection(ring.buffer(10))
        river = largest(river.difference(taken) if taken is not None else river)
        middle = river.representative_point()
        wet = largest(river.intersection(middle.buffer(230)))
    # As a person would draw it: around the water, a little of the banks too, in a dozen or so clicks.
    outline = wet.buffer(14, join_style='mitre').simplify(7)
    outline = largest(outline)
    points = [ll(x, y) for x, y in list(outline.exterior.coords)[:-1]]
    problem = boundaries.check_area(points, name)
    if problem:
        outline = largest(outline.intersection(ring.buffer(25)).simplify(5))
        points = [ll(x, y) for x, y in list(outline.exterior.coords)[:-1]]
        problem = boundaries.check_area(points, name)
    used.append(outline)
    on_water = largest(outline.intersection(water).difference(ponds.buffer(1)))
    nodes = sweep(on_water) if kind == 'coast' else along(on_water)
    nodes = [p for p in nodes if water.buffer(1).contains(p)] or nodes
    pockets = [[round(rng.uniform(0.05, 0.95), 3), round(rng.uniform(0.6, 1.0), 2)] for _ in range(rng.randint(2, 4))]
    return {
        'kind': kind, 'points': points, 'problem': problem,
        'water_m2': round(on_water.area), 'outline_m2': round(outline.area),
        'path': [ll(p.x, p.y) for p in nodes], 'pockets': pockets,
    }


rng = random.Random(7)
result = {}
for key, name, kind in SPECS:
    area = build(name, kind, rng)
    print(f"{key[:24]:24} {area['kind']:8} pts {len(area['points']):3} water {area['water_m2']:7} m2 of {area['outline_m2']:7} "
          f"| path nodes {len(area['path']):4} | check: {area['problem'] or 'ok'}")
    area.pop('problem')
    area.pop('outline_m2')
    result[key] = area
json.dump(result, open(out_path, 'w', encoding='utf-8'), separators=(',', ':'))
