"""Builds San Fernando's water map (rivers, creeks, canals, ponds) from an OpenStreetMap extract.
TROID works waterways, not the coast, so the sea is left out.

Run with the scratch venv's Python (it has shapely):
    build_water.py <osm water.json> <boundaries.json> <out.json>
"""
import json
import math
import sys

from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import unary_union

osm_path, bounds_path, out_path = sys.argv[1:4]
LAT0 = 16.61
M_LAT = 111320.0
M_LNG = M_LAT * math.cos(math.radians(LAT0))
REACH_M = 1000 + 200  # boundaries.WATER_REACH_M, and a little more so edges aren't cut short
# Width (m) of a waterway drawn only as a line, when OSM gives none.
WIDTHS = {'river': 20, 'canal': 6, 'stream': 5, 'drain': 3, 'ditch': 2}


def xy(lat, lng):
    return (lng * M_LNG, lat * M_LAT)


def latlng(x, y):
    return [round(y / M_LAT, 6), round(x / M_LNG, 6)]


osm = json.load(open(osm_path, encoding='utf-8'))['elements']
bounds = json.load(open(bounds_path, encoding='utf-8'))
land_city = unary_union([Polygon([xy(*p) for p in b['ring']]).buffer(0) for b in bounds['barangays']])

region = land_city.buffer(REACH_M)

polys = []
for e in osm:
    tags = e.get('tags', {})
    geom = e.get('geometry')
    if e['type'] != 'way' or not geom:
        continue
    pts = [xy(g['lat'], g['lon']) for g in geom]
    if tags.get('natural') in ('water', 'wetland') and len(pts) >= 4 and pts[0] == pts[-1]:
        polys.append(Polygon(pts).buffer(0))
    elif tags.get('waterway') in WIDTHS and len(pts) >= 2:
        try:
            width = float(str(tags.get('width', '')).split()[0])
        except (ValueError, IndexError):
            width = WIDTHS[tags['waterway']]
        polys.append(LineString(pts).buffer(max(width, 2) / 2, cap_style='flat'))

water = unary_union(polys).intersection(region).simplify(1.5, preserve_topology=True)
parts = list(water.geoms) if isinstance(water, MultiPolygon) else [water]
parts = [p for p in parts if p.area > 20]  # specks
out = []
for p in parts:
    out.append([[latlng(x, y) for x, y in p.exterior.coords]] + [[latlng(x, y) for x, y in r.coords] for r in p.interiors])
data = {
    'source': 'Waterways (rivers, creeks, canals, ponds; not the sea) from OpenStreetMap, (c) OpenStreetMap contributors, ODbL. '
              'Rivers and creeks drawn only as lines are widened to a typical width. Coordinates are [latitude, longitude]; '
              'each polygon is its outline followed by any holes (islands).',
    'polygons': out,
}
json.dump(data, open(out_path, 'w', encoding='utf-8'), separators=(',', ':'))
print('polygons', len(out), 'points', sum(len(r) for p in out for r in p), 'water km2 in reach', round(sum(p.area for p in parts) / 1e6, 2))
