import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldCheck,
  Signature,
} from "lucide-react";
import api from "../../services/api";
import { mapRequest, matchesRequestQuery } from "../../constants/requests";
import { SummaryCard } from "../../components/ui/SummaryCard";
import { Pagination } from "../../components/ui/Pagination";

const PAGE_SIZE = 5;

const TABS = ["All Requests", "Pending Approval", "Approved", "Declined"];

const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
  Parked: "bg-purple-50 text-purple-700",
  "Pending Mayor Approval": "bg-amber-50 text-amber-700",
  "Pending Admin Approval": "bg-blue-50 text-blue-700",
  Processing: "bg-sky-50 text-sky-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Segregated: "bg-purple-50 text-purple-700",
  "Pending Verification": "bg-orange-50 text-orange-700",
  Verified: "bg-slate-100 text-slate-600",
};

const STATUS_DOT = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Declined: "bg-red-500",
  Parked: "bg-purple-500",
  "Pending Mayor Approval": "bg-amber-500",
  "Pending Admin Approval": "bg-blue-500",
  Processing: "bg-sky-500",
  Completed: "bg-emerald-500",
  Segregated: "bg-purple-500",
  "Pending Verification": "bg-orange-500",
  Verified: "bg-slate-400",
};

export default function Requests() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("All Requests");
  const [currentPage, setCurrentPage] = useState(1);
  const [requests, setRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
      const all = await api.requests();
      if (!cancelled) {
        setRequests(all.map(mapRequest));
      }
      } catch (err) {
        console.error("Failed to load requests", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredByTab = (activeTab === "All Requests"
    ? requests
    : requests.filter((r) => r.status === activeTab)
  ).filter((req) => matchesRequestQuery(req, searchQuery));

  const totalPages = Math.max(1, Math.ceil(filteredByTab.length / PAGE_SIZE));
  const paginated = filteredByTab.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Requests</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">Review and approve or decline barangay requests for TROID bot deployment.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search requests..."
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={requests.length} sub="All time" />
        <SummaryCard icon={Clock} label="Pending Approval" value={requests.filter((r) => r.status === "Pending Mayor Approval").length} sub="Awaiting your decision" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={requests.filter((r) => r.status === "Approved" || r.status === "Pending Admin Approval").length} sub="Sent to CENRO" />
        <SummaryCard icon={XCircle} label="Declined" value={requests.filter((r) => r.status === "Declined").length} sub="Declined requests" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center gap-6 px-5 border-b border-slate-100 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
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
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Requested By</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Barangay</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date Submitted</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((req) => (
                <tr key={req.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{req.id}</td>
                  <td className="px-5 py-3.5 text-slate-600">{req.type}</td>
                  <td className="px-5 py-3.5 text-slate-600">{req.requestedBy?.name}</td>
                  <td className="px-5 py-3.5 text-slate-600">{req.location?.barangay}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {req.dateSubmitted}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[req.status]}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[req.status]}`} />
                      {req.status}
                    </span>
                  </td>
                   <td className="px-5 py-3.5">
                     <div className="flex items-center justify-end gap-2">
                       {req.status === "Pending Mayor Approval" ? (
                         <button
                           onClick={() => navigate(`/mayorsoffice/requests/${req.id}`)}
                           className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1b4de4] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#153eb8]"
                         >
                           <Signature size={13} />
                           Review
                         </button>
                       ) : (
                         <button
                           onClick={() => navigate(`/mayorsoffice/requests/${req.id}`)}
                           className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                         >
                           <Eye size={13} />
                           View
                         </button>
                       )}
                     </div>
                   </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    No requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredByTab.length}
          pageSize={PAGE_SIZE}
        />
      </div>
      </>
      )}
    </div>
  );
}
