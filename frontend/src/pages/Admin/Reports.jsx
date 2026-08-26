import { useState, useEffect } from "react";
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
import api from '../../services/api';
import { logAudit } from '../../services/auditLog';

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
const barangays = ["Carlatan Creek", "Biday Creek", "San Fernando Creek"];

const Reports = () => {
  const { currentUser } = useOutletContext() || {};
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [trend, setTrend] = useState([]);
  const [wasteTypes, setWasteTypes] = useState([]);
  const [collections, setCollections] = useState([]);
  const [stats, setStats] = useState({ totalBags: 0, deployments: 0, zones: 0, hotspots: 0 });
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const [requestsRes, recyclingRes] = await Promise.all([
          api.requests(),
          api.recyclingRecords(),
        ]);

        const reqs = Array.isArray(requestsRes) ? requestsRes : [];
        const recyclings = Array.isArray(recyclingRes) ? recyclingRes : [];

        const trendMap = {};
        reqs.forEach((r) => {
          if (r.date_submitted) {
            const day = new Date(r.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            trendMap[day] = (trendMap[day] || 0) + (Number(r.bags) || 0);
          }
        });
        const trendArr = Object.entries(trendMap)
          .map(([day, bags]) => ({ day, bags }))
          .slice(-14);
        setTrend(trendArr);

        const categoryMap = {};
        recyclings.forEach((r) => {
          if (r.category) {
            categoryMap[r.category] = (categoryMap[r.category] || 0) + (Number(r.bags) || 0);
          }
        });
        const totalRecycled = Object.values(categoryMap).reduce((a, b) => a + b, 0) || 1;
        const wasteTypesArr = Object.entries(categoryMap).map(([name, value]) => ({
          name,
          value,
          pct: Math.round((value / totalRecycled) * 100),
          color: "#22C55E",
        }));
        if (wasteTypesArr.length === 0) {
          wasteTypesArr.push({ name: "No Data", value: 0, pct: 100, color: "#E5E7EB" });
        }
        setWasteTypes(wasteTypesArr);

        const collectionsArr = reqs.slice(0, 5).map((r) => ({
          date: r.date_submitted ? new Date(r.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-',
          zone: r.location_name || '-',
          bags: Number(r.bags) || 0,
          unit: r.bot_id ? `Boat-${r.bot_id}` : '-',
          operator: r.operator ? `Operator-${r.operator}` : '-',
        }));
        setCollections(collectionsArr);

        const totalBags = reqs.reduce((sum, r) => sum + (Number(r.bags) || 0), 0);
        setStats({
          totalBags,
          deployments: reqs.length,
          zones: new Set(reqs.map((r) => r.location_name).filter(Boolean)).size,
          hotspots: new Set(reqs.map((r) => r.location_name).filter(Boolean)).size,
        });

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
    const headers = ['Date', 'Location / Zone', 'Bags Collected', 'Robot / Unit', 'Operator', 'Status'];
    const rows = filteredCollections.map((c) => [c.date, c.zone, c.bags, c.unit, c.operator, 'Completed']);
    const escapeCell = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `collection-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logAudit({
      currentUser,
      action: 'Report exported (Excel)',
      module: 'Report Generation',
      details: `Collection Report exported to CSV for ${selectedBarangay || 'All Areas'}`,
    });
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    let y = 18;

    doc.setFontSize(16);
    doc.text('Collection Report', 14, y);
    y += 10;

    doc.setFontSize(10);
    overview.forEach(({ label, value }) => {
      const displayValue = label === 'Coverage Area' ? selectedBarangay || 'All Areas' : value;
      doc.text(`${label}: ${displayValue}`, 14, y);
      y += 6;
    });
    y += 4;

    doc.setFontSize(12);
    doc.text('Collection Summary', 14, y);
    y += 8;

    doc.setFontSize(9);
    const colX = [14, 46, 96, 128, 160];
    ['Date', 'Zone', 'Bags', 'Unit', 'Operator'].forEach((h, i) => doc.text(h, colX[i], y));
    y += 6;

    filteredCollections.forEach((c) => {
      if (y > 280) {
        doc.addPage();
        y = 18;
      }
      doc.text(String(c.date), colX[0], y);
      doc.text(String(c.zone), colX[1], y);
      doc.text(String(c.bags), colX[2], y);
      doc.text(String(c.unit), colX[3], y);
      doc.text(String(c.operator), colX[4], y);
      y += 6;
    });

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
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Report Generation</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          Generate and export reports of aquatic waste collection and deployment activities.
        </p>
      </header>

      {/* Filter bar: lets the user select date range and location before generating */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 mb-6">
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
            { label: "Total Bags Collected", value: stats.totalBags.toLocaleString(), suffix: "Bags", delta: "+12.5%", icon: FileBarChart2, tint: "bg-blue-50 text-blue-500" },
            { label: "Total Robot Deployments", value: stats.deployments, suffix: "", delta: "+8.3%", icon: Bot, tint: "bg-emerald-50 text-emerald-500" },
            { label: "Patrol Zones Covered", value: stats.zones, suffix: "", delta: "+5.9%", icon: Locate, tint: "bg-violet-50 text-violet-500" },
            { label: "Waste Collection Hotspots Identified", value: stats.hotspots, suffix: "", delta: "+14.3%", icon: Target, tint: "bg-amber-50 text-amber-500" },
          ].map(({ label, value, suffix, delta, icon: Icon, tint }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5 flex gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 leading-none">
                  {value} {suffix && <span className="text-sm font-semibold text-slate-400">{suffix}</span>}
                </p>
                <p className="mt-1.5 text-xs font-semibold text-emerald-500 flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1L9 6H1L5 1Z" fill="currentColor" /></svg>
                  {delta} <span className="text-slate-400 font-medium">vs previous period</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts section: trend line + waste type donut chart side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-6">
        {/* Time-series line chart of daily bag collections */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Total Bags Collected Over Time</h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">Daily</span>
          </div>
          <TrendChart data={trend} />
        </div>

        {/* Donut chart breaking down total bags by waste type */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
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
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-bold text-slate-900">Collection Summary</h2>
            <div className="relative">
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
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-50 text-xs font-semibold px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completed
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Report overview summary and quick-export actions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col">
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
          <div className="grid grid-cols-3 gap-2.5 mt-5">
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
