// The parts every dashboard is built from (CENRO, City Admin, barangay/NGO): the header with the
// notification bell and a way to Reports, the KPI cards, and the charts. Each compares this month
// so far with the same dates last month, and each chart can open the Reports page on that chart
// (barangay and NGO accounts have no Reports page, so theirs open nothing).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, FileBarChart2 } from "lucide-react";
import NotificationBell from "./NotificationBell";
import { DASHBOARD_CARD } from "./DashboardPanels";
import { CURRENT_COLOR, PREVIOUS_COLOR, Change, CompareBarChart, TrendChart } from "./charts/CompareCharts";
import { formatMetric } from "../utils/reportData";
import { reportsLink } from "../utils/dashboardData";

const REPORT_BUTTON =
  "inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-[#1b4de4]";

/** "Nov 1 – Nov 26 against Oct 1 – Oct 26". */
export function PeriodNote({ period, className = "" }) {
  return (
    <p className={`text-xs font-medium text-slate-400 ${className}`}>
      This month so far, <span className="text-slate-600">{period.label}</span>, against the same dates last month,{" "}
      <span className="text-slate-600">{period.previous.label}</span>.
    </p>
  );
}

/** The page title, a line under it, the bell, and a button to Reports (when `reportsPath` is given). */
export function DashboardHeader({ title = "Dashboard", subtitle, currentUser, userType, reportsPath, period }) {
  const navigate = useNavigate();
  return (
    <header className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm font-medium text-slate-500">{subtitle}</p>}
        {period && <PeriodNote period={period} className="mt-1" />}
      </div>
      <div className="flex items-center gap-2.5">
        <NotificationBell currentUser={currentUser} userType={userType} />
        {reportsPath && (
          <button
            type="button"
            onClick={() => navigate(period ? reportsLink(reportsPath, period) : reportsPath)}
            className="flex items-center gap-2 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#153eb8]"
          >
            <FileBarChart2 size={15} /> Open Reports
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * One KPI: its value this month so far, the change against the same dates last month, and what it
 * was then. `to` is where clicking it goes (a Reports chart, or a filtered list).
 */
export function KpiCard({ icon: Icon, tint, label, value, unit, previous, change, comparedLabel, to, hint }) {
  const navigate = useNavigate();
  const body = (
    <>
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-0.5 text-[22px] font-bold leading-none tracking-tight text-slate-950">
            {formatMetric(value)}
            {unit && <span className="ml-1 text-xs font-semibold text-slate-400">{unit}</span>}
          </p>
        </div>
        {to && <ArrowUpRight size={15} className="shrink-0 self-start text-slate-300 transition-colors group-hover:text-[#1b4de4]" />}
      </div>
      {change !== undefined ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px]">
          <Change change={change} />
          <span className="font-medium text-slate-400">vs {formatMetric(previous)} {comparedLabel}</span>
        </p>
      ) : (
        <p className="mt-2 truncate text-[11px] font-medium text-slate-400">{hint}</p>
      )}
    </>
  );
  if (!to) return <div className={`${DASHBOARD_CARD} px-4 py-3.5`}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      title={hint || "Open in Reports"}
      className={`${DASHBOARD_CARD} group px-4 py-3.5 text-left transition-shadow hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)]`}
    >
      {body}
    </button>
  );
}

const lineLegend = (
  <>
    <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: CURRENT_COLOR }} /> This month</span>
    <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} /> Last month</span>
  </>
);
const barLegend = (
  <>
    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CURRENT_COLOR }} /> This month</span>
    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm opacity-60" style={{ backgroundColor: PREVIOUS_COLOR }} /> Last month</span>
  </>
);

/** Two bars per row, this month over last month's, scaled to the largest of all. */
export function PairedBars({ rows, unit, empty }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const top = Math.max(1, ...rows.map((r) => Math.max(r.now, r.before)));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name} className="text-xs">
          <div className="flex items-center gap-2">
            {r.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />}
            <span className="flex-1 truncate font-medium text-slate-700" title={r.name}>{r.name}</span>
            <span className="whitespace-nowrap font-semibold text-slate-900">{r.now.toLocaleString()} {unit}</span>
            <span className="whitespace-nowrap text-slate-400">vs {r.before.toLocaleString()}</span>
            <span className="w-[62px] text-right"><Change change={r.change} /></span>
          </div>
          <div className="mt-1.5 space-y-1">
            <div className="h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full" style={{ width: `${(r.now / top) * 100}%`, backgroundColor: r.color || CURRENT_COLOR }} />
            </div>
            <div className="h-1 rounded-full bg-slate-50">
              <div className="h-1 rounded-full" style={{ width: `${(r.before / top) * 100}%`, backgroundColor: PREVIOUS_COLOR }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The height of an element, kept current as it resizes (for charts that fill their card). */
function useHeight() {
  const ref = useRef(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setHeight(Math.floor(entry.contentRect.height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height];
}

/**
 * This month against the same dates last month in one card, a tab per chart: bags and cleanups day
 * by day, trash by type, and bags by place (`placesLabel`: by barangay, or by collection area inside
 * one). `reportsLink(chart)`, when given, opens the shown chart in Reports. The chart fills the card.
 */
export function TrendsCard({ summary, placesLabel, reportsLink: linkTo, className = "" }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("bags");
  const [ref, height] = useHeight();
  const { now, before, change, period } = summary;
  const chartHeight = Math.max(160, height);

  const tabs = [
    {
      id: "bags",
      label: "Bags",
      legend: lineLegend,
      total: <>{formatMetric(now.bags)} vs {formatMetric(before.bags)} bags <Change change={change.bags} className="ml-1" /></>,
      body: <TrendChart data={summary.trend} comparing height={chartHeight} emptyText="No bags collected this month or the same days last month." />,
    },
    {
      id: "cleanups",
      label: "Cleanups",
      legend: barLegend,
      total: <>{formatMetric(now.drives)} vs {formatMetric(before.drives)} cleanups <Change change={change.drives} className="ml-1" /></>,
      body: <CompareBarChart data={summary.trend} comparing height={chartHeight} emptyText="No cleanups finished this month or the same days last month." />,
    },
    {
      id: "waste",
      label: "Trash by type",
      legend: <span>Pieces in the trash reports; the thin bar is last month</span>,
      body: (
        <PairedBars
          rows={summary.waste.map((w) => ({ name: w.name, now: w.value, before: w.previous || 0, change: w.change, color: w.color }))}
          unit="pcs"
          empty="No trash reports filed this month or the same days last month."
        />
      ),
    },
    {
      id: "places",
      label: placesLabel,
      legend: <span>Bags; the thin bar is last month</span>,
      body: (
        <PairedBars
          rows={summary.groups.map((g) => ({ name: g.name, now: g.current, before: g.previous, change: g.change }))}
          unit="bags"
          empty="No bags collected this month or the same days last month."
        />
      ),
    },
  ];
  const shown = tabs.find((t) => t.id === tab);
  const isChart = tab === "bags" || tab === "cleanups";

  return (
    <section className={`${DASHBOARD_CARD} flex flex-col p-4 ${className}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900">This Month vs Last</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">{period.label} vs {period.previous.label}</p>
        </div>
        {linkTo && (
          <button type="button" onClick={() => navigate(linkTo(tab))} className={REPORT_BUTTON} title="Open this chart in Reports">
            Reports <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Chart">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 truncate rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
              tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {shown.legend}
        {shown.total && <span className="ml-auto">{shown.total}</span>}
      </div>
      <div ref={ref} className={`min-h-[160px] flex-1 ${isChart ? "overflow-hidden" : "overflow-y-auto pr-1"}`}>
        {shown.body}
      </div>
    </section>
  );
}
