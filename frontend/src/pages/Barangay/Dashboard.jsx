import { useEffect, useState } from "react";
import { Truck, FileText, Clock, CheckCircle2, Send } from "lucide-react";
import api from "../../services/api";

const STATUS_STYLES = {
  Completed: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  Rejected: "bg-red-50 text-red-700",
  Approved: "bg-blue-50 text-blue-700",
  Processing: "bg-purple-50 text-purple-700",
};

const Dashboard = () => {
  const [barangayData, setBarangayData] = useState({});
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await api.requests();
        const barangayRequests = all.filter((r) =>
          (r.requested_by_barangay || "").toLowerCase().includes("carlatan")
        );

        if (cancelled) return;

        const totalRequests = barangayRequests.length;
        const pendingRequests = barangayRequests.filter((r) => r.status === "Pending").length;
        const approvedRequests = barangayRequests.filter((r) => r.status === "Approved").length;
        const completedCleanups = barangayRequests.filter((r) => r.status === "Completed" || r.status === "Segregated").length;

        let totalBags = 0;
        let totalWeight = 0;
        let recyclable = 0;
        let nonUsable = 0;

        barangayRequests.forEach((r) => {
          totalBags += Number(r.bags) || 0;
          totalWeight += Number(r.weight_kg) || 0;
          recyclable += Number(r.recyclable_kg) || 0;
          nonUsable += Number(r.non_usable_kg) || 0;
        });

        const mappedRecent = barangayRequests.slice(0, 5).map((r) => ({
          id: r.id,
          type: r.request_type || "Cleanup",
          date: r.date_submitted
            ? new Date(r.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '-',
          status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
          botId: r.bot_id ? `Boat-${r.bot_id}` : null,
        }));

        if (!cancelled) {
          setBarangayData({
            name: "Carlatan",
            address: "Carlatan Creek, San Fernando, La Union",
            stats: {
              totalRequests,
              pendingRequests,
              approvedRequests,
              completedCleanups,
              upcomingSchedule: barangayRequests.find((r) => r.status === "Approved")?.date_submitted || "N/A",
              totalBagsCollected: totalBags,
              totalWeightKg: totalWeight,
              recyclableKg: recyclable,
              nonUsableKg: nonUsable,
            },
          });
          setRecentRequests(mappedRecent);
        }
      } catch (err) {
        console.error("Failed to load barangay dashboard", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const stats = barangayData.stats || {};
  const recent = recentRequests;

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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Barangay Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">{stats.address || "Carlatan Creek, San Fernando, La Union"}</p>
        </div>
        <a
          href="/barangay/request"
          className="flex items-center gap-2 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
        >
          <Send className="w-4 h-4" />
          New Request
        </a>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Requests</p>
             <p className="text-2xl font-bold text-slate-900">{stats.totalRequests ?? 0}</p>
             <p className="text-xs text-slate-400">{stats.pendingRequests ?? 0} pending</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Awaiting Approval</p>
             <p className="text-2xl font-bold text-slate-900">{stats.pendingRequests ?? 0}</p>
             <p className="text-xs text-slate-400">Submitted to Mayor</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upcoming Cleanup</p>
             <p className="text-2xl font-bold text-slate-900">{stats.upcomingSchedule || "N/A"}</p>
             <p className="text-xs text-slate-400">{stats.approvedRequests ?? 0} approved</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed Cleanups</p>
             <p className="text-2xl font-bold text-slate-900">{stats.completedCleanups ?? 0}</p>
             <p className="text-xs text-slate-400">Since May 2026</p>
          </div>
        </div>
      </div>

      {/* Waste Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="w-5 h-5 text-slate-500" />
            <h2 className="text-[15px] font-bold text-slate-900">Waste Collected</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Total Bags</p>
               <p className="text-xl font-bold text-slate-900">{stats.totalBagsCollected ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Total Weight</p>
               <p className="text-xl font-bold text-slate-900">{stats.totalWeightKg ?? 0} kg</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 border border-red-100">
              <p className="text-xs text-red-600 mb-1">Non-Usable</p>
               <p className="text-xl font-bold text-red-700">{stats.nonUsableKg ?? 0} kg</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-100">
              <p className="text-xs text-emerald-600 mb-1">Recyclable</p>
               <p className="text-xl font-bold text-emerald-700">{stats.recyclableKg ?? 0} kg</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 lg:col-span-2">
          <h2 className="text-[15px] font-bold text-slate-900 mb-4">Workflow Status</h2>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { label: "Request Sent", completed: true },
              { label: "Mayor Review", completed: true },
              { label: "Approved", completed: true },
              { label: "Deployment", completed: false },
              { label: "Collection", completed: false },
              { label: "Segregation", completed: false },
              { label: "Disposal", completed: false },
            ].map((step, idx) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  step.completed ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-100"
                }`}>
                  {step.completed ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <Clock className="w-3 h-3 text-slate-400" />
                  )}
                  {step.label}
                </div>
                {idx < 6 && (
                  <svg className="w-4 h-4 text-slate-300 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">Track your request as it moves through the CENRO pipeline. The latest approved request is scheduled for deployment on Jul 2, 2026.</p>
        </div>
      </div>

      {/* Recent Requests */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-[17px] font-bold text-slate-900">Recent Requests</h2>
          <a href="/barangay/requests" className="text-xs font-semibold text-[#1b4de4] hover:text-[#153eb8]">
            View all
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-4 py-2.5 font-medium">Request Type</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Bot Assigned</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((req) => (
                <tr key={req.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{req.type}</td>
                  <td className="px-4 py-2.5 text-slate-500">{req.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[req.status]}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{req.botId || "Not assigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;