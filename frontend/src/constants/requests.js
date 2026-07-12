export const TABS = ["All Requests", "Pending Mayor", "Pending Admin", "Approved", "Declined"];

export const REQUEST_STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
  "Pending Mayor Approval": "bg-amber-50 text-amber-700",
  "Pending Admin Approval": "bg-blue-50 text-blue-700",
};

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
    notes: raw.notes || '',
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
    })),
    botId: raw.bot_id || null,
    operator: raw.operator || null,
    bags: raw.bags || 0,
    weightKg: raw.weight_kg || 0,
    nonUsableKg: raw.non_usable_kg || 0,
    recyclableKg: raw.recyclable_kg || 0,
  };
}
