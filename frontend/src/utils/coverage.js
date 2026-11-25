// How much of a collection area TROID covered, worked out from its travel path: the points the
// robot reported, joined in the order it reported them (one line per robot per run). The path
// counts as covering TRAVEL_REACH_M either side of it; the area is sampled on a grid and the share
// of grid cells that close to the path is the coverage. Only the water inside the area counts
// (utils/water: the sea, rivers, creeks and ponds), since that is all a boat can cover, and only
// points reported on the water make up the path. Distances use a flat projection around the area,
// which is accurate at barangay scale.
import { onWater, reportedOnWater } from './water';

const M_PER_DEG_LAT = 111320;
// Enough grid cells for a sub-percent answer while staying fast on every 5-second refresh.
const MAX_CELLS = 40000;
// Two reports further apart than this are treated as separate runs when measuring the trail.
export const TRAIL_GAP_MS = 15 * 60 * 1000;
// How far either side of its travel path the robot clears.
export const TRAVEL_REACH_M = 5;

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

/** Squared distance from (x, y) to the segment a–b, in projected metres. */
function segmentDistance2(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

/**
 * The robot's travel path, as [[lat, lng], ...] lines: its points on the water joined in the
 * order they were reported, one line per robot per run (trailRuns).
 * @param reports  [{ latitude, longitude, timestamp, boat? }, ...]
 */
export function travelLines(reports) {
  return trailRuns(reports)
    .map((run) => run.nodes.map((node) => node.at).filter((at) => reportedOnWater(at)))
    .filter((line) => line.length > 0);
}

/**
 * Compares the robot's travel path with an area.
 * @param latLngRing  the area's [[lat, lng], ...] outline
 * @param reports     [{ latitude, longitude, timestamp, boat? }, ...] the robot reported
 */
export function areaCoverage(latLngRing, reports) {
  const empty = {
    areaM2: 0, outlineM2: 0, waterMapped: false, coveredM2: 0, coveredPct: 0, inside: 0, outside: 0, onLand: 0, total: 0,
  };
  if (!Array.isArray(latLngRing) || latLngRing.length < 3) return empty;

  const lat0 = latLngRing[0][0];
  const project = projector(lat0);
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const unproject = (x, y) => [y / M_PER_DEG_LAT, x / mPerDegLng];
  const ring = latLngRing.map(project);
  const outlineM2 = shoelaceM2(ring);
  const valid = (reports || [])
    .filter((r) => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude))
    .map((r) => [r.latitude, r.longitude]);
  const inside = valid.filter((p) => insideRing(project(p), ring)).length;
  // Points on land (GPS gone astray, or a report from the shore) aren't part of the path.
  const onLand = valid.filter((p) => !reportedOnWater(p)).length;
  const result = { ...empty, areaM2: outlineM2, outlineM2, inside, outside: valid.length - inside, onLand, total: valid.length };
  if (outlineM2 === 0) return result;

  // Each stretch of the path, filed under the grid squares it passes within reach of, so a cell
  // only checks the stretches near it. A lone point is a stretch of no length.
  const reach = TRAVEL_REACH_M;
  const square = Math.max(reach * 4, 20);
  const buckets = new Map();
  for (const line of travelLines(reports)) {
    const pts = line.map(project);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      if (i > 0 && i === pts.length - 1) break;
      const [x0, x1] = [Math.min(a[0], b[0]) - reach, Math.max(a[0], b[0]) + reach];
      const [y0, y1] = [Math.min(a[1], b[1]) - reach, Math.max(a[1], b[1]) + reach];
      for (let bx = Math.floor(x0 / square); bx <= Math.floor(x1 / square); bx++) {
        for (let by = Math.floor(y0 / square); by <= Math.floor(y1 / square); by++) {
          const key = bucketKey(bx, by);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push([a, b]);
        }
      }
    }
  }
  const r2 = reach * reach;
  const reached = (x, y) => {
    const near = buckets.get(bucketKey(Math.floor(x / square), Math.floor(y / square)));
    return Boolean(near && near.some(([a, b]) => segmentDistance2(x, y, a, b) <= r2));
  };

  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cell = Math.max(Math.sqrt(((maxX - minX) * (maxY - minY)) / MAX_CELLS), 0.25);

  // Each cell of the outline, and whether it is water and close enough to the path.
  let cellsInArea = 0;
  let wetCells = 0;
  let wetCovered = 0;
  let allCovered = 0;
  for (let x = minX + cell / 2; x < maxX; x += cell) {
    for (let y = minY + cell / 2; y < maxY; y += cell) {
      if (!insideRing([x, y], ring)) continue;
      cellsInArea += 1;
      const hit = buckets.size > 0 && reached(x, y);
      if (hit) allCovered += 1;
      if (onWater(unproject(x, y))) {
        wetCells += 1;
        if (hit) wetCovered += 1;
      }
    }
  }
  if (cellsInArea === 0) return result;
  // An area with no mapped water (a creek too small for the map) is measured on its whole outline.
  const waterMapped = wetCells > 0;
  const areaM2 = waterMapped ? (wetCells / cellsInArea) * outlineM2 : outlineM2;
  const share = waterMapped ? wetCovered / wetCells : allCovered / cellsInArea;
  return { ...result, areaM2, waterMapped, coveredM2: share * areaM2, coveredPct: share * 100 };
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

/** Length of a [[lat, lng], ...] line in metres. */
export function pathLengthM(latLngs) {
  let total = 0;
  for (let i = 1; i < (latLngs?.length || 0); i++) total += metresBetween(latLngs[i - 1], latLngs[i]);
  return total;
}

/**
 * Distance and time along the robot's trail, from its reports in time order, per robot.
 * Gaps longer than TRAIL_GAP_MS start a new run, so separate drives aren't joined up.
 * @param reports  [{ latitude, longitude, timestamp, boat? }, ...]
 */
export function trailStats(reports) {
  const runs = trailRuns(reports);
  let distanceM = 0;
  let activeMs = 0;
  let first = null;
  let last = null;
  for (const { nodes } of runs) {
    for (let i = 0; i < nodes.length; i++) {
      const { time } = nodes[i];
      if (first === null || time < first) first = time;
      if (last === null || time > last) last = time;
      if (i === 0) continue;
      activeMs += time - nodes[i - 1].time;
      distanceM += metresBetween(nodes[i - 1].at, nodes[i].at);
    }
  }
  return { distanceM, activeMs, first, last, robots: new Set(runs.map((r) => r.boat)).size };
}

/**
 * The robot's reports as runs to draw as a path: per robot, in time order, split where
 * two reports are more than TRAIL_GAP_MS apart.
 * @returns [{ boat, nodes: [{ at: [lat, lng], time, report }] }]
 */
export function trailRuns(reports) {
  const byBoat = new Map();
  for (const report of reports || []) {
    const time = new Date(report.timestamp).getTime();
    if (!Number.isFinite(report.latitude) || !Number.isFinite(report.longitude) || !Number.isFinite(time)) continue;
    const key = report.boat ?? '';
    if (!byBoat.has(key)) byBoat.set(key, []);
    byBoat.get(key).push({ at: [report.latitude, report.longitude], time, report });
  }

  const runs = [];
  for (const [boat, list] of byBoat) {
    list.sort((a, b) => a.time - b.time);
    let run = null;
    for (const node of list) {
      if (!run || node.time - run.nodes[run.nodes.length - 1].time > TRAIL_GAP_MS) {
        run = { boat, nodes: [] };
        runs.push(run);
      }
      run.nodes.push(node);
    }
  }
  return runs;
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
