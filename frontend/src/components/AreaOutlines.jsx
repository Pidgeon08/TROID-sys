// "Show collection areas" on the Heatmap page's maps: every collection area's outline, and the
// switch that shows them.
import { Polygon, Polyline, Tooltip } from "react-leaflet";

const BLUE = "#1b4de4";

/**
 * Collection areas' outlines (mapped areas: utils/collectionAreaInfo mapArea), each in its own
 * colour, named on hover. `onSelect(area)`, when given, is called on a click, and `hint(area)` is
 * the line the hover adds about it (null for none). `highlightId` draws that one thicker.
 */
export function AreaOutlines({ areas, onSelect, hint, highlightId }) {
  return areas.map((a) => {
    if (!a.points || a.points.length < (a.closed ? 3 : 2)) return null;
    const active = a.id === highlightId;
    const color = a.color || BLUE;
    const pathOptions = { color, weight: active ? 4 : 2, opacity: active ? 1 : 0.8 };
    const handlers = onSelect ? { click: () => onSelect(a) } : undefined;
    const note = hint?.(a);
    const tooltip = (
      <Tooltip sticky>
        <span className="font-semibold">{a.name}</span>{a.barangay ? ` · ${a.barangay}` : ""}
        {note && <span className="block text-[10px] text-slate-500">{note}</span>}
      </Tooltip>
    );
    return a.closed ? (
      <Polygon key={a.id} positions={a.points} eventHandlers={handlers} pathOptions={{ ...pathOptions, fillColor: color, fillOpacity: active ? 0.04 : 0.1 }}>{tooltip}</Polygon>
    ) : (
      <Polyline key={a.id} positions={a.points} eventHandlers={handlers} pathOptions={pathOptions}>{tooltip}</Polyline>
    );
  });
}

/** The "Show collection areas" switch. */
export function ShowAreasSwitch({ on, onChange, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={title}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    >
      <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-[#1b4de4]" : "bg-slate-200"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? "left-[14px]" : "left-0.5"}`} />
      </span>
      Show collection areas
    </button>
  );
}
