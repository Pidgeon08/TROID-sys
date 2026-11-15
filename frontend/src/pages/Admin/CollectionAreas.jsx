import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Polyline, Polygon, useMap } from "react-leaflet";
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
import { SummaryCard } from "../../components/ui/SummaryCard";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import AreaRequestsModal from "./AreaRequestsModal";

const DEFAULT_CENTER = [16.6195, 120.314];
const DEFAULT_ZOOM = 14;
const AREA_COLOR = "#1b4de4";
// The area's old shape, shown for reference while it is redrawn.
const OLD_SHAPE_COLOR = "#64748b";

// "Archived" is how CENRO sees the declined status (still stored as "declined").
const TABS = ["All", "Pending", "Approved", "Archived"];
const TAB_STATUS = { Pending: "pending", Approved: "approved", Archived: "declined" };

const STATUS_META = {
  pending: { label: "Pending Approval", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  declined: { label: "Archived", cls: "bg-red-50 text-red-700", icon: XCircle },
};

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

function FlyTo({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, zoom || DEFAULT_ZOOM + 1, { duration: 0.8 });
    }
  }, [map, position, zoom]);
  return null;
}

function AreaShape({ area, color, weight = 3, opacity = 0.9, dashed = false }) {
  if (area.points.length < (area.closed ? 3 : 2)) return null;
  const pathOptions = { color, weight, opacity, ...(dashed ? { dashArray: "6 6" } : {}) };
  return area.closed ? (
    <Polygon positions={area.points} interactive={!dashed} pathOptions={{ ...pathOptions, fillColor: color, fillOpacity: dashed ? 0.05 : 0.2 }} />
  ) : (
    <Polyline positions={area.points} interactive={!dashed} pathOptions={pathOptions} />
  );
}

/** What CENRO knows about an area, shown under it in the list. */
function AreaDetails({ area }) {
  const rows = [
    ["Water body", [waterBodyLabel(area.waterBodyType), area.waterBodyName].filter(Boolean).join(" · ")],
    ["Hazards", area.hazards],
    ["Size", shapeSize(area)],
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
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
      {area.description && <p className="mb-2 whitespace-pre-line text-slate-600">{area.description}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className={`break-words whitespace-pre-line font-medium ${label === "Hazards" ? "text-amber-700" : "text-slate-700"}`}>{value}</dd>
          </Fragment>
        ))}
      </dl>
      {!hasAreaDetails(area) && (
        <p className="mt-2 text-slate-400">No details yet. Click Edit to add a description, the water body and its hazards.</p>
      )}
    </div>
  );
}

export default function CollectionAreas() {
  const { currentUser } = useOutletContext() || {};
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Pending");
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

  useEffect(() => {
    let cancelled = false;
    api.collectionAreas()
      .then((data) => { if (!cancelled) setAreas((data || []).map(mapArea)); })
      .catch((err) => console.error("Failed to load collection areas:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    total: areas.length,
    pending: areas.filter((a) => a.status === "pending").length,
    approved: areas.filter((a) => a.status === "approved").length,
    declined: areas.filter((a) => a.status === "declined").length,
  }), [areas]);

  const filtered = useMemo(() => {
    if (activeTab === "All") return areas;
    return areas.filter((a) => a.status === TAB_STATUS[activeTab]);
  }, [areas, activeTab]);

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
        setActiveTab("Approved");
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
    ? { cls: "bg-[#1b4de4]/10 border-[#1b4de4]/20 text-[#1b4de4]", text: "Polygon created. Save it, or click Redraw to start the shape over." }
    : draft.drawing
      ? {
          cls: "bg-amber-50 border-amber-100 text-amber-700",
          text: form.barangay
            ? `Click the map inside ${form.barangay}'s dashed outline, or on the water just off it, to add points. Click the first (blue) point to close a filled polygon.`
            : "Choose the barangay first. The map moves to its boundary.",
        }
      : null;

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
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
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Layers} label="Total Areas" value={counts.total} sub="All submissions" />
        <SummaryCard icon={Clock} label="Pending" value={counts.pending} sub="Awaiting your approval" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={counts.approved} sub="Active collection zones" />
        <SummaryCard icon={XCircle} label="Archived" value={counts.declined} sub="Archived submissions" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {mode ? (
          <Card>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 min-w-0">
                {editing ? <Pencil className="h-4 w-4 shrink-0 text-slate-400" /> : <Layers className="h-4 w-4 shrink-0 text-slate-400" />}
                <h2 className="text-[15px] font-bold text-slate-900 truncate">{editing ? `Edit ${editing.id}` : "New Area"}</h2>
              </div>
              <button type="button" onClick={closeForm} disabled={saving} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {drawingHint && (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-xs font-medium ${drawingHint.cls}`}>{drawingHint.text}</div>
            )}
            {draft.notice && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs font-medium text-red-700" role="alert">
                {draft.notice}
              </div>
            )}

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
          </Card>
        ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-4 px-5 border-b border-slate-100 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab}
                {activeTab === tab && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-blue-600 rounded-full" />}
              </button>
            ))}
          </div>
          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-50">
            {filtered.length === 0 && (
              <div className="p-5">
                <EmptyState title="No areas found." subtitle="Submissions from barangays will appear here." />
              </div>
            )}
            {filtered.map((a) => {
              const meta = STATUS_META[a.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              const selected = activeId === a.id;
              return (
                <div key={a.id} className={`p-5 ${selected ? "bg-blue-50/40" : ""}`}>
                  <button type="button" onClick={() => focusArea(a)} className="w-full text-left" aria-expanded={selected}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="truncate">{a.name}</span>
                      </p>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                        <StatusIcon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {a.id} · {a.barangay || "Unknown barangay"} · {a.closed ? "Polygon" : "Line"}
                      {a.waterBodyType ? ` · ${waterBodyLabel(a.waterBodyType)}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">{a.submittedBy} &bull; {a.dateSubmitted}</p>
                  </button>
                  {a.status === "declined" && a.declineReason && (
                    <p className="mt-2 text-xs text-red-600">Reason: {a.declineReason}</p>
                  )}
                  {selected && <AreaDetails area={a} />}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(a)}
                      disabled={busyId === a.id}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestsArea(a)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <ClipboardList size={14} />
                      Requests
                      <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{a.requestCount}</span>
                    </button>
                    {a.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openDecline(a)}
                          disabled={busyId === a.id}
                          className="flex items-center gap-1.5 rounded-lg border-2 border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <XCircle size={14} />
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => setApproveTarget(a)}
                          disabled={busyId === a.id}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          {busyId === a.id ? "Approving…" : "Approve"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        )}

        {/* Map */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-3">
          <div className="relative h-[600px] rounded-xl overflow-hidden border border-slate-100">
            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url={TILE_URL}
                attribution={TILE_ATTRIBUTION}
              />
              {flyTo && <FlyTo position={flyTo} />}
              {filtered.map((a) =>
                a.id === editing?.id ? null : (
                  <AreaShape
                    key={a.id}
                    area={a}
                    color={a.color || AREA_COLOR}
                    weight={activeId === a.id ? 5 : 3}
                    opacity={activeId && activeId !== a.id ? 0.4 : 0.9}
                  />
                )
              )}
              {mode && <BarangayOutline barangay={form.barangay} fit={reshaping} />}
              {editing && (
                reshaping
                  ? <AreaShape area={editing} color={OLD_SHAPE_COLOR} weight={2} dashed />
                  : <AreaShape area={editing} color={form.color} weight={5} />
              )}
              {mode && <AreaDraftLayers draft={draft} barangay={form.barangay} color={form.color} />}
            </MapContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AREA_COLOR }} />
                Collection Area
              </span>
              {editing && reshaping && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: OLD_SHAPE_COLOR }} />
                  Current shape
                </span>
              )}
            </span>
            {draft.drawing ? (
              <button
                type="button"
                onClick={draft.stop}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Stop drawing
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <MapIcon className="h-3.5 w-3.5" /> Select an area to see its details
              </span>
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
