// CENRO's hotspot history of one collection area, on Report Generation (opened by "View more" on
// an area's card in Collection Areas, or by choosing the area here). It is split the way hotspots
// are decided (backend priority.py): month by month, each as it stood at its end, looking at the 30
// days before. Pick a month to see that period's heatmap and what its cleanups brought in; "Show
// report" compares it with the month before. Barangay and NGO accounts compare hotspots on their
// Bot Tracking page instead.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, Flame, MapPin } from "lucide-react";
import api from "../services/api";
import { logAudit } from "../services/auditLog";
import AreaHeatMap from "./AreaHeatMap";
import AreaConditionReport from "./AreaConditionReport";
import { LEGEND_CLASSES } from "../constants/mapLayers";
import { waterBodyLabel } from "../constants/collectionAreas";
import { TROID_CLASSES } from "../constants/trashReport";
import { shapeSize } from "../utils/collectionAreaInfo";
import { areaCoverage, isMeasurableArea } from "../utils/coverage";
import { STATUS, heatOptionsFor, monthName, periodLabel, periodRange, statusLabel, statusSentence } from "../utils/areaReport";

const TONE = {
  hot: { bar: "#e34948", pill: "bg-red-50 text-red-700" },
  ok: { bar: "#2a78d6", pill: "bg-emerald-50 text-emerald-700" },
  none: { bar: "#cbd5e1", pill: "bg-slate-100 text-slate-600" },
};
const toneOf = (period) => TONE[(STATUS[period?.status] || STATUS.no_cleanups).tone];
// One more month than shown, so the first month shown has one before it to compare with.
const MONTHS_SHOWN = 12;
const fmt = (n, digits = 1) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

/** Bags per cleanup month by month, each bar coloured by whether the area was a hotspot then. */
function MonthBars({ months, selected, onSelect }) {
  const most = Math.max(1, ...months.map((m) => m.average_bags || 0));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5 sm:gap-2" role="listbox" aria-label="Months">
        {months.map((m) => {
          const tone = toneOf(m);
          const active = m.month === selected.month;
          const height = m.average_bags ? Math.max(8, (m.average_bags / most) * 100) : 4;
          return (
            <button
              key={m.month}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(m.month)}
              title={`${periodLabel(m)}: ${statusLabel(m)}${m.average_bags != null ? ` · ${m.average_bags} bags per cleanup` : ""}`}
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-lg px-0.5 pb-1 transition-colors ${active ? "bg-blue-50 ring-2 ring-blue-400" : "hover:bg-slate-50"}`}
            >
              <span className="mb-1 text-[10px] font-semibold tabular-nums text-slate-500">{m.average_bags ?? "–"}</span>
              <span className="w-full max-w-[34px] rounded-t-md" style={{ height: `${height}%`, background: tone.bar, opacity: active ? 1 : 0.8 }} />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 sm:gap-2">
        {months.map((m) => (
          <span key={m.month} className={`min-w-0 flex-1 truncate text-center text-[10px] font-semibold ${m.month === selected.month ? "text-blue-700" : "text-slate-400"}`}>
            {new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE.hot.bar }} /> Hotspot</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE.ok.bar }} /> Not a hotspot</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE.none.bar }} /> No cleanups</span>
        <span className="text-slate-400">Bars: bags per cleanup over the 30 days to each month&apos;s end.</span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="text-lg font-bold tabular-nums text-slate-900">{value}</dd>
      {sub && <dd className="text-[11px] text-slate-400">{sub}</dd>}
    </div>
  );
}

/** One area's history (it starts over when the area changes: the parent keys it by the area). */
function AreaHistory({ area, initialMonth, currentUser }) {
  const [loaded, setLoaded] = useState(null); // { months } or { error }
  const [picked, setPicked] = useState(initialMonth || "");
  const [heat, setHeat] = useState({}); // month -> detections
  const requested = useRef(new Set());
  const [compare, setCompare] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.collectionAreaHistory(area.id, MONTHS_SHOWN + 1)
      .then((history) => { if (!cancelled) setLoaded({ months: history.months || [] }); })
      .catch((err) => {
        console.error("Failed to load the area's hotspot history:", err);
        if (!cancelled) setLoaded({ error: "The area's hotspot history couldn't be loaded." });
      });
    return () => { cancelled = true; };
  }, [area.id]);

  const allMonths = useMemo(() => loaded?.months || [], [loaded]);
  const months = allMonths.slice(-MONTHS_SHOWN);
  const selected = months.find((m) => m.month === picked) || months[months.length - 1] || null;
  const index = selected ? allMonths.indexOf(selected) : -1;
  const previous = index > 0 ? allMonths[index - 1] : null;

  // The robots' reports for the selected period and the one before (for comparing and the report).
  // Each month is asked for once; what comes back is kept for when it is picked again.
  useEffect(() => {
    [selected, previous].forEach((m) => {
      if (!m || requested.current.has(m.month)) return;
      requested.current.add(m.month);
      api.getHeatmap({ time_filter: "custom", start: m.start, end: m.as_of, collection_area: area.id })
        .then((res) => setHeat((prev) => ({ ...prev, [m.month]: Array.isArray(res) ? res : [] })))
        .catch(() => setHeat((prev) => ({ ...prev, [m.month]: [] })));
    });
  }, [selected, previous, area.id]);

  const nowHeat = selected ? heat[selected.month] : undefined;
  const beforeHeat = previous ? heat[previous.month] : undefined;
  const coverage = useMemo(() => {
    if (!isMeasurableArea(area)) return {};
    return {
      now: nowHeat ? areaCoverage(area.points, nowHeat) : null,
      before: beforeHeat ? areaCoverage(area.points, beforeHeat) : null,
    };
  }, [area, nowHeat, beforeHeat]);
  const heatOptions = useMemo(() => heatOptionsFor(nowHeat, compare ? beforeHeat : null), [nowHeat, beforeHeat, compare]);

  const openReport = () => {
    setReportOpen(true);
    logAudit({
      currentUser,
      action: "Area report generated",
      module: "Report Generation",
      details: `${area.id} ${area.name}: ${monthName(selected.month)} compared with ${previous ? monthName(previous.month) : "the month before"}`,
    });
  };

  if (!loaded) return <p className="py-10 text-center text-sm text-slate-400">Loading the hotspot history…</p>;
  if (loaded.error) return <p className="py-10 text-center text-sm text-red-600">{loaded.error}</p>;
  if (!selected) return <p className="py-10 text-center text-sm text-slate-400">No history for this area yet.</p>;

  const latest = allMonths[allMonths.length - 1];
  const tone = toneOf(selected);
  const classTotal = TROID_CLASSES.reduce((sum, cls) => sum + (selected.classes?.[cls] || 0), 0);
  const water = [waterBodyLabel(area.waterBodyType), area.waterBodyName].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: area.color }} />
            {area.name}
            {latest?.is_hotspot && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"><Flame size={11} /> Hotspot now</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{[area.id, `Barangay ${area.barangay}`, water, shapeSize(area)].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Link
            to={`/admin/collection-areas?area=${encodeURIComponent(area.id)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <MapPin size={13} /> In Collection Areas <ArrowUpRight size={12} />
          </Link>
          <button
            type="button"
            onClick={openReport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#153eb8]"
          >
            <FileText size={14} /> Show report: {monthName(selected.month, "short")} vs {previous ? monthName(previous.month, "short") : "the month before"}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs text-slate-500">
          Each month is judged as it stood at its end: its bags per cleanup over the 30 days before, against the 30 days before that.
          Higher makes it a hotspot. Pick a month to see it.
        </p>
        <MonthBars months={months} selected={selected} onSelect={setPicked} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">
              Where the robots found trash · <span className="font-medium text-slate-500">{periodRange(selected)}</span>
            </p>
            <label className={`inline-flex items-center gap-2 text-xs font-medium print:hidden ${previous ? "cursor-pointer text-slate-600" : "text-slate-300"}`}>
              <input type="checkbox" checked={compare} disabled={!previous} onChange={(e) => setCompare(e.target.checked)} className="rounded accent-[#1b4de4]" />
              Show {previous ? monthName(previous.month, "short") : "the month before"} in gray
            </label>
          </div>
          <div className="relative h-[400px]">
            <AreaHeatMap area={area} detections={nowHeat} before={compare ? beforeHeat : null} heatOptions={heatOptions} showWater />
            {nowHeat && nowHeat.length === 0 && (
              <p className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                The robots reported nothing here in this period.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-2">{periodLabel(selected)}: Low <span className={`h-1.5 w-20 rounded-full ${LEGEND_CLASSES["Waste Density"]}`} /> High</span>
            {compare && previous && (
              <span className="inline-flex items-center gap-2">{monthName(previous.month)}: <span className={`h-1.5 w-20 rounded-full ${LEGEND_CLASSES["Past Hotspots"]}`} /></span>
            )}
            <span>Blue: the mapped waterway.</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-base font-bold text-slate-900">{periodLabel(selected)}</p>
              <p className="text-xs text-slate-400">{periodRange(selected)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.pill}`}>{statusLabel(selected)}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">{statusSentence(selected)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <Stat label="Cleanups" value={selected.cleanups} sub={selected.cleanups ? `${selected.troid_cleanups} with a robot` : null} />
            <Stat label="Bags" value={fmt(selected.bags, 0)} sub={selected.average_bags != null ? `${selected.average_bags} per cleanup` : null} />
            <Stat label="Weight" value={`${fmt(selected.weight_kg)} kg`} sub={selected.weight_kg ? `${fmt(selected.recyclable_kg)} kg recyclable` : null} />
            <Stat label="Robot detections" value={fmt(selected.detected_items, 0)} sub={`${fmt(selected.detections, 0)} reports`} />
            {coverage.now && <Stat label="Waterway covered" value={`${fmt(coverage.now.coveredPct)}%`} sub="by the robots' travel path" />}
          </dl>
          {classTotal > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pieces by class</p>
              {TROID_CLASSES.filter((cls) => selected.classes?.[cls]).map((cls) => (
                <div key={cls} className="text-xs">
                  <div className="flex justify-between"><span className="text-slate-600">{cls}</span><span className="font-semibold tabular-nums">{fmt(selected.classes[cls], 0)}</span></div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(selected.classes[cls] / classTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reportOpen && (
        <AreaConditionReport
          area={area}
          current={selected}
          previous={previous}
          currentHeat={nowHeat}
          previousHeat={beforeHeat}
          coverage={coverage}
          preparedBy={currentUser?.name}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The section on Report Generation: an area picker (the areas in the report's barangay, when one is
 * chosen) and the chosen area's history. `areaId` and `onAreaChange` keep the choice in the parent.
 */
export default function AreaHotspotHistory({ areas, areaId, onAreaChange, initialMonth, currentUser }) {
  const area = areas.find((a) => a.id === areaId) || null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Flame size={15} className="text-red-500" /> Collection Area Hotspot History</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-400">
            One collection area month by month for the last year: whether it was a hotspot, what its cleanups brought in, and where the robots found
            trash. Its condition report compares a month with the one before.
          </p>
        </div>
        <select
          value={areaId}
          onChange={(e) => onAreaChange(e.target.value)}
          aria-label="Collection area"
          className="min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 print:hidden"
        >
          <option value="">Choose a collection area…</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id}) · {a.barangay}</option>)}
        </select>
      </div>
      {area ? (
        <AreaHistory key={area.id} area={area} initialMonth={initialMonth} currentUser={currentUser} />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
          {areaId ? "That collection area wasn't found." : "Choose a collection area above, or click View more on an area's card in Collection Areas."}
        </p>
      )}
    </div>
  );
}
