// Barangay boundaries of the City of San Fernando, La Union, and where a collection area may go.
// These rules mirror backend/troid_api/boundaries.py, which checks every area again on save;
// data/sanFernandoBoundaries.json is the same file as the backend's. Change both together.
//
// A point belongs to a barangay's collection area when it is
//  - inside the barangay, or
//  - just across its border inside a neighbouring barangay (border creeks and rivers), or
//  - out on the water near the barangay's coast or riverbank (outside every barangay and every
//    neighbouring town).
import data from "../data/sanFernandoBoundaries.json";

// How far across a border into a neighbouring barangay a point may sit.
export const BORDER_SLACK_M = 30;
// How far out on the water from the barangay a point may sit.
export const WATER_REACH_M = 1000;

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG_EQUATOR = 111320;

export const BOUNDARY_SOURCE = data.source;
export const BARANGAYS = data.barangays.map((b) => b.name);

const key = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^\s*(brgy|bgy)\s+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

/** The official name for a barangay typed any reasonable way ("poro", "Brgy. Poro"), else null. */
export function canonicalBarangay(name) {
  const k = key(name);
  if (!k) return null;
  return data.barangays.find((b) => key(b.name) === k)?.name || null;
}

/** The barangay's outline as [lat, lng] points, or null. */
export function barangayRing(name) {
  return data.barangays.find((b) => b.name === name)?.ring || null;
}

function inside([lat, lng], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[j];
    if (lat1 > lat !== lat2 > lat && lng < ((lng2 - lng1) * (lat - lat1)) / (lat2 - lat1) + lng1) hit = !hit;
  }
  return hit;
}

function distanceToRingM([lat0, lng0], ring) {
  const kx = M_PER_DEG_LNG_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][1] - lng0) * kx, ay = (ring[j][0] - lat0) * M_PER_DEG_LAT;
    const bx = (ring[i][1] - lng0) * kx, by = (ring[i][0] - lat0) * M_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function barangayAt(point) {
  return data.barangays.find((b) => inside(point, b.ring))?.name || null;
}

/** null when the point may be part of the barangay's collection area, else why it may not. */
export function placePoint(point, barangay) {
  const ring = barangayRing(barangay);
  if (!ring) return `${barangay || "This barangay"} isn't a barangay of San Fernando`;
  if (inside(point, ring)) return null;
  const near = distanceToRingM(point, ring);
  const other = barangayAt(point);
  if (other) return near <= BORDER_SLACK_M ? null : `That spot is in ${other}, not ${barangay}`;
  const town = data.neighbors.find((m) => inside(point, m.ring))?.name;
  if (town) return `That spot is in ${town}, outside San Fernando`;
  return near <= WATER_REACH_M ? null : `That spot is more than ${WATER_REACH_M.toLocaleString("en-US")} m out from ${barangay}`;
}

/** The [[south, west], [north, east]] box around a barangay, for fitting the map to it. */
export function barangayBounds(name) {
  const ring = barangayRing(name);
  if (!ring) return null;
  const lats = ring.map((p) => p[0]);
  const lngs = ring.map((p) => p[1]);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}
