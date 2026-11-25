// One collection area's history, opened from its card on the Collection Areas page ("View more").
// It is split the way hotspots are decided (backend priority.py): month by month, each as it stood
// at its end, looking at the 30 days before. Pick a month to see that period's heatmap and what its
// cleanups brought in; "Show report" compares it with the month before.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Flame, Info } from "lucide-react";
import api from "../services/api";
import { logAudit } from "../services/auditLog";
import AreaHeatMap from "./AreaHeatMap";
import AreaDetails from "./AreaDetails";
import AreaConditionReport from "./AreaConditionReport";
import { LEGEND_CLASSES } from "../constants/mapLayers";
import { waterBodyLabel } from "../constants/collectionAreas";
import { TROID_CLASSES } from "../constants/trashReport";
import { STATUS_META, mapArea, shapeSize } from "../utils/collectionAreaInfo";
import { areaCoverage, isMeasurableArea } from "../utils/coverage";
import { STATUS, heatOptionsFor, monthName, periodLabel, periodRange, statusLabel, statusSentence } from "../utils/areaReport";

const PANEL = "rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]";
const TONE = {
  hot: { bar: "#e34948", pill: "bg-red-50 text-red-700" },
  ok: { bar: "#2a78d6", pill: "bg-emerald-50 text-emerald-700" },
  none: { bar: "#cbd5e1", pill: "bg-slate-100 text-slate-600" },
};
const toneOf = (period) => TONE[(STATUS[period?.status] || STATUS.no_cleanups).tone];
// One more month than shown, so the first month shown has one before it to compare with.
const MONTHS_SHOWN = 12;

/** The area as the history API's latest month judges it, in the shape AreaDetails reads. */
function priorityOf(period, windowDays) {
  if (!period || period.status === "no_cleanups") return null;
  return {
    status: period.status,
    is_priority: period.is_hotspot,
    current: { average: period.average_bags },
    previous: period.previous,
    change_pct: period.change_pct,
    window_days: windowDays,
  };
}

/** Bags per cleanup month by month, each bar coloured by whether the area was a hotspot then. */
function MonthBars({ months, selected, onSelect }) {
  const most = Math.max(1, ...months.map((m) => m.average_bags || 0));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 sm:gap-2" role="listbox" aria-label="Months">
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
              className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-lg px-0.5 pb-1 transition-colors ${active ? "bg-blue-50 ring-2 ring-blue-400" : "hover:bg-slate-50"}`}
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

const fmt = (n, digits = 1) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function AreaHistoryPage({ side = "admin" }) {
  const { areaId } = useParams();
  const { currentUser } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const backPath = side === "barangay" ? "/barangay/areas" : "/admin/collection-areas";
  const [loaded, setLoaded] = useState(null); // { area, months, windowDays } or { error }
  const [heat, setHeat] = useState({}); // month -> detections
  const requested = useRef(new Set());
  const [compare, setCompare] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.collectionAreaDetail(areaId), api.collectionAreaHistory(areaId, MONTHS_SHOWN + 1)])
      .then(([raw, history]) => {
        if (!cancelled) setLoaded({ area: mapArea(raw), months: history.months || [], windowDays: history.window_days || 30 });
      })
      .catch((err) => {
        console.error("Failed to load the area's history:", err);
        if (!cancelled) setLoaded({ error: err.status === 404 ? "This collection area wasn't found." : "The area's history couldn't be loaded." });
      });
    return () => { cancelled = true; };
  }, [areaId]);

  const allMonths = useMemo(() => loaded?.months || [], [loaded]);
  const months = allMonths.slice(-MONTHS_SHOWN);
  const selected = months.find((m) => m.month === params.get("month")) || months[months.length - 1] || null;
  const index = selected ? allMonths.indexOf(selected) : -1;
  const previous = index > 0 ? allMonths[index - 1] : null;

  // The robots' reports for the selected period and the one before (for comparing and the report).
  // Each month is asked for once; what comes back is kept for when it is picked again.
  useEffect(() => {
    [selected, previous].forEach((m) => {
      if (!m || requested.current.has(m.month)) return;
      requested.current.add(m.month);
      api.getHeatmap({ time_filter: "custom", start: m.start, end: m.as_of, collection_area: areaId })
        .then((res) => setHeat((prev) => ({ ...prev, [m.month]: Array.isArray(res) ? res : [] })))
        .catch(() => setHeat((prev) => ({ ...prev, [m.month]: [] })));
    });
  }, [selected, previous, areaId]);

  const area = loaded?.area ? { ...loaded.area, priority: priorityOf(allMonths[allMonths.length - 1], loaded.windowDays) } : null;
  const nowHeat = selected ? heat[selected.month] : undefined;
  const beforeHeat = previous ? heat[previous.month] : undefined;
  const shape = loaded?.area;
  const coverage = useMemo(() => {
    if (!shape || !isMeasurableArea(shape)) return {};
    return {
      now: nowHeat ? areaCoverage(shape.points, nowHeat) : null,
      before: beforeHeat ? areaCoverage(shape.points, beforeHeat) : null,
    };
  }, [shape, nowHeat, beforeHeat]);
  const heatOptions = useMemo(() => heatOptionsFor(nowHeat, compare ? beforeHeat : null), [nowHeat, beforeHeat, compare]);

  const select = (month) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("month", month);
    return next;
  }, { replace: true });

  const openReport = () => {
    setReportOpen(true);
    logAudit({
      currentUser,
      action: "Area report generated",
      module: "Collection Areas",
      details: `${area.id} ${area.name}: ${monthName(selected.month)} compared with ${previous ? monthName(previous.month) : "the month before"}`,
    });
  };

  if (!loaded) {
    return <div className="flex min-h-[400px] items-center justify-center text-lg font-semibold text-slate-500">Loading…</div>;
  }
  if (loaded.error) {
    return (
      <div className="mx-auto max-w-[1400px] pb-12">
        <Link to={backPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"><ArrowLeft size={15} /> Collection Areas</Link>
        <p className="mt-6 text-sm text-red-600">{loaded.error}</p>
      </div>
    );
  }

  const meta = STATUS_META[area.status] || STATUS_META.pending;
  const tone = toneOf(selected);
  const classTotal = TROID_CLASSES.reduce((sum, cls) => sum + (selected?.classes?.[cls] || 0), 0);
  const water = [waterBodyLabel(area.waterBodyType), area.waterBodyName].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in pb-12">
      <Link to={`${backPath}?area=${encodeURIComponent(area.id)}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
        <ArrowLeft size={15} /> Collection Areas
      </Link>
      <header className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-[28px] font-bold leading-tight tracking-tight text-slate-900">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: area.color }} />
            {area.name}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-slate-500">
            {[area.id, `Barangay ${area.barangay}`, water, shapeSize(area)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
            {area.priority?.is_priority && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700"><Flame size={12} /> Hotspot now</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={openReport}
          disabled={!selected}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153eb8] disabled:opacity-50"
        >
          <FileText size={16} /> Show report
        </button>
      </header>

      {selected && (
        <section className={`${PANEL} mb-6 p-5`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Month by month</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
                Each month is judged as it stood at its end: its bags per cleanup over the 30 days before, against the 30 days before that.
                Higher makes it a hotspot. Pick a month to see it.
              </p>
            </div>
          </div>
          <MonthBars months={months} selected={selected} onSelect={select} />
        </section>
      )}

      {selected && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className={`${PANEL} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-800">
                Where the robots found trash · <span className="font-medium text-slate-500">{periodRange(selected)}</span>
              </p>
              <label className={`inline-flex items-center gap-2 text-xs font-medium ${previous ? "cursor-pointer text-slate-600" : "text-slate-300"}`}>
                <input type="checkbox" checked={compare} disabled={!previous} onChange={(e) => setCompare(e.target.checked)} className="rounded accent-[#1b4de4]" />
                Show {previous ? monthName(previous.month, "short") : "the month before"} in gray
              </label>
            </div>
            <div className="relative h-[480px]">
              <AreaHeatMap area={area} detections={nowHeat} before={compare ? beforeHeat : null} heatOptions={heatOptions} showWater />
              {nowHeat && nowHeat.length === 0 && (
                <p className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                  The robots reported nothing here in this period.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-2">{periodLabel(selected)}: Low <span className={`h-1.5 w-20 rounded-full ${LEGEND_CLASSES["Waste Density"]}`} /> High</span>
              {compare && previous && (
                <span className="inline-flex items-center gap-2">{monthName(previous.month)}: <span className={`h-1.5 w-20 rounded-full ${LEGEND_CLASSES["Past Hotspots"]}`} /></span>
              )}
              <span>Blue: the mapped waterway.</span>
            </div>
          </section>

          <aside className="space-y-6">
            <section className={`${PANEL} p-5`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{periodLabel(selected)}</h2>
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
                {coverage.now && (
                  <Stat label="Waterway covered" value={`${fmt(coverage.now.coveredPct)}%`} sub="by the robots' travel path" />
                )}
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
              <button
                type="button"
                onClick={openReport}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                <FileText size={14} /> Report: {monthName(selected.month, "short")} against {previous ? monthName(previous.month, "short") : "the month before"}
              </button>
            </section>

            <section className={`${PANEL} px-5 pt-4`}>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Info size={14} className="text-slate-400" /> About this area</h2>
              <AreaDetails area={area} />
            </section>
          </aside>
        </div>
      )}

      {reportOpen && selected && (
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
