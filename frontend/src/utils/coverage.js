// How much of a collection area TROID covered, worked out from its travel path: the points the
// robot reported, joined in the order it reported them (one line per robot per run). The path
// counts as covering TRAVEL_REACH_M either side of it; the area is sampled on a grid and the share
// of grid cells that close to the path is the coverage. Only the water inside the area counts
// (utils/water: rivers, creeks, canals and ponds, the waterways TROID works), and only points
// reported on them make up the path. Distances use a flat projection around the area,
// which is accurate at barangay scale.
import { nearWater, onWater, reportedOnWater } from './water';

const M_PER_DEG_LAT = 111320;
// Enough grid cells for a sub-percent answer while staying fast on every 5-second refresh.
const MAX_CELLS = 40000;
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

// --- how much of a collection area is waterway --------------------------------------
// Mirrors backend/troid_api/water.py (area_water), so the browser and the server agree. Change both together.

// Less waterway than this inside an area is none: the outline only grazes a bank.
export const MIN_WATER_M2 = 20;
// A drawn line counts as on the waterway where it comes this close to it.
const LINE_REACH_M = 8;
// More than this much land for each square metre of waterway, and the creator is warned.
export const MOSTLY_LAND_RATIO = 10;
const WATER_CELLS = 4000;
const LINE_STEP_M = 2;
const MAX_LINE_SAMPLES = 2000;

/**
 * How much of a drawn area (or, for a line, of its length) is mapped waterway.
 * { size, water, land, unit: 'm2' | 'm', status } — status 'none' (no waterway: it can't be
 * saved), 'mostlyLand' (land more than MOSTLY_LAND_RATIO times the waterway: a warning) or 'ok'.
 */
export function areaWater(points, closed = true) {
  const lat0 = points[0][0];
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map(projector(lat0));
  const toPoint = (x, y) => [y / M_PER_DEG_LAT, x / mPerDegLng];
  let size;
  let water;
  if (closed) {
    size = shoelaceM2(xy);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const cell = Math.max(Math.sqrt(((maxX - minX) * (maxY - minY)) / WATER_CELLS), 0.25);
    let cells = 0;
    let wet = 0;
    for (let x = minX + cell / 2; x < maxX; x += cell) {
      for (let y = minY + cell / 2; y < maxY; y += cell) {
        if (!insideRing([x, y], xy)) continue;
        cells += 1;
        if (onWater(toPoint(x, y))) wet += 1;
      }
    }
    water = cells ? (size * wet) / cells : 0;
  } else {
    size = 0;
    for (let i = 1; i < xy.length; i++) size += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    const step = Math.max(LINE_STEP_M, size / MAX_LINE_SAMPLES);
    let samples = 0;
    let wet = 0;
    for (let i = 1; i < xy.length; i++) {
      const [ax, ay] = xy[i - 1];
      const [bx, by] = xy[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      // Each stretch from its start up to (not including) its end; the line's last point after.
      for (let k = 0; k < n; k++) {
        samples += 1;
        if (nearWater(toPoint(ax + (k / n) * (bx - ax), ay + (k / n) * (by - ay)), LINE_REACH_M)) wet += 1;
      }
    }
    samples += 1;
    if (nearWater(points[points.length - 1], LINE_REACH_M)) wet += 1;
    water = samples ? (size * wet) / samples : 0;
  }
  const land = Math.max(size - water, 0);
  const status = water < (closed ? MIN_WATER_M2 : LINE_REACH_M) ? "none" : land > MOSTLY_LAND_RATIO * water ? "mostlyLand" : "ok";
  return { size, water, land, unit: closed ? "m2" : "m", status };
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
 * order they were reported, one line per cleanup request per robot per day (trailRuns).
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
  // Points off the waterways (GPS gone astray, a report from the bank or out at sea) aren't part of the path.
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
 * Distance and time along the robot's trail, from its reports in time order, per cleanup run
 * (trailRuns), so separate cleanups and days aren't joined up.
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

// Days are Manila's, like the cleanups' schedules.
const dayOf = (time) => new Date(time).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/**
 * The robot's reports as runs to draw as a path: one per cleanup request, per robot, per day, its
 * points in the order they were reported (by id when two share a time). Runs never join each
 * other, so one robot's back-to-back cleanups stay apart. A report with no request is a run of its
 * own (a lone point, joined to nothing).
 * @returns [{ boat, request, day, nodes: [{ at: [lat, lng], time, report }] }]
 */
export function trailRuns(reports) {
  const groups = new Map();
  (reports || []).forEach((report, index) => {
    const time = new Date(report.timestamp).getTime();
    if (!Number.isFinite(report.latitude) || !Number.isFinite(report.longitude) || !Number.isFinite(time)) return;
    const boat = report.boat ?? '';
    const request = report.request ?? null;
    const day = dayOf(time);
    const key = request ? `${request}|${boat}|${day}` : `none|${report.id ?? index}`;
    if (!groups.has(key)) groups.set(key, { boat, request, day, nodes: [] });
    groups.get(key).nodes.push({ at: [report.latitude, report.longitude], time, report, order: report.id ?? index });
  });

  const runs = [...groups.values()];
  for (const run of runs) run.nodes.sort((a, b) => a.time - b.time || a.order - b.order);
  return runs.sort((a, b) => a.nodes[0].time - b.nodes[0].time);
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
