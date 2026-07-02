import { useEffect, useState } from "react";
import { ShieldCheck, Clock, CheckCircle2, XCircle, TrendingUp, FileText } from "lucide-react";
import api from "../../services/api";

const STAT_COLORS = {
  total: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
};

function SummaryCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${color}`}>
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

export default function Dashboard() {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [stats, setStats] = useState({});
  const [recentDecisions, setRecentDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await api.requests();
        const pending = all.filter((r) => r.status === "Pending").map((r) => ({
          id: r.request_id,
          barangay: r.barangay,
          requestedBy: r.requested_by_name,
          date: r.date_submitted
            ? new Date(r.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '-',
          type: r.request_type,
          priority: "High",
          notes: r.notes || "",
        }));
        const approved = all.filter((r) => r.status === "Approved").length;
        const declined = all.filter((r) => r.status === "Declined").length;
        const recent = all
          .filter((r) => r.status === "Approved" || r.status === "Declined")
          .sort((a, b) => new Date(b.date_submitted) - new Date(a.date_submitted))
          .slice(0, 3)
          .map((r) => ({
            id: r.request_id,
            action: r.status === "Approved" ? "Approved" : "Declined",
            barangay: r.barangay,
            time: r.date_submitted
              ? new Date(r.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '-',
          }));

        if (!cancelled) {
          setPendingRequests(pending);
          setStats({
            total: all.length,
            pending: pending.length,
            approved,
            declined,
          });
          setRecentDecisions(recent);
        }
      } catch (err) {
        console.error("Failed to load city hall dashboard", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">City Hall Dashboard</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">Overview of TROID bot requests from barangays. Review pending requests below.</p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={stats.total ?? 0} sub="All time" color={STAT_COLORS.total} />
        <SummaryCard icon={Clock} label="Pending Review" value={stats.pending ?? 0} sub="Requires your action" color={STAT_COLORS.pending} />
        <SummaryCard icon={CheckCircle2} label="Approved" value={stats.approved ?? 0} sub="Sent to CENRO" color={STAT_COLORS.approved} />
        <SummaryCard icon={XCircle} label="Declined" value={stats.declined ?? 0} sub="This month" color={STAT_COLORS.declined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold text-slate-900">Pending Your Approval</h2>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                {pendingRequests.length}
              </span>
            </div>
            <a href="/mayorsoffice/requests" className="text-xs font-semibold text-[#1b4de4] hover:text-[#153eb8]">
              View all requests
            </a>
          </div>
          <div className="divide-y divide-slate-50">
            {pendingRequests.map((req) => (
              <div key={req.id} className="p-5 flex flex-wrap items-start justify-between gap-4 hover:bg-slate-50/40 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{req.id}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{req.barangay} · {req.requestedBy}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{req.notes}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    req.priority === "High" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {req.priority}
                  </span>
                  <span className="text-xs text-slate-400">{req.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-slate-900">Recent Decisions</h2>
            <button className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-colors">
              View all
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {recentDecisions.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                  item.action === "Approved" ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-red-500 shadow-[0_0_6px_#ef4444]"
                }`}></div>
                <div>
                  <p className="text-xs font-medium text-slate-700">{item.id} — <span className={item.action === "Approved" ? "text-emerald-600" : "text-red-600"}>{item.action}</span></p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.barangay} · {item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h2 className="text-[15px] font-bold text-slate-900">Your Role in the Workflow</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-xs font-semibold text-blue-700 mb-1">1. Review Requests</p>
            <p className="text-xs text-blue-600/80">Barangays submit TROID bot deployment requests through the system.</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-1">2. Approve or Decline</p>
            <p className="text-xs text-emerald-600/80">You are the only one authorized to approve or decline requests from barangays.</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">3. CENRO Takes Over</p>
            <p className="text-xs text-amber-600/80">Once approved, CENRO schedules deployment and assigns operators and bots.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
