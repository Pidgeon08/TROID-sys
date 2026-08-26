export const TABS = ["All Requests", "Pending Mayor", "Pending Admin", "Approved", "Unscheduled", "Pending Verification", "Verified", "Parked"];

export const REQUEST_STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
  Parked: "bg-purple-50 text-purple-700",
  "Pending Mayor Approval": "bg-amber-50 text-amber-700",
  "Pending Admin Approval": "bg-blue-50 text-blue-700",
  Processing: "bg-sky-50 text-sky-700",
  "Pending Verification": "bg-orange-50 text-orange-700",
  Verified: "bg-emerald-50 text-emerald-700",
};

export const TRASH_CATEGORIES = ["Plastic", "Metal", "Glass", "Paper/Cardboard", "Organic/Biodegradable", "Other"];

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

export function mapRequest(raw) {
  const status = raw.status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  
  return {
    id: raw.request_id,
    type: raw.request_type || 'TROID Bot Deployment',
    status: status,
    dateSubmitted: raw.date_submitted
      ? new Date(raw.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : raw.date_submitted,
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
      ? { fileName: raw.letter_file_name, size: raw.letter_size }
      : null,
    photos: (raw.photos || []).map((p) => ({
      id: p.photo_id || p.id,
      label: p.label || '',
      date: p.date || '',
      image_data: p.image_data || '',
    })),
    statusHistory: (raw.status_history || []).map((sh) => ({
      label: sh.label || '',
      date: sh.date
        ? new Date(sh.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : sh.date,
      actor: sh.actor || '',
      role: sh.role || '',
      state: sh.state || 'done',
      details: sh.details || '',
    })),
    botId: raw.bot_id || null,
    operator: raw.operator || null,
    collectionArea: raw.collection_area_detail
      ? { id: raw.collection_area_detail.id, areaId: raw.collection_area_detail.area_id, name: raw.collection_area_detail.name }
      : null,
    bags: raw.bags || 0,
    weightKg: raw.weight_kg || 0,
    nonUsableKg: raw.non_usable_kg || 0,
    recyclableKg: raw.recyclable_kg || 0,
    sessionCompletedAt: raw.session_completed_at || null,
    trashCategories: raw.trash_categories || {},
    verifiedCategories: raw.verified_categories || {},
    verificationNotes: raw.verification_notes || '',
    verifiedAt: raw.verified_at || null,
  };
}
