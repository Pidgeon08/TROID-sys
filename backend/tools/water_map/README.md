# Water map and sample areas

Two data files are built from OpenStreetMap with these scripts. They are only needed again when
the water map should be refreshed; the app and the sample data read the built files.

| Built file | Used by |
|---|---|
| `frontend/src/data/sanFernandoWater.json` | Heatmap coverage: only the water inside a collection area, and only points on the water, count. |
| `backend/troid_api/data/sample_areas.json` | `seed_sample_data`: the sample collection areas, drawn over real water, and the path each robot sweeps. |

Water is the sea (split off along OSM's coastline), rivers, creeks, canals and ponds, within
1.2 km of San Fernando's barangays. Rivers and creeks mapped only as a line are widened to a typical
width (see `WIDTHS` in `build_water.py`). Data © OpenStreetMap contributors, ODbL.

## Rebuilding

The scripts need Python with `shapely` (`pip install shapely`, best in a separate virtual environment).

```sh
# 1. Download the water features (any Overpass server works).
curl -A "troid-map-data/1.0" --data-urlencode "data@water_query.overpassql" \
     https://overpass-api.de/api/interpreter -o osm_water.json

# 2. The water map.
python build_water.py osm_water.json ../../../frontend/src/data/sanFernandoBoundaries.json \
       ../../../frontend/src/data/sanFernandoWater.json

# 3. The sample areas and robot paths (run from the repository root).
python backend/tools/water_map/build_samples.py osm_water.json frontend/src/data/sanFernandoWater.json \
       backend backend/troid_api/data/sample_areas.json
```

Then run `python manage.py seed_sample_data` to lay the sample data out on the new shapes.
