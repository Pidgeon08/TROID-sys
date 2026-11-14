// How much of a collection area TROID covered, worked out from the points the robot reported
// (its detections). Each point counts as covering a circle of `radiusM` metres around it; the
// area is sampled on a grid and the share of grid cells within reach of a point is the coverage.
// Distances use a flat projection around the area, which is accurate at barangay scale.

const M_PER_DEG_LAT = 111320;
// Enough grid cells for a sub-percent answer while staying fast on every 5-second refresh.
const MAX_CELLS = 40000;
// Two reports further apart than this are treated as separate runs when measuring the trail.
export const TRAIL_GAP_MS = 15 * 60 * 1000;

function projector(lat0) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return ([lat, lng]) => [lng * mPerDegLng, lat * M_PER_DEG_LAT];
}

// Projected metres are in the millions at most, so bucket indices fit one number without colliding.
const bucketKey = (bx, by) => bx * 4194304 + by;

function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function shoelaceM2(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum) / 2;
}

/** Whether a collection area's points describe a closed shape that coverage can be measured on. */
export function isMeasurableArea(area) {
  return Boolean(area && area.closed !== false && Array.isArray(area.points) && area.points.length >= 3);
}

/** Size of a [[lat, lng], ...] ring in square metres. */
export function ringAreaM2(latLngRing) {
  if (!Array.isArray(latLngRing) || latLngRing.length < 3) return 0;
  const project = projector(latLngRing[0][0]);
  return shoelaceM2(latLngRing.map(project));
}

/**
 * Compares the robot's points with an area.
 * @param latLngRing  the area's [[lat, lng], ...] outline
 * @param points      [[lat, lng, ...], ...] the robot reported
 * @param radiusM     how far around each point counts as covered
 */
export function areaCoverage(latLngRing, points, radiusM) {
  const empty = { areaM2: 0, coveredM2: 0, coveredPct: 0, inside: 0, outside: 0, total: 0 };
  if (!Array.isArray(latLngRing) || latLngRing.length < 3) return empty;

  const project = projector(latLngRing[0][0]);
  const ring = latLngRing.map(project);
  const areaM2 = shoelaceM2(ring);
  const pts = (points || []).filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).map(project);

  const inside = pts.filter((p) => insideRing(p, ring)).length;
  const result = { ...empty, areaM2, inside, outside: pts.length - inside, total: pts.length };
  if (pts.length === 0 || areaM2 === 0 || !(radiusM > 0)) return result;

  // Bucket the points by radius so each cell only checks its neighbours.
  const buckets = new Map();
  for (const [x, y] of pts) {
    const key = bucketKey(Math.floor(x / radiusM), Math.floor(y / radiusM));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push([x, y]);
  }
  const r2 = radiusM * radiusM;
  const reached = (x, y) => {
    const bx = Math.floor(x / radiusM);
    const by = Math.floor(y / radiusM);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const near = buckets.get(bucketKey(bx + dx, by + dy));
        if (near && near.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= r2)) return true;
      }
    }
    return false;
  };

  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cell = Math.max(Math.sqrt(((maxX - minX) * (maxY - minY)) / MAX_CELLS), 0.25);

  let cellsInArea = 0;
  let cellsCovered = 0;
  for (let x = minX + cell / 2; x < maxX; x += cell) {
    for (let y = minY + cell / 2; y < maxY; y += cell) {
      if (!insideRing([x, y], ring)) continue;
      cellsInArea += 1;
      if (reached(x, y)) cellsCovered += 1;
    }
  }
  if (cellsInArea === 0) return result;
  const share = cellsCovered / cellsInArea;
  return { ...result, coveredM2: share * areaM2, coveredPct: share * 100 };
}

/** The points inside and outside an area, as given (so the map can colour them apart). */
export function splitByArea(latLngRing, points) {
  if (!Array.isArray(latLngRing) || latLngRing.length < 3) return { inside: [], outside: points || [] };
  const project = projector(latLngRing[0][0]);
  const ring = latLngRing.map(project);
  const inside = [];
  const outside = [];
  for (const p of points || []) {
    if (!Number.isFinite(p?.[0]) || !Number.isFinite(p?.[1])) continue;
    (insideRing(project(p), ring) ? inside : outside).push(p);
  }
  return { inside, outside };
}

function metresBetween([lat1, lng1], [lat2, lng2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * Distance and time along the robot's trail, from its reports in time order, per robot.
 * Gaps longer than TRAIL_GAP_MS start a new run, so separate drives aren't joined up.
 * @param reports  [{ latitude, longitude, timestamp, boat? }, ...]
 */
export function trailStats(reports) {
  const byBoat = new Map();
  for (const r of reports || []) {
    const time = new Date(r.timestamp).getTime();
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || !Number.isFinite(time)) continue;
    const key = r.boat ?? '';
    if (!byBoat.has(key)) byBoat.set(key, []);
    byBoat.get(key).push({ at: [r.latitude, r.longitude], time });
  }

  let distanceM = 0;
  let activeMs = 0;
  let first = null;
  let last = null;
  for (const list of byBoat.values()) {
    list.sort((a, b) => a.time - b.time);
    for (let i = 0; i < list.length; i++) {
      const { time } = list[i];
      if (first === null || time < first) first = time;
      if (last === null || time > last) last = time;
      if (i === 0) continue;
      const gap = time - list[i - 1].time;
      if (gap > TRAIL_GAP_MS) continue;
      activeMs += gap;
      distanceM += metresBetween(list[i - 1].at, list[i].at);
    }
  }
  return { distanceM, activeMs, first, last, robots: byBoat.size };
}

export function formatArea(m2) {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

export function formatDistance(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
