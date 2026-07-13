import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";

const DEFAULT_CENTER = [16.6195, 120.314];
const DEFAULT_ZOOM = 14;
const AREA_COLOR = "#1b4de4";

function storageKey(barangay) {
  const slug = (barangay || "default").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `troid:barangay-areas:${slug}`;
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
  const barangayName = currentUser?.barangay || currentUser?.name || "Barangay";

  const [areas, setAreas] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState([]);
  const [isPolygon, setIsPolygon] = useState(false);
  const [name, setName] = useState("");
  const [flyTo, setFlyTo] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [savedFlash, setSavedFlash] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(barangayName));
      if (raw) setAreas(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [barangayName]);

  const persist = useCallback(
    (next) => {
      setAreas(next);
      try {
        localStorage.setItem(storageKey(barangayName), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [barangayName]
  );

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
  };

  const saveArea = () => {
    const required = isPolygon ? 3 : 2;
    if (draftPoints.length < required || !name.trim()) return;
    const newArea = {
      id: `area_${Date.now()}`,
      name: name.trim(),
      color: AREA_COLOR,
      closed: isPolygon,
      points: draftPoints,
      createdAt: new Date().toISOString(),
    };
    persist([...areas, newArea]);
    setActiveId(newArea.id);
    setFlyTo(centroid(draftPoints));
    clearDraft();
    setDrawing(false);
    setSavedFlash(`${newArea.name} saved`);
    setTimeout(() => setSavedFlash(""), 2500);
  };

  const deleteArea = (id) => {
    persist(areas.filter((a) => a.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const focusArea = (a) => {
    setActiveId(a.id);
    setFlyTo(centroid(a.points));
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
            Draw and manage cleanup / collection zones for {barangayName}.
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
          {/* Draft card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-slate-400" />
              <h2 className="text-[15px] font-bold text-slate-900">New Area</h2>
            </div>

            {!drawing && draftPoints.length === 0 && (
              <p className="text-sm text-slate-400 mb-4">
                Click <span className="font-semibold text-slate-600">Draw Area</span> then tap the map to add points.
                Connect at least two points to form a polyline.
              </p>
            )}

            {isPolygon ? (
              <div className="mb-4 rounded-lg bg-[#1b4de4]/10 border border-[#1b4de4]/20 px-3 py-2 text-xs font-medium text-[#1b4de4]">
                Polygon created — add a name and save, or click Draw Area to start over.
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
                onClick={saveArea}
                disabled={draftPoints.length < 2 || !name.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" /> Save Area
              </button>
            </div>
          </div>

          {/* Saved list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
            <h2 className="text-[15px] font-bold text-slate-900 mb-4">
              Saved Areas <span className="text-slate-400 font-medium">({areas.length})</span>
            </h2>
            {areas.length === 0 ? (
              <p className="text-sm text-slate-400">No areas yet. Draw your first zone above.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {areas.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center gap-3 py-3 ${activeId === a.id ? "opacity-100" : "opacity-80"}`}
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: AREA_COLOR }}
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
                      onClick={() => deleteArea(a.id)}
                      aria-label="Delete area"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                        color: AREA_COLOR,
                        weight: activeId === a.id ? 5 : 3,
                        opacity: activeId && activeId !== a.id ? 0.4 : 0.9,
                        fillColor: AREA_COLOR,
                        fillOpacity: 0.2,
                      }}
                    />
                  ) : (
                    <Polyline
                      key={a.id}
                      positions={a.points}
                      pathOptions={{
                        color: AREA_COLOR,
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
                  pathOptions={{ color: AREA_COLOR, weight: 3, fillColor: AREA_COLOR, fillOpacity: 0.2 }}
                />
              ) : (
                draftPoints.length >= 2 && (
                  <Polyline
                    positions={draftPoints}
                    pathOptions={{ color: AREA_COLOR, weight: 3, dashArray: "6 6", opacity: 0.9 }}
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
                      fillColor: canClose ? "#1b4de4" : AREA_COLOR,
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
    </div>
  );
}

function centroid(points) {
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

export default BarangayAreas;
