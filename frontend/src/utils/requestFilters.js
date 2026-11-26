// Filtering and sorting for the request lists (CENRO, City Admin, Barangay/NGO). The filters
// live in the page URL, so they survive a refresh and coming Back from a request.
import { OPEN_STATUSES, manilaDate, matchesRequestQuery } from "../constants/requests";

// The order statuses are offered in: the way a request moves through review and cleanup.
export const STATUS_ORDER = [
  "Pending City Admin Approval",
  "Pending Admin Approval",
  "Approved",
  "Ongoing",
  "Processing",
  "Completed",
  "Parked",
  "Declined",
  "Merged",
];

export const DATE_FIELDS = {
  submitted: "Date submitted",
  preferred: "Preferred cleanup date",
};

// Submitted dates are in the past; preferred cleanup dates are mostly ahead.
export const DATE_PRESETS = {
  submitted: { today: "Today", last7: "Last 7 days", last30: "Last 30 days", thisMonth: "This month", custom: "Custom range" },
  preferred: { today: "Today", next7: "Next 7 days", next30: "Next 30 days", thisMonth: "This month", custom: "Custom range" },
};

export const CLEANUP_TYPES = { troid_supported: "TROID Supported", unsupported: "Unsupported" };
export const SCHEDULE_OPTIONS = { scheduled: "Scheduled", unscheduled: "Not scheduled yet" };
export const MERGE_OPTIONS = { mergeable: "Mergeable" };
export const SORT_OPTIONS = {
  newest: "Newest submitted",
  oldest: "Oldest submitted",
  preferredSoonest: "Preferred date (soonest)",
  preferredLatest: "Preferred date (latest)",
};

export const EMPTY_FILTERS = {
  q: "",
  status: [],
  dateField: "submitted",
  range: "",
  from: "",
  to: "",
  type: "",
  barangay: "",
  area: "",
  role: "",
  schedule: "",
  merge: "",
  sort: "newest",
};

// --- URL <-> filters ------------------------------------------------------------

const PARAM = { dateField: "date", range: "range" };
const param = (key) => PARAM[key] || key;

export function filtersFromParams(params) {
  const filters = { ...EMPTY_FILTERS };
  Object.keys(EMPTY_FILTERS).forEach((key) => {
    const value = params.get(param(key));
    if (value == null || value === "") return;
    filters[key] = key === "status" ? value.split(",").filter(Boolean) : value;
  });
  if (!DATE_FIELDS[filters.dateField]) filters.dateField = "submitted";
  if (filters.range && !DATE_PRESETS[filters.dateField][filters.range]) filters.range = "";
  if (!SORT_OPTIONS[filters.sort]) filters.sort = "newest";
  return filters;
}

export function filtersToParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const isDefault = Array.isArray(value) ? value.length === 0 : value === EMPTY_FILTERS[key];
    if (isDefault || value == null) return;
    params.set(param(key), Array.isArray(value) ? value.join(",") : value);
  });
  return params;
}

// --- dates (YYYY-MM-DD, in Manila like the rest of the app) ------------------

function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(day) {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

/** The {from, to} days (inclusive, either may be "") the date filter allows, or null for any date. */
export function dateRange(filters, today = manilaDate(new Date())) {
  switch (filters.range) {
    case "today": return { from: today, to: today };
    case "last7": return { from: addDays(today, -6), to: today };
    case "last30": return { from: addDays(today, -29), to: today };
    case "next7": return { from: today, to: addDays(today, 6) };
    case "next30": return { from: today, to: addDays(today, 29) };
    case "thisMonth": return { from: `${today.slice(0, 7)}-01`, to: lastDayOfMonth(today) };
    case "custom": return filters.from || filters.to ? { from: filters.from, to: filters.to } : null;
    default: return null;
  }
}

function requestDay(req, field) {
  if (field === "preferred") return req.preferredDate || "";
  return req.submittedAt ? manilaDate(new Date(req.submittedAt)) : "";
}

// --- merging ----------------------------------------------------------------------

// A request CENRO can still merge, or merge others into: TROID-supported or not, for a collection
// area (optional for a non-TROID one), its cleanup not started, and not merged into another. The
// server checks the same (RequestViewSet.merge).
const canMerge = (req) => !req.archived && !req.mergedInto
  && Boolean(req.collectionArea) && OPEN_STATUSES.includes(req.status);

// Requests are merged with others for the same barangay and the same collection area: a
// barangay's own request and an NGO's working the same stretch, say.
const mergeKey = (req) => `${(req.location?.barangay || "").trim().toLowerCase()}|${req.collectionArea.id}`;

// One of the two must have nothing merged into it: that's the one merged into the other.
const mergeablePair = (a, b) => a.id !== b.id && (a.mergedRequests.length === 0 || b.mergedRequests.length === 0);

/** The requests that can be merged into `request` (it must be mergeable itself). */
export function mergeCandidates(request, requests) {
  if (!canMerge(request)) return [];
  const key = mergeKey(request);
  return requests.filter((r) => canMerge(r) && mergeKey(r) === key && r.id !== request.id && r.mergedRequests.length === 0);
}

/** The ids of the requests that could be merged with at least one other in `requests`. */
export function mergeableIds(requests) {
  const groups = new Map();
  requests.filter(canMerge).forEach((req) => {
    const key = mergeKey(req);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(req);
  });
  const ids = new Set();
  groups.forEach((group) => group.forEach((req) => {
    if (group.some((other) => mergeablePair(req, other))) ids.add(req.id);
  }));
  return ids;
}

/** The list with the requests that can be merged together next to each other (stable otherwise). */
export function groupForMerging(requests) {
  const order = new Map();
  requests.forEach((req) => {
    const key = canMerge(req) ? mergeKey(req) : `~${req.id}`;
    if (!order.has(key)) order.set(key, order.size);
  });
  const rank = (req) => order.get(canMerge(req) ? mergeKey(req) : `~${req.id}`);
  return requests.map((req, i) => [req, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([req]) => req);
}

// --- filtering --------------------------------------------------------------------

function matchesSearch(req, q) {
  if (!q) return true;
  const text = q.toLowerCase();
  return matchesRequestQuery(req, q)
    || (req.location?.barangay || "").toLowerCase().includes(text)
    || (req.collectionArea?.name || "").toLowerCase().includes(text)
    || (req.collectionArea?.areaId || "").toLowerCase().includes(text)
    || (req.notes || "").toLowerCase().includes(text);
}

/**
 * The requests that pass every filter. `except` leaves one filter out, for counting
 * what each of its options would show. `scheduledIds` is needed for the schedule filter.
 */
export function filterRequests(requests, filters, { scheduledIds, except } = {}) {
  const range = except === "date" ? null : dateRange(filters);
  // Whether a request can be merged depends on the others, so it is worked out on the whole list.
  const mergeable = filters.merge && except !== "merge" ? mergeableIds(requests) : null;
  return requests.filter((req) => {
    if (!matchesSearch(req, filters.q)) return false;
    if (except !== "status" && filters.status.length && !filters.status.includes(req.status)) return false;
    if (range) {
      const day = requestDay(req, filters.dateField);
      if (!day) return false;
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
    }
    if (filters.type && req.cleanupType !== filters.type) return false;
    if (filters.barangay && req.location?.barangay !== filters.barangay) return false;
    if (filters.area && String(req.collectionArea?.id ?? "") !== filters.area) return false;
    if (filters.role && (req.requestedBy?.role || "").toLowerCase() !== filters.role.toLowerCase()) return false;
    if (filters.schedule && scheduledIds) {
      // Only an approved request waits on a schedule.
      if (req.status !== "Approved") return false;
      if ((filters.schedule === "scheduled") !== scheduledIds.has(req.id)) return false;
    }
    if (mergeable && !mergeable.has(req.id)) return false;
    return true;
  });
}

const byId = (a, b) => b.id.localeCompare(a.id, undefined, { numeric: true });

export function sortRequests(requests, sort) {
  const list = [...requests];
  const submitted = (req) => (req.submittedAt ? new Date(req.submittedAt).getTime() : 0);
  // Requests without a preferred date go last either way.
  const preferred = (req, missing) => req.preferredDate ? `${req.preferredDate}T${req.preferredTime || "00:00"}` : missing;
  switch (sort) {
    case "oldest": return list.sort((a, b) => submitted(a) - submitted(b) || -byId(a, b));
    case "preferredSoonest": return list.sort((a, b) => preferred(a, "￿").localeCompare(preferred(b, "￿")) || byId(a, b));
    case "preferredLatest": return list.sort((a, b) => preferred(b, "").localeCompare(preferred(a, "")) || byId(a, b));
    default: return list.sort((a, b) => submitted(b) - submitted(a) || byId(a, b));
  }
}

/**
 * The barangays, collection areas, requester roles and statuses that occur in the requests.
 * `statusOrder` is every status the list offers, in order (the City Admin has only their own).
 */
export function filterOptions(requests, statusOrder = STATUS_ORDER) {
  const barangays = new Set();
  const areas = new Map();
  const roles = new Map();
  const statuses = new Set();
  requests.forEach((req) => {
    if (req.location?.barangay) barangays.add(req.location.barangay);
    if (req.collectionArea) areas.set(String(req.collectionArea.id), req.collectionArea);
    const role = (req.requestedBy?.role || "").trim();
    if (role) roles.set(role.toLowerCase(), role);
    if (req.status) statuses.add(req.status);
  });
  return {
    barangays: [...barangays].sort((a, b) => a.localeCompare(b)),
    areas: [...areas.values()].sort((a, b) => a.name.localeCompare(b.name)),
    roles: [...roles.values()].sort((a, b) => a.localeCompare(b)),
    // Every status, so a filter can be set up before any request reaches it; older ones last.
    statuses: [...statusOrder, ...[...statuses].filter((s) => !statusOrder.includes(s)).sort()],
  };
}

function formatDay(day) {
  return day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

export function describeDateFilter(filters) {
  if (!filters.range) return "";
  const field = filters.dateField === "preferred" ? "Preferred" : "Submitted";
  if (filters.range !== "custom") return `${field}: ${DATE_PRESETS[filters.dateField][filters.range]}`;
  if (filters.from && filters.to) return `${field}: ${formatDay(filters.from)} – ${formatDay(filters.to)}`;
  if (filters.from) return `${field}: from ${formatDay(filters.from)}`;
  if (filters.to) return `${field}: until ${formatDay(filters.to)}`;
  return "";
}

/** One removable chip per active filter: { key, label, clear } where clear is the change that removes it. */
export function activeFilterChips(filters, options) {
  const chips = [];
  filters.status.forEach((status) => chips.push({
    key: `status:${status}`, label: status, clear: { status: filters.status.filter((s) => s !== status) },
  }));
  const date = describeDateFilter(filters);
  if (date) chips.push({ key: "date", label: date, clear: { range: "", from: "", to: "" } });
  if (filters.type) chips.push({ key: "type", label: CLEANUP_TYPES[filters.type] || filters.type, clear: { type: "" } });
  if (filters.barangay) chips.push({ key: "barangay", label: `Barangay: ${filters.barangay}`, clear: { barangay: "" } });
  if (filters.area) {
    const area = options.areas.find((a) => String(a.id) === filters.area);
    chips.push({ key: "area", label: `Area: ${area ? area.name : filters.area}`, clear: { area: "" } });
  }
  if (filters.role) chips.push({ key: "role", label: `Requester: ${filters.role}`, clear: { role: "" } });
  if (filters.schedule) chips.push({ key: "schedule", label: SCHEDULE_OPTIONS[filters.schedule], clear: { schedule: "" } });
  if (filters.merge) chips.push({ key: "merge", label: MERGE_OPTIONS[filters.merge] || "Mergeable", clear: { merge: "" } });
  return chips;
}
