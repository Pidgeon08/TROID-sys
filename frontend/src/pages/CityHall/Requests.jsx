import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldCheck,
  Signature,
} from "lucide-react";
import api from "../../services/api";
import { useUnreadNotifications } from "../../hooks/useUnreadNotifications";
import { UnreadDot } from "../../components/ui/UnreadDot";
import { formatDate, formatTime12h, mapRequest } from "../../constants/requests";
import { SummaryCard } from "../../components/ui/SummaryCard";
import { Pagination } from "../../components/ui/Pagination";
import { Badge } from "../../components/ui/Badge";
import RequestFilters from "../../components/RequestFilters";
import { useRequestFilters } from "../../hooks/useRequestFilters";
import { filterRequests, sortRequests } from "../../utils/requestFilters";

const PAGE_SIZE = 5;

export default function Requests() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  const unreadRequestIds = new Set(useUnreadNotifications(currentUser?.id).map((n) => n.request_id));
  const { filters, update, clear } = useRequestFilters();
  const [currentPage, setCurrentPage] = useState(1);
  const [requests, setRequests] = useState([]);
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

  const changeFilters = (changes) => { update(changes); setCurrentPage(1); };
  const clearFilters = () => { clear(); setCurrentPage(1); };
  const filtered = useMemo(() => sortRequests(filterRequests(requests, filters), filters.sort), [requests, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={requests.length} sub="All time" />
        <SummaryCard icon={Clock} label="Pending Approval" value={requests.filter((r) => r.status === "Pending City Admin Approval").length} sub="Awaiting your decision" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={requests.filter((r) => r.status === "Approved" || r.status === "Pending Admin Approval").length} sub="Sent to CENRO" />
        <SummaryCard icon={XCircle} label="Declined" value={requests.filter((r) => r.status === "Declined").length} sub="Declined requests" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <RequestFilters
          filters={filters}
          onChange={changeFilters}
          onClear={clearFilters}
          requests={requests}
          shown={filtered.length}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Request ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Requested By</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Barangay</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date Submitted</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Preferred Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((req) => (
                <tr key={req.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      {req.id}
                      {unreadRequestIds.has(req.id) && <UnreadDot />}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{req.type}</td>
                  <td className="px-5 py-3.5 text-slate-600">{req.requestedBy?.name}</td>
                  <td className="px-5 py-3.5 text-slate-600">{req.location?.barangay}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {req.dateSubmitted}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{req.preferredDate ? `${formatDate(`${req.preferredDate}T00:00:00`)}${req.preferredTime ? ` · ${formatTime12h(req.preferredTime)}` : ""}` : "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge status={req.status} dot />
                  </td>
                   <td className="px-5 py-3.5">
                     <div className="flex items-center justify-end gap-2">
                       {req.status === "Pending City Admin Approval" ? (
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
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
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
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
        />
      </div>
      </>
      )}
    </div>
  );
}
