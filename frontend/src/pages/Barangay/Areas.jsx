import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Map as MapIcon,
  Plus,
  Trash2,
  Pencil,
  Undo2,
  Eraser,
  Save,
  MapPin,
  Layers,
  X,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import api from "../../services/api";
import { logAudit } from "../../services/auditLog";

const DEFAULT_CENTER = [16.6195, 120.314];
const DEFAULT_ZOOM = 14;
const AREA_COLOR = "#1b4de4";

const STATUS_META = {
  pending: { label: "Pending Approval", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  declined: { label: "Declined", cls: "bg-red-50 text-red-700", icon: XCircle },
};

function mapArea(raw) {
  return {
    id: raw.area_id,
    name: raw.name,
    closed: raw.closed,
    points: raw.points || [],
    color: raw.color || AREA_COLOR,
    status: raw.status || "pending",
    declineReason: raw.decline_reason || "",
    createdAt: raw.date_submitted,
  };
}

function MapClickHandler({ enabled, draftPoints, isPolygon, onAddPoint, onClose }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (!enabled) return;
      const first = draftPoints[0];
      if (draftPoints.length >= 3 && !isPolygon && first) {
        const a = map.latLngToLayerPoint(e.latlng);
        const b = map.latLngToLayerPoint(L.latLng(first[0], first[1]));
        if (Math.hypot(a.x - b.x, a.y - b.y) <= 18) {
          onClose();
          return;
        }
      }
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
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

function BarangayAreas() {
  const { currentUser } = useOutletContext() || {};
  const barangayName = currentUser?.name || "Barangay";
  const barangayLocation = currentUser?.location || barangayName;

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState([]);
  const [isPolygon, setIsPolygon] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(AREA_COLOR);
  const [flyTo, setFlyTo] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [savedFlash, setSavedFlash] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(AREA_COLOR);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.collectionAreas({ barangay: barangayLocation })
      .then((data) => { if (!cancelled) setAreas((data || []).map(mapArea)); })
      .catch((err) => console.error("Failed to load collection areas:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barangayLocation]);

  const addPoint = (p) => setDraftPoints((prev) => [...prev, p]);

  const closePolygon = () => {
    if (drawing && draftPoints.length >= 3 && !isPolygon) {
      setIsPolygon(true);
      setDrawing(false);
    }
  };

  const undoPoint = () => setDraftPoints((prev) => prev.slice(0, -1));

  const clearDraft = () => {
    setDraftPoints([]);
    setIsPolygon(false);
    setName("");
    setColor(AREA_COLOR);
  };

  const requiredPoints = isPolygon ? 3 : 2;
  const canSubmitDraft = draftPoints.length >= requiredPoints && name.trim() && !submitting;
  const isDraftingArea = drawing || draftPoints.length > 0;

  const confirmSaveArea = async () => {
    if (!canSubmitDraft) return;
    setSubmitting(true);
    try {
      const created = await api.createCollectionArea({
        name: name.trim(),
        barangay: barangayLocation,
        submitted_by: barangayName,
        points: draftPoints,
        closed: isPolygon,
        color,
        status: "pending",
      });
      const newArea = mapArea(created);
      setAreas((prev) => [newArea, ...prev]);
      setActiveId(newArea.id);
      setFlyTo(centroid(draftPoints));
      clearDraft();
      setDrawing(false);
      setShowConfirm(false);
      setSavedFlash(`${newArea.name} submitted for admin approval`);
      setTimeout(() => setSavedFlash(""), 3000);
      logAudit({
        currentUser,
        action: "Collection area submitted",
        module: "Collection Areas",
        details: `${newArea.name} (${newArea.id}) submitted by ${barangayName} for approval`,
      });
    } catch (err) {
      console.error("Failed to submit collection area:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteArea = async (id) => {
    const area = areas.find((a) => a.id === id);
    try {
      await api.deleteCollectionArea(id);
      setAreas((prev) => prev.filter((a) => a.id !== id));
      if (activeId === id) setActiveId(null);
      logAudit({
        currentUser,
        action: "Collection area removed",
        module: "Collection Areas",
        details: `${area?.name || id} removed by ${barangayName}`,
      });
    } catch (err) {
      console.error("Failed to remove collection area:", err);
    }
  };

  const focusArea = (a) => {
    setActiveId(a.id);
    setFlyTo(centroid(a.points));
  };

  const openEditArea = (a) => {
    setEditingArea(a);
    setEditName(a.name);
    setEditColor(a.color || AREA_COLOR);
  };

  const closeEditArea = () => {
    setEditingArea(null);
    setEditName("");
    setEditColor(AREA_COLOR);
  };

  const saveEditArea = async () => {
    if (!editingArea || !editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.patchCollectionArea(editingArea.id, {
        name: editName.trim(),
        color: editColor,
      });
      setAreas((prev) => prev.map((a) =>
        a.id === editingArea.id ? { ...a, name: editName.trim(), color: editColor } : a
      ));
      logAudit({
        currentUser,
        action: "Collection area updated",
        module: "Collection Areas",
        details: `${editingArea.name} (${editingArea.id}) renamed to "${editName.trim()}" by ${barangayName}`,
      });
      closeEditArea();
    } catch (err) {
      console.error("Failed to update collection area:", err);
    } finally {
      setSavingEdit(false);
    }
  };

  const startDrawing = () => {
    clearDraft();
    setActiveId(null);
    setDrawing(true);
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Collection Areas</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">
            Draw a cleanup / collection zone for {barangayName} and submit it for admin approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700">
              {savedFlash}
            </span>
          )}
          <button
            type="button"
            onClick={startDrawing}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-colors ${
              drawing ? "bg-amber-500 hover:bg-amber-600" : "bg-[#1b4de4] hover:bg-[#153eb8]"
            }`}
          >
            {drawing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {drawing ? "Drawing…" : "Draw Area"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left panel: draft form + saved list */}
        <div className="flex flex-col gap-6">
          {/* Draft card replaces the Active Areas list while drawing */}
          {isDraftingArea && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-slate-400" />
              <h2 className="text-[15px] font-bold text-slate-900">New Area</h2>
            </div>

            {isPolygon ? (
              <div className="mb-4 rounded-lg bg-[#1b4de4]/10 border border-[#1b4de4]/20 px-3 py-2 text-xs font-medium text-[#1b4de4]">
                Polygon created — add a name and submit, or click Draw Area to start over.
              </div>
            ) : drawing && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs font-medium text-amber-700">
                Drawing mode active — click the map to add vertices. Click the first (blue) node to close a filled polygon.
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Area Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Carlatan Creek Reach"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Area Color</label>
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-7 w-9 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0"
                    aria-label="Area color"
                  />
                  <span className="text-xs font-medium uppercase text-slate-500">{color}</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span>Points drawn</span>
                <span className="font-semibold text-slate-700">{draftPoints.length}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={undoPoint}
                  disabled={draftPoints.length === 0}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 className="h-4 w-4" /> Undo
                </button>
                <button
                  type="button"
                  onClick={clearDraft}
                  disabled={draftPoints.length === 0}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Eraser className="h-4 w-4" /> Clear
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={!canSubmitDraft}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" /> Submit for Approval
              </button>
            </div>
          </div>
          )}

          {/* Saved list: replaced by the draft card while drawing */}
          {!isDraftingArea && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
            <h2 className="text-[15px] font-bold text-slate-900 mb-4">
              Active Areas <span className="text-slate-400 font-medium">({areas.length})</span>
            </h2>
            {loading ? (
              <p className="text-sm text-slate-400">Loading areas…</p>
            ) : areas.length === 0 ? (
              <p className="text-sm text-slate-400">No areas yet. Click Draw Area to start your first zone.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {areas.map((a) => {
                  const meta = STATUS_META[a.status] || STATUS_META.pending;
                  const StatusIcon = meta.icon;
                  return (
                    <li
                      key={a.id}
                      className={`flex flex-col gap-2 py-3 ${activeId === a.id ? "opacity-100" : "opacity-90"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: a.color || AREA_COLOR }}
                        />
                        <button
                          type="button"
                          onClick={() => focusArea(a)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="truncate text-sm font-semibold text-slate-800">{a.name}</p>
                          <p className="text-xs text-slate-400">
                            {a.closed ? "Polygon" : "Polyline"} · {a.points.length} pts
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditArea(a)}
                          aria-label="Edit area"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-[#1b4de4] hover:bg-blue-50 transition-colors shrink-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteArea(a.id)}
                          aria-label="Delete area"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                          <StatusIcon className="h-3 w-3" /> {meta.label}
                        </span>
                      </div>
                      {a.status === "declined" && a.declineReason && (
                        <p className="pl-6 text-xs text-red-600">Reason: {a.declineReason}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}
        </div>

        {/* Map */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-3">
          <div className="relative h-[600px] rounded-xl overflow-hidden border border-slate-100">
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

              <MapClickHandler
                enabled={drawing}
                draftPoints={draftPoints}
                isPolygon={isPolygon}
                onAddPoint={addPoint}
                onClose={closePolygon}
              />
              {flyTo && <FlyTo position={flyTo} />}

              {/* Saved shapes */}
              {areas.map((a) =>
                a.points.length >= (a.closed ? 3 : 2) ? (
                  a.closed ? (
                    <Polygon
                      key={a.id}
                      positions={a.points}
                      pathOptions={{
                        color: a.color || AREA_COLOR,
                        weight: activeId === a.id ? 5 : 3,
                        opacity: activeId && activeId !== a.id ? 0.4 : 0.9,
                        fillColor: a.color || AREA_COLOR,
                        fillOpacity: 0.2,
                      }}
                    />
                  ) : (
                    <Polyline
                      key={a.id}
                      positions={a.points}
                      pathOptions={{
                        color: a.color || AREA_COLOR,
                        weight: activeId === a.id ? 5 : 3,
                        opacity: activeId && activeId !== a.id ? 0.4 : 0.9,
                      }}
                    />
                  )
                ) : null
              )}

              {/* Draft shape */}
              {isPolygon && draftPoints.length >= 3 ? (
                <Polygon
                  positions={draftPoints}
                  pathOptions={{ color, weight: 3, fillColor: color, fillOpacity: 0.2 }}
                />
              ) : (
                draftPoints.length >= 2 && (
                  <Polyline
                    positions={draftPoints}
                    pathOptions={{ color, weight: 3, dashArray: "6 6", opacity: 0.9 }}
                  />
                )
              )}

              {/* Draft vertices */}
              {draftPoints.map((p, i) => {
                const isStart = i === 0;
                const canClose = isStart && drawing && draftPoints.length >= 3 && !isPolygon;
                return (
                  <CircleMarker
                    key={i}
                    center={p}
                    radius={canClose ? 7 : 5}
                    eventHandlers={canClose ? { click: (e) => { e.originalEvent.stopPropagation(); closePolygon(); } } : undefined}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      fillColor: canClose ? "#1b4de4" : color,
                      fillOpacity: 1,
                    }}
                  />
                );
              })}
            </MapContainer>

            {/* Drawing overlay hint */}
            {drawing && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 rounded-full bg-[#1b4de4] px-4 py-2 text-xs font-medium text-white shadow-lg">
                <MapPin className="h-3.5 w-3.5" />
                Click on the map to add points to the polyline
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AREA_COLOR }} />
              Collection Area
            </span>
            {drawing ? (
              <button
                type="button"
                onClick={() => setDrawing(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Stop drawing
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <MapIcon className="h-3.5 w-3.5" /> Tap points to outline an area
              </span>
            )}
          </div>
        </div>
      </div>

      {showConfirm && createPortal(
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Submit Collection Area</h3>
              <p className="text-xs text-slate-500 mt-1">
                Review the details below. This area will be sent to admin for approval.
              </p>
            </div>
            <div className="px-6 py-4 space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Name</span>
                <span className="font-semibold text-slate-800 text-right">{name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Barangay</span>
                <span className="font-semibold text-slate-800 text-right">{barangayLocation}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Shape</span>
                <span className="font-semibold text-slate-800 text-right">
                  {isPolygon ? "Polygon" : "Polyline"} · {draftPoints.length} pts
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Color</span>
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                  {color}
                </span>
              </div>
            </div>
            <div className="p-6 pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveArea}
                disabled={submitting}
                className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingArea && createPortal(
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Area</h3>
                <p className="text-xs text-slate-500 mt-1">Update the name or color of this area.</p>
              </div>
              <button
                type="button"
                onClick={closeEditArea}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Area Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Carlatan Creek Reach"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Area Color</label>
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-7 w-9 shrink-0 cursor-pointer rounded border border-slate-200 bg-transparent p-0"
                    aria-label="Area color"
                  />
                  <span className="text-xs font-medium uppercase text-slate-500">{editColor}</span>
                </div>
              </div>
            </div>
            <div className="p-6 pt-2 flex gap-3">
              <button
                type="button"
                onClick={closeEditArea}
                disabled={savingEdit}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditArea}
                disabled={!editName.trim() || savingEdit}
                className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function centroid(points) {
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

export default BarangayAreas;
