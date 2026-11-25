// Where the waterways are around San Fernando: rivers, creeks, canals and ponds (not the sea, as
// TROID doesn't work the coast), from OpenStreetMap (data/sanFernandoWater.json, built by backend/tools/water_map). Coverage on the
// Heatmap only counts the water inside a collection area, and only points TROID reported on it.
import data from "../data/sanFernandoWater.json";

// Latitude bands each polygon's edges are filed under, so a point is only tested against the few
// edges that cross its band instead of all of a polygon's (a long river has thousands).
const BAND_DEG = 0.0004; // about 45 m

function indexPolygon(rings) {
  const lats = rings[0].map((p) => p[0]);
  const lngs = rings[0].map((p) => p[1]);
  const minLat = Math.min(...lats);
  const bands = new Map();
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j];
      const b = ring[i];
      const from = Math.floor((Math.min(a[0], b[0]) - minLat) / BAND_DEG);
      const to = Math.floor((Math.max(a[0], b[0]) - minLat) / BAND_DEG);
      for (let band = from; band <= to; band++) {
        if (!bands.has(band)) bands.set(band, []);
        bands.get(band).push(a, b);
      }
    }
  }
  return { minLat, maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs), bands };
}

const POLYGONS = data.polygons.map(indexPolygon);

/** Whether a [lat, lng] point is on the water. An island inside a polygon is a hole in it. */
export function onWater([lat, lng]) {
  for (const poly of POLYGONS) {
    if (lat < poly.minLat || lat > poly.maxLat || lng < poly.minLng || lng > poly.maxLng) continue;
    const edges = poly.bands.get(Math.floor((lat - poly.minLat) / BAND_DEG));
    if (!edges) continue;
    let inside = false;
    for (let k = 0; k < edges.length; k += 2) {
      const [ay, ax] = edges[k];
      const [by, bx] = edges[k + 1];
      if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// GPS on a boat drifts a few metres; a point this close to the water still counts as on it.
const DRIFT_M = 8;

/** Whether a [lat, lng] point TROID reported is on the water, allowing for GPS drift. */
export function reportedOnWater([lat, lng]) {
  if (onWater([lat, lng])) return true;
  const dLat = DRIFT_M / 111320;
  const dLng = DRIFT_M / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lat + dLat, lng], [lat - dLat, lng], [lat, lng + dLng], [lat, lng - dLng]].some(onWater);
}
