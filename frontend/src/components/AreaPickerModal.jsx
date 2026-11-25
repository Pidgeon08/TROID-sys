// Choosing a request's collection area on a map: every area that can be chosen, the one picked
// highlighted with its details, so a requester can see where each one is before choosing.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Check, Layers, X } from "lucide-react";
import { TILE_URL, TILE_ATTRIBUTION } from "../services/mapTiles";
import { BarangayOutline } from "./AreaDrawing";
import { waterBodyLabel } from "../constants/collectionAreas";
import { formatArea, ringAreaM2 } from "../utils/coverage";

const SAN_FERNANDO = [16.6159, 120.3166];
const OTHER = "#64748b";

/**
 * Fits the map to the chosen area, or to all of them when none is chosen yet. The map is measured
 * again first: it is created while the dialog is still being laid out, and would otherwise leave
 * grey, tile-less strips at its edges.
 */
function FitTo({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
    }, 60);
    return () => clearTimeout(timer);
  }, [map, points, fitKey]);
  return null;
}

function Shape({ area, chosen, onPick }) {
  const points = area.points || [];
  if (points.length < (area.closed === false ? 2 : 3)) return null;
  const color = chosen ? area.color || "#1b4de4" : OTHER;
  const options = chosen
    ? { color, weight: 3, fillColor: color, fillOpacity: 0.3 }
    : { color, weight: 2, dashArray: "5 5", fillColor: color, fillOpacity: 0.08 };
  const handlers = { click: () => onPick(area.id) };
  const tooltip = <Tooltip sticky>{area.name}</Tooltip>;
  return area.closed === false ? (
    <Polyline positions={points} pathOptions={options} eventHandlers={handlers}>{tooltip}</Polyline>
  ) : (
    <Polygon positions={points} pathOptions={options} eventHandlers={handlers}>{tooltip}</Polygon>
  );
}

/**
 * `areas` are the collection areas that can be chosen (raw from the API), `value` the chosen
 * one's id. `onChoose(id)` is called with the area picked here.
 */
export default function AreaPickerModal({ areas, value, barangay, onChoose, onClose }) {
  const [picked, setPicked] = useState(value ? String(value) : "");
  const chosen = areas.find((a) => String(a.id) === picked) || null;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fitPoints = chosen ? chosen.points || [] : areas.flatMap((a) => a.points || []);
  const outline = barangay || chosen?.barangay || "";
  const details = chosen && [
    chosen.barangay && `Barangay ${chosen.barangay}`,
    [waterBodyLabel(chosen.water_body_type), chosen.water_body_name].filter(Boolean).join(" · "),
    chosen.closed !== false && (chosen.points || []).length >= 3 && formatArea(ringAreaM2(chosen.points)),
  ].filter(Boolean).join(" · ");

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Collection areas on the map"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Layers size={16} className="shrink-0 text-blue-600" />
              Collection areas{outline ? ` in ${outline}` : ""}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">Click an area on the map, or pick it below, to see where it is.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="relative h-[min(420px,55vh)] shrink-0 bg-slate-100">
          {areas.length === 0 ? (
            <p className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              There are no approved collection areas to choose from yet.
            </p>
          ) : (
            <MapContainer center={SAN_FERNANDO} zoom={14} className="h-full w-full" scrollWheelZoom>
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              {outline && <BarangayOutline barangay={outline} fit={false} />}
              {/* The chosen one last, so it is drawn on top. */}
              {areas.filter((a) => a !== chosen).map((a) => <Shape key={a.id} area={a} onPick={(id) => setPicked(String(id))} />)}
              {chosen && <Shape area={chosen} chosen onPick={() => {}} />}
              <FitTo points={fitPoints} fitKey={picked} />
            </MapContainer>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              aria-label="Collection area"
            >
              <option value="">Choose an area…</option>
              {areas.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            </select>
            <p className="mt-1 truncate text-[11px] text-slate-500" title={details || undefined}>
              {details || "The dashed outlines are the areas you can choose."}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={!chosen}
              onClick={() => { onChoose(chosen.id); onClose(); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#153eb8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={14} /> Choose this area
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
