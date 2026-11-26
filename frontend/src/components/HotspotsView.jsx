// The Heatmap page's Hotspots view. A hotspot is a priority collection area: its bags per cleanup
// over the last 30 days spiked above its average for the 30 days before (backend priority.py).
// It marks a month's hotspots on the map (this month, or one the reader picks) and compares them
// with the month before it; a chart floating over the map shows how many there were each month.
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Flame, History, Info, TrendingDown, TrendingUp } from "lucide-react";
import api from "../services/api";
import { TILE_ATTRIBUTION, TILE_URL } from "../services/mapTiles";
import { BarangayOutline } from "./AreaDrawing";
import { HeatmapLayer } from "./MapLayers";
import { LEGEND_CLASSES } from "../constants/mapLayers";
import { barangayBounds } from "../utils/barangayBoundaries";
import { LIVE, useLiveVersion } from "../hooks/useLiveUpdates";
import { AreaOutlines, ShowAreasSwitch } from "./AreaOutlines";

const CENTER = [16.6195, 120.314];
const SELECT = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30";
const HOT = "#e34948";
const GONE = "#64748b";
const BAR = "#2a78d6";
const BAR_MUTED = "#cde2fb";
const BAR_NOW = "#1b4de4";
// The months the chart and the month picker offer.
const MONTHS_SHOWN = 12;

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
    // Clear of the chart floating over the bottom of the map.
    map.fitBounds(bounds, { paddingTopLeft: [40, 40], paddingBottomRight: [60, 200], maxZoom: 15 });
  }, [map, fitKey, bounds]);
  return null;
}

// A month's hotspots are the areas whose last 30 days (to the month's end) spiked: priority.WINDOW_DAYS.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The 30 days that made a month's hotspots, as the heatmap's custom range. */
function windowKey(month, barangay) {
  if (!month) return "";
  const end = new Date(month.as_of);
  return [barangay || "", new Date(end.getTime() - WINDOW_MS).toISOString(), end.toISOString()].join("|");
}

/** The heatmap points (what TROID found) of cleanups sent to these areas ("CA-0001,CA-0002"). */
function heatFor(detections, areaIds) {
  const ids = new Set(areaIds.split(","));
  return (detections || []).filter((d) => ids.has(d.collection_area)).map((d) => [d.latitude, d.longitude, d.weight ?? 0.5]);
}

/** That heatmap on the map: the heatmap's own colours (Waste Density) for this month's, gray ("Past Hotspots") for former ones. */
function HotspotHeat({ detections, areaIds, type }) {
  const points = useMemo(() => heatFor(detections, areaIds), [detections, areaIds]);
  return points.length > 0 ? <HeatmapLayer points={points} type={type} /> : null;
}

/** A hotspot's outline. `onSelect(area)`, when given, opens its monthly hotspots on a click. */
function AreaShape({ hotspot, color, dashed, label, onSelect }) {
  const area = hotspot.collection_area;
  const points = area.points || [];
  if (points.length < (area.closed ? 3 : 2)) return null;
  const pathOptions = { color, weight: dashed ? 2 : 3, ...(dashed ? { dashArray: "6 6" } : {}) };
  const handlers = onSelect ? { click: () => onSelect({ id: area.area_id }) } : undefined;
  const tooltip = (
    <Tooltip sticky>
      {area.name} · {label}
      {onSelect && <span className="block text-[10px] text-slate-500">Click for its monthly hotspots</span>}
    </Tooltip>
  );
  return area.closed ? (
    <Polygon positions={points} eventHandlers={handlers} pathOptions={{ ...pathOptions, fillColor: color, fillOpacity: dashed ? 0.04 : 0.12 }}>{tooltip}</Polygon>
  ) : (
    <Polyline positions={points} eventHandlers={handlers} pathOptions={pathOptions}>{tooltip}</Polyline>
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

/**
 * Hotspots per month, floating over the bottom of the map: one bar each, the month shown and
 * the month before it in full colour. Click a month to see it against the month before.
 * `legend` (the map's) sits under it.
 */
function HistoryChart({ months, selected, previous, onPick, legend }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...months.map((m) => m.count));
  const shown = hover || selected;
  return (
    <div className="absolute bottom-6 left-3 right-3 z-[400] rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <History className="h-3.5 w-3.5 text-slate-400" /> Hotspots per month
        </h2>
        <p className="text-[11px] text-slate-500">
          {shown && (
            <>
              <span className="font-semibold text-slate-800">{monthName(shown.month)}{shown.so_far ? " (so far)" : ""}:</span>{" "}
              {plural(shown.count, "hotspot")}
            </>
          )}
          <span className="text-slate-400"> · click a month to compare it with the month before</span>
        </p>
      </div>
      <div className="flex h-16 items-end gap-1" role="list" aria-label="Hotspots per month">
        {months.map((m) => {
          const isSelected = m.month === selected?.month;
          const isPrevious = m.month === previous?.month;
          return (
            <button
              key={m.month}
              type="button"
              role="listitem"
              aria-pressed={isSelected}
              onClick={() => onPick(m.month)}
              onMouseEnter={() => setHover(m)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(m)}
              onBlur={() => setHover(null)}
              aria-label={`${monthName(m.month)}: ${plural(m.count, "hotspot")}${isSelected ? ", shown" : isPrevious ? ", compared" : ""}`}
              className="group flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-0.5"
            >
              <span className={`text-[10px] tabular-nums ${isSelected || isPrevious ? "font-semibold text-slate-700" : "text-slate-400"}`}>{m.count}</span>
              <span
                className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(2, (m.count / max) * 100)}%`, backgroundColor: isSelected ? BAR_NOW : isPrevious ? BAR : BAR_MUTED }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-0.5 flex gap-1 border-t border-slate-200 pt-0.5">
        {months.map((m) => (
          <span
            key={m.month}
            className={`min-w-0 flex-1 truncate text-center text-[10px] ${m.month === selected?.month ? "font-semibold text-[#1b4de4]" : m.month === previous?.month ? "font-semibold text-slate-600" : "text-slate-400"}`}
          >
            {shortMonth(m.month)}
          </span>
        ))}
      </div>
      {legend && <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-1.5 text-[11px] text-slate-600">{legend}</div>}
    </div>
  );
}

/**
 * `barangay`: a barangay or NGO account's own page; CENRO sees every barangay. `areas` are the
 * collection areas "Show collection areas" outlines (`showAreas`, `onShowAreas`); `onSelectArea`
 * (CENRO) opens an area's monthly hotspots when it is clicked on the map.
 */
export default function HotspotsView({ barangay, areas = [], showAreas = false, onShowAreas, onSelectArea }) {
  const [history, setHistory] = useState(null);
  const [failed, setFailed] = useState(false);
  // The month shown (compared with the month before it); empty for this month.
  const [pickedMonth, setPickedMonth] = useState("");
  const [focus, setFocus] = useState(null);
  // Filters: a barangay (CENRO only; a barangay account already sees just its own) and an area.
  const [barangayFilter, setBarangayFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  // Loaded again when requests or areas change anywhere (a filed report can make a hotspot).
  const live = useLiveVersion(LIVE.requests, LIVE.areas);
  useEffect(() => {
    let cancelled = false;
    // One more month than shown, so the first month shown has one before it to compare with.
    api.hotspots({ months: MONTHS_SHOWN + 1, barangay: barangay || undefined })
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
  const allMonths = useMemo(() => (history || []).map((m) => {
    const hotspots = m.hotspots.filter((h) =>
      (!barangayFilter || h.collection_area.barangay === barangayFilter) && (!areaFilter || h.collection_area.area_id === areaFilter));
    return { ...m, hotspots, count: hotspots.length };
  }), [history, barangayFilter, areaFilter]);
  const months = allMonths.slice(-MONTHS_SHOWN);
  const filtering = Boolean(barangayFilter || areaFilter);
  const outlined = barangay || barangayFilter;
  // The month shown: the reader's pick, or this month; compared with the month before it.
  const current = months.find((m) => m.month === pickedMonth) || months[months.length - 1] || null;
  const index = current ? allMonths.indexOf(current) : -1;
  const compared = index > 0 ? allMonths[index - 1] : null;
  const pickMonth = (month) => {
    setPickedMonth(month);
    setFocus(null);
  };

  // The heatmap of each compared month: what TROID found in the 30 days that made its hotspots.
  const [detections, setDetections] = useState({});
  const nowKey = windowKey(current, barangay);
  const thenKey = windowKey(compared, barangay);
  useEffect(() => {
    let cancelled = false;
    for (const key of [nowKey, thenKey]) {
      if (!key) continue;
      const [place, start, end] = key.split("|");
      api.getHeatmap({ time_filter: "custom", start, end, barangay: place || undefined })
        .then((data) => { if (!cancelled) setDetections((prev) => ({ ...prev, [key]: Array.isArray(data) ? data : [] })); })
        .catch((err) => console.error("Failed to load the hotspots' heatmap:", err));
    }
    return () => { cancelled = true; };
  }, [nowKey, thenKey, live]);
  const nowDetections = detections[nowKey];
  const thenDetections = detections[thenKey];

  // New this month, a hotspot in both months, and a hotspot in the compared month only.
  const nowIds = new Set((current?.hotspots || []).map((h) => h.collection_area.area_id));
  const thenIds = new Set((compared?.hotspots || []).map((h) => h.collection_area.area_id));
  const added = (current?.hotspots || []).filter((h) => !thenIds.has(h.collection_area.area_id));
  const still = (current?.hotspots || []).filter((h) => thenIds.has(h.collection_area.area_id));
  const gone = (compared?.hotspots || []).filter((h) => !nowIds.has(h.collection_area.area_id));
  const nowAreas = [...nowIds].join(",");
  const goneAreas = gone.map((h) => h.collection_area.area_id).join(",");

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
  const nowName = current ? `${monthName(current.month)}${current.so_far ? " (so far)" : ""}` : "This month";

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
          {onShowAreas && (
            <ShowAreasSwitch
              on={showAreas}
              onChange={onShowAreas}
              title={onSelectArea ? "Outline every collection area; click one for its monthly hotspots" : "Outline every collection area"}
            />
          )}
          <label className="flex items-center gap-2 lg:ml-auto">
            <span className="text-xs font-semibold text-slate-500">Month</span>
            <select value={current?.month || ""} onChange={(e) => pickMonth(e.target.value)} className={SELECT}>
              {[...months].reverse().map((m) => (
                <option key={m.month} value={m.month}>{monthName(m.month)}{m.so_far ? " (so far)" : ""} ({plural(m.count, "hotspot")})</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">vs {thenName || "no earlier month"}</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 lg:h-[600px]">
          <MapContainer center={CENTER} zoom={14} zoomControl={false} style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
            <FitTo fitKey={fitKey} bounds={bounds} />
            {outlined && <BarangayOutline barangay={outlined} fit={false} />}
            {/* Every other collection area, under the hotspots, when "Show collection areas" is on. */}
            {showAreas && (
              <AreaOutlines
                areas={areas.filter((a) => !nowIds.has(a.id) && !thenIds.has(a.id) && (!outlined || a.barangay === outlined))}
                onSelect={onSelectArea}
                hint={() => (onSelectArea ? "Click for its monthly hotspots" : null)}
              />
            )}
            {/* The heatmap first (its usual colours this month, gray for former hotspots), with each area's outline over it. */}
            <HotspotHeat detections={thenDetections} areaIds={goneAreas} type="Past Hotspots" />
            <HotspotHeat detections={nowDetections} areaIds={nowAreas} type="Waste Density" />
            {gone.map((h) => <AreaShape key={`gone-${h.collection_area.area_id}`} hotspot={h} color={GONE} dashed label={`hotspot in ${thenName}, not in ${nowName}`} onSelect={onSelectArea} />)}
            {still.map((h) => <AreaShape key={`still-${h.collection_area.area_id}`} hotspot={h} color={HOT} label={`hotspot in ${nowName} and ${thenName}`} onSelect={onSelectArea} />)}
            {added.map((h) => <AreaShape key={`new-${h.collection_area.area_id}`} hotspot={h} color={HOT} label={`new hotspot in ${nowName}`} onSelect={onSelectArea} />)}
            <ZoomControl position="topright" />
          </MapContainer>
          {shapes.length === 0 && (
            <div className="absolute left-1/2 top-3 z-[400] -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              No hotspots in {nowName}{compared ? ` or ${thenName}` : ""}{filtering ? " for these filters" : ""}
            </div>
          )}
          <HistoryChart
            months={months}
            selected={current}
            previous={compared}
            onPick={pickMonth}
            legend={(
              <>
                <span className="flex items-center gap-2">
                  <span className={`h-3 w-4 rounded-sm border-2 ${LEGEND_CLASSES["Waste Density"]}`} style={{ borderColor: HOT }} />
                  Hotspot in {nowName}
                </span>
                {compared && (
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-4 rounded-sm border-2 border-dashed ${LEGEND_CLASSES["Past Hotspots"]}`} style={{ borderColor: GONE }} />
                    Hotspot in {thenName} only
                  </span>
                )}
              </>
            )}
          />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:h-[600px] lg:overflow-y-auto">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Flame className="h-4 w-4 shrink-0 text-slate-400" /> {nowName} vs {thenName || "the month before"}
          </h2>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-medium text-slate-500">{nowName}</dt>
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
            <AreaList title={`New in ${current ? monthName(current.month, "short") : "this month"}`} tone={HOT} items={added} note={spikeText}
              showBarangay={!barangay} onFocus={focusOn} empty={`No area became a hotspot since ${thenName || "the month before"}.`} />
            <AreaList title="Still a hotspot" tone={HOT} items={still} note={spikeText} showBarangay={!barangay} onFocus={focusOn}
              empty={`None was a hotspot in ${thenName || "the month before"} too.`} />
            <AreaList title="No longer a hotspot" tone={GONE} items={gone} note={(h) => `In ${thenName}: ${spikeText(h)}`} showBarangay={!barangay}
              onFocus={focusOn} empty={`Every hotspot of ${thenName || "the month before"} still is one.`} />
          </div>
        </section>
      </div>
    </div>
  );
}
