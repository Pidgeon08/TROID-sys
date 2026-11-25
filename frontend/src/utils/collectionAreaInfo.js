// What the Collection Areas pages (and an area's history page) show about an area, from the API.
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { areaDetailsFromApi } from "../constants/collectionAreas";
import { formatArea, formatDistance, pathLengthM, ringAreaM2 } from "./coverage";

export const AREA_COLOR = "#1b4de4";

export const STATUS_META = {
  pending: { label: "Pending Approval", short: "Pending", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved", short: "Approved", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  declined: { label: "Archived", short: "Archived", cls: "bg-red-50 text-red-700", icon: XCircle },
};

export function formatWhen(iso) {
  return iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
}

/** An area as the pages use it, from the API's. */
export function mapArea(raw) {
  return {
    id: raw.area_id,
    name: raw.name,
    barangay: raw.barangay || "",
    submittedBy: raw.submitted_by || "",
    closed: raw.closed,
    points: raw.points || [],
    color: raw.color || AREA_COLOR,
    status: raw.status || "pending",
    declineReason: raw.decline_reason || "",
    reviewedBy: raw.reviewed_by || "",
    dateReviewed: formatWhen(raw.date_reviewed),
    dateSubmitted: formatWhen(raw.date_submitted),
    updatedBy: raw.updated_by || "",
    dateUpdated: formatWhen(raw.date_updated),
    submittedAt: raw.date_submitted || "",
    updatedAt: raw.date_updated || "",
    requestCount: raw.request_count || 0,
    ...areaDetailsFromApi(raw),
  };
}

/** "1.20 ha" for a polygon, "350 m long" for a line. */
export function shapeSize({ closed, points }) {
  if (closed && points.length >= 3) return formatArea(ringAreaM2(points));
  if (!closed && points.length >= 2) return `${formatDistance(pathLengthM(points))} long`;
  return "";
}

/** "22.1 bags in the last 30 days, up from 18.5 (+19.5%)": the figures behind the priority flag. */
export function priorityText(p) {
  if (!p) return "";
  const avg = (n) => `${n} bag${n === 1 ? "" : "s"}`;
  switch (p.status) {
    case "priority": return `${avg(p.current.average)} in the last ${p.window_days} days, up from ${avg(p.previous.average)} (+${p.change_pct}%). Priority area.`;
    case "steady": return `${avg(p.current.average)} in the last ${p.window_days} days, down or level from ${avg(p.previous.average)}.`;
    case "no_baseline": return `${avg(p.current.average)} in the last ${p.window_days} days; no cleanups the month before to compare with.`;
    default: return `No cleanups in the last ${p.window_days} days (${avg(p.previous.average)} the month before).`;
  }
}
