import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock, CheckCircle2, Eye, MapPin, Recycle } from "lucide-react";
import api from "../../services/api";
import { useUnreadNotifications } from "../../hooks/useUnreadNotifications";
import { UnreadDot } from "../../components/ui/UnreadDot";
import { formatDate, formatTime12h, mapRequest } from "../../constants/requests";
import { SummaryCard } from "../../components/ui/SummaryCard";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import RequestFilters from "../../components/RequestFilters";
import { useRequestFilters } from "../../hooks/useRequestFilters";
import { filterRequests, sortRequests } from "../../utils/requestFilters";

const PAGE_SIZE = 10;

export default function BarangayRequests({ currentUser }) {
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

  const changeFilters = (changes) => { update(changes); setCurrentPage(1); };
  const clearFilters = () => { clear(); setCurrentPage(1); };
  const filtered = useMemo(() => sortRequests(filterRequests(requests, filters), filters.sort), [requests, filters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      </header>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={requests.length} sub="All submitted" />
        <SummaryCard icon={Clock} label="Pending" value={requests.filter((r) => r.status === "Pending City Admin Approval" || r.status === "Pending").length} sub="Awaiting approval" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={requests.filter((r) => r.status === "Approved" || r.status === "Pending Admin Approval").length} sub="Ready for deployment" />
        <SummaryCard icon={Recycle} label="Completed" value={requests.filter((r) => r.status === "Completed" || r.status === "Segregated").length} sub="Including segregation" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {/* A barangay or NGO account only sees its own requests, so filtering by barangay or requester isn't needed. */}
        <RequestFilters
          filters={filters}
          onChange={changeFilters}
          onClear={clearFilters}
          requests={requests}
          shown={filtered.length}
          fields={{ type: true, area: true }}
          searchPlaceholder="Search ID, area, landmark..."
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Request ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Barangay</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date Submitted</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Preferred Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
             <tbody>
                {paginated.map((req) => {
                  const isPendingMayor = req.status === "Pending City Admin Approval";
                  return (
                  <tr key={req.id} className="border-t border-slate-50 transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        {req.id}
                        {unreadRequestIds.has(req.id) && <UnreadDot />}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{req.type}</td>
                    <td className="px-5 py-3.5 text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{req.location?.barangay}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {req.dateSubmitted}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{req.preferredDate ? `${formatDate(`${req.preferredDate}T00:00:00`)}${req.preferredTime ? ` · ${formatTime12h(req.preferredTime)}` : ""}` : "—"}</td>
                   <td className="px-5 py-3.5">
                     <span title={req.status === "Declined" || req.status === "Parked" ? (req.declineReason || "No reason provided") : undefined}>
                       <Badge status={req.status} dot />
                     </span>
                   </td>
                     <td className="px-5 py-3.5">
                        <button
                          onClick={() => navigate(`/barangay/requests/${req.id}`)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          title={isPendingMayor ? "Awaiting City Admin approval" : "View request"}
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
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    No requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {paginated.length > 0 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
        )}
      </div>
      </>
      )}
    </div>
  );
}
