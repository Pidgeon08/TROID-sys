// Filtering and sorting for CENRO's Collection Areas list. The filters live in the page URL,
// so they survive a refresh and coming Back to the page.
import { manilaDate } from "../constants/requests";
import { WATER_BODY_TYPES, hasAreaDetails, waterBodyLabel } from "../constants/collectionAreas";
import { addDays, formatDay } from "./reportData";

// "Archived" is how CENRO sees the declined status (still stored as "declined").
export const AREA_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Archived" },
];

export const SHAPES = { polygon: "Polygon", line: "Line" };
export const USAGE = { used: "Has requests", unused: "No requests yet" };
export const DETAILS = { missing: "No details yet", complete: "Has details", hazards: "Has hazards noted" };
export const NO_WATER_BODY = "none";
// A priority area brings in more bags per cleanup over the last 30 days than the 30 before.
export const PRIORITY = { priority: "Priority areas", fine: "Not a priority" };

export const DATE_PRESETS = {
  last7: "Last 7 days",
  last30: "Last 30 days",
  last90: "Last 90 days",
  thisYear: "This year",
  custom: "Custom range",
};

export const SORT_OPTIONS = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name (A–Z)",
  barangay: "Barangay (A–Z)",
  requests: "Most requests",
  updated: "Recently edited",
};

export const EMPTY_AREA_FILTERS = {
  q: "",
  status: "",
  barangay: "",
  water: "",
  shape: "",
  usage: "",
  details: "",
  priority: "",
  range: "",
  from: "",
  to: "",
  sort: "newest",
};

const VALID = {
  status: Object.fromEntries(AREA_STATUSES.map((s) => [s.value, s.label])),
  water: { ...Object.fromEntries(WATER_BODY_TYPES.map((t) => [t.value, t.label])), [NO_WATER_BODY]: "Not set" },
  shape: SHAPES,
  usage: USAGE,
  details: DETAILS,
  priority: PRIORITY,
  range: DATE_PRESETS,
  sort: SORT_OPTIONS,
};

// --- URL <-> filters ------------------------------------------------------------

export function areaFiltersFromParams(params) {
  const filters = { ...EMPTY_AREA_FILTERS };
  Object.keys(EMPTY_AREA_FILTERS).forEach((key) => {
    const value = params.get(key);
    if (value == null || value === "") return;
    // A value from an old or hand-edited link that isn't an option is ignored.
    if (VALID[key] && !VALID[key][value]) return;
    filters[key] = value;
  });
  return filters;
}

export function areaFiltersToParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value == null || value === EMPTY_AREA_FILTERS[key]) return;
    params.set(key, value);
  });
  return params;
}

// --- filtering --------------------------------------------------------------------

/** The {from, to} days (inclusive, either may be "") the date filter allows, or null for any date. */
export function areaDateRange(filters, today = manilaDate(new Date())) {
  switch (filters.range) {
    case "last7": return { from: addDays(today, -6), to: today };
    case "last30": return { from: addDays(today, -29), to: today };
    case "last90": return { from: addDays(today, -89), to: today };
    case "thisYear": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": return filters.from || filters.to ? { from: filters.from, to: filters.to } : null;
    default: return null;
  }
}

function matchesSearch(area, q) {
  if (!q) return true;
  const text = q.trim().toLowerCase();
  return [area.id, area.name, area.barangay, area.submittedBy, area.waterBodyName, waterBodyLabel(area.waterBodyType),
    area.description, area.hazards, area.reviewedBy]
    .some((value) => (value || "").toLowerCase().includes(text));
}

/**
 * The areas that pass every filter. `except` leaves one filter out, for counting what each of
 * its options would show (the status tabs count this way).
 */
export function filterAreas(areas, filters, { except, today } = {}) {
  const range = areaDateRange(filters, today);
  return areas.filter((area) => {
    if (!matchesSearch(area, filters.q)) return false;
    if (except !== "status" && filters.status && area.status !== filters.status) return false;
    if (filters.barangay && area.barangay !== filters.barangay) return false;
    if (filters.water === NO_WATER_BODY) {
      if (area.waterBodyType) return false;
    } else if (filters.water && area.waterBodyType !== filters.water) {
      return false;
    }
    if (filters.shape && (filters.shape === "polygon") !== Boolean(area.closed)) return false;
    if (filters.usage && (filters.usage === "used") !== area.requestCount > 0) return false;
    if (filters.details === "missing" && hasAreaDetails(area)) return false;
    if (filters.details === "complete" && !hasAreaDetails(area)) return false;
    if (filters.details === "hazards" && !area.hazards.trim()) return false;
    if (filters.priority && (filters.priority === "priority") !== Boolean(area.priority?.is_priority)) return false;
    if (range) {
      const day = area.submittedAt ? manilaDate(new Date(area.submittedAt)) : "";
      if (!day) return false;
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
    }
    return true;
  });
}

const time = (iso) => (iso ? new Date(iso).getTime() : 0);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export function sortAreas(areas, sort) {
  const list = [...areas];
  switch (sort) {
    case "oldest": return list.sort((a, b) => time(a.submittedAt) - time(b.submittedAt) || byName(a, b));
    case "name": return list.sort(byName);
    case "barangay": return list.sort((a, b) => a.barangay.localeCompare(b.barangay) || byName(a, b));
    case "requests": return list.sort((a, b) => b.requestCount - a.requestCount || byName(a, b));
    case "updated": return list.sort((a, b) => time(b.updatedAt || b.submittedAt) - time(a.updatedAt || a.submittedAt) || byName(a, b));
    default: return list.sort((a, b) => time(b.submittedAt) - time(a.submittedAt) || byName(a, b));
  }
}

/** How many areas each status tab would show with the other filters as they are. */
export function statusCounts(areas, filters, today) {
  const counts = { "": 0, pending: 0, approved: 0, declined: 0 };
  filterAreas(areas, filters, { except: "status", today }).forEach((area) => {
    counts[""] += 1;
    counts[area.status] = (counts[area.status] || 0) + 1;
  });
  return counts;
}

/** The barangays that have an area, for the barangay filter. */
export function areaBarangays(areas) {
  return [...new Set(areas.map((a) => a.barangay).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function describeAreaDate(filters) {
  if (!filters.range) return "";
  if (filters.range !== "custom") return `Added: ${DATE_PRESETS[filters.range]}`;
  if (filters.from && filters.to) return `Added: ${formatDay(filters.from)} – ${formatDay(filters.to)}`;
  if (filters.from) return `Added from ${formatDay(filters.from)}`;
  if (filters.to) return `Added until ${formatDay(filters.to)}`;
  return "";
}

/** The filters inside the "More filters" panel that are set (status, search, date and sort aren't in it). */
export const PANEL_FILTERS = ["priority", "barangay", "water", "shape", "usage", "details"];

/** One removable chip per active filter: { key, label, clear }, where clear is the change that removes it. */
export function areaFilterChips(filters) {
  const chips = [];
  if (filters.status) chips.push({ key: "status", label: VALID.status[filters.status], clear: { status: "" } });
  if (filters.priority) chips.push({ key: "priority", label: PRIORITY[filters.priority], clear: { priority: "" } });
  if (filters.barangay) chips.push({ key: "barangay", label: `Barangay: ${filters.barangay}`, clear: { barangay: "" } });
  if (filters.water) chips.push({ key: "water", label: `Water body: ${VALID.water[filters.water]}`, clear: { water: "" } });
  if (filters.shape) chips.push({ key: "shape", label: SHAPES[filters.shape], clear: { shape: "" } });
  if (filters.usage) chips.push({ key: "usage", label: USAGE[filters.usage], clear: { usage: "" } });
  if (filters.details) chips.push({ key: "details", label: DETAILS[filters.details], clear: { details: "" } });
  const date = describeAreaDate(filters);
  if (date) chips.push({ key: "date", label: date, clear: { range: "", from: "", to: "" } });
  return chips;
}
