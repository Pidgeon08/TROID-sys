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
} from "lucide-react";
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx-js-style';
import api from '../../services/api';
import { logAudit } from '../../services/auditLog';
import { TRASH_CATEGORIES, REQUEST_STATUS_STYLES } from '../../constants/requests';

const toStatusLabel = (raw) => (raw || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Distinct color per trash category, so the waste-type donut segments are visually
// distinguishable instead of every slice sharing one color.
const CATEGORY_COLORS = {
  Plastic: '#3B82F6',
  Metal: '#F59E0B',
  Glass: '#06B6D4',
  'Paper/Cardboard': '#A855F7',
  'Organic/Biodegradable': '#22C55E',
  Other: '#94A3B8',
};

// --- Reusable Sub-components ---

// Reusable label/value field with an icon, used in report filters
const FieldSelect = ({ icon: Icon, label, value }) => (
  <div>
    <p className="text-xs font-semibold text-slate-500 mb-1.5">{label}</p>
    <button className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors">
      <Icon size={16} className="text-slate-400 shrink-0" />
      <span className="truncate">{value}</span>
      <svg className="ml-auto w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  </div>
);

// Line chart component that visualizes the daily bag collection trend over time
const TrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <svg viewBox="0 0 600 220" className="w-full h-[240px]" preserveAspectRatio="none">
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="text-sm fill-slate-400">
          No data available
        </text>
      </svg>
    );
  }

  const width = 600;
  const height = 220;
  const padX = 8;
  const padTop = 12;
  const padBottom = 24;
  const max = Math.max(...data.map((d) => d.bags)) * 1.15 || 1;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const stepX = innerW / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + innerH - (d.bags / max) * innerH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padTop + innerH} L${points[0].x},${padTop + innerH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[240px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="bagsFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((g) => (
        <line
          key={g}
          x1={padX}
          x2={width - padX}
          y1={padTop + innerH * g}
          y2={padTop + innerH * g}
          stroke="#F1F5F9"
          strokeWidth="1"
        />
      ))}
      {/* Filled area beneath the trend line */}
      <path d={areaPath} fill="url(#bagsFill)" />
      {/* Main trend line */}
      <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Data point markers */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3B82F6" />
      ))}
      {/* X-axis day labels - show every other label to avoid crowding */}
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text key={d.day} x={points[i].x} y={height - 6} fontSize="10" fill="#94A3B8" textAnchor="middle">
            {d.day}
          </text>
        ) : null
      )}
    </svg>
  );
};

// Donut chart component that breaks down waste collection by type
const DonutChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="relative w-[140px] h-[140px] shrink-0">
        <svg width={140} height={140} viewBox="0 0 140 140" className="-rotate-90">
          <circle cx={70} cy={70} r={60} fill="none" stroke="#E5E7EB" strokeWidth={20} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-900">0</span>
          <span className="text-[10px] font-semibold text-slate-400">Total Bags</span>
        </div>
      </div>
    );
  }

  const size = 140;
  const radius = 60;
  const stroke = 20;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="relative w-[140px] h-[140px] shrink-0">
        <svg width={140} height={140} viewBox="0 0 140 140" className="-rotate-90">
          <circle cx={70} cy={70} r={60} fill="none" stroke="#E5E7EB" strokeWidth={20} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-900">0</span>
          <span className="text-[10px] font-semibold text-slate-400">Total Bags</span>
        </div>
      </div>
    );
  }

  // Calculate segments with accumulated rotation
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const segments = data.reduce((acc, d) => {
    const fraction = safeTotal > 0 ? d.value / safeTotal : 0;
    const dash = Math.max(0, fraction * circumference);
    const gap = Math.max(0, circumference - dash);
    const rotation = safeTotal > 0 ? (acc.runningTotal / safeTotal) * 360 : 0;
    acc.runningTotal += Number.isFinite(d.value) ? d.value : 0;
    acc.items.push(
      <circle
        key={d.name}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={d.color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="butt"
        transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
      />
    );
    return acc;
  }, { runningTotal: 0, items: [] });

  return (
    <div className="relative w-[140px] h-[140px] shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {segments.items}
      </svg>
      {/* Center label showing the total */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-[10px] font-semibold text-slate-400">Total Bags</span>
      </div>
    </div>
  );
};

// --- Main Reports Page Component ---
const Reports = () => {
  const { currentUser } = useOutletContext() || {};
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [allRequests, setAllRequests] = useState([]);
  const [trendGranularity, setTrendGranularity] = useState("Daily");
  const [collections, setCollections] = useState([]);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const requestsRes = await api.requests();
        const reqs = Array.isArray(requestsRes) ? requestsRes : [];

        setAllRequests(reqs);

        const collectionsArr = [...reqs]
          .filter((r) => r.bags != null)
          .sort((a, b) => new Date(b.date_submitted) - new Date(a.date_submitted))
          .slice(0, 5)
          .map((r) => ({
            date: r.date_submitted ? new Date(r.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-',
            zone: r.location_name || '-',
            bags: Number(r.bags) || 0,
            unit: r.bot_id ? `Boat-${r.bot_id}` : '-',
            operator: r.operator ? `Operator-${r.operator}` : '-',
            status: toStatusLabel(r.status),
          }));
        setCollections(collectionsArr);

        setOverview([
          { label: "Date Range", value: dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "All time", icon: Calendar },
          { label: "Coverage Area", value: selectedBarangay || "All Areas", icon: MapPin },
          { label: "Report Type", value: "Collection Report", icon: FileText },
          { label: "Generated On", value: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }), icon: Clock },
          { label: "Generated By", value: currentUser?.name || "CENRO Admin", icon: UserCircle2 },
        ]);
      } catch (err) {
        console.error('Failed to fetch report data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [dateFrom, dateTo, selectedBarangay]);

  const filteredCollections = collections.filter((c) => c.zone.toLowerCase().includes(search.toLowerCase()));

  // Total Bags Collected Over Time: grouped by the selected granularity.
  const trend = useMemo(() => {
    const trendMap = {};
    const sorted = [...allRequests].sort((a, b) => new Date(a.date_submitted) - new Date(b.date_submitted));
    sorted.forEach((r) => {
      if (!r.date_submitted) return;
      const d = new Date(r.date_submitted);
      let key;
      if (trendGranularity === "Weekly") {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (trendGranularity === "Monthly") {
        key = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      } else {
        key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      trendMap[key] = (trendMap[key] || 0) + (Number(r.bags) || 0);
    });
    const limit = trendGranularity === "Monthly" ? 12 : trendGranularity === "Weekly" ? 12 : 14;
    return Object.entries(trendMap)
      .map(([day, bags]) => ({ day, bags }))
      .slice(-limit);
  }, [allRequests, trendGranularity]);

  // Waste Collection Distribution: real per-category totals from filed trash reports,
  // ordered/colored by the canonical TRASH_CATEGORIES list used across the app.
  const wasteTypes = useMemo(() => {
    const categoryMap = {};
    allRequests.forEach((r) => {
      Object.entries(r.trash_categories || {}).forEach(([cat, count]) => {
        categoryMap[cat] = (categoryMap[cat] || 0) + (Number(count) || 0);
      });
    });
    const total = Object.values(categoryMap).reduce((a, b) => a + b, 0);
    if (total === 0) {
      return [{ name: "No Data", value: 0, pct: 100, color: "#E5E7EB" }];
    }
    const orderedNames = [
      ...TRASH_CATEGORIES.filter((c) => categoryMap[c]),
      ...Object.keys(categoryMap).filter((c) => !TRASH_CATEGORIES.includes(c)),
    ];
    return orderedNames.map((name) => ({
      name,
      value: categoryMap[name],
      pct: Math.round((categoryMap[name] / total) * 100),
      color: CATEGORY_COLORS[name] || "#94A3B8",
    }));
  }, [allRequests]);

  // Barangay filter options: derived from actual submitted requests, not a fixed list.
  const barangays = useMemo(
    () => Array.from(new Set(allRequests.map((r) => r.barangay || r.location_name).filter(Boolean))).sort(),
    [allRequests]
  );

  // KPI totals + real period-over-period deltas. The "current period" is the selected
  // date range if set, otherwise the trailing 30 days; the "previous period" is the
  // equal-length window immediately before it.
  const stats = useMemo(() => {
    const matchesBarangay = (r) => !selectedBarangay || r.barangay === selectedBarangay || r.location_name === selectedBarangay;

    let periodStart, periodEnd, prevStart, prevEnd;
    if (dateFrom && dateTo) {
      periodStart = new Date(dateFrom);
      periodEnd = new Date(dateTo);
      periodEnd.setHours(23, 59, 59, 999);
      const spanMs = periodEnd - periodStart;
      prevEnd = new Date(periodStart.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - spanMs);
    } else {
      periodEnd = new Date();
      periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 30);
      prevEnd = new Date(periodStart.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const inRange = (r, start, end) => {
      if (!r.date_submitted) return false;
      const d = new Date(r.date_submitted);
      return d >= start && d <= end;
    };

    const currentReqs = allRequests.filter((r) => matchesBarangay(r) && inRange(r, periodStart, periodEnd));
    const previousReqs = allRequests.filter((r) => matchesBarangay(r) && inRange(r, prevStart, prevEnd));

    const summarize = (reqs) => ({
      totalBags: reqs.reduce((sum, r) => sum + (Number(r.bags) || 0), 0),
      deployments: reqs.length,
      zones: new Set(reqs.map((r) => r.location_name).filter(Boolean)).size,
      hotspots: new Set(reqs.map((r) => r.location_name).filter(Boolean)).size,
    });

    const current = summarize(currentReqs);
    const previous = summarize(previousReqs);

    // null means "no previous-period baseline to compare against" (not a fabricated
    // percentage) — the previous window had zero activity, so any change is undefined.
    const pctDelta = (curr, prev) => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    return {
      ...current,
      deltas: {
        totalBags: pctDelta(current.totalBags, previous.totalBags),
        deployments: pctDelta(current.deployments, previous.deployments),
        zones: pctDelta(current.zones, previous.zones),
        hotspots: pctDelta(current.hotspots, previous.hotspots),
      },
    };
  }, [allRequests, dateFrom, dateTo, selectedBarangay]);

  const handlePrintReport = () => {
    logAudit({
      currentUser,
      action: 'Report printed',
      module: 'Report Generation',
      details: `Collection Report printed for ${selectedBarangay || 'All Areas'}`,
    });
    window.print();
  };

  const handleExportExcel = () => {
    const headerRow = ['Date', 'Location / Zone', 'Bags Collected', 'Robot / Unit', 'Operator', 'Status'];
    const wsData = [
      ['CENRO TROID Bot — Collection Report'],
      [`${selectedBarangay || 'All Areas'}${dateFrom && dateTo ? `  ·  ${dateFrom} to ${dateTo}` : ''}  ·  Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`],
      [],
      headerRow,
      ...filteredCollections.map((c) => [c.date, c.zone, c.bags, c.unit, c.operator, c.status]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headerRow.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headerRow.length - 1 } },
    ];

    const titleStyle = { font: { bold: true, sz: 14, color: { rgb: '1B4DE4' } } };
    const subtitleStyle = { font: { italic: true, sz: 10, color: { rgb: '64748B' } } };
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1B4DE4' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    ws['A1'].s = titleStyle;
    ws['A2'].s = subtitleStyle;
    headerRow.forEach((_, i) => {
      const cell = ws[XLSX.utils.encode_cell({ r: 3, c: i })];
      if (cell) cell.s = headerStyle;
    });

    filteredCollections.forEach((_, rowIdx) => {
      const r = rowIdx + 4;
      const bandFill = rowIdx % 2 === 1 ? { fgColor: { rgb: 'F1F5F9' } } : undefined;
      for (let c = 0; c < headerRow.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        cell.s = {
          fill: bandFill,
          border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
          alignment: c === 2 ? { horizontal: 'right' } : undefined,
        };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Collection Report');
    XLSX.writeFile(wb, `collection-report-${new Date().toISOString().split('T')[0]}.xlsx`);

    logAudit({
      currentUser,
      action: 'Report exported (Excel)',
      module: 'Report Generation',
      details: `Collection Report exported to Excel for ${selectedBarangay || 'All Areas'}`,
    });
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const contentWidth = pageWidth - marginX * 2;
    let y = 0;

    const BRAND = [27, 77, 228];
    const SLATE_900 = [15, 23, 42];
    const SLATE_500 = [100, 116, 139];
    const SLATE_400 = [148, 163, 184];
    const SLATE_100 = [241, 245, 249];
    const SLATE_200 = [226, 232, 240];

    const statusColors = {
      Approved: [5, 150, 105], Verified: [100, 116, 139], Completed: [5, 150, 105],
      Segregated: [147, 51, 234], Declined: [220, 38, 38], Parked: [147, 51, 234],
      Processing: [2, 132, 199], 'Pending Verification': [234, 88, 12],
      'Pending Mayor Approval': [217, 119, 6], 'Pending Admin Approval': [37, 99, 235],
      Pending: [217, 119, 6],
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
    doc.text(
      new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      pageWidth - marginX, 12, { align: 'right' }
    );
    doc.text(`${selectedBarangay || 'All Areas'}${dateFrom && dateTo ? `  ·  ${dateFrom} to ${dateTo}` : ''}`, pageWidth - marginX, 19, { align: 'right' });
    y = 36;

    // --- KPI stat row ---
    const kpis = [
      { label: 'Total Bags', value: stats.totalBags.toLocaleString() },
      { label: 'Deployments', value: String(stats.deployments) },
      { label: 'Zones Covered', value: String(stats.zones) },
      { label: 'Hotspots', value: String(stats.hotspots) },
    ];
    const kpiGap = 4;
    const kpiWidth = (contentWidth - kpiGap * 3) / 4;
    kpis.forEach((k, i) => {
      const x = marginX + i * (kpiWidth + kpiGap);
      doc.setDrawColor(...SLATE_200);
      doc.setFillColor(...SLATE_100);
      doc.roundedRect(x, y, kpiWidth, 18, 2, 2, 'FD');
      doc.setTextColor(...SLATE_500);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(k.label.toUpperCase(), x + 4, y + 7);
      doc.setTextColor(...SLATE_900);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(k.value, x + 4, y + 14.5);
    });
    y += 26;

    // --- Waste type breakdown ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...SLATE_900);
    doc.setFillColor(...BRAND);
    doc.rect(marginX, y - 3.5, 1.2, 4.5, 'F');
    doc.text('Waste Collection Distribution', marginX + 4, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const swatchSize = 3;
    const colGap = contentWidth / 2;
    wasteTypes.forEach((w, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = marginX + col * colGap;
      const rowY = y + row * 6;
      const rgb = w.color.match(/\w\w/g).map((h) => parseInt(h, 16));
      doc.setFillColor(...rgb);
      doc.rect(x, rowY - swatchSize + 1, swatchSize, swatchSize, 'F');
      doc.setTextColor(...SLATE_500);
      doc.text(`${w.name}`, x + 5, rowY + 1);
      doc.setTextColor(...SLATE_900);
      doc.setFont('helvetica', 'bold');
      doc.text(`${w.value} (${w.pct}%)`, x + colGap - 4, rowY + 1, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    });
    y += Math.ceil(wasteTypes.length / 2) * 6 + 8;

    // --- Collection Summary table ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...SLATE_900);
    doc.setFillColor(...BRAND);
    doc.rect(marginX, y - 3.5, 1.2, 4.5, 'F');
    doc.text('Collection Summary', marginX + 4, y);
    y += 6;

    const cols = [
      { label: 'Date', width: 26 },
      { label: 'Location / Zone', width: 40 },
      { label: 'Bags', width: 20, align: 'right' },
      { label: 'Robot / Unit', width: 32 },
      { label: 'Operator', width: 32 },
      { label: 'Status', width: contentWidth - (26 + 40 + 20 + 32 + 32) },
    ];
    const rowHeight = 8;

    const drawTableHeader = () => {
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

    drawTableHeader();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    filteredCollections.forEach((c, i) => {
      if (y > 275) {
        doc.addPage();
        y = 16;
        drawTableHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
      }

      if (i % 2 === 1) {
        doc.setFillColor(...SLATE_100);
        doc.rect(marginX, y, contentWidth, rowHeight, 'F');
      }

      let cx = marginX;
      const cells = [c.date, c.zone, String(c.bags), c.unit, c.operator];
      cells.forEach((val, ci) => {
        const col = cols[ci];
        doc.setTextColor(...SLATE_900);
        const text = doc.splitTextToSize(String(val), col.width - 6)[0] || '';
        doc.text(text, col.align === 'right' ? cx + col.width - 3 : cx + 3, y + 5.5, col.align === 'right' ? { align: 'right' } : undefined);
        cx += col.width;
      });

      const statusRgb = statusColors[c.status] || SLATE_500;
      doc.setTextColor(...statusRgb);
      doc.setFont('helvetica', 'bold');
      doc.text(c.status, cx + 3, y + 5.5);
      doc.setFont('helvetica', 'normal');

      doc.setDrawColor(...SLATE_200);
      doc.line(marginX, y + rowHeight, marginX + contentWidth, y + rowHeight);

      y += rowHeight;
    });

    // --- Footer on every page ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...SLATE_200);
      doc.line(marginX, pageH - 12, pageWidth - marginX, pageH - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_400);
      doc.text('CENRO TROID Bot — Collection Report', marginX, pageH - 7);
      doc.text(`Page ${p} of ${pageCount}`, pageWidth - marginX, pageH - 7, { align: 'right' });
    }

    doc.save(`collection-report-${new Date().toISOString().split('T')[0]}.pdf`);

    logAudit({
      currentUser,
      action: 'Report exported (PDF)',
      module: 'Report Generation',
      details: `Collection Report exported to PDF for ${selectedBarangay || 'All Areas'}`,
    });
  };

  return (
    <div className="animate-fade-in pb-12">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">Loading report data...</span>
        </div>
      )}
      {!loading && (
      <>
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
          <p className="text-xs text-slate-500">Collection Report — {selectedBarangay || "All Areas"}{dateFrom && dateTo ? ` · ${dateFrom} to ${dateTo}` : ""}</p>
        </div>
        <p className="text-xs text-slate-500">Generated {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </header>

      {/* Filter bar: lets the user select date range and location before generating */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 p-6 mb-6 print:hidden">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            {/* Date Range with calendar inputs */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Date Range</p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors pl-9"
                    placeholder="From"
                  />
                </div>
                <span className="text-slate-400 text-sm shrink-0">to</span>
                <div className="relative flex-1">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors pl-9"
                    placeholder="To"
                  />
                </div>
              </div>
            </div>
            {/* Barangay / Location select dropdown */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Barangay / Location</p>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
<select
                   value={selectedBarangay}
                   onChange={(e) => setSelectedBarangay(e.target.value)}
                   className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors appearance-none pl-9 pr-8"
                 >
                   <option value="" disabled>Select Barangay / Location</option>
                   {barangays.map((b) => (
                     <option key={b} value={b}>{b}</option>
                   ))}
                 </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            {/* Report Type (left as is) */}
            <FieldSelect icon={FileText} label="Report Type" value="Collection Report" />
          </div>
<button
             onClick={() => logAudit({
               currentUser,
               action: 'Report generated',
               module: 'Report Generation',
               details: `Collection Report generated for ${selectedBarangay || 'All Areas'}${dateFrom && dateTo ? ` (${dateFrom} – ${dateTo})` : ''}`,
             })}
             className="flex items-center justify-center gap-2 bg-[#1b4de4] hover:bg-[#153eb8] text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors shrink-0"
           >
             <FileText size={16} />
             Generate Report
           </button>
        </div>
      </div>

      {/* KPI stat cards row showing high-level collection and deployment metrics */}
      {loading ? (
        <div className="flex items-center justify-center h-[140px]">
          <span className="text-sm font-medium text-slate-500">Loading report data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          {[
            { label: "Total Bags Collected", value: stats.totalBags.toLocaleString(), suffix: "Bags", delta: stats.deltas.totalBags, icon: FileBarChart2, tint: "bg-blue-50 text-blue-500" },
            { label: "Total Robot Deployments", value: stats.deployments, suffix: "", delta: stats.deltas.deployments, icon: Bot, tint: "bg-emerald-50 text-emerald-500" },
            { label: "Patrol Zones Covered", value: stats.zones, suffix: "", delta: stats.deltas.zones, icon: Locate, tint: "bg-violet-50 text-violet-500" },
            { label: "Waste Collection Hotspots Identified", value: stats.hotspots, suffix: "", delta: stats.deltas.hotspots, icon: Target, tint: "bg-amber-50 text-amber-500" },
          ].map(({ label, value, suffix, delta, icon: Icon, tint }) => {
            const hasBaseline = delta !== null;
            const isFlat = hasBaseline && delta === 0;
            const isUp = hasBaseline && delta > 0;
            return (
              <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 p-5 flex gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 leading-none">
                    {value} {suffix && <span className="text-sm font-semibold text-slate-400">{suffix}</span>}
                  </p>
                  <p className={`mt-1.5 text-xs font-semibold flex items-center gap-0.5 ${!hasBaseline || isFlat ? "text-slate-400" : isUp ? "text-emerald-500" : "text-rose-500"}`}>
                    {hasBaseline && !isFlat && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={isUp ? "" : "rotate-180"}>
                        <path d="M5 1L9 6H1L5 1Z" fill="currentColor" />
                      </svg>
                    )}
                    {!hasBaseline ? "New activity" : isFlat ? "No change" : `${isUp ? "+" : ""}${delta}%`}{" "}
                    <span className="text-slate-400 font-medium">vs previous period</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts section: trend line + waste type donut chart side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-6">
        {/* Time-series line chart of daily bag collections */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Total Bags Collected Over Time</h2>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
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
          <TrendChart data={trend} />
        </div>

        {/* Donut chart breaking down total bags by waste type */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">
            Waste Collection Distribution <span className="text-slate-400 font-medium">(by Type of Waste)</span>
          </h2>
          <div className="flex items-center gap-4">
            <DonutChart data={wasteTypes} />
            {/* Legend listing each waste type with its count and percentage */}
            <ul className="flex-1 space-y-2.5 min-w-0">
              {wasteTypes.map((w) => (
                <li key={w.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className="text-slate-600 font-medium truncate flex-1">{w.name}</span>
                  <span className="text-slate-900 font-semibold shrink-0">{w.value} ({w.pct}%)</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom section: collection summary table + report overview / export actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        {/* Collection summary table with search filtering by zone */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 p-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-bold text-slate-900">Collection Summary</h2>
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
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
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
                {/* Filter rows by matching the search term against the zone name */}
                {filteredCollections
                  .map((c, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-3 px-2 text-slate-500 whitespace-nowrap">{c.date}</td>
                      <td className="py-3 px-2 text-slate-700 font-medium">{c.zone}</td>
                      <td className="py-3 px-2 text-slate-700">{c.bags} Bags</td>
                      <td className="py-3 px-2 text-slate-500">{c.unit}</td>
                      <td className="py-3 px-2 text-slate-500">{c.operator}</td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${REQUEST_STATUS_STYLES[c.status] || 'bg-slate-100 text-slate-600'}`}>
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
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] print:shadow-none print:border-slate-300 p-6 flex flex-col">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Report Overview</h2>
<ul className="space-y-3.5 flex-1">
             {overview.map(({ label, value, icon: Icon }) => {
               const displayValue = label === "Coverage Area" ? selectedBarangay || "All Areas" : value;
               return (
                 <li key={label} className="flex items-start gap-3 text-sm">
                   <Icon size={16} className="text-slate-400 mt-0.5 shrink-0" />
                   <span className="text-slate-500 w-28 shrink-0">{label}</span>
                   <span className="text-slate-800 font-semibold">{displayValue}</span>
                 </li>
               );
             })}
           </ul>
          {/* Quick export buttons for the generated report */}
          <div className="grid grid-cols-3 gap-2.5 mt-5 print:hidden">
            <button
              onClick={handleExportPdf}
              className="flex flex-col items-center gap-1.5 border border-slate-200 rounded-xl py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <FileDown size={16} className="text-red-500" /> Export PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="flex flex-col items-center gap-1.5 border border-slate-200 rounded-xl py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Sheet size={16} className="text-emerald-600" /> Export Excel
            </button>
            <button
              onClick={handlePrintReport}
              className="flex flex-col items-center gap-1.5 border border-slate-200 rounded-xl py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Printer size={16} className="text-slate-500" /> Print Report
            </button>
           </div>
         </div>
       </div>
       </>
       )}
     </div>
   );
 };

export default Reports;
