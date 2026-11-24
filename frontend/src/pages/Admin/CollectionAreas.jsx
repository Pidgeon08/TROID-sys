import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Polyline, Polygon, ZoomControl, useMap } from "react-leaflet";
import { TILE_URL, TILE_ATTRIBUTION } from "../../services/mapTiles";
import "leaflet/dist/leaflet.css";
import {
  Map as MapIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Layers,
  X,
  Plus,
  Pencil,
  Undo2,
  Eraser,
  Save,
  ChevronDown,
  RotateCcw,
  ClipboardList,
  Maximize2,
  AlertTriangle,
  Flame,
} from "lucide-react";
import api from "../../services/api";
import { logAudit } from "../../services/auditLog";
import { AreaDraftLayers, BarangayOutline } from "../../components/AreaDrawing";
import { useAreaDraft } from "../../hooks/useAreaDraft";
import { BARANGAYS } from "../../utils/barangayBoundaries";
import { formatArea, formatDistance, pathLengthM, ringAreaM2 } from "../../utils/coverage";
import {
  EMPTY_AREA_DETAILS,
  WATER_BODY_TYPES,
  areaDetailsFromApi,
  areaDetailsToApi,
  hasAreaDetails,
  pickAreaDetails,
  waterBodyLabel,
} from "../../constants/collectionAreas";
import { EmptyState } from "../../components/ui/EmptyState";
import AreaRequestsModal from "./AreaRequestsModal";
import AreaFilters, { AreaStatusTabs } from "../../components/AreaFilters";
import { useUrlFilters } from "../../hooks/useUrlFilters";
import {
  EMPTY_AREA_FILTERS, areaBarangays, areaFiltersFromParams, areaFiltersToParams, filterAreas, sortAreas, statusCounts,
} from "../../utils/areaFilters";
import { LIVE, useLiveVersion } from "../../hooks/useLiveUpdates";
import { HeatmapLayer } from "../../components/MapLayers";
import { LEGEND_CLASSES } from "../../constants/mapLayers";

const DEFAULT_CENTER = [16.6195, 120.314];
const DEFAULT_ZOOM = 14;
const AREA_COLOR = "#1b4de4";
// The area's old shape, shown for reference while it is redrawn.
const OLD_SHAPE_COLOR = "#64748b";

const FILTER_OPTIONS = { fromParams: areaFiltersFromParams, toParams: areaFiltersToParams, empty: EMPTY_AREA_FILTERS };

const STATUS_META = {
  pending: { label: "Pending Approval", short: "Pending", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved", short: "Approved", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  declined: { label: "Archived", short: "Archived", cls: "bg-red-50 text-red-700", icon: XCircle },
};

const PANEL = "bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]";
const MAP_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-white";
const CARD_BUTTON =
  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50";

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30";
const LABEL = "block text-xs font-semibold text-slate-500 mb-1.5";

function formatWhen(iso) {
  return iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
}

function mapArea(raw) {
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

const emptyForm = () => ({ barangay: "", name: "", color: AREA_COLOR, ...EMPTY_AREA_DETAILS });
const formFromArea = (a) => ({ barangay: a.barangay, name: a.name, color: a.color || AREA_COLOR, ...pickAreaDetails(a) });

function centroid(points) {
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

/** "1.20 ha" for a polygon, "350 m long" for a line. */
function shapeSize({ closed, points }) {
  if (closed && points.length >= 3) return formatArea(ringAreaM2(points));
  if (!closed && points.length >= 2) return `${formatDistance(pathLengthM(points))} long`;
  return "";
}

/** The server's reason, without the field name it is filed under. */
function serverReason(err, fallback) {
  const message = (err?.message || "").replace(/^\w+: /, "");
  return message && !message.startsWith("API error") ? message : fallback;
}

/** Flies to `position`; `offsetX` (px) puts it that far left of the middle, clear of the details card. */
function FlyTo({ position, zoom, offsetX = 0 }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    const targetZoom = zoom || DEFAULT_ZOOM + 1;
    const shift = Math.min(offsetX, map.getSize().x / 4);
    const center = shift ? map.unproject(map.project(position, targetZoom).add([shift, 0]), targetZoom) : position;
    map.flyTo(center, targetZoom, { duration: 0.8 });
  }, [map, position, zoom, offsetX]);
  return null;
}

/** Zooms the map to fit the shown areas each time `trigger` changes (0 does nothing). */
function FitAreas({ areas, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (!trigger) return;
    const points = areas.flatMap((a) => a.points);
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
    // Only a new trigger should move the map, not every change to the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trigger]);
  return null;
}

function AreaShape({ area, color, weight = 3, opacity = 0.9, dashed = false, fillOpacity, onSelect }) {
  if (area.points.length < (area.closed ? 3 : 2)) return null;
  const pathOptions = { color, weight, opacity, ...(dashed ? { dashArray: "6 6" } : {}) };
  const eventHandlers = onSelect ? { click: onSelect } : undefined;
  return area.closed ? (
    <Polygon positions={area.points} interactive={!dashed} eventHandlers={eventHandlers} pathOptions={{ ...pathOptions, fillColor: color, fillOpacity: fillOpacity ?? (dashed ? 0.05 : 0.2) }} />
  ) : (
    <Polyline positions={area.points} interactive={!dashed} eventHandlers={eventHandlers} pathOptions={pathOptions} />
  );
}

/** "22.1 bags in the last 30 days, up from 18.5 (+19.5%)": the figures behind the priority flag. */
function priorityText(p) {
  if (!p) return "";
  const avg = (n) => `${n} bag${n === 1 ? "" : "s"}`;
  switch (p.status) {
    case "priority": return `${avg(p.current.average)} in the last ${p.window_days} days, up from ${avg(p.previous.average)} (+${p.change_pct}%). Priority area.`;
    case "steady": return `${avg(p.current.average)} in the last ${p.window_days} days, down or level from ${avg(p.previous.average)}.`;
    case "no_baseline": return `${avg(p.current.average)} in the last ${p.window_days} days; no cleanups the month before to compare with.`;
    default: return `No cleanups in the last ${p.window_days} days (${avg(p.previous.average)} the month before).`;
  }
}

/** What CENRO knows about an area, shown under it in the list. */
function AreaDetails({ area }) {
  const rows = [
    ["Bags per cleanup", priorityText(area.priority)],
    ["Water body", [waterBodyLabel(area.waterBodyType), area.waterBodyName].filter(Boolean).join(" · ")],
    ["Hazards", area.hazards],
    ["Cleanups", area.requestCount === 1 ? "1 request sent here" : `${area.requestCount} requests sent here`],
    ["Made by", area.submittedBy || "Unknown"],
    ["Created", area.dateSubmitted],
    [
      area.status === "declined" ? "Archived by" : "Approved by",
      area.status === "pending"
        ? "Not approved yet"
        : [area.reviewedBy || "Unknown", area.dateReviewed].filter(Boolean).join(" • "),
    ],
    ["Last edited", area.updatedBy ? `${area.updatedBy} • ${area.dateUpdated}` : ""],
  ].filter(([, value]) => value);

  return (
    <div className="py-3 text-xs">
      {area.description && <p className="mb-2 whitespace-pre-line text-slate-600">{area.description}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className={`break-words whitespace-pre-line font-medium ${label === "Hazards" || (label === "Bags per cleanup" && area.priority?.is_priority) ? "text-amber-700" : "text-slate-700"}`}>{value}</dd>
          </Fragment>
        ))}
      </dl>
      {!hasAreaDetails(area) && (
        <p className="mt-2 text-slate-400">No details yet. Click Edit to add a description, the water body and its hazards.</p>
      )}
    </div>
  );
}

// How far back an area's heatmap looks (the heatmap API's time_filter).
const HEAT_PERIODS = [
  { value: "weekly", label: "7 days", none: "in the last 7 days" },
  { value: "monthly", label: "30 days", none: "in the last 30 days" },
  { value: "all", label: "All time", none: "yet" },
];

/** The switch for the area's trash heatmap, with how far back it looks and what it found. */
function HeatmapToggle({ heat, onToggle, onPeriod }) {
  const period = HEAT_PERIODS.find((p) => p.value === heat.period) || HEAT_PERIODS[1];
  const items = heat.reports.reduce((sum, r) => sum + (r.trash_count || 0), 0);
  let summary = "Where the robots found trash during this area's cleanups";
  if (heat.on) {
    if (heat.loading) summary = "Loading…";
    else if (heat.failed) summary = "The heatmap couldn't be loaded.";
    else if (heat.reports.length === 0) summary = `No trash detected here ${period.none}.`;
    else summary = `${heat.reports.length} detection${heat.reports.length === 1 ? "" : "s"} · ${items} item${items === 1 ? "" : "s"}`;
  }
  return (
    <div className="rounded-xl border border-slate-200 p-2.5">
      <button type="button" role="switch" aria-checked={heat.on} onClick={onToggle} className="flex w-full items-center gap-2.5 text-left">
        <Flame size={16} className={`shrink-0 ${heat.on ? "text-orange-500" : "text-slate-400"}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-700">Trash heatmap</span>
          <span className={`block truncate text-[11px] ${heat.on && heat.failed ? "text-red-600" : "text-slate-400"}`}>{summary}</span>
        </span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${heat.on ? "bg-[#1b4de4]" : "bg-slate-200"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${heat.on ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {heat.on && (
        <div className="mt-2.5 space-y-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Heatmap period">
            {HEAT_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onPeriod(p.value)}
                aria-pressed={heat.period === p.value}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                  heat.period === p.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Low <span className={`h-1.5 flex-1 rounded-full ${LEGEND_CLASSES["Waste Density"]}`} /> High
          </div>
        </div>
      )}
    </div>
  );
}

/** The selected area, over the map: what it is, its details, and what can be done with it. */
function AreaCard({ area, busy, heat, onToggleHeat, onHeatPeriod, onClose, onEdit, onRequests, onApprove, onArchive }) {
  const meta = STATUS_META[area.status] || STATUS_META.pending;
  const StatusIcon = meta.icon;
  return (
    <div className="absolute right-3 top-3 z-[500] flex max-h-[calc(100%-1.5rem)] w-[min(340px,calc(100%-1.5rem))] flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-start gap-2.5 border-b border-slate-100 p-4">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: area.color }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-snug text-slate-900">{area.name}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {area.id} · {area.barangay || "Unknown barangay"} · {area.closed ? "Polygon" : "Line"}
            {shapeSize(area) ? ` · ${shapeSize(area)}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
              <StatusIcon className="h-3 w-3" /> {meta.label}
            </span>
            {area.priority?.is_priority && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Priority
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close details">
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1">
        {area.status === "declined" && area.declineReason && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Reason: {area.declineReason}</p>
        )}
        <AreaDetails area={area} />
      </div>

      <div className="space-y-2 border-t border-slate-100 p-3">
        <HeatmapToggle heat={heat} onToggle={onToggleHeat} onPeriod={onHeatPeriod} />
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} disabled={busy} className={`${CARD_BUTTON} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
            <Pencil size={14} /> Edit
          </button>
          <button type="button" onClick={onRequests} className={`${CARD_BUTTON} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
            <ClipboardList size={14} /> Requests
            <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{area.requestCount}</span>
          </button>
        </div>
        {area.status === "pending" && (
          <div className="flex gap-2">
            <button type="button" onClick={onArchive} disabled={busy} className={`${CARD_BUTTON} border border-red-200 text-red-700 hover:bg-red-50`}>
              <XCircle size={14} /> Archive
            </button>
            <button type="button" onClick={onApprove} disabled={busy} className={`${CARD_BUTTON} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <CheckCircle2 size={14} /> {busy ? "Approving…" : "Approve"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CollectionAreas() {
  const { currentUser } = useOutletContext() || {};
  const [areas, setAreas] = useState([]);
  // Whether each area is a priority (by area ID), from /api/priority-areas/.
  const [priorityById, setPriorityById] = useState({});
  const [loading, setLoading] = useState(true);
  const { filters, update: updateFilters, clear: clearFilters, reset: resetFilters } = useUrlFilters(FILTER_OPTIONS);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [approveTarget, setApproveTarget] = useState(null);
  const [requestsArea, setRequestsArea] = useState(null);
  // Adding an area (approved as soon as it's saved) or editing one: "add", "edit" or null.
  const [mode, setMode] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const draft = useAreaDraft();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.areas, LIVE.requests);
  useEffect(() => {
    let cancelled = false;
    api.collectionAreas()
      .then((data) => { if (!cancelled) setAreas((data || []).map(mapArea)); })
      .catch((err) => console.error("Failed to load collection areas:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    api.priorityAreas()
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setPriorityById(Object.fromEntries(data.map((p) => [p.collection_area.area_id, p])));
      })
      .catch((err) => console.error("Failed to load priority areas:", err));
    return () => { cancelled = true; };
  }, [live]);

  const listed = useMemo(() => areas.map((a) => ({ ...a, priority: priorityById[a.id] || null })), [areas, priorityById]);
  const filtered = useMemo(() => sortAreas(filterAreas(listed, filters), filters.sort), [listed, filters]);
  const tabCounts = useMemo(() => statusCounts(listed, filters), [listed, filters]);
  const barangayOptions = useMemo(() => areaBarangays(areas), [areas]);
  const filtersActive = filtered.length !== areas.length;
  // The selected area may be hidden by a filter; then nothing is highlighted on the map.
  const highlightedId = filtered.some((a) => a.id === activeId) ? activeId : null;
  const selectedArea = highlightedId ? filtered.find((a) => a.id === highlightedId) : null;
  useEffect(() => {
    if (highlightedId) document.querySelector(`[data-area-row="${highlightedId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedId]);

  // The selected area's trash heatmap: detections from the cleanups sent to it. The switch
  // stays on while other areas are picked, so each one's heatmap shows in turn.
  const [heatOn, setHeatOn] = useState(false);
  const [heatPeriod, setHeatPeriod] = useState("monthly");
  const [heatData, setHeatData] = useState({ key: null, reports: [], failed: false });
  const liveDetections = useLiveVersion(LIVE.detections, LIVE.requests);
  const heatKey = !mode && heatOn && selectedArea ? `${selectedArea.id}|${heatPeriod}` : null;
  useEffect(() => {
    if (!heatKey) return undefined;
    const [areaId, period] = heatKey.split("|");
    let cancelled = false;
    api.getHeatmap({ collection_area: areaId, time_filter: period })
      .then((data) => { if (!cancelled) setHeatData({ key: heatKey, reports: Array.isArray(data) ? data : [], failed: false }); })
      .catch((err) => {
        console.error("Failed to load the area's heatmap:", err);
        if (!cancelled) setHeatData({ key: heatKey, reports: [], failed: true });
      });
    return () => { cancelled = true; };
  }, [heatKey, liveDetections]);
  const heatLoaded = heatKey && heatData.key === heatKey ? heatData : null;
  const heatPoints = useMemo(
    () => (heatLoaded?.reports || []).map((r) => [r.latitude, r.longitude, r.weight || 0.5]),
    [heatLoaded]
  );
  // One area holds many detections close together: tighter spots, and "hot" scaled to how many
  // there are, so the worst parts stand out instead of the whole area turning red.
  const heatOptions = useMemo(
    () => ({ radius: 22, blur: 18, max: Math.max(1, heatPoints.length / 25) }),
    [heatPoints.length]
  );
  const heat = {
    on: heatOn,
    period: heatPeriod,
    loading: Boolean(heatKey) && !heatLoaded,
    failed: Boolean(heatLoaded?.failed),
    reports: heatLoaded?.reports || [],
  };

  const editing = mode === "edit" ? editTarget : null;
  const barangayChanged = Boolean(editing && form.barangay !== editing.barangay);
  // A new area is always drawn; an edited one keeps its shape unless it is redrawn or moved.
  const reshaping = mode === "add" || draft.isDrafting || barangayChanged;
  const shapeReady = !reshaping || draft.canSave;
  const canSave = Boolean(form.barangay && form.name.trim() && shapeReady && !saving);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const focusArea = (a) => {
    setActiveId(a.id);
    setFlyTo(centroid(a.points));
  };

  // Opened from a link to one area (?area=CA-0016, e.g. from the dashboard): select it.
  const [searchParams] = useSearchParams();
  const linkedAreaId = searchParams.get("area");
  const [linkedShown, setLinkedShown] = useState(null);
  const linkedArea = linkedAreaId && linkedShown !== linkedAreaId ? areas.find((a) => a.id === linkedAreaId) : null;
  if (linkedArea) {
    setLinkedShown(linkedAreaId);
    setActiveId(linkedArea.id);
    setFlyTo(centroid(linkedArea.points));
  }

  const handleApprove = async (area) => {
    setBusyId(area.id);
    try {
      const updated = await api.approveCollectionArea(area.id, { reviewed_by: currentUser?.name });
      setAreas((prev) => prev.map((a) => (a.id === area.id ? mapArea(updated) : a)));
      logAudit({
        currentUser,
        action: "Collection area approved",
        module: "Collection Areas",
        details: `${area.name} (${area.id}) approved for ${area.barangay}`,
      });
    } catch (err) {
      console.error("Failed to approve collection area:", err);
      alert("Failed to approve area. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const area = approveTarget;
    setApproveTarget(null);
    await handleApprove(area);
  };

  const openDecline = (area) => {
    setDeclineTarget(area);
    setDeclineReason("");
  };

  const submitDecline = async () => {
    if (!declineTarget || !declineReason.trim()) return;
    setBusyId(declineTarget.id);
    try {
      const updated = await api.declineCollectionArea(declineTarget.id, { reason: declineReason.trim(), reviewed_by: currentUser?.name });
      setAreas((prev) => prev.map((a) => (a.id === declineTarget.id ? mapArea(updated) : a)));
      logAudit({
        currentUser,
        action: "Collection area archived",
        module: "Collection Areas",
        details: `${declineTarget.name} (${declineTarget.id}) archived: ${declineReason.trim()}`,
        status: "warning",
      });
      setDeclineTarget(null);
      setDeclineReason("");
    } catch (err) {
      console.error("Failed to archive collection area:", err);
      alert("Failed to archive area. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const closeForm = () => {
    draft.clear();
    draft.stop();
    setMode(null);
    setEditTarget(null);
    setForm(emptyForm());
    setSaveError("");
  };

  const startAdding = () => {
    // Clicking Add Area again while adding starts the shape over and keeps what was typed.
    if (mode !== "add") {
      setForm(emptyForm());
      setEditTarget(null);
      setMode("add");
    }
    draft.start();
    setActiveId(null);
    setSaveError("");
  };

  const startEditing = (area) => {
    draft.clear();
    draft.stop();
    setMode("edit");
    setEditTarget(area);
    setForm(formFromArea(area));
    focusArea(area);
    setSaveError("");
  };

  const chooseBarangay = (barangay) => {
    // A shape drawn for one barangay can't move to another, so a new barangay means drawing again.
    setForm((prev) => ({ ...prev, barangay }));
    draft.start();
  };

  const keepCurrentShape = () => {
    draft.clear();
    draft.stop();
    if (editing) setForm((prev) => ({ ...prev, barangay: editing.barangay }));
  };

  const saveForm = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError("");
    const body = { name: form.name.trim(), color: form.color, ...areaDetailsToApi(form) };
    if (reshaping) Object.assign(body, { barangay: form.barangay, points: draft.points, closed: draft.isPolygon });
    try {
      if (editing) {
        const updated = mapArea(await api.patchCollectionArea(editing.id, body));
        setAreas((prev) => prev.map((a) => (a.id === editing.id ? updated : a)));
        setActiveId(updated.id);
        setFlyTo(centroid(updated.points));
        const changes = [reshaping && "shape redrawn", barangayChanged && `moved to ${updated.barangay}`].filter(Boolean);
        logAudit({
          currentUser,
          action: "Collection area edited",
          module: "Collection Areas",
          details: `${updated.name} (${updated.id}) edited${changes.length ? `: ${changes.join(", ")}` : ""}`,
        });
      } else {
        const created = mapArea(await api.createCollectionArea({ ...body, submitted_by: currentUser?.name || "CENRO" }));
        setAreas((prev) => [created, ...prev]);
        // Show the new area: only approved ones, with no other filter that could hide it.
        resetFilters({ status: "approved" });
        setActiveId(created.id);
        setFlyTo(centroid(created.points));
        logAudit({
          currentUser,
          action: "Collection area added",
          module: "Collection Areas",
          details: `${created.name} (${created.id}) added for ${created.barangay}`,
        });
      }
      closeForm();
    } catch (err) {
      console.error("Failed to save collection area:", err);
      setSaveError(serverReason(err, "The area couldn't be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  const drawingHint = draft.isPolygon
    ? { cls: "border-blue-100 text-[#1b4de4]", text: "Polygon created. Save it, or click Redraw to start the shape over." }
    : draft.drawing
      ? {
          cls: "border-amber-200 text-amber-800",
          text: form.barangay
            ? `Click the map inside ${form.barangay}'s dashed outline, or on the water just off it, to add points. Click the first (blue) point to close a filled polygon.`
            : "Choose the barangay first. The map moves to its boundary.",
        }
      : null;

  // Only while adding or editing: the fields read the area being edited.
  const formFields = mode && (
    <div className="space-y-3">
      <div>
        <label htmlFor="area-barangay" className={LABEL}>Barangay</label>
        <div className="relative">
          <select
            id="area-barangay"
            value={form.barangay}
            onChange={(e) => chooseBarangay(e.target.value)}
            className={`${FIELD} appearance-none pr-9`}
          >
            <option value="" disabled>Select a barangay</option>
            {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {barangayChanged && (
          <p className="text-[11px] text-amber-700 mt-1.5">Moving it to {form.barangay} means drawing its shape again there.</p>
        )}
      </div>

      <div>
        <label htmlFor="area-name" className={LABEL}>Area Name</label>
        <input
          id="area-name"
          type="text"
          value={form.name}
          onChange={setField("name")}
          maxLength={100}
          placeholder="e.g. Carlatan Creek Reach"
          className={FIELD}
        />
      </div>

      <div>
        <p className={LABEL}>Area Color</p>
        <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input
            type="color"
            value={form.color}
            onChange={setField("color")}
            className="h-7 w-9 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0"
            aria-label="Area color"
          />
          <span className="text-xs font-medium uppercase text-slate-500">{form.color}</span>
        </div>
      </div>

      {/* Shape */}
      <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-between">
          <span>{reshaping ? "Points drawn" : "Shape"}</span>
          <span className="font-semibold text-slate-700">
            {reshaping
              ? `${draft.points.length}${draft.canSave ? ` · ${shapeSize({ closed: draft.isPolygon, points: draft.points })}` : ""}`
              : `${editing.closed ? "Polygon" : "Line"} · ${shapeSize(editing) || `${editing.points.length} pts`}`}
          </span>
        </div>
        {editing && reshaping && editing.requestCount > 0 && (
          <p className="text-amber-700">
            {editing.requestCount === 1 ? "1 request was" : `${editing.requestCount} requests were`} sent to this area. The Heatmap
            will measure their coverage against the new shape.
          </p>
        )}
        <div className="flex gap-2">
          {editing && !reshaping ? (
            <button
              type="button"
              onClick={() => draft.start()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="h-4 w-4" /> Redraw shape
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={draft.undo}
                disabled={draft.points.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Undo2 className="h-4 w-4" /> Undo
              </button>
              <button
                type="button"
                onClick={() => draft.start()}
                disabled={draft.drawing && draft.points.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {draft.points.length === 0 && !draft.drawing
                  ? <><Pencil className="h-4 w-4" /> Draw</>
                  : <><Eraser className="h-4 w-4" /> Redraw</>}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={keepCurrentShape}
                  title="Keep the shape (and barangay) it has now"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" /> Keep old
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-bold text-slate-700">
          Details <span className="font-medium text-slate-400">(optional, for the operator and workers)</span>
        </p>
      </div>

      <div>
        <label htmlFor="area-description" className={LABEL}>Description</label>
        <textarea
          id="area-description"
          value={form.description}
          onChange={setField("description")}
          rows={2}
          placeholder="What the area is and what usually collects there"
          className={FIELD}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="area-water-type" className={LABEL}>Water body</label>
          <div className="relative">
            <select id="area-water-type" value={form.waterBodyType} onChange={setField("waterBodyType")} className={`${FIELD} appearance-none pr-8`}>
              <option value="">Not set</option>
              {WATER_BODY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="area-water-name" className={LABEL}>Its name</label>
          <input
            id="area-water-name"
            type="text"
            value={form.waterBodyName}
            onChange={setField("waterBodyName")}
            maxLength={100}
            placeholder="e.g. Carlatan Creek"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="area-hazards" className={LABEL}>Hazards</label>
        <textarea
          id="area-hazards"
          value={form.hazards}
          onChange={setField("hazards")}
          rows={2}
          placeholder="e.g. Strong current after rain, submerged rocks near the outlet"
          className={FIELD}
        />
      </div>

      {saveError && <p className="text-xs font-medium text-red-600" role="alert">{saveError}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={closeForm}
          disabled={saving}
          className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={saveForm}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : editing ? "Save Changes" : "Save Area"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        {editing
          ? !shapeReady
            ? "Finish the new shape, or click Keep old to leave it as it was."
            : "Changes apply straight away. The area keeps its status."
          : "Areas CENRO adds are approved straight away."}
      </p>
    </div>
  );

  return (
    <div className="h-full max-w-[1400px] mx-auto animate-fade-in flex flex-col lg:overflow-hidden pb-4 lg:pb-0">
      <header className="mb-5 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Collection Areas</h1>
            <p className="text-slate-500 mt-1.5 text-sm font-medium">
              Add and edit collection zones for any barangay, and review the ones barangays submit.
            </p>
          </div>
          <button
            type="button"
            onClick={startAdding}
            disabled={mode === "edit"}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === "add" && draft.drawing ? "bg-amber-500 hover:bg-amber-600" : "bg-[#1b4de4] hover:bg-[#153eb8]"
            }`}
          >
            {mode === "add" && draft.drawing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mode === "add" && draft.drawing ? "Drawing…" : "Add Area"}
          </button>
        </div>
        {!mode && (
          <div className="mt-4 overflow-x-auto">
            <AreaStatusTabs value={filters.status} onChange={updateFilters} counts={tabCounts} />
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5 flex-1 min-h-0">
        {/* ── Left panel: the list, or the add / edit form ── */}
        <div className={`${PANEL} flex flex-col min-h-0 max-h-[70vh] lg:max-h-none`}>
          {mode ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  {editing ? <Pencil className="h-4 w-4 shrink-0 text-slate-400" /> : <Layers className="h-4 w-4 shrink-0 text-slate-400" />}
                  <h2 className="text-[15px] font-bold text-slate-900 truncate">{editing ? `Edit ${editing.name}` : "New Area"}</h2>
                </div>
                <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              {formFields}
            </div>
          ) : (
            <>
              <AreaFilters
                filters={filters}
                onChange={updateFilters}
                onClear={clearFilters}
                barangays={barangayOptions}
                total={areas.length}
                shown={filtered.length}
              />
              <div className="flex-1 min-h-0 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="p-5">
                    {areas.length === 0 ? (
                      <EmptyState title="No areas yet." subtitle="Submissions from barangays will appear here." />
                    ) : (
                      <EmptyState title="No areas match these filters." subtitle="Change or clear the filters to see more areas." />
                    )}
                  </div>
                ) : (
                  <ul className="p-2">
                    {filtered.map((a) => {
                      const selected = highlightedId === a.id;
                      const meta = STATUS_META[a.status] || STATUS_META.pending;
                      // Approved is the usual state, so only the others get a label, unless a tab already says it.
                      const showStatus = a.status !== "approved" && !filters.status;
                      return (
                        <li key={a.id} data-area-row={a.id}>
                          <button
                            type="button"
                            onClick={() => (selected ? setActiveId(null) : focusArea(a))}
                            aria-pressed={selected}
                            className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{a.name}</span>
                              {a.priority?.is_priority && (
                                <span
                                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                                  title="More bags per cleanup over the last 30 days than the 30 before"
                                >
                                  <AlertTriangle className="h-3 w-3" /> Priority
                                </span>
                              )}
                              {showStatus && (
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.short}</span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate pl-5 text-xs text-slate-400">
                              {a.barangay || "Unknown barangay"} · {a.requestCount === 1 ? "1 request" : `${a.requestCount} requests`} · {a.id}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Map ── */}
        <div className={`${PANEL} relative min-h-[480px] lg:min-h-0 overflow-hidden p-2`}>
          <div className="relative h-full min-h-[460px] lg:min-h-0 rounded-xl overflow-hidden">
            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}>
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <ZoomControl position="bottomright" />
              {flyTo && <FlyTo position={flyTo} offsetX={mode ? 0 : 175} />}
              <FitAreas areas={filtered} trigger={fitTrigger} />
              {filtered.map((a) =>
                a.id === editing?.id ? null : (
                  <AreaShape
                    key={a.id}
                    area={a}
                    color={a.color || AREA_COLOR}
                    weight={highlightedId === a.id ? 5 : 3}
                    opacity={highlightedId && highlightedId !== a.id ? 0.4 : 0.9}
                    // Nearly clear while its heatmap shows, so the heat keeps its colours.
                    fillOpacity={heatPoints.length > 0 && a.id === highlightedId ? 0.04 : undefined}
                    onSelect={mode ? undefined : () => focusArea(a)}
                  />
                )
              )}
              {heatPoints.length > 0 && <HeatmapLayer points={heatPoints} type="Waste Density" options={heatOptions} />}
              {mode && <BarangayOutline barangay={form.barangay} fit={reshaping} />}
              {editing && (
                reshaping
                  ? <AreaShape area={editing} color={OLD_SHAPE_COLOR} weight={2} dashed />
                  : <AreaShape area={editing} color={form.color} weight={5} />
              )}
              {mode && <AreaDraftLayers draft={draft} barangay={form.barangay} color={form.color} />}
            </MapContainer>

            {/* What's on the map, and drawing help, over its top-left corner */}
            <div className="pointer-events-none absolute left-3 top-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 sm:max-w-sm">
              {drawingHint ? (
                <div className={`pointer-events-auto rounded-xl border px-3 py-2 text-xs font-medium shadow-sm bg-white/95 ${drawingHint.cls}`}>{drawingHint.text}</div>
              ) : (
                <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                  <MapIcon className="h-3.5 w-3.5 text-slate-400" />
                  {filtersActive ? `Showing ${filtered.length} of ${areas.length} areas` : `${areas.length} collection areas`}
                  {!mode && !selectedArea && <span className="text-slate-400">· click one to see it</span>}
                </span>
              )}
              {draft.notice && (
                <div className="pointer-events-auto rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-sm" role="alert">
                  {draft.notice}
                </div>
              )}
              {editing && reshaping && (
                <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                  <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: OLD_SHAPE_COLOR }} />
                  Current shape
                </span>
              )}
            </div>

            {/* Map buttons, bottom-left */}
            <div className="absolute bottom-3 left-3 z-[500] flex gap-2">
              {draft.drawing ? (
                <button type="button" onClick={draft.stop} className={MAP_BUTTON}>
                  <X className="h-3.5 w-3.5" /> Stop drawing
                </button>
              ) : !mode && filtered.length > 0 && (
                <button type="button" onClick={() => setFitTrigger((n) => n + 1)} className={MAP_BUTTON}>
                  <Maximize2 className="h-3.5 w-3.5" /> {filtersActive ? "Zoom to shown areas" : "Zoom to all areas"}
                </button>
              )}
            </div>

            {/* The selected area's details and actions, over the map's right side */}
            {!mode && selectedArea && (
              <AreaCard
                area={selectedArea}
                busy={busyId === selectedArea.id}
                heat={heat}
                onToggleHeat={() => setHeatOn((on) => !on)}
                onHeatPeriod={setHeatPeriod}
                onClose={() => setActiveId(null)}
                onEdit={() => startEditing(selectedArea)}
                onRequests={() => setRequestsArea(selectedArea)}
                onApprove={() => setApproveTarget(selectedArea)}
                onArchive={() => openDecline(selectedArea)}
              />
            )}
          </div>
        </div>
      </div>

      {requestsArea && <AreaRequestsModal area={requestsArea} onClose={() => setRequestsArea(null)} />}

      {approveTarget && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Approve Area</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {approveTarget.name} will be approved as an active collection zone for {approveTarget.barangay || "this barangay"}.
                </p>
              </div>
              <button onClick={() => setApproveTarget(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 flex gap-3">
              <button
                onClick={() => setApproveTarget(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={busyId === approveTarget.id}
                onClick={confirmApprove}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyId === approveTarget.id ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {declineTarget && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Archive Area</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {declineTarget.name} will be archived and the barangay will be notified with your remarks.
                </p>
              </div>
              <button onClick={() => setDeclineTarget(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 pt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                Reason for archiving <span className="text-red-500">*</span>
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="Explain why this area is being archived..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
              />
            </div>
            <div className="p-6 flex gap-3">
              <button
                onClick={() => setDeclineTarget(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!declineReason.trim() || busyId === declineTarget.id}
                onClick={submitDecline}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyId === declineTarget.id ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
