import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock, CheckCircle2, Eye, MapPin, Trash2, Recycle, ArrowLeft, Download, User } from "lucide-react";
import api from "../../services/api";
import { mapRequest } from "../../constants/requests";
import { Card } from "../../components/ui/Card";

const BCOL_STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
  Processing: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Segregated: "bg-purple-50 text-purple-700",
  "Pending Mayor Approval": "bg-amber-50 text-amber-700",
  "Pending Admin Approval": "bg-blue-50 text-blue-700",
};

const BCOL_STATUS_DOT = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Declined: "bg-red-500",
  Processing: "bg-blue-500",
  Completed: "bg-emerald-500",
  Segregated: "bg-purple-500",
  "Pending Mayor Approval": "bg-amber-500",
  "Pending Admin Approval": "bg-blue-500",
};

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

const Field = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right">{value}</span>
  </div>
);

export default function BarangayRequests({ currentUser }) {
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await api.requests();
        const requesterName = (currentUser?.name || "").toLowerCase();
        const mapped = all
          .filter((r) => {
            const reqName = (r.requested_by_name || "").toLowerCase();
            return requesterName.length > 0 && reqName.includes(requesterName);
          })
          .map(mapRequest);
        if (!cancelled) setRequests(mapped);
      } catch (err) {
        console.error("Failed to load requests", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentUser?.name]);

  const tabs = ["All", "Pending", "Approved", "Deployed", "Completed"];

  const filtered = requests.filter((r) => {
    if (activeTab === "All") return true;
    if (activeTab === "Deployed") return r.status === "Approved" && r.deploymentDate;
    if (activeTab === "Completed") return r.status === "Completed" || r.status === "Segregated";
    if (activeTab === "Pending") return r.status === "Pending Mayor Approval" || r.status === "Pending";
    if (activeTab === "Approved") return r.status === "Approved" || r.status === "Pending Admin Approval";
    return r.status === activeTab;
  }).filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.id.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q);
  });

  const navigate = useNavigate();

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">Loading requests...</span>
        </div>
      )}
      {!loading && (
      <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">My Requests</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">Track all submitted cleanup requests and their current status.</p>
        </div>
        <div className="relative">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search requests..."
            className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
          <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </header>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={requests.length} sub="All submitted" />
        <SummaryCard icon={Clock} label="Pending" value={requests.filter((r) => r.status === "Pending Mayor Approval" || r.status === "Pending").length} sub="Awaiting approval" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={requests.filter((r) => r.status === "Approved" || r.status === "Pending Admin Approval").length} sub="Ready for deployment" />
        <SummaryCard icon={Recycle} label="Completed" value={requests.filter((r) => r.status === "Completed" || r.status === "Segregated").length} sub="Including segregation" />
      </div>

      {/* Tab navigation */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center gap-6 px-5 border-b border-slate-100 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab}
              {activeTab === tab && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-blue-600 rounded-full" />}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Request ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Barangay</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date Submitted</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
             <tbody>
                {filtered.map((req) => {
                  const isPendingMayor = req.status === "Pending Mayor Approval";
                  return (
                  <tr key={req.id} className="border-t border-slate-50 transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{req.id}</td>
                    <td className="px-5 py-3.5 text-slate-600">{req.type}</td>
                    <td className="px-5 py-3.5 text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{req.location?.barangay}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {req.dateSubmitted}
                    </td>
                   <td className="px-5 py-3.5">
                     <span
                       className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${BCOL_STATUS_STYLES[req.status]}`}
                       title={req.status === "Declined" ? (req.declineReason || "No reason provided") : undefined}
                     >
                       <span className={`w-1.5 h-1.5 rounded-full ${BCOL_STATUS_DOT[req.status]}`} />
                       {req.status}
                     </span>
                   </td>
                     <td className="px-5 py-3.5">
                        <button
                          onClick={() => navigate(`/barangay/requests/${req.id}`)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          title={isPendingMayor ? "Awaiting Mayor approval" : "View request"}
                        >
                         <Eye size={13} />
                         View
                       </button>
                     </td>
                 </tr>
                  );
                })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                    No requests found.
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
