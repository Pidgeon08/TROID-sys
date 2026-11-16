// The numbers behind the Reports page: finished cleanups with a filed trash report, grouped
// into the chosen period and compared with the period of the same length just before it.
// Days are YYYY-MM-DD in Manila, the zone the server dates cleanups in.
import { manilaDate, requestArea, toStatusLabel, TRASH_CATEGORIES } from "../constants/requests";

// --- days -------------------------------------------------------------------------

export function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included. */
export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
}

export function formatDay(day, withYear = true) {
  if (!day) return "";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
  });
}

const monthIndex = (day) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;

// --- the period -------------------------------------------------------------------

/**
 * The period the report covers and the one it is compared with. A start date is needed for a
 * comparison (the previous period is the same number of days just before it); without an end
 * date the period runs to today. With neither date the report covers all time.
 */
export function reportPeriod(dateFrom, dateTo, today = manilaDate(new Date())) {
  let from = dateFrom || "";
  let to = dateTo || "";
  if (from && to && from > to) [from, to] = [to, from];
  if (!from && !to) return { from: "", to: "", label: "All time", previous: null };
  if (!from) return { from: "", to, label: `Until ${formatDay(to)}`, previous: null };
  if (!to) to = today < from ? from : today;
  const length = daysBetween(from, to);
  const previous = { from: addDays(from, -length), to: addDays(from, -1) };
  previous.label = describeRange(previous.from, previous.to);
  return { from, to, label: describeRange(from, to), days: length, previous };
}

export function describeRange(from, to) {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}

// --- what the period is compared with ----------------------------------------------

export const COMPARE_OPTIONS = {
  previous: "Previous period",
  week: "Same dates last week",
  month: "Same dates last month",
  year: "Same dates last year",
  custom: "Another date range",
  none: "No comparison",
};

/** The same day `months` calendar months earlier, kept inside that month (Mar 31 → Feb 28). */
export function shiftMonths(day, months) {
  const target = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 - months;
  const year = Math.floor(target / 12);
  const month = target - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, "0")}`;
}

/**
 * The period with what it is compared with as `previous` ({ from, to, label, name }), or
 * null for no comparison. The shifted choices need a start date; "Another date range" needs
 * both of its dates. `overlaps` says when the two share days, which makes the change smaller.
 */
export function withComparison(period, mode = "previous", custom = {}) {
  const make = (from, to, name) => ({ from, to, label: describeRange(from, to), name });
  let previous = null;
  if (mode === "custom") {
    let { from, to } = custom;
    if (from && to) {
      if (from > to) [from, to] = [to, from];
      previous = make(from, to, "the chosen range");
    }
  } else if (period.from && mode !== "none") {
    if (mode === "week") previous = make(addDays(period.from, -7), addDays(period.to, -7), "the same dates last week");
    else if (mode === "month") previous = make(shiftMonths(period.from, 1), shiftMonths(period.to, 1), "the same dates last month");
    else if (mode === "year") previous = make(shiftMonths(period.from, 12), shiftMonths(period.to, 12), "the same dates last year");
    else if (period.previous) previous = { ...period.previous, name: "the previous period" };
  }
  const overlaps = Boolean(previous && previous.from <= period.to && (!period.from || previous.to >= period.from));
  return { ...period, previous, compareMode: mode, overlaps };
}

/** Why there is no comparison, for the page to say. */
export function noComparisonReason(period) {
  if (period.compareMode === "none") return "No comparison chosen";
  if (period.compareMode === "custom") return "Choose both dates of the range to compare with";
  return "Set a start date to compare with an earlier period";
}

export function inPeriod(day, period) {
  if (!day || !period) return false;
  if (period.from && day < period.from) return false;
  if (period.to && day > period.to) return false;
  return true;
}

// --- collections ------------------------------------------------------------------

/** Where a request counts toward: its barangay, or its landmark when it has none. */
export const requestBarangay = (req) => req.barangay || req.location_name || "";

/**
 * One row per finished cleanup with a filed trash report. Archived requests and requests
 * merged into another (whose cleanup and report are the other one's) are left out, so no
 * bag is counted twice. Old reports without a finish time fall back to the submission date.
 */
export function toCollections(requests, { boats = [], operators = [] } = {}) {
  const boatNames = new Map(boats.map((b) => [b.id, b.name]));
  const operatorNames = new Map(operators.map((o) => [o.id, o.name]));
  return requests
    .filter((r) => !r.archived && r.status !== "merged" && r.bags != null)
    .map((r) => {
      const when = r.session_completed_at || r.date_submitted;
      const area = r.collection_area_detail;
      const robot = r.cleanup_type !== "unsupported";
      return {
        requestId: r.request_id,
        day: when ? manilaDate(new Date(when)) : "",
        zone: requestArea(r) || r.location_name || "-",
        barangay: requestBarangay(r),
        areaKey: area ? String(area.id) : "",
        areaName: area?.name || "",
        robot,
        bags: Number(r.bags) || 0,
        weightKg: Number(r.weight_kg) || 0,
        recyclableKg: Number(r.recyclable_kg) || 0,
        nonUsableKg: Number(r.non_usable_kg) || 0,
        categories: r.trash_categories || {},
        unit: r.bot_id ? boatNames.get(r.bot_id) || `Bot #${r.bot_id}` : robot ? "-" : "Manual cleanup",
        operator: r.operator ? operatorNames.get(r.operator) || `Operator #${r.operator}` : "-",
        status: toStatusLabel(r.status),
      };
    })
    .filter((c) => c.day);
}

export function collectionsIn(collections, period, barangay) {
  if (!period) return [];
  return collections.filter((c) => inPeriod(c.day, period) && (!barangay || c.barangay === barangay));
}

/** The priority collection areas (from /api/priority-areas/), in one barangay if given. */
export function priorityIn(priorityAreas, barangay) {
  return (priorityAreas || []).filter((p) => p.is_priority && (!barangay || p.barangay === barangay));
}

// --- totals -----------------------------------------------------------------------

export function summarize(collections, priorityAreas = []) {
  const sum = (key) => collections.reduce((total, c) => total + c[key], 0);
  const deployments = collections.filter((c) => c.robot);
  const bags = sum("bags");
  const items = collections.reduce(
    (total, c) => total + Object.values(c.categories).reduce((s, n) => s + (Number(n) || 0), 0), 0
  );
  return {
    bags,
    weightKg: round1(sum("weightKg")),
    recyclableKg: round1(sum("recyclableKg")),
    nonUsableKg: round1(sum("nonUsableKg")),
    items,
    drives: collections.length,
    deployments: deployments.length,
    zones: new Set(deployments.map((c) => c.areaKey).filter(Boolean)).size,
    barangays: new Set(collections.map((c) => c.barangay).filter(Boolean)).size,
    priority: priorityAreas.length,
    avgBags: collections.length ? round1(bags / collections.length) : 0,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Percent change; null when there was nothing before to compare with. */
export function pctChange(current, previous) {
  if (!previous) return current ? null : 0;
  return round1(((current - previous) / previous) * 100);
}

// What the comparison table lists, in order.
export const COMPARISON_METRICS = [
  { key: "bags", label: "Bags collected" },
  { key: "weightKg", label: "Total weight", unit: "kg" },
  { key: "recyclableKg", label: "Recyclable", unit: "kg" },
  { key: "nonUsableKg", label: "Non-usable", unit: "kg" },
  { key: "items", label: "Trash items sorted" },
  { key: "drives", label: "Cleanup drives" },
  { key: "deployments", label: "Robot deployments" },
  { key: "avgBags", label: "Bags per drive" },
  { key: "zones", label: "Patrol zones covered" },
  { key: "barangays", label: "Barangays reached" },
  { key: "priority", label: "Priority collection areas" },
];

export function formatMetric(value, unit) {
  const text = Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return unit ? `${text} ${unit}` : text;
}

/** "+12.5%", "-3%", "No change", or "New" when there was nothing before. */
export function formatChange(change) {
  if (change === null) return "New";
  if (change === 0) return "No change";
  return `${change > 0 ? "+" : ""}${change}%`;
}

export function comparisonRows(current, previous) {
  return COMPARISON_METRICS.map(({ key, label, unit }) => ({
    key, label, unit,
    current: current[key],
    previous: previous ? previous[key] : null,
    change: previous ? pctChange(current[key], previous[key]) : null,
  }));
}

/**
 * Bags per group (barangay, or collection area), this period against the previous one.
 * Groups with bags in either period are listed, the busiest first.
 */
export function compareGroups(current, previous, groupOf) {
  const groups = new Map();
  const add = (list, field) => list.forEach((c) => {
    const name = groupOf(c);
    if (!name) return;
    const row = groups.get(name) || { name, current: 0, previous: 0, drives: 0 };
    row[field] += c.bags;
    if (field === "current") row.drives += 1;
    groups.set(name, row);
  });
  add(current, "current");
  add(previous || [], "previous");
  return [...groups.values()]
    .map((row) => ({ ...row, change: previous ? pctChange(row.current, row.previous) : null }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name));
}

// --- waste types ------------------------------------------------------------------

export const CATEGORY_COLORS = {
  Plastic: "#3B82F6",
  Metal: "#F59E0B",
  Glass: "#06B6D4",
  "Paper/Cardboard": "#A855F7",
  "Organic/Biodegradable": "#22C55E",
  Other: "#94A3B8",
};

function categoryTotals(collections) {
  const totals = {};
  collections.forEach((c) => Object.entries(c.categories).forEach(([cat, n]) => {
    totals[cat] = (totals[cat] || 0) + (Number(n) || 0);
  }));
  return totals;
}

/** Items per waste type in the period, with the previous period's count and the change. */
export function wasteBreakdown(current, previous) {
  const now = categoryTotals(current);
  const before = previous ? categoryTotals(previous) : {};
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  const names = [
    ...TRASH_CATEGORIES.filter((c) => now[c] || before[c]),
    ...[...new Set([...Object.keys(now), ...Object.keys(before)])].filter((c) => !TRASH_CATEGORIES.includes(c)).sort(),
  ];
  return names.map((name) => ({
    name,
    value: now[name] || 0,
    previous: previous ? before[name] || 0 : null,
    pct: total ? Math.round(((now[name] || 0) / total) * 100) : 0,
    change: previous ? pctChange(now[name] || 0, before[name] || 0) : null,
    color: CATEGORY_COLORS[name] || "#94A3B8",
  }));
}

// --- trend ------------------------------------------------------------------------

/**
 * The buckets a period is drawn in: every day, every 7 days from its start, or every
 * calendar month. With no start date the trend begins at the first collection.
 */
function buckets(from, to, granularity) {
  const list = [];
  if (granularity === "Monthly") {
    for (let m = monthIndex(from); m <= monthIndex(to); m++) {
      const key = `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
      list.push({ key, label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) });
    }
    return list;
  }
  const step = granularity === "Weekly" ? 7 : 1;
  for (let day = from; day <= to; day = addDays(day, step)) {
    list.push({ key: day, label: formatDay(day, false) });
  }
  return list;
}

function bucketIndex(day, from, granularity) {
  if (granularity === "Monthly") return monthIndex(day) - monthIndex(from);
  return Math.floor((daysBetween(from, day) - 1) / (granularity === "Weekly" ? 7 : 1));
}

function series(collections, from, to, granularity) {
  const list = buckets(from, to, granularity).map((b) => ({ ...b, bags: 0 }));
  collections.forEach((c) => {
    if (c.day < from || c.day > to) return;
    const point = list[bucketIndex(c.day, from, granularity)];
    if (point) point.bags += c.bags;
  });
  return list;
}

/**
 * Bags per bucket across the period, each point with the matching bucket of the previous
 * period (`previousBags`, null when there is no comparison) so both can be drawn together.
 */
export function trendSeries(current, period, granularity, previous, today = manilaDate(new Date())) {
  const to = period.to || today;
  const from = period.from || current.reduce((min, c) => (c.day < min ? c.day : min), to);
  const points = series(current, from, to, granularity);
  const before = period.previous ? series(previous || [], period.previous.from, period.previous.to, granularity) : null;
  return points.map((p, i) => ({
    ...p,
    previousBags: before ? before[i]?.bags ?? null : null,
    previousLabel: before ? before[i]?.label ?? "" : "",
  }));
}

// --- history ----------------------------------------------------------------------

export const HISTORY_UNITS = { month: "Monthly", week: "Weekly" };
export const HISTORY_COUNTS = { month: [3, 6, 12], week: [4, 8, 12] };

/** The Monday of the week a day is in. */
function weekStart(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

function monthEnd(day) {
  return addDays(shiftMonths(`${day.slice(0, 7)}-01`, -1), -1);
}

/**
 * The last `count` calendar months or Monday–Sunday weeks up to `end` (the latest one cut
 * short at `end`, marked `partial`), oldest first. Each has the cleanups, bags, weight,
 * items and bags per cleanup in it, and `change`: the percent change in bags from the one
 * before it (null when that one had none).
 */
export function collectionHistory(collections, { unit = "month", count = 6, end, barangay = "" }) {
  const ranges = [];
  let start = unit === "week" ? weekStart(end) : `${end.slice(0, 7)}-01`;
  // One more than shown, so the oldest shown row has a change too.
  for (let i = 0; i <= count; i++) {
    const fullTo = unit === "week" ? addDays(start, 6) : monthEnd(start);
    ranges.unshift({ from: start, to: fullTo < end ? fullTo : end, partial: fullTo > end });
    start = unit === "week" ? addDays(start, -7) : shiftMonths(start, 1);
  }
  const rows = ranges.map((range) => {
    const totals = summarize(collectionsIn(collections, range, barangay));
    const label = unit === "week"
      ? `${formatDay(range.from, false)} – ${formatDay(range.to)}`
      : new Date(`${range.from}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    return {
      ...range,
      key: range.from,
      label,
      cleanups: totals.drives,
      bags: totals.bags,
      weightKg: totals.weightKg,
      items: totals.items,
      avgBags: totals.avgBags,
    };
  });
  return rows.slice(1).map((row, i) => ({ ...row, change: pctChange(row.bags, rows[i].bags) }));
}

// --- quick date ranges for the filter bar ------------------------------------------

export const DATE_PRESETS = {
  last7: "Last 7 days",
  last30: "Last 30 days",
  last90: "Last 90 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year",
  all: "All time",
};

/** The { from, to } days a quick range stands for ("" for all time). */
export function presetRange(key, today = manilaDate(new Date())) {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (key) {
    case "last7": return { from: addDays(today, -6), to: today };
    case "last30": return { from: addDays(today, -29), to: today };
    case "last90": return { from: addDays(today, -89), to: today };
    case "thisMonth": return { from: monthStart, to: today };
    case "lastMonth": return { from: shiftMonths(monthStart, 1), to: addDays(monthStart, -1) };
    case "thisYear": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return { from: "", to: "" };
  }
}

/** The quick range the dates are, or "" when they are a range of their own. */
export function matchingPreset(from, to, today = manilaDate(new Date())) {
  const end = from && !to ? today : to;
  return Object.keys(DATE_PRESETS).find((key) => {
    const range = presetRange(key, today);
    return range.from === from && range.to === end;
  }) || "";
}
