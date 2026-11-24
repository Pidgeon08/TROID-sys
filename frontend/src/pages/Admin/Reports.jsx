import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Calendar,
  MapPin,
  FileText,
  FileBarChart2,
  Bot,
  Locate,
  Target,
  Search,
  FileDown,
  Sheet,
  Printer,
  Clock,
  UserCircle2,
  GitCompareArrows,
  ListChecks,
} from "lucide-react";
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx-js-style';
import api from '../../services/api';
import { logAudit } from '../../services/auditLog';
import ReportFilters from '../../components/ReportFilters';
import { openReportPreview } from '../../utils/reportPreview';
import { REQUEST_STATUS_STYLES, manilaDate } from '../../constants/requests';
import {
  COMPARE_OPTIONS, HISTORY_COUNTS, HISTORY_UNITS, addDays, collectionHistory, collectionsIn, compareGroups,
  comparisonRows, formatChange, formatDay, formatMetric, noComparisonReason, priorityIn, reportPeriod,
  requestBarangay, summarize, toCollections, trendSeries, wasteBreakdown, withComparison,
} from '../../utils/reportData';
import { LIVE, useLiveVersion } from "../../hooks/useLiveUpdates";

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 print:break-inside-avoid";
const CURRENT_COLOR = "#3B82F6";
const PREVIOUS_COLOR = "#94A3B8";

const defaultFilters = () => {
  const today = manilaDate(new Date());
  // requestIds: the finished cleanups chosen with Select requests; empty means all of them.
  return { dateFrom: addDays(today, -29), dateTo: today, barangay: "", compare: "previous", compareFrom: "", compareTo: "", requestIds: [] };
};

const sameFilter = (a, b) => (Array.isArray(a) ? a.join("|") === b.join("|") : a === b);

const generatedOn = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// --- Reusable Sub-components ---

/** Up/down arrow and percent for a change; green is more, red is less, grey is none. */
const Change = ({ change, className = "" }) => {
  if (change === undefined) return null;
  const tone = change === null || change === 0 ? "text-slate-400" : change > 0 ? "text-emerald-600" : "text-rose-600";
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold whitespace-nowrap ${tone} ${className}`}>
      {change !== null && change !== 0 && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className={change > 0 ? "" : "rotate-180"} aria-hidden="true">
          <path d="M5 1L9 6H1L5 1Z" fill="currentColor" />
        </svg>
      )}
      {formatChange(change)}
    </span>
  );
};

// Line chart of bags collected per day / week / month, with the previous period dashed behind it.
const TrendChart = ({ data, comparing }) => {
  const [hover, setHover] = useState(null);
  const hasData = data.some((d) => d.bags > 0 || (d.previousBags || 0) > 0);
  if (!hasData) {
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
        No bags were collected in this period.
      </div>
    );
  }

  const width = 600;
  const height = 220;
  const padX = 12;
  const padTop = 14;
  const padBottom = 24;
  const max = Math.max(...data.map((d) => Math.max(d.bags, d.previousBags || 0)), 1) * 1.15;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const stepX = innerW / Math.max(data.length - 1, 1);
  const xAt = (i) => (data.length === 1 ? width / 2 : padX + i * stepX);
  const yAt = (v) => padTop + innerH - (v / max) * innerH;

  const path = (key) => data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d[key] || 0)}`).join(" ");
  const linePath = path("bags");
  const areaPath = `${linePath} L${xAt(data.length - 1)},${padTop + innerH} L${xAt(0)},${padTop + innerH} Z`;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const showMarkers = data.length <= 45;
  const point = hover !== null ? data[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[240px]" preserveAspectRatio="none" role="img" aria-label="Bags collected over time">
        <defs>
          <linearGradient id="bagsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CURRENT_COLOR} stopOpacity="0.18" />
            <stop offset="100%" stopColor={CURRENT_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padX} x2={width - padX} y1={padTop + innerH * g} y2={padTop + innerH * g} stroke="#F1F5F9" strokeWidth="1" />
        ))}
        <path d={areaPath} fill="url(#bagsFill)" />
        {comparing && (
          <path d={path("previousBags")} fill="none" stroke={PREVIOUS_COLOR} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
        <path d={linePath} fill="none" stroke={CURRENT_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={padTop} y2={padTop + innerH} stroke="#CBD5E1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        {data.map((d, i) => (showMarkers || hover === i) && (
          <circle key={d.key} cx={xAt(i)} cy={yAt(d.bags)} r={hover === i ? 4.5 : 3} fill={CURRENT_COLOR} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => (i % labelEvery === 0 ? (
          <text key={d.key} x={xAt(i)} y={height - 6} fontSize="10" fill="#94A3B8" textAnchor="middle">{d.label}</text>
        ) : null))}
        {/* Hover targets: one full-height column per point, wider than the marker */}
        {data.map((d, i) => (
          <rect
            key={d.key}
            x={xAt(i) - Math.max(stepX, 8) / 2}
            y={0}
            width={Math.max(stepX, 8)}
            height={padTop + innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {point && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg print:hidden"
          style={{ left: `${(xAt(hover) / width) * 100}%`, transform: `translateX(${hover > data.length / 2 ? "-105%" : "5%"})` }}
        >
          <p className="font-semibold text-slate-800">{point.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
            {point.bags.toLocaleString()} bags
          </p>
          {comparing && point.previousBags !== null && (
            <p className="mt-0.5 flex items-center gap-1.5 text-slate-500">
              <span className="h-0.5 w-2.5" style={{ backgroundColor: PREVIOUS_COLOR }} />
              {point.previousBags.toLocaleString()} bags ({point.previousLabel})
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Donut chart of trash items by waste type.
const DonutChart = ({ data }) => {
  const size = 140;
  const radius = 60;
  const stroke = 20;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  let running = 0;
  const segments = total > 0 ? data.filter((d) => d.value > 0).map((d) => {
    const dash = (d.value / total) * circumference;
    const rotation = (running / total) * 360;
    running += d.value;
    return (
      <circle
        key={d.name}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={d.color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
      >
        <title>{`${d.name}: ${d.value.toLocaleString()} (${d.pct}%)`}</title>
      </circle>
    );
  }) : [];

  return (
    <div className="relative w-[140px] h-[140px] shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {segments.length ? segments : <circle cx={70} cy={70} r={60} fill="none" stroke="#E5E7EB" strokeWidth={20} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-[10px] font-semibold text-slate-400">Total Items</span>
      </div>
    </div>
  );
};

// --- Main Reports Page Component ---
const Reports = () => {
  const { currentUser } = useOutletContext() || {};
  const [search, setSearch] = useState("");
  // The filters being edited, and the ones the shown report was generated with.
  const [draft, setDraft] = useState(defaultFilters);
  const [applied, setApplied] = useState(defaultFilters);
  const [trendGranularity, setTrendGranularity] = useState("Daily");
  // The history table: calendar months or Monday–Sunday weeks, and how many of them.
  const [history, setHistory] = useState({ unit: "month", count: 6 });
  const [data, setData] = useState({ requests: [], boats: [], operators: [] });
  // Priority collection areas as they stood at the end of a day: { 'YYYY-MM-DD': [...] }.
  const [priorityByDay, setPriorityByDay] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Set when the browser blocked the preview tab.
  const [previewBlocked, setPreviewBlocked] = useState(false);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests, LIVE.fleet);
  useEffect(() => {
    let cancelled = false;
    // Robot and operator names only add detail, so the report still loads without them.
    Promise.allSettled([api.requests(), api.boats(), api.operators()])
      .then(([requests, boats, operators]) => {
        if (cancelled) return;
        const list = (result) => (result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
        if (requests.status === "rejected") {
          console.error('Failed to fetch report data:', requests.reason);
          setError("The report data could not be loaded. Refresh the page to try again.");
        }
        setData({ requests: list(requests), boats: list(boats), operators: list(operators) });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [live]);

  const { dateFrom, dateTo, barangay: selectedBarangay, compare, compareFrom, compareTo, requestIds } = applied;
  // Only the chosen requests, when some are chosen. They have nothing in an earlier period to
  // be compared with, so the comparison is off while they are.
  const chosen = useMemo(() => new Set(requestIds), [requestIds]);
  const choosing = chosen.size > 0;
  // The report's period, with what it is compared with as period.previous.
  const period = useMemo(
    () => withComparison(reportPeriod(dateFrom, dateTo), choosing ? "none" : compare, { from: compareFrom, to: compareTo }),
    [dateFrom, dateTo, compare, compareFrom, compareTo, choosing]
  );
  const noComparisonText = choosing ? "No comparison while specific requests are chosen" : noComparisonReason(period);
  const comparing = Boolean(period.previous);
  // Short name of the comparison for legends and headings ("Same dates last month").
  const compareName = comparing ? (period.compareMode === "custom" ? period.previous.label : COMPARE_OPTIONS[period.compareMode]) : "";
  const areaLabel = selectedBarangay || "All Areas";
  const draftChanged = Object.keys(draft).some((key) => !sameFilter(draft[key], applied[key]));

  const collections = useMemo(
    () => toCollections(data.requests, { boats: data.boats, operators: data.operators }),
    [data]
  );
  const current = useMemo(
    () => collectionsIn(collections, period, selectedBarangay).filter((c) => !choosing || chosen.has(c.requestId)),
    [collections, period, selectedBarangay, choosing, chosen]
  );
  // What Select requests offers: the finished cleanups the filters being edited allow, newest first.
  const candidates = useMemo(
    () => collectionsIn(collections, reportPeriod(draft.dateFrom, draft.dateTo), draft.barangay)
      .sort((a, b) => b.day.localeCompare(a.day) || b.requestId.localeCompare(a.requestId, undefined, { numeric: true })),
    [collections, draft.dateFrom, draft.dateTo, draft.barangay]
  );
  const previous = useMemo(
    () => (period.previous ? collectionsIn(collections, period.previous, selectedBarangay) : null),
    [collections, period, selectedBarangay]
  );

  // A collection area is a priority when its last 30 days bring in more bags per cleanup than
  // the 30 before; the report counts the priority areas at the end of each period.
  const priorityDays = useMemo(
    () => ({ thisEnd: period.to || manilaDate(new Date()), previousEnd: period.previous?.to || "" }),
    [period]
  );
  useEffect(() => {
    const missing = [priorityDays.thisEnd, priorityDays.previousEnd].filter((day) => day && !(day in priorityByDay));
    if (missing.length === 0) return undefined;
    let cancelled = false;
    Promise.all(missing.map((day) => api.priorityAreas({ as_of: day })
      .then((list) => [day, Array.isArray(list) ? list : []])
      .catch((err) => {
        console.error('Failed to fetch priority areas:', err);
        return [day, []];
      })))
      .then((pairs) => { if (!cancelled) setPriorityByDay((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [priorityDays, priorityByDay]);

  // With requests chosen, the priority areas counted are the ones those cleanups were in.
  const chosenAreas = useMemo(() => new Set(current.map((c) => c.areaKey).filter(Boolean)), [current]);
  const stats = useMemo(() => {
    const priorityNow = priorityIn(priorityByDay[priorityDays.thisEnd], selectedBarangay)
      .filter((p) => !choosing || chosenAreas.has(String(p.collection_area?.id)));
    const now = summarize(current, priorityNow);
    const before = previous ? summarize(previous, priorityIn(priorityByDay[priorityDays.previousEnd], selectedBarangay)) : null;
    return { now, before, rows: comparisonRows(now, before) };
  }, [current, previous, priorityByDay, priorityDays, selectedBarangay, choosing, chosenAreas]);
  const metric = (key) => stats.rows.find((r) => r.key === key);

  const trend = useMemo(
    () => trendSeries(current, period, trendGranularity, previous),
    [current, period, trendGranularity, previous]
  );
  const wasteTypes = useMemo(() => wasteBreakdown(current, previous), [current, previous]);

  // Bags by barangay; once one barangay is chosen, by collection area inside it instead.
  const groupBy = selectedBarangay ? "Collection Area" : "Barangay";
  const groups = useMemo(
    () => compareGroups(current, previous, selectedBarangay ? (c) => c.areaName || c.zone : (c) => c.barangay),
    [current, previous, selectedBarangay]
  );

  // The last few months or weeks up to the end of the report, each against the one before.
  const historyEnd = period.to || manilaDate(new Date());
  const historyRows = useMemo(
    () => collectionHistory(choosing ? collections.filter((c) => chosen.has(c.requestId)) : collections, {
      unit: history.unit, count: history.count, end: historyEnd, barangay: selectedBarangay,
    }),
    [collections, history, historyEnd, selectedBarangay, choosing, chosen]
  );
  const historyName = history.unit === "week" ? "week" : "month";
  const historyLabel = (row) => `${row.label}${row.partial ? " (so far)" : ""}`;

  // Barangay filter options: derived from actual submitted requests, not a fixed list.
  const barangays = useMemo(
    () => Array.from(new Set(data.requests.map(requestBarangay).filter(Boolean))).sort(),
    [data.requests]
  );

  const filteredCollections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...current]
      .sort((a, b) => b.day.localeCompare(a.day) || b.requestId.localeCompare(a.requestId, undefined, { numeric: true }))
      .filter((c) => !q || [c.requestId, c.zone, c.barangay, c.unit, c.operator, c.status].some((v) => (v || "").toLowerCase().includes(q)));
  }, [current, search]);

  const overview = [
    { label: "Date Range", value: period.label, icon: Calendar },
    { label: "Compared With", value: comparing ? `${period.previous.label} (${COMPARE_OPTIONS[period.compareMode].toLowerCase()})` : noComparisonText, icon: GitCompareArrows },
    { label: "Coverage Area", value: areaLabel, icon: MapPin },
    { label: "Requests", value: choosing ? `${current.length} selected: ${current.map((c) => c.requestId).join(", ")}` : "All in the period", icon: ListChecks },
    { label: "Report Type", value: "Collection Report", icon: FileText },
    { label: "Generated On", value: generatedOn(), icon: Clock },
    { label: "Generated By", value: currentUser?.name || "CENRO Admin", icon: UserCircle2 },
  ];

  const kpis = [
    { key: "bags", label: "Total Bags Collected", suffix: "Bags", icon: FileBarChart2, tint: "bg-blue-50 text-blue-500" },
    { key: "deployments", label: "Total Robot Deployments", suffix: "", icon: Bot, tint: "bg-emerald-50 text-emerald-500" },
    { key: "zones", label: "Patrol Zones Covered", suffix: "", icon: Locate, tint: "bg-violet-50 text-violet-500" },
    { key: "priority", label: "Priority Collection Areas", suffix: "", icon: Target, tint: "bg-amber-50 text-amber-500" },
  ];

  const reportScope = `${areaLabel} · ${period.label}${choosing ? ` · ${current.length} selected request${current.length === 1 ? "" : "s"}` : ""}`;

  const handleGenerate = () => {
    // A selection outside the period or barangay being applied can't be in the report.
    const allowed = new Set(candidates.map((c) => c.requestId));
    const next = { ...draft, requestIds: draft.requestIds.filter((id) => allowed.has(id)) };
    setDraft(next);
    setApplied(next);
    const picked = next.requestIds.length;
    logAudit({
      currentUser,
      action: 'Report generated',
      module: 'Report Generation',
      details: `Collection Report generated for ${next.barangay || 'All Areas'} (${reportPeriod(next.dateFrom, next.dateTo).label}), `
        + (picked
          ? `covering ${picked} selected request${picked === 1 ? '' : 's'}: ${next.requestIds.join(', ')}`
          : `compared with: ${COMPARE_OPTIONS[next.compare].toLowerCase()}`),
    });
  };

  const handlePrintReport = () => {
    logAudit({
      currentUser,
      action: 'Report printed',
      module: 'Report Generation',
      details: `Collection Report printed for ${reportScope}`,
    });
    window.print();
  };

  const handleExportExcel = () => {
    const titleStyle = { font: { bold: true, sz: 14, color: { rgb: '1B4DE4' } } };
    const subtitleStyle = { font: { italic: true, sz: 10, color: { rgb: '64748B' } } };
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1B4DE4' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const subtitle = `${reportScope}${comparing ? `  ·  compared with ${period.previous.label}` : ''}  ·  Generated ${generatedOn()}`;

    // A sheet with a title, a subtitle, a header row, then the rows; `numeric` columns align right.
    const buildSheet = (title, headerRow, rows, widths, numeric = []) => {
      const ws = XLSX.utils.aoa_to_sheet([[title], [subtitle], [], headerRow, ...rows]);
      ws['!cols'] = widths.map((wch) => ({ wch }));
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headerRow.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headerRow.length - 1 } },
      ];
      ws['A1'].s = titleStyle;
      ws['A2'].s = subtitleStyle;
      headerRow.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 3, c: i })];
        if (cell) cell.s = headerStyle;
      });
      rows.forEach((_, rowIdx) => {
        const bandFill = rowIdx % 2 === 1 ? { fgColor: { rgb: 'F1F5F9' } } : undefined;
        for (let c = 0; c < headerRow.length; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: rowIdx + 4, c })];
          if (!cell) continue;
          cell.s = {
            fill: bandFill,
            border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
            alignment: numeric.includes(c) ? { horizontal: 'right' } : undefined,
          };
        }
      });
      return ws;
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(
      'CENRO TROID Bot — Collection Report',
      ['Date', 'Request', 'Location / Zone', 'Barangay', 'Bags Collected', 'Weight (kg)', 'Robot / Unit', 'Operator', 'Status'],
      filteredCollections.map((c) => [formatDay(c.day), c.requestId, c.zone, c.barangay, c.bags, c.weightKg, c.unit, c.operator, c.status]),
      [14, 12, 22, 18, 14, 12, 16, 18, 16],
      [4, 5],
    ), 'Collection Report');

    const changeCell = (change) => (comparing ? formatChange(change) : '-');
    XLSX.utils.book_append_sheet(wb, buildSheet(
      'Period Comparison',
      ['Metric', 'This Period', 'Compared Period', 'Change'],
      stats.rows.map((r) => [r.unit ? `${r.label} (${r.unit})` : r.label, r.current, comparing ? r.previous : '-', changeCell(r.change)]),
      [26, 14, 16, 12],
      [1, 2, 3],
    ), 'Comparison');

    XLSX.utils.book_append_sheet(wb, buildSheet(
      `Bags by ${groupBy}`,
      [groupBy, 'Drives', 'Bags (This Period)', 'Bags (Compared Period)', 'Change'],
      groups.map((g) => [g.name, g.drives, g.current, comparing ? g.previous : '-', changeCell(g.change)]),
      [24, 10, 18, 20, 12],
      [1, 2, 3, 4],
    ), `By ${groupBy}`);

    XLSX.utils.book_append_sheet(wb, buildSheet(
      'Waste Collection Distribution',
      ['Waste Type', 'Items (This Period)', 'Share', 'Items (Compared Period)', 'Change'],
      wasteTypes.map((w) => [w.name, w.value, `${w.pct}%`, comparing ? w.previous : '-', changeCell(w.change)]),
      [24, 18, 10, 22, 12],
      [1, 2, 3, 4],
    ), 'Waste Types');

    XLSX.utils.book_append_sheet(wb, buildSheet(
      `Collection History (last ${history.count} ${historyName}s)`,
      [history.unit === 'week' ? 'Week' : 'Month', 'Cleanups', 'Bags', 'Weight (kg)', 'Bags per Cleanup', 'Items', `Change in Bags vs Previous ${history.unit === 'week' ? 'Week' : 'Month'}`],
      [...historyRows].reverse().map((h) => [historyLabel(h), h.cleanups, h.bags, h.weightKg, h.avgBags, h.items, formatChange(h.change)]),
      [26, 10, 10, 12, 16, 10, 30],
      [1, 2, 3, 4, 5, 6],
    ), 'History');

    // Shown in a new tab first; it is only saved if the user clicks Download there.
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const opened = openReportPreview({
      title: 'Collection Report (Excel)',
      subtitle: subtitle.replace(/\s+·\s+/g, ' · '),
      fileName: `collection-report-${manilaDate(new Date())}.xlsx`,
      blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      sheets: wb.SheetNames.map((name) => ({ name, html: XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' }) })),
      onDownload: () => logAudit({
        currentUser,
        action: 'Report exported (Excel)',
        module: 'Report Generation',
        details: `Collection Report exported to Excel for ${reportScope}`,
      }),
    });
    setPreviewBlocked(!opened);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const contentWidth = pageWidth - marginX * 2;
    let y = 0;

    const BRAND = [27, 77, 228];
    const SLATE_900 = [15, 23, 42];
    const SLATE_500 = [100, 116, 139];
    const SLATE_400 = [148, 163, 184];
    const SLATE_100 = [241, 245, 249];
    const SLATE_200 = [226, 232, 240];
    const GREEN = [5, 150, 105];
    const RED = [220, 38, 38];

    const statusColors = {
      Approved: GREEN, Verified: SLATE_500, Completed: GREEN,
      Segregated: [147, 51, 234], Declined: RED, Parked: [147, 51, 234],
      Ongoing: [2, 132, 199], Processing: [2, 132, 199], 'Pending Verification': [234, 88, 12],
      'Pending City Admin Approval': [217, 119, 6], 'Pending Admin Approval': [37, 99, 235],
      Pending: [217, 119, 6],
    };
    const changeColor = (change) => (change === null || change === 0 ? SLATE_500 : change > 0 ? GREEN : RED);
    const rowHeight = 8;

    const ensureSpace = (needed) => {
      if (y + needed > pageHeight - 18) {
        doc.addPage();
        y = 16;
        return true;
      }
      return false;
    };

    const sectionTitle = (title) => {
      ensureSpace(18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...SLATE_900);
      doc.setFillColor(...BRAND);
      doc.rect(marginX, y - 3.5, 1.2, 4.5, 'F');
      doc.text(title, marginX + 4, y);
      y += 6;
    };

    // A table with a branded header row, repeated on each new page. `cell(row, i)` returns
    // { text, color?, bold? }; columns are { label, width, align? }.
    const table = (cols, rows, cell) => {
      const header = () => {
        doc.setFillColor(...BRAND);
        doc.rect(marginX, y, contentWidth, rowHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        let cx = marginX;
        cols.forEach((col) => {
          doc.text(col.label, col.align === 'right' ? cx + col.width - 3 : cx + 3, y + 5.5, col.align === 'right' ? { align: 'right' } : undefined);
          cx += col.width;
        });
        y += rowHeight;
      };
      header();
      rows.forEach((row, i) => {
        if (ensureSpace(rowHeight)) header();
        if (i % 2 === 1) {
          doc.setFillColor(...SLATE_100);
          doc.rect(marginX, y, contentWidth, rowHeight, 'F');
        }
        let cx = marginX;
        cols.forEach((col, ci) => {
          const { text, color = SLATE_900, bold = false } = cell(row, ci);
          doc.setFont('helvetica', bold ? 'bold' : 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...color);
          const fitted = doc.splitTextToSize(String(text), col.width - 6)[0] || '';
          doc.text(fitted, col.align === 'right' ? cx + col.width - 3 : cx + 3, y + 5.5, col.align === 'right' ? { align: 'right' } : undefined);
          cx += col.width;
        });
        doc.setDrawColor(...SLATE_200);
        doc.line(marginX, y + rowHeight, marginX + contentWidth, y + rowHeight);
        y += rowHeight;
      });
      if (rows.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...SLATE_500);
        doc.text('Nothing in this period.', marginX + 3, y + 5.5);
        y += rowHeight;
      }
      y += 8;
    };

    // --- Header band ---
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('CENRO TROID Bot', marginX, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Collection Report', marginX, 19);
    doc.setFontSize(8);
    doc.text(generatedOn(), pageWidth - marginX, 12, { align: 'right' });
    doc.text(reportScope, pageWidth - marginX, 19, { align: 'right' });
    y = 36;

    // --- KPI stat row ---
    const kpiGap = 4;
    const kpiWidth = (contentWidth - kpiGap * 3) / 4;
    const kpiHeight = comparing ? 23 : 18;
    [
      { label: 'Total Bags', row: metric('bags') },
      { label: 'Robot Deployments', row: metric('deployments') },
      { label: 'Zones Covered', row: metric('zones') },
      { label: 'Priority Areas', row: metric('priority') },
    ].forEach((k, i) => {
      const x = marginX + i * (kpiWidth + kpiGap);
      doc.setDrawColor(...SLATE_200);
      doc.setFillColor(...SLATE_100);
      doc.roundedRect(x, y, kpiWidth, kpiHeight, 2, 2, 'FD');
      doc.setTextColor(...SLATE_500);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(k.label.toUpperCase(), x + 4, y + 7);
      doc.setTextColor(...SLATE_900);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(formatMetric(k.row.current), x + 4, y + 14.5);
      if (comparing) {
        doc.setFontSize(7);
        doc.setTextColor(...changeColor(k.row.change));
        const changeText = formatChange(k.row.change);
        doc.text(changeText, x + 4, y + 20);
        // Measured in the bold font it was drawn in, so the next words don't run into it.
        const changeWidth = doc.getTextWidth(changeText);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...SLATE_500);
        doc.text(`vs ${formatMetric(k.row.previous)}`, x + 5.5 + changeWidth, y + 20);
      }
    });
    y += kpiHeight + 10;

    // --- Period comparison ---
    sectionTitle(comparing ? `Period Comparison (vs ${period.previous.label})` : 'Period Summary');
    if (comparing) {
      table(
        [
          { label: 'Metric', width: 70 },
          { label: 'This Period', width: 37, align: 'right' },
          { label: 'Compared', width: 40, align: 'right' },
          { label: 'Change', width: contentWidth - 147, align: 'right' },
        ],
        stats.rows,
        (r, ci) => [
          { text: r.label },
          { text: formatMetric(r.current, r.unit), bold: true },
          { text: formatMetric(r.previous, r.unit), color: SLATE_500 },
          { text: formatChange(r.change), color: changeColor(r.change), bold: true },
        ][ci],
      );
    } else {
      table(
        [{ label: 'Metric', width: 110 }, { label: 'Value', width: contentWidth - 110, align: 'right' }],
        stats.rows,
        (r, ci) => [{ text: r.label }, { text: formatMetric(r.current, r.unit), bold: true }][ci],
      );
    }

    // --- Bags by barangay / area ---
    sectionTitle(`Bags by ${groupBy}`);
    table(
      [
        { label: groupBy, width: 70 },
        { label: 'Drives', width: 22, align: 'right' },
        { label: 'Bags', width: 28, align: 'right' },
        { label: 'Compared', width: 30, align: 'right' },
        { label: 'Change', width: contentWidth - 150, align: 'right' },
      ],
      groups,
      (g, ci) => [
        { text: g.name },
        { text: String(g.drives) },
        { text: g.current.toLocaleString(), bold: true },
        { text: comparing ? g.previous.toLocaleString() : '-', color: SLATE_500 },
        comparing ? { text: formatChange(g.change), color: changeColor(g.change), bold: true } : { text: '-', color: SLATE_500 },
      ][ci],
    );

    // --- Waste type breakdown ---
    sectionTitle('Waste Collection Distribution (items by type)');
    table(
      [
        { label: 'Waste Type', width: 70 },
        { label: 'Items', width: 28, align: 'right' },
        { label: 'Share', width: 22, align: 'right' },
        { label: 'Compared', width: 30, align: 'right' },
        { label: 'Change', width: contentWidth - 150, align: 'right' },
      ],
      wasteTypes,
      (w, ci) => [
        { text: w.name, color: w.color.match(/\w\w/g).map((h) => parseInt(h, 16)), bold: true },
        { text: w.value.toLocaleString(), bold: true },
        { text: `${w.pct}%` },
        { text: comparing ? w.previous.toLocaleString() : '-', color: SLATE_500 },
        comparing ? { text: formatChange(w.change), color: changeColor(w.change), bold: true } : { text: '-', color: SLATE_500 },
      ][ci],
    );

    // --- History: the last few months or weeks ---
    sectionTitle(`Collection History (last ${history.count} ${historyName}s)`);
    table(
      [
        { label: history.unit === 'week' ? 'Week' : 'Month', width: 52 },
        { label: 'Cleanups', width: 22, align: 'right' },
        { label: 'Bags', width: 22, align: 'right' },
        { label: 'Weight (kg)', width: 28, align: 'right' },
        { label: 'Bags / Cleanup', width: 30, align: 'right' },
        { label: `vs Prev. ${history.unit === 'week' ? 'Week' : 'Month'}`, width: contentWidth - 154, align: 'right' },
      ],
      [...historyRows].reverse(),
      (h, ci) => [
        { text: historyLabel(h) },
        { text: String(h.cleanups) },
        { text: h.bags.toLocaleString(), bold: true },
        { text: formatMetric(h.weightKg) },
        { text: formatMetric(h.avgBags) },
        { text: formatChange(h.change), color: changeColor(h.change), bold: true },
      ][ci],
    );

    // --- Collection Summary table ---
    sectionTitle('Collection Summary');
    table(
      [
        { label: 'Date', width: 26 },
        { label: 'Location / Zone', width: 40 },
        { label: 'Bags', width: 18, align: 'right' },
        { label: 'Robot / Unit', width: 32 },
        { label: 'Operator', width: 34 },
        { label: 'Status', width: contentWidth - 150 },
      ],
      filteredCollections,
      (c, ci) => [
        { text: formatDay(c.day) },
        { text: c.zone },
        { text: String(c.bags) },
        { text: c.unit },
        { text: c.operator },
        { text: c.status, color: statusColors[c.status] || SLATE_500, bold: true },
      ][ci],
    );

    // --- Footer on every page ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(...SLATE_200);
      doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_400);
      doc.text('CENRO TROID Bot — Collection Report', marginX, pageHeight - 7);
      doc.text(`Page ${p} of ${pageCount}`, pageWidth - marginX, pageHeight - 7, { align: 'right' });
    }

    // Shown in a new tab first; it is only saved if the user clicks Download there.
    const opened = openReportPreview({
      title: 'Collection Report (PDF)',
      subtitle: `${reportScope}${comparing ? ` · compared with ${period.previous.label}` : ''} · Generated ${generatedOn()}`,
      fileName: `collection-report-${manilaDate(new Date())}.pdf`,
      blob: doc.output('blob'),
      onDownload: () => logAudit({
        currentUser,
        action: 'Report exported (PDF)',
        module: 'Report Generation',
        details: `Collection Report exported to PDF for ${reportScope}`,
      }),
    });
    setPreviewBlocked(!opened);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <span className="text-sm font-medium text-slate-500">Loading report data...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-12">
      {/* Page header with title and description */}
      <header className="mb-6 print:hidden">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Report Generation</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          Generate and export reports of aquatic waste collection and deployment activities.
        </p>
      </header>

      {/* Print-only letterhead: the sidebar branding is hidden on paper, so this stands in for it */}
      <header className="hidden print:flex print:items-center print:justify-between print:border-b-2 print:border-[#1b4de4] print:pb-4 print:mb-6">
        <div>
          <p className="text-lg font-bold text-slate-900">CENRO TROID Bot</p>
          <p className="text-xs text-slate-500">
            Collection Report — {reportScope}{comparing ? ` · compared with ${period.previous.label}` : ""}
          </p>
        </div>
        <p className="text-xs text-slate-500">Generated {generatedOn()}</p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 print:hidden">{error}</div>
      )}

      {/* Filter bar: the period, barangay and comparison, applied by Generate Report */}
      <ReportFilters
        draft={draft}
        onChange={(changes) => setDraft((d) => ({ ...d, ...changes }))}
        barangays={barangays}
        candidates={candidates}
        onGenerate={handleGenerate}
      >
        {draftChanged ? (
          <>
            <span className="font-semibold text-amber-600">Click Generate Report to apply the changes.</span>
            <button type="button" onClick={() => setDraft(applied)} className="font-medium text-blue-600 hover:text-blue-700">
              Undo changes
            </button>
          </>
        ) : (
          <span>
            Showing <span className="font-semibold text-slate-700">{period.label}</span>
            {selectedBarangay ? <> in <span className="font-semibold text-slate-700">{selectedBarangay}</span></> : ""}
            {choosing && <> · <span className="font-semibold text-slate-700">{current.length} selected request{current.length === 1 ? "" : "s"}</span></>}
            {comparing
              ? <> compared with <span className="font-semibold text-slate-700">{period.previous.label}</span> ({COMPARE_OPTIONS[period.compareMode].toLowerCase()})</>
              : ` · ${noComparisonText.toLowerCase()}`}
          </span>
        )}
        {!draftChanged && period.overlaps && (
          <span className="font-medium text-amber-600">The two periods share some days, so the changes look smaller than they are.</span>
        )}
      </ReportFilters>

      {/* KPI stat cards row showing high-level collection and deployment metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        {kpis.map(({ key, label, suffix, icon: Icon, tint }) => {
          const row = metric(key);
          return (
            <div key={key} className={`${CARD} p-5 flex gap-4`}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 leading-none">
                  {formatMetric(row.current)} {suffix && <span className="text-sm font-semibold text-slate-400">{suffix}</span>}
                </p>
                {comparing ? (
                  <p className="mt-1.5 text-xs flex flex-wrap items-center gap-x-1">
                    <Change change={row.change} />
                    <span className="text-slate-400 font-medium">vs {formatMetric(row.previous)} · {compareName.toLowerCase()}</span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs font-medium text-slate-400">{period.label}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts section: trend line + waste type donut chart side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-6">
        <div className={`${CARD} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h2 className="text-sm font-bold text-slate-900">Total Bags Collected Over Time</h2>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg print:hidden">
              {["Daily", "Weekly", "Monthly"].map((g) => (
                <button
                  key={g}
                  onClick={() => setTrendGranularity(g)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 ${
                    trendGranularity === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          {comparing && (
            <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: CURRENT_COLOR }} /> This period
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} /> {compareName}
              </span>
              <span className="ml-auto">
                {formatMetric(stats.now.bags)} vs {formatMetric(stats.before.bags)} bags <Change change={metric("bags").change} className="ml-1" />
              </span>
            </div>
          )}
          <TrendChart data={trend} comparing={comparing} />
        </div>

        <div className={`${CARD} p-6`}>
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            Waste Collection Distribution <span className="text-slate-400 font-medium">(by Type of Waste)</span>
          </h2>
          <div className="flex items-center gap-4">
            <DonutChart data={wasteTypes} />
            {wasteTypes.length === 0 ? (
              <p className="flex-1 text-xs text-slate-400">No trash reports were filed in this period.</p>
            ) : (
              <ul className="flex-1 space-y-2.5 min-w-0">
                {wasteTypes.map((w) => (
                  <li key={w.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                    <span className="text-slate-600 font-medium truncate flex-1">{w.name}</span>
                    <span className="text-slate-900 font-semibold shrink-0">{w.value.toLocaleString()} ({w.pct}%)</span>
                    {comparing && (
                      <span className="shrink-0 w-[68px] text-right" title={`${w.previous.toLocaleString()} in ${period.previous.label}`}>
                        <Change change={w.change} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {comparing && wasteTypes.length > 0 && (
            <p className="mt-4 text-[11px] text-slate-400">Changes compare item counts with {period.previous.name} ({period.previous.label}).</p>
          )}
        </div>
      </div>

      {/* Bottom section: collection summary table + report overview / export actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-6">
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-bold text-slate-900">
              Collection Summary <span className="text-slate-400 font-medium">({filteredCollections.length})</span>
            </h2>
            <div className="relative print:hidden">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 max-h-[420px] overflow-y-auto print:max-h-none print:overflow-visible">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs font-semibold text-slate-400 border-b border-slate-100">
                  <th className="py-2.5 px-2 font-semibold">Date</th>
                  <th className="py-2.5 px-2 font-semibold">Location / Zone</th>
                  <th className="py-2.5 px-2 font-semibold">Bags Collected</th>
                  <th className="py-2.5 px-2 font-semibold">Robot / Unit</th>
                  <th className="py-2.5 px-2 font-semibold">Operator</th>
                  <th className="py-2.5 px-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCollections.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                      {search ? "No collections match your search." : "No trash reports were filed in this period."}
                    </td>
                  </tr>
                )}
                {filteredCollections.map((c) => (
                  <tr key={c.requestId} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 px-2 text-slate-500 whitespace-nowrap">{formatDay(c.day)}</td>
                    <td className="py-3 px-2">
                      <p className="text-slate-700 font-medium">{c.zone}</p>
                      <p className="text-[11px] text-slate-400">{c.requestId}{c.barangay && c.barangay !== c.zone ? ` · ${c.barangay}` : ""}</p>
                    </td>
                    <td className="py-3 px-2 text-slate-700 whitespace-nowrap">{c.bags} Bags</td>
                    <td className="py-3 px-2 text-slate-500">{c.unit}</td>
                    <td className="py-3 px-2 text-slate-500">{c.operator}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${REQUEST_STATUS_STYLES[c.status] || 'bg-slate-100 text-slate-600'}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Report overview summary and quick-export actions */}
        <div className={`${CARD} p-6 flex flex-col`}>
          <h2 className="text-sm font-bold text-slate-900 mb-4">Report Overview</h2>
          <ul className="space-y-3.5 flex-1">
            {overview.map(({ label, value, icon: Icon }) => (
              <li key={label} className="flex items-start gap-3 text-sm">
                <Icon size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <span className="text-slate-500 w-28 shrink-0">{label}</span>
                <span className="text-slate-800 font-semibold">{value}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-3 gap-2.5 mt-5 print:hidden">
            <button
              onClick={handleExportPdf}
              className="flex flex-col items-center gap-1.5 border border-slate-200 rounded-xl py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <FileDown size={16} className="text-red-500" /> Preview PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="flex flex-col items-center gap-1.5 border border-slate-200 rounded-xl py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Sheet size={16} className="text-emerald-600" /> Preview Excel
            </button>
            <button
              onClick={handlePrintReport}
              className="flex flex-col items-center gap-1.5 border border-slate-200 rounded-xl py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Printer size={16} className="text-slate-500" /> Print Report
            </button>
          </div>
          <p className="mt-2.5 text-[11px] text-slate-400 print:hidden" role={previewBlocked ? "alert" : undefined}>
            {previewBlocked ? (
              <span className="font-medium text-amber-600">Your browser blocked the preview tab. Allow pop-ups for this site, then try again.</span>
            ) : (
              "The PDF and Excel files open in a new tab to check first; download them from there."
            )}
          </p>
        </div>
      </div>

      {/* Comparative data: this period against the one before it, overall and per place */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 mb-6">
        <div className={`${CARD} p-6`}>
          <h2 className="text-sm font-bold text-slate-900">Period Comparison</h2>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            {comparing ? `${period.label} vs ${period.previous.label} (${compareName.toLowerCase()})` : `${period.label} · ${noComparisonText.toLowerCase()}`}
          </p>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 border-b border-slate-100">
                  <th className="py-2.5 px-2 font-semibold">Metric</th>
                  <th className="py-2.5 px-2 font-semibold text-right">This Period</th>
                  {comparing && <th className="py-2.5 px-2 font-semibold text-right">Compared</th>}
                  {comparing && <th className="py-2.5 px-2 font-semibold text-right">Change</th>}
                </tr>
              </thead>
              <tbody>
                {stats.rows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 px-2 text-slate-600">{r.label}</td>
                    <td className="py-2.5 px-2 text-right font-semibold text-slate-900 whitespace-nowrap">{formatMetric(r.current, r.unit)}</td>
                    {comparing && <td className="py-2.5 px-2 text-right text-slate-500 whitespace-nowrap">{formatMetric(r.previous, r.unit)}</td>}
                    {comparing && <td className="py-2.5 px-2 text-right text-xs"><Change change={r.change} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${CARD} p-6`}>
          <h2 className="text-sm font-bold text-slate-900">Bags by {groupBy}</h2>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            {selectedBarangay ? `Collection areas in ${selectedBarangay}` : "Every barangay with a filed trash report"}
            {comparing ? `, against ${period.previous.name}` : ""}
          </p>
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No bags were collected in either period.</p>
          ) : (
            <ul className="space-y-3 max-h-[440px] overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
              {groups.map((g) => {
                const top = Math.max(groups[0].current, ...groups.map((x) => x.previous), 1);
                return (
                  <li key={g.name} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate font-medium text-slate-700" title={g.name}>{g.name}</span>
                      <span className="font-semibold text-slate-900 whitespace-nowrap">{g.current.toLocaleString()} bags</span>
                      {comparing && <span className="text-slate-400 whitespace-nowrap">vs {g.previous.toLocaleString()}</span>}
                      {comparing && <span className="w-[68px] text-right"><Change change={g.change} /></span>}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full" style={{ width: `${(g.current / top) * 100}%`, backgroundColor: CURRENT_COLOR }} />
                      </div>
                      {comparing && (
                        <div className="h-1 rounded-full bg-slate-50">
                          <div className="h-1 rounded-full" style={{ width: `${(g.previous / top) * 100}%`, backgroundColor: PREVIOUS_COLOR }} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {comparing && groups.length > 0 && (
            <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} /> This period</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full" style={{ backgroundColor: PREVIOUS_COLOR }} /> {compareName}</span>
            </div>
          )}
        </div>
      </div>

      {/* History: the last few months or weeks side by side, each against the one before */}
      <div className={`${CARD} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Collection History</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              The last {history.count} {history.unit === "week" ? "weeks (Monday to Sunday)" : "calendar months"} up to {formatDay(historyEnd)}
              {selectedBarangay ? ` in ${selectedBarangay}` : ""}, each compared with the {historyName} before it.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {Object.entries(HISTORY_UNITS).map(([unit, name]) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setHistory({ unit, count: HISTORY_COUNTS[unit][1] })}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200 ${
                    history.unit === unit ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            <select
              value={history.count}
              onChange={(e) => setHistory((h) => ({ ...h, count: Number(e.target.value) }))}
              aria-label={`Number of ${historyName}s`}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {HISTORY_COUNTS[history.unit].map((n) => <option key={n} value={n}>Last {n} {historyName}s</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-400 border-b border-slate-100">
                <th className="py-2.5 px-2 font-semibold">{history.unit === "week" ? "Week" : "Month"}</th>
                <th className="py-2.5 px-2 font-semibold text-right">Cleanups</th>
                <th className="py-2.5 px-2 font-semibold w-[34%]">Bags</th>
                <th className="py-2.5 px-2 font-semibold text-right">Weight</th>
                <th className="py-2.5 px-2 font-semibold text-right">Bags / Cleanup</th>
                <th className="py-2.5 px-2 font-semibold text-right whitespace-nowrap">vs Previous {history.unit === "week" ? "Week" : "Month"}</th>
              </tr>
            </thead>
            <tbody>
              {[...historyRows].reverse().map((h, i, rows) => {
                const top = Math.max(...rows.map((r) => r.bags), 1);
                const inReport = Boolean(period.from) && h.from <= period.to && h.to >= period.from;
                return (
                  <tr key={h.key} className={`border-b border-slate-50 last:border-0 ${inReport ? "bg-blue-50/40" : ""}`}>
                    <td className="py-2.5 px-2 text-slate-700 font-medium whitespace-nowrap">
                      {h.label}
                      {h.partial && <span className="ml-1.5 text-[11px] font-normal text-slate-400">so far</span>}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600">{h.cleanups}</td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full" style={{ width: `${(h.bags / top) * 100}%`, backgroundColor: CURRENT_COLOR }} />
                        </div>
                        <span className="w-12 text-right font-semibold text-slate-900">{h.bags.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600 whitespace-nowrap">{formatMetric(h.weightKg, "kg")}</td>
                    <td className="py-2.5 px-2 text-right text-slate-600">{formatMetric(h.avgBags)}</td>
                    <td className="py-2.5 px-2 text-right text-xs" title={h.partial ? `Only part of this ${historyName} so far` : undefined}>
                      <Change change={h.change} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          {period.from ? "Highlighted rows overlap the report period. " : ""}
          {historyRows.some((h) => h.partial) ? `The latest ${historyName} is not over yet, so its change is only so far.` : ""}
        </p>
      </div>
    </div>
  );
};

export default Reports;
