import { useState, useEffect } from "react";
import { MapPin, Recycle, Truck, FileText, ChevronDown } from "lucide-react";
import { api } from '../../services/api';

const CATEGORIES = ["Plastic Packaging", "Plastic Bottles", "Glass", "Metal Cans", "Organic Waste", "Mixed Recyclables"];

function SummaryCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{sub}</p>
      </div>
    </div>
  );
}

export default function RecyclingCenter() {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterBarangay, setFilterBarangay] = useState("All Barangays");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.recyclingRecords().then((data) => {
      if (cancelled) return;
      const mapped = data.map((r) => ({
        record_id: r.record_id,
        barangay: r.barangay,
        date: r.date,
        bags: r.bags,
        weightKg: r.weight_kg,
        category: r.category,
        botId: r.bot ? String(r.bot) : '-',
        operator: r.operator ? `Operator-${r.operator}` : '-',
        buyer: r.buyer,
        soldAt: r.sold_at,
      }));
      setRecords(mapped);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filtered = records.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        r.record_id.toLowerCase().includes(q) ||
        r.barangay.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.buyer.toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "All" && r.category !== filterCategory) return false;
    if (filterBarangay !== "All Barangays" && r.barangay !== filterBarangay) return false;
    return true;
  });

  const barangays = [...new Set(records.map((r) => r.barangay))];
  const totalWeight = records.reduce((sum, r) => sum + (r.weightKg || 0), 0);

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">Loading recycling records...</span>
        </div>
      )}
      {!loading && (
      <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Recycling Center</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Track recyclables sent to the recycling center for selling, reuse, or recycling.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search records..."
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div className="relative">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30 pr-8 appearance-none"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterBarangay}
              onChange={(e) => setFilterBarangay(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30 pr-8 appearance-none"
            >
              <option value="All Barangays">All Barangays</option>
              {barangays.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </header>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Recycle} label="Total Recyclables" value={`${Math.round(totalWeight)} kg`} sub="This month" />
        <SummaryCard icon={Truck} label="Trips Made" value={records.length} sub="To recycling center" />
        <SummaryCard icon={FileText} label="Revenue Generated" value="-" sub="From recyclables sales" />
        <SummaryCard icon={MapPin} label="Barangays Served" value={barangays.length} sub="This month" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Record ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Barangay</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Category</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Bags</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Weight</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Bot ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Buyer / Partner</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Sold At</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => (
                <tr key={rec.record_id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{rec.record_id}</td>
                  <td className="px-5 py-3.5 text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{rec.barangay}</td>
                  <td className="px-5 py-3.5 text-slate-500">{rec.date}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <Recycle className="w-3 h-3" />
                      {rec.category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 font-medium">{rec.bags} bags</td>
                  <td className="px-5 py-3.5 text-slate-600 font-medium">{rec.weightKg} kg</td>
                  <td className="px-5 py-3.5 text-slate-600">{rec.botId}</td>
                  <td className="px-5 py-3.5 text-slate-600">{rec.buyer}</td>
                  <td className="px-5 py-3.5 text-slate-900 font-semibold">{rec.soldAt}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-400">
                    No recycling records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
