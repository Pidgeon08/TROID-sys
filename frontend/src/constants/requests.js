export const REQUEST_STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Ongoing: "bg-sky-50 text-sky-700",
  Declined: "bg-red-50 text-red-700",
  Parked: "bg-purple-50 text-purple-700",
  "Pending City Admin Approval": "bg-amber-50 text-amber-700",
  "Pending Admin Approval": "bg-blue-50 text-blue-700",
  Processing: "bg-sky-50 text-sky-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Merged: "bg-indigo-50 text-indigo-700",
};

// Before the cleanup starts: when CENRO can still change a request's area or merge it.
export const OPEN_STATUSES = ["Pending City Admin Approval", "Pending Admin Approval", "Approved", "Parked"];

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

// The TROID classes: a trash report's categories, each the sum of its items (see trashReport.js).
export { TROID_CLASSES as TRASH_CATEGORIES } from "./trashReport";

// Shared search predicate for request tables: matches on ID, type, requester name,
// and the request's site/location name (its "request name").
export function matchesRequestQuery(req, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (req.id || '').toLowerCase().includes(q) ||
    (req.type || '').toLowerCase().includes(q) ||
    (req.requestedBy?.name || '').toLowerCase().includes(q) ||
    (req.location?.name || '').toLowerCase().includes(q)
  );
}

// Fills the blank trash report fields with what the robot counted (0 if it saw none).
export function fillTroidCounts(values, counts) {
  return Object.fromEntries(
    Object.entries(values).map(([cat, value]) => [cat, value === "" ? String(counts[cat] || 0) : value])
  );
}

// YYYY-MM-DD in Manila, the zone the server dates schedules and sessions in.
export function manilaDate(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// Finished cleanup drives per day, from the 1st of the current month through today.
export function cleanupsThisMonth(requests) {
  const today = manilaDate(new Date());
  const month = today.slice(0, 7);
  const days = Array.from({ length: Number(today.slice(8)) }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    bags: 0,
    drives: 0,
  }));
  requests.forEach((request) => {
    if (request.archived || !request.session_completed_at) return;
    const finished = manilaDate(new Date(request.session_completed_at));
    if (!finished.startsWith(month)) return;
    const day = days[Number(finished.slice(8)) - 1];
    if (!day) return;
    day.bags += Number(request.bags) || 0;
    day.drives += 1;
  });
  return days;
}

// Where a cleanup happens. location_name is only a landmark to guide the crew.
export function requestArea(raw) {
  return raw.collection_area_detail?.name || raw.barangay || '';
}

// The five collection areas with the most bags. `max` scales the bars to the top area.
export function topCollectionAreas(requests) {
  const areas = {};
  requests.forEach((req) => {
    const bags = Number(req.bags) || 0;
    if (bags === 0) return;
    const area = req.collection_area_detail;
    const key = `${area?.id ?? ''}|${req.barangay}`;
    areas[key] = areas[key] || { key, name: area?.name || 'No collection area', barangay: req.barangay || '', bags: 0 };
    areas[key].bags += bags;
  });
  const top = Object.values(areas).sort((a, b) => b.bags - a.bags).slice(0, 5);
  return top.map((area) => ({ ...area, max: top[0].bags }));
}

export function formatFileSize(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatTime12h(time) {
  if (!time) return time;
  const [hourStr, minuteStr = "00"] = time.split(":");
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

export function getDeploymentStatus(schedule) {
  if (!schedule) return { label: 'Pending Schedule', cls: 'bg-amber-50 text-amber-700' };
  const dt = new Date(`${schedule.day}T${schedule.label}`);
  if (isNaN(dt.getTime())) return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700' };
  if (dt <= new Date()) return { label: 'Deployed', cls: 'bg-emerald-50 text-emerald-700' };
  return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700' };
}

// The Mayor's Office role is shown as "City Admin". Stored codes (pending_mayor_approval,
// mayorsoffice) and older history entries still say "mayor", so they are reworded for display.
export function cityAdminWording(text) {
  return (text || '').replace(/\bMayor's Office\b/g, 'City Admin').replace(/\bMayor\b/g, 'City Admin');
}

// "pending_mayor_approval" -> "Pending City Admin Approval".
export function toStatusLabel(raw) {
  return cityAdminWording((raw || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
}

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : value;
}

function mapStatusHistory(history) {
  return (history || []).map((sh) => ({
    label: cityAdminWording(sh.label),
    date: formatDateTime(sh.date),
    actor: cityAdminWording(sh.actor),
    role: cityAdminWording(sh.role),
    state: sh.state || 'done',
    details: sh.details || '',
  }));
}

// The data card details filed with the trash report, beside the bags, weights and item counts.
function mapTrashReportDetails(raw) {
  return {
    trashItems: raw.trash_items || {},
    siteType: raw.site_type || '',
    peopleCount: raw.people_count ?? null,
    hoursSpent: raw.hours_spent ?? null,
    distanceKm: raw.distance_km ?? null,
    entangledAnimals: Array.isArray(raw.entangled_animals) ? raw.entangled_animals : [],
    peculiarItem: raw.peculiar_item || '',
  };
}

function mapCollectionArea(detail) {
  return detail ? { id: detail.id, areaId: detail.area_id, name: detail.name, waterBodyType: detail.water_body_type || '' } : null;
}

// The request a merged one was folded into: its cleanup, schedule and results are the merged one's too.
function mapMergedInto(raw) {
  if (!raw) return null;
  return {
    id: raw.request_id,
    status: toStatusLabel(raw.status),
    archived: Boolean(raw.archived),
    cleanupType: raw.cleanup_type || 'troid_supported',
    requestedByName: raw.requested_by_name || '',
    barangay: raw.barangay || '',
    locationName: raw.location_name || '',
    collectionArea: mapCollectionArea(raw.collection_area_detail),
    preferredDate: raw.preferred_date || '',
    preferredTime: raw.preferred_time || '',
    sessionCompletedAt: raw.session_completed_at || null,
    bags: raw.bags || 0,
    weightKg: raw.weight_kg || 0,
    nonUsableKg: raw.non_usable_kg || 0,
    recyclableKg: raw.recyclable_kg || 0,
    trashCategories: raw.trash_categories || {},
    ...mapTrashReportDetails(raw),
    verifiedCategories: raw.verified_categories || {},
    verifiedAt: raw.verified_at || null,
    statusHistory: mapStatusHistory(raw.status_history),
  };
}

export function mapRequest(raw) {
  const status = toStatusLabel(raw.status);
  
  return {
    id: raw.request_id,
    type: raw.request_type || 'TROID Bot Deployment',
    status: status,
    dateSubmitted: raw.date_submitted
      ? new Date(raw.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : raw.date_submitted,
    submittedAt: raw.date_submitted || null,
    requestedBy: {
      name: raw.requested_by_name || '',
      role: raw.requested_by_role || '',
      barangay: raw.requested_by_barangay || '',
      contact: raw.contact || '',
      email: raw.email || '',
    },
    location: {
      name: raw.location_name || '',
      barangay: raw.barangay || '',
      municipality: raw.municipality || '',
      province: raw.province || '',
    },
    preferredDate: raw.preferred_date || '',
    preferredTime: raw.preferred_time || '',
    notes: raw.notes || '',
    declineReason: raw.decline_reason || '',
    letter: raw.letter_file_name
      ? { fileName: raw.letter_file_name, size: raw.letter_size, contentType: raw.letter_content_type || '' }
      : null,
    photos: (raw.photos || []).map((p) => ({
      id: p.photo_id || p.id,
      label: p.label || '',
      date: p.date || '',
      image_data: p.image_data || '',
    })),
    statusHistory: mapStatusHistory(raw.status_history),
    botId: raw.bot_id || null,
    operator: raw.operator || null,
    // 'troid_supported' cleanups have a collection area; 'unsupported' ones only a location.
    cleanupType: raw.cleanup_type || 'troid_supported',
    collectionArea: mapCollectionArea(raw.collection_area_detail),
    bags: raw.bags || 0,
    weightKg: raw.weight_kg || 0,
    nonUsableKg: raw.non_usable_kg || 0,
    recyclableKg: raw.recyclable_kg || 0,
    sessionCompletedAt: raw.session_completed_at || null,
    trashCategories: raw.trash_categories || {},
    ...mapTrashReportDetails(raw),
    verifiedCategories: raw.verified_categories || {},
    verificationNotes: raw.verification_notes || '',
    verifiedAt: raw.verified_at || null,
    // Sendable again after 20 days without a decision (see Request.RESEND_AFTER_DAYS).
    canResend: Boolean(raw.can_resend),
    resendAvailableAt: raw.resend_available_at || null,
    resentAt: raw.resent_at || null,
    mergedInto: mapMergedInto(raw.merged_into_detail),
    mergedAt: raw.merged_at || null,
    mergedRequests: (raw.merged_requests || []).map((m) => ({
      id: m.request_id,
      requestedByName: m.requested_by_name || '',
      requestedByRole: m.requested_by_role || '',
      barangay: m.barangay || '',
      locationName: m.location_name || '',
      mergedAt: m.merged_at || null,
    })),
  };
}
