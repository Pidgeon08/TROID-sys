// The Heatmap page's Hotspots view. A hotspot is a priority collection area: its bags per cleanup
// over the last 30 days spiked above its average for the 30 days before (backend priority.py).
// It marks this month's hotspots on the map, compares them with a month the reader picks, and
// shows how many hotspots there were each month.
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Flame, History, Info, TrendingDown, TrendingUp } from "lucide-react";
import api from "../services/api";
import { TILE_ATTRIBUTION, TILE_URL } from "../services/mapTiles";
import { BarangayOutline } from "./AreaDrawing";
import { barangayBounds } from "../utils/barangayBoundaries";
import { LIVE, useLiveVersion } from "../hooks/useLiveUpdates";

const CENTER = [16.6195, 120.314];
const SELECT = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30";
const HOT = "#e34948";
const GONE = "#64748b";
const BAR = "#2a78d6";
const BAR_MUTED = "#cde2fb";

const monthName = (month, style = "long") =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: style, year: "numeric" });
const shortMonth = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const bags = (n) => plural(n, "bag");

function FitTo({ fitKey, bounds }) {
  const map = useMap();
  const fitted = useRef(null);
  useEffect(() => {
    if (!bounds?.length || fitted.current === fitKey) return;
    fitted.current = fitKey;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, fitKey, bounds]);
  return null;
}

function AreaShape({ hotspot, color, dashed, label }) {
  const area = hotspot.collection_area;
  const points = area.points || [];
  if (points.length < (area.closed ? 3 : 2)) return null;
  const pathOptions = { color, weight: dashed ? 2 : 3, ...(dashed ? { dashArray: "6 6" } : {}) };
  const tooltip = <Tooltip sticky>{area.name} · {label}</Tooltip>;
  return area.closed ? (
    <Polygon positions={points} pathOptions={{ ...pathOptions, fillColor: color, fillOpacity: dashed ? 0.06 : 0.35 }}>{tooltip}</Polygon>
  ) : (
    <Polyline positions={points} pathOptions={pathOptions}>{tooltip}</Polyline>
  );
}

/** "12 bags a cleanup, up from 5 (+140%)". */
function spikeText(h) {
  return `${bags(h.current.average)} a cleanup, up from ${h.previous.average}${h.change_pct != null ? ` (+${h.change_pct}%)` : ""}`;
}

function AreaList({ title, tone, items, note, showBarangay, onFocus, empty }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone }} />
        {title} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((h) => (
            <li key={h.collection_area.area_id}>
              <button
                type="button"
                onClick={() => onFocus(h)}
                className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="block truncate text-sm font-medium text-slate-800">
                  {h.collection_area.name}
                  {showBarangay && <span className="font-normal text-slate-400"> · {h.collection_area.barangay}</span>}
                </span>
                <span className="block text-xs text-slate-500">{note(h)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hotspots per month: one bar each, the two compared months in full colour. Click one to compare with it. */
function HistoryChart({ months, current, compared, onPick }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...months.map((m) => m.count));
  const shown = hover || months.find((m) => m.month === compared) || current;
  return (
    <div>
      <p className="mb-3 h-4 text-xs text-slate-500">
        {shown && (
          <>
            <span className="font-semibold text-slate-800">{monthName(shown.month)}{shown.so_far ? " (so far)" : ""}:</span>{" "}
            {plural(shown.count, "hotspot")}
          </>
        )}
      </p>
      <div className="flex h-32 items-end gap-1.5" role="list" aria-label="Hotspots per month">
        {months.map((m) => {
          const highlighted = m.month === current?.month || m.month === compared;
          return (
            <button
              key={m.month}
              type="button"
              role="listitem"
              onClick={() => !m.so_far && onPick(m.month)}
              onMouseEnter={() => setHover(m)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(m)}
              onBlur={() => setHover(null)}
              aria-label={`${monthName(m.month)}: ${plural(m.count, "hotspot")}`}
              className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 ${m.so_far ? "cursor-default" : "cursor-pointer"}`}
            >
              <span className={`text-[10px] tabular-nums ${highlighted ? "font-semibold text-slate-700" : "text-slate-400"}`}>{m.count}</span>
              <span
                className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(2, (m.count / max) * 100)}%`, backgroundColor: highlighted ? BAR : BAR_MUTED }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 border-t border-slate-200 pt-1">
        {months.map((m) => (
          <span key={m.month} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-400">{shortMonth(m.month)}</span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Click a month to compare it with this month.</p>
    </div>
  );
}

/** `barangay`: a barangay or NGO account's own page; CENRO sees every barangay. */
export default function HotspotsView({ barangay }) {
  const [history, setHistory] = useState(null);
  const [failed, setFailed] = useState(false);
  const [comparedMonth, setComparedMonth] = useState("");
  const [focus, setFocus] = useState(null);
  // Filters: a barangay (CENRO only; a barangay account already sees just its own) and an area.
  const [barangayFilter, setBarangayFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  // Loaded again when requests or areas change anywhere (a filed report can make a hotspot).
  const live = useLiveVersion(LIVE.requests, LIVE.areas);
  useEffect(() => {
    let cancelled = false;
    api.hotspots({ months: 12, barangay: barangay || undefined })
      .then((data) => { if (!cancelled) { setHistory(data?.months || []); setFailed(false); } })
      .catch((err) => {
        console.error("Failed to load hotspots:", err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [barangay, live]);

  // Every area that was a hotspot in these months, for the filters to offer.
  const knownAreas = useMemo(() => {
    const byId = new Map();
    (history || []).forEach((m) => m.hotspots.forEach((h) => byId.set(h.collection_area.area_id, h.collection_area)));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [history]);
  const barangayOptions = useMemo(() => [...new Set(knownAreas.map((a) => a.barangay).filter(Boolean))].sort(), [knownAreas]);
  const areaOptions = knownAreas.filter((a) => !barangayFilter || a.barangay === barangayFilter);
  // Whether an area is a hotspot doesn't depend on any other area, so filtering keeps the counts right.
  const months = useMemo(() => (history || []).map((m) => {
    const hotspots = m.hotspots.filter((h) =>
      (!barangayFilter || h.collection_area.barangay === barangayFilter) && (!areaFilter || h.collection_area.area_id === areaFilter));
    return { ...m, hotspots, count: hotspots.length };
  }), [history, barangayFilter, areaFilter]);
  const filtering = Boolean(barangayFilter || areaFilter);
  const outlined = barangay || barangayFilter;
  const current = months[months.length - 1] || null;
  const earlier = months.slice(0, -1);
  // The month compared with: the reader's pick, or last month.
  const compared = months.find((m) => m.month === comparedMonth && !m.so_far) || earlier[earlier.length - 1] || null;

  // New this month, a hotspot in both months, and a hotspot in the compared month only.
  const nowIds = new Set((current?.hotspots || []).map((h) => h.collection_area.area_id));
  const thenIds = new Set((compared?.hotspots || []).map((h) => h.collection_area.area_id));
  const added = (current?.hotspots || []).filter((h) => !thenIds.has(h.collection_area.area_id));
  const still = (current?.hotspots || []).filter((h) => thenIds.has(h.collection_area.area_id));
  const gone = (compared?.hotspots || []).filter((h) => !nowIds.has(h.collection_area.area_id));

  const shapes = [...added, ...still, ...gone].flatMap((h) => h.collection_area.points || []);
  const bounds = focus ? focus.collection_area.points : shapes.length ? shapes : outlined ? barangayBounds(outlined) : null;
  const fitKey = focus
    ? `focus-${focus.collection_area.area_id}-${focus.at}`
    : `${outlined || "all"}-${areaFilter}-${compared?.month}-${shapes.length}`;
  const chooseBarangay = (value) => {
    setBarangayFilter(value);
    // An area in another barangay no longer fits.
    if (value && areaFilter && knownAreas.find((a) => a.area_id === areaFilter)?.barangay !== value) setAreaFilter("");
    setFocus(null);
  };
  const focusOn = (h) => setFocus({ ...h, at: Date.now() });

  if (failed) {
    return <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">The hotspots couldn't be loaded. Refresh to try again.</p>;
  }
  if (!history) {
    return <p className="py-16 text-center text-sm font-medium text-slate-500">Loading hotspots...</p>;
  }

  const difference = current && compared ? current.count - compared.count : 0;
  const thenName = compared ? monthName(compared.month) : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          A hotspot is a collection area whose bags per cleanup over the last 30 days spiked above its average for the 30 days before.
        </span>
        <div className="flex w-full flex-wrap items-center gap-2">
          {!barangay && (
            <select value={barangayFilter} onChange={(e) => chooseBarangay(e.target.value)} className={SELECT} aria-label="Barangay">
              <option value="">All barangays</option>
              {barangayOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select
            value={areaFilter}
            onChange={(e) => { setAreaFilter(e.target.value); setFocus(null); }}
            className={`${SELECT} max-w-[260px]`}
            aria-label="Collection area"
            title="Areas that were hotspots in the last 12 months"
          >
            <option value="">{areaOptions.length ? "All collection areas" : "No areas were hotspots"}</option>
            {barangay || barangayFilter
              ? areaOptions.map((a) => <option key={a.area_id} value={a.area_id}>{a.name}</option>)
              : barangayOptions.map((b) => (
                <optgroup key={b} label={b}>
                  {areaOptions.filter((a) => a.barangay === b).map((a) => <option key={a.area_id} value={a.area_id}>{a.name}</option>)}
                </optgroup>
              ))}
          </select>
          {filtering && (
            <button
              type="button"
              onClick={() => { setBarangayFilter(""); setAreaFilter(""); setFocus(null); }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </button>
          )}
        <label className="flex items-center gap-2 lg:ml-auto">
          <span className="text-xs font-semibold text-slate-500">Compare this month with</span>
          <select
            value={compared?.month || ""}
            onChange={(e) => { setComparedMonth(e.target.value); setFocus(null); }}
            className={SELECT}
          >
            {[...earlier].reverse().map((m) => (
              <option key={m.month} value={m.month}>{monthName(m.month)} ({plural(m.count, "hotspot")})</option>
            ))}
          </select>
        </label>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative h-[460px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 lg:h-[600px]">
          <MapContainer center={CENTER} zoom={14} zoomControl={false} style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
            <FitTo fitKey={fitKey} bounds={bounds} />
            {outlined && <BarangayOutline barangay={outlined} fit={false} />}
            {gone.map((h) => <AreaShape key={`gone-${h.collection_area.area_id}`} hotspot={h} color={GONE} dashed label={`hotspot in ${thenName}, not now`} />)}
            {still.map((h) => <AreaShape key={`still-${h.collection_area.area_id}`} hotspot={h} color={HOT} label={`hotspot now and in ${thenName}`} />)}
            {added.map((h) => <AreaShape key={`new-${h.collection_area.area_id}`} hotspot={h} color={HOT} label="new hotspot this month" />)}
            <ZoomControl position="bottomright" />
          </MapContainer>
          <div className="absolute bottom-3 left-3 z-[400] space-y-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
            <p className="flex items-center gap-2">
              <span className="h-3 w-4 rounded-sm border-2" style={{ borderColor: HOT, backgroundColor: `${HOT}59` }} />
              Hotspot this month
            </p>
            {compared && (
              <p className="flex items-center gap-2">
                <span className="h-3 w-4 rounded-sm border-2 border-dashed" style={{ borderColor: GONE }} />
                Hotspot in {thenName} only
              </p>
            )}
          </div>
          {shapes.length === 0 && (
            <div className="absolute left-1/2 top-3 z-[400] -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              No hotspots this month{compared ? ` or in ${thenName}` : ""}{filtering ? " for these filters" : ""}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Flame className="h-4 w-4 text-slate-400" /> This month vs {thenName || "earlier"}
            </h2>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[11px] font-medium text-slate-500">{current ? monthName(current.month) : "This month"} (so far)</dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{current?.count ?? 0}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[11px] font-medium text-slate-500">{thenName || "—"}</dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{compared?.count ?? "—"}</dd>
              </div>
            </dl>
            {compared && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                {difference > 0 ? <TrendingUp className="h-3.5 w-3.5 text-red-600" /> : difference < 0 ? <TrendingDown className="h-3.5 w-3.5 text-emerald-600" /> : null}
                {difference === 0
                  ? `The same number as ${thenName}.`
                  : `${plural(Math.abs(difference), "hotspot")} ${difference > 0 ? "more" : "fewer"} than ${thenName}.`}
              </p>
            )}
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <AreaList title="New this month" tone={HOT} items={added} note={spikeText} showBarangay={!barangay} onFocus={focusOn}
                empty={`No area became a hotspot since ${thenName || "last month"}.`} />
              <AreaList title="Still a hotspot" tone={HOT} items={still} note={spikeText} showBarangay={!barangay} onFocus={focusOn}
                empty={`None was a hotspot in ${thenName || "both months"} too.`} />
              <AreaList title="No longer a hotspot" tone={GONE} items={gone} note={(h) => `In ${thenName}: ${spikeText(h)}`} showBarangay={!barangay}
                onFocus={focusOn} empty={`Every hotspot of ${thenName || "that month"} still is one.`} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <History className="h-4 w-4 text-slate-400" /> Hotspots per month
            </h2>
            <HistoryChart months={months} current={current} compared={compared?.month} onPick={(m) => { setComparedMonth(m); setFocus(null); }} />
          </section>
        </div>
      </div>
    </div>
  );
}
