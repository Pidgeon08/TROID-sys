// The parts every dashboard is built from (CENRO, City Admin, barangay/NGO): the header with the
// notification bell and a way to Reports, the KPI cards, and the charts. Each compares this month
// so far with the same dates last month, and each chart can open the Reports page on that chart.
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

/** The page title, a line under it, and the bell and Reports button every side has. */
export function DashboardHeader({ title = "Dashboard", subtitle, currentUser, userType, reportsPath, period }) {
  const navigate = useNavigate();
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm font-medium text-slate-500">{subtitle}</p>}
        {period && <PeriodNote period={period} className="mt-1" />}
      </div>
      <div className="flex items-center gap-2.5">
        <NotificationBell currentUser={currentUser} userType={userType} />
        <button
          type="button"
          onClick={() => navigate(period ? reportsLink(reportsPath, period) : reportsPath)}
          className="flex items-center gap-2 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#153eb8]"
        >
          <FileBarChart2 size={15} /> Open Reports
        </button>
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
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon size={19} />
        </div>
        {to && <ArrowUpRight size={15} className="text-slate-300 transition-colors group-hover:text-[#1b4de4]" />}
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-slate-950">
        {formatMetric(value)}
        {unit && <span className="ml-1.5 text-sm font-semibold text-slate-400">{unit}</span>}
      </p>
      {change !== undefined ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs">
          <Change change={change} />
          <span className="font-medium text-slate-400">vs {formatMetric(previous)} {comparedLabel}</span>
        </p>
      ) : (
        <p className="mt-2 text-xs font-medium text-slate-400">{hint}</p>
      )}
    </>
  );
  if (!to) return <div className={`${DASHBOARD_CARD} p-5`}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      title={hint || "Open in Reports"}
      className={`${DASHBOARD_CARD} group p-5 text-left transition-shadow hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)]`}
    >
      {body}
    </button>
  );
}

/** A chart card: title, this month against last, its totals, and a button to the same chart in Reports. */
export function ChartCard({ title, period, summary, legend, reportTo, children, className = "" }) {
  const navigate = useNavigate();
  return (
    <section className={`${DASHBOARD_CARD} flex flex-col p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          {period && <p className="mt-0.5 text-[11px] text-slate-400">{period.label} vs {period.previous.label}</p>}
        </div>
        {reportTo && (
          <button type="button" onClick={() => navigate(reportTo)} className={REPORT_BUTTON} title="Open this chart in Reports">
            View in Reports <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {(summary || legend) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {legend}
          {summary && <span className="ml-auto">{summary}</span>}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
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

/** Bags collected each day this month, last month's same days dashed behind it. */
export function BagsChartCard({ summary, reportTo }) {
  const { now, before } = summary;
  return (
    <ChartCard
      title="Bags Collected"
      period={summary.period}
      legend={lineLegend}
      summary={<>{formatMetric(now.bags)} vs {formatMetric(before.bags)} bags <Change change={summary.change.bags} className="ml-1" /></>}
      reportTo={reportTo}
    >
      <TrendChart data={summary.trend} comparing height={220} emptyText="No bags collected this month or the same days last month." />
    </ChartCard>
  );
}

/** Cleanups finished each day this month, beside last month's same days. */
export function CleanupsChartCard({ summary, reportTo }) {
  const { now, before } = summary;
  return (
    <ChartCard
      title="Cleanups Finished"
      period={summary.period}
      legend={barLegend}
      summary={<>{formatMetric(now.drives)} vs {formatMetric(before.drives)} cleanups <Change change={summary.change.drives} className="ml-1" /></>}
      reportTo={reportTo}
    >
      <CompareBarChart data={summary.trend} comparing height={220} emptyText="No cleanups finished this month or the same days last month." />
    </ChartCard>
  );
}

/** Two bars per row, this month over last month's, scaled to the largest of all. */
function PairedBars({ rows, unit, empty }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const top = Math.max(1, ...rows.map((r) => Math.max(r.now, r.before)));
  return (
    <ul className="space-y-3">
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

/** Trash items by type (the TROID classes) this month against last. */
export function WasteChartCard({ summary, reportTo }) {
  const rows = summary.waste.map((w) => ({ name: w.name, now: w.value, before: w.previous || 0, change: w.change, color: w.color }));
  return (
    <ChartCard title="Trash by Type" period={summary.period} legend={<span>Pieces counted in the trash reports; the thin bar is last month</span>} reportTo={reportTo}>
      <PairedBars rows={rows} unit="pcs" empty="No trash reports filed this month or the same days last month." />
    </ChartCard>
  );
}

/** Bags by barangay (or by collection area, inside one barangay) this month against last. */
export function PlacesChartCard({ summary, title, reportTo, limit = 6 }) {
  const rows = summary.groups.slice(0, limit).map((g) => ({ name: g.name, now: g.current, before: g.previous, change: g.change }));
  const more = summary.groups.length - rows.length;
  return (
    <ChartCard title={title} period={summary.period} legend={<span>Bags; the thin bar is last month</span>} reportTo={reportTo}>
      <PairedBars rows={rows} unit="bags" empty="No bags collected this month or the same days last month." />
      {more > 0 && <p className="mt-3 text-[11px] text-slate-400">And {more} more in Reports.</p>}
    </ChartCard>
  );
}
