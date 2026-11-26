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
  "Awaiting City Admin Approval": "bg-amber-50 text-amber-700",
  Overdue: "bg-red-50 text-red-700",
  "Awaiting CENRO Approval": "bg-blue-50 text-blue-700",
};

// A request waiting on the City Admin this long is overdue; its requester can resend it then
// (Request.RESEND_AFTER_DAYS).
export const CITY_ADMIN_OVERDUE_DAYS = 7;

/** Whole days since `iso` (0 for today or no date). */
export const daysWaiting = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);

// The only statuses the City Admin sees: waiting on them, waiting on CENRO after they approved
// it, and approved by both. What CENRO does with it after that (scheduling, parking, declining,
// the cleanup) isn't theirs to follow.
export const CITY_ADMIN_STATUSES = ["Awaiting City Admin Approval", "Overdue", "Awaiting CENRO Approval", "Approved"];

/**
 * A request's status as the City Admin sees it, from the API's request: waiting on them (overdue
 * after CITY_ADMIN_OVERDUE_DAYS); approved by them and waiting on CENRO (parked by CENRO counts as
 * still waiting); or approved by CENRO as well. Null when it never reached them (CENRO's own, or
 * parked, declined or merged before they decided) or CENRO declined it, and their pages leave it out.
 */
export function cityAdminStatus(raw) {
  if (!raw || raw.archived) return null;
  if (raw.status === "pending_mayor_approval") {
    return daysWaiting(raw.date_submitted) >= CITY_ADMIN_OVERDUE_DAYS ? "Overdue" : "Awaiting City Admin Approval";
  }
  const approved = (raw.status_history || []).some((step) => cityAdminWording(step.label) === "Approved by City Admin");
  if (!approved || raw.status === "declined") return null;
  const atCenro = raw.status === "pending_admin_approval"
    || (raw.status === "parked" && raw.parked_from_status === "pending_admin_approval");
  return atCenro ? "Awaiting CENRO Approval" : "Approved";
}

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

// Where a cleanup happens. location_name is only a landmark to guide the crew.
export function requestArea(raw) {
  return raw.collection_area_detail?.name || raw.barangay || '';
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
    archived: Boolean(raw.archived),
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
