// CENRO's hotspot history of one collection area, over the Heatmap page's map (opened by "View
// more" on the area's card in Collection Areas, or by clicking the area on the heatmap). It is split the way hotspots are decided (backend priority.py): month
// by month, each as it stood at its end, looking at the 30 days before. Picking a month puts that
// period's heatmap on the map; the Compare switch adds the month before it in gray, with the change
// next to each figure. Barangay and NGO accounts compare hotspots on their Bot Tracking page instead.
import { useMemo, useState } from "react";
import { FileText, Flame, X } from "lucide-react";
import { logAudit } from "../services/auditLog";
import AreaConditionReport from "./AreaConditionReport";
import { HeatmapLayer } from "./MapLayers";
import { LEGEND_CLASSES } from "../constants/mapLayers";
import { STATUS, changeText, heatOptionsFor, monthName, periodLabel, periodRange, statusLabel, statusSentence } from "../utils/areaReport";

const TONE = {
  hot: { bar: "#e34948", pill: "bg-red-50 text-red-700" },
  ok: { bar: "#2a78d6", pill: "bg-emerald-50 text-emerald-700" },
  none: { bar: "#cbd5e1", pill: "bg-slate-100 text-slate-600" },
};
const toneOf = (period) => TONE[(STATUS[period?.status] || STATUS.no_cleanups).tone];
const fmt = (n, digits = 1) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
const toPoints = (detections) => (detections || []).map((d) => [d.latitude, d.longitude, d.weight ?? 0.5]);

/** The picked month's heat on the map, with the month before in gray beneath it while comparing. */
export function AreaHistoryHeat({ history }) {
  const now = useMemo(() => toPoints(history.nowHeat), [history.nowHeat]);
  const before = useMemo(() => (history.compare ? toPoints(history.beforeHeat) : []), [history.compare, history.beforeHeat]);
  const options = useMemo(
    () => heatOptionsFor(history.nowHeat, history.compare ? history.beforeHeat : null),
    [history.nowHeat, history.beforeHeat, history.compare]
  );
  return (
    <>
      {before.length > 0 && <HeatmapLayer points={before} type="Past Hotspots" options={options} />}
      {now.length > 0 && <HeatmapLayer points={now} type="Waste Density" options={options} />}
    </>
  );
}

/** Bags per cleanup month by month, each bar coloured by whether the area was a hotspot then. */
function MonthBars({ months, selected, previous, comparing, onSelect }) {
  const most = Math.max(1, ...months.map((m) => m.average_bags || 0));
  return (
    <div className="min-w-0 flex-1">
      <div className="flex h-24 items-end gap-1" role="listbox" aria-label="Months">
        {months.map((m) => {
          const tone = toneOf(m);
          const active = m.month === selected.month;
          const before = comparing && m.month === previous?.month;
          const height = m.average_bags ? Math.max(8, (m.average_bags / most) * 100) : 4;
          return (
            <button
              key={m.month}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(m.month)}
              title={`${periodLabel(m)}: ${statusLabel(m)}${m.average_bags != null ? ` · ${m.average_bags} bags per cleanup` : ""}`}
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-md border px-0.5 pb-0.5 transition-colors ${
                active ? "border-transparent bg-blue-50 ring-2 ring-blue-400" : before ? "border-dashed border-slate-400 bg-slate-50" : "border-transparent hover:bg-slate-50"
              }`}
            >
              <span className="mb-0.5 text-[9px] font-semibold tabular-nums text-slate-500">{m.average_bags ?? "–"}</span>
              <span className="w-full max-w-[28px] rounded-t" style={{ height: `${height}%`, background: tone.bar, opacity: active || before ? 1 : 0.75 }} />
            </button>
          );
        })}
      </div>
      <div className="mt-0.5 flex gap-1">
        {months.map((m) => (
          <span key={m.month} className={`min-w-0 flex-1 truncate text-center text-[10px] font-semibold ${m.month === selected.month ? "text-blue-700" : "text-slate-400"}`}>
            {new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A figure for the picked month, and its change from the month before while comparing. */
function Stat({ label, value, before, now, comparing }) {
  const change = comparing ? changeText(before, now) : null;
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-medium text-slate-400">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold tabular-nums text-slate-900">{value}</span>
        {change && change !== "—" && <span className="text-[10px] font-semibold text-slate-500">{change}</span>}
      </dd>
    </div>
  );
}

/** The switch that adds the month before to the map and the figures. */
function CompareSwitch({ on, disabled, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-[#1b4de4]" : "bg-slate-200"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? "left-[14px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

/** The history panel floating over the bottom of the map. `onClose` goes back to the area's card. */
export default function AreaHistoryOverlay({ history, currentUser, onClose }) {
  const [reportOpen, setReportOpen] = useState(false);
  const { area, selected, previous, compare: comparing } = history;
  if (!area) return null;

  const openReport = () => {
    setReportOpen(true);
    logAudit({
      currentUser,
      action: "Area report generated",
      module: "Heatmap",
      details: `${area.id} ${area.name}: ${monthName(selected.month)} compared with ${previous ? monthName(previous.month) : "the month before"}`,
    });
  };

  const prevShort = previous ? monthName(previous.month, "short") : "the month before";
  let body;
  if (history.loading) body = <p className="py-6 text-center text-xs text-slate-400">Loading the hotspot history…</p>;
  else if (history.error) body = <p className="py-6 text-center text-xs text-red-600">{history.error}</p>;
  else if (!selected) body = <p className="py-6 text-center text-xs text-slate-400">No history for this area yet.</p>;
  else {
    const before = comparing ? previous : null;
    body = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <MonthBars months={history.months} selected={selected} previous={previous} comparing={comparing} onSelect={history.pick} />
        <div className="shrink-0 border-slate-100 sm:w-60 sm:border-l sm:pl-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">{periodLabel(selected)}</p>
              <p className="truncate text-[10px] text-slate-400">{periodRange(selected)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneOf(selected).pill}`} title={statusSentence(selected)}>
              {statusLabel(selected)}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Stat label="Cleanups" value={selected.cleanups} before={before?.cleanups} now={selected.cleanups} comparing={comparing} />
            <Stat label="Bags per cleanup" value={selected.average_bags ?? "–"} before={before?.average_bags} now={selected.average_bags} comparing={comparing} />
            <Stat label="Weight" value={`${fmt(selected.weight_kg)} kg`} before={before?.weight_kg} now={selected.weight_kg} comparing={comparing} />
            <Stat label="Robot detections" value={fmt(selected.detected_items, 0)} before={before?.detected_items} now={selected.detected_items} comparing={comparing} />
          </dl>
          {comparing && <p className="mt-1.5 text-[10px] text-slate-400">Changes are from {monthName(previous.month)}.</p>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="absolute bottom-3 left-3 right-14 z-[500] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: area.color }} />
          <p className="min-w-0 truncate text-sm font-bold text-slate-900">{area.name}</p>
          <span className="text-xs text-slate-400">· Hotspot history</span>
          {history.latest?.is_hotspot && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700"><Flame size={10} /> Hotspot now</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <CompareSwitch on={comparing} disabled={!previous} label={`Compare with ${prevShort}`} onChange={history.setCompare} />
            {selected && (
              <button
                type="button"
                onClick={openReport}
                title={`A condition report: ${monthName(selected.month)} against ${previous ? monthName(previous.month) : "the month before"}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#153eb8]"
              >
                <FileText size={13} /> Report
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close hotspot history">
              <X size={16} />
            </button>
          </div>
        </div>
        {body}
        {selected && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">{monthName(selected.month, "short")}: Low <span className={`h-1.5 w-14 rounded-full ${LEGEND_CLASSES["Waste Density"]}`} /> High</span>
            {comparing && (
              <span className="inline-flex items-center gap-1.5">{prevShort}: <span className={`h-1.5 w-14 rounded-full ${LEGEND_CLASSES["Past Hotspots"]}`} /></span>
            )}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: TONE.hot.bar }} /> Hotspot</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: TONE.ok.bar }} /> Not a hotspot</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: TONE.none.bar }} /> No cleanups</span>
            <span className="text-slate-400">Bars: bags per cleanup over the 30 days to each month&apos;s end.</span>
            {history.nowHeat && history.nowHeat.length === 0 && <span className="font-medium text-slate-600">The robots reported nothing here this month.</span>}
          </div>
        )}
      </div>

      {reportOpen && selected && (
        <AreaConditionReport
          area={area}
          current={selected}
          previous={previous}
          currentHeat={history.nowHeat}
          previousHeat={history.beforeHeat}
          coverage={history.coverage}
          preparedBy={currentUser?.name}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}
