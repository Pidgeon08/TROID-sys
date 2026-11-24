// Shows where a collection area is on a small map, over the current page, so a reader can see it
// without leaving what they are doing. `openPath`, when given, also offers its Collection Areas page.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MapContainer, Polygon, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import api from "../services/api";
import { TILE_URL, TILE_ATTRIBUTION } from "../services/mapTiles";
import { BarangayOutline } from "./AreaDrawing";
import { waterBodyLabel } from "../constants/collectionAreas";

const SAN_FERNANDO = [16.6159, 120.3166];

function FitArea({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
  }, [map, points]);
  return null;
}

function AreaShape({ area }) {
  const color = area.color || "#1b4de4";
  if (area.points.length < (area.closed ? 3 : 2)) return null;
  return area.closed ? (
    <Polygon positions={area.points} pathOptions={{ color, weight: 3, fillColor: color, fillOpacity: 0.25 }} />
  ) : (
    <Polyline positions={area.points} pathOptions={{ color, weight: 4 }} />
  );
}

export function AreaPreviewModal({ areaId, name, openPath, onClose }) {
  const [area, setArea] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.collectionAreaDetail(areaId)
      .then((raw) => {
        if (cancelled) return;
        setArea({
          name: raw.name,
          barangay: raw.barangay || "",
          points: Array.isArray(raw.points) ? raw.points : [],
          closed: raw.closed !== false,
          color: raw.color,
          waterBody: [waterBodyLabel(raw.water_body_type), raw.water_body_name].filter(Boolean).join(" · "),
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [areaId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = area?.name || name || "Collection area";
  return createPortal(
    // React passes clicks out of a portal to the components around it (e.g. a clickable row), so they stop here.
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Where ${title} is`}
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <MapPin size={16} className="shrink-0 text-blue-600" />
              <span className="truncate">{title}</span>
            </h3>
            {area && (
              <p className="mt-0.5 text-xs text-slate-500">
                {[area.barangay && `Barangay ${area.barangay}`, area.waterBody].filter(Boolean).join(" · ") || "Collection area"}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="relative h-[min(420px,60vh)] bg-slate-100">
          {failed ? (
            <p className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              This area couldn't be shown. It may have been archived.
            </p>
          ) : !area ? (
            <p className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</p>
          ) : (
            <MapContainer center={SAN_FERNANDO} zoom={14} className="h-full w-full" scrollWheelZoom>
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              {area.barangay && <BarangayOutline barangay={area.barangay} fit={false} />}
              <AreaShape area={area} />
              <FitArea points={area.points} />
            </MapContainer>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <p className="text-[11px] text-slate-400">{area?.barangay ? "The dashed line is the barangay's boundary." : ""}</p>
          <div className="flex items-center gap-2">
            {openPath && (
              <Link to={openPath} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Open in Collection Areas
                <ArrowUpRight size={13} />
              </Link>
            )}
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A collection area's name that opens its map preview when pressed. `area` is
 * { areaId, name }; the click doesn't reach the row or card it sits in.
 */
export function AreaPreviewButton({ area, openPath, className = "", children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`text-left underline decoration-dotted underline-offset-2 hover:text-[#1b4de4] ${className}`}
        title={`Show where ${area.name} is`}
      >
        {children || area.name}
      </button>
      {open && <AreaPreviewModal areaId={area.areaId} name={area.name} openPath={openPath} onClose={() => setOpen(false)} />}
    </>
  );
}
