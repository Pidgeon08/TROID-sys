import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Trash2, Plus, FileText, Clock, CheckCircle2, XCircle, Signature, Archive } from "lucide-react";
import { TABS, mapRequest, matchesRequestQuery } from "../../constants/requests";
import { useRequests } from "../../hooks/useRequests";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { SearchBar } from "../../components/ui/SearchBar";
import { Pagination } from "../../components/ui/Pagination";
import { SummaryCard } from "../../components/ui/SummaryCard";
import { EmptyState } from "../../components/ui/EmptyState";
import api from "../../services/api";

const PAGE_SIZE = 5;

export default function Requests({ userRole = "admin" }) {
  const navigate = useNavigate();
  const { loading, activeTab, setActiveTab, searchQuery, setSearchQuery, filteredByTab, counts, setRequests, scheduledRequestIds } = useRequests(userRole);
  const [currentPage, setCurrentPage] = useState(1);
  const [archivingId, setArchivingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedRequests, setArchivedRequests] = useState([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  useEffect(() => {
    if (!showArchived) return;
    let cancelled = false;
    setLoadingArchived(true);
    api.requestsArchived()
      .then((res) => { if (!cancelled) setArchivedRequests(Array.isArray(res) ? res.map(mapRequest) : []); })
      .catch((err) => console.error('Failed to load archived requests:', err))
      .finally(() => { if (!cancelled) setLoadingArchived(false); });
    return () => { cancelled = true; };
  }, [showArchived]);

  const handleRestore = async (req) => {
    try {
      await api.restoreRequest(req.id);
      setArchivedRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (err) {
      console.error('Failed to restore request:', err);
      alert('Failed to restore request. Please try again.');
    }
  };

  const handleArchive = async (req) => {
    if (!confirm(`Archive request ${req.id}? This action cannot be undone.`)) return;
    setArchivingId(req.id);
    try {
      await api.deleteRequest(req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (err) {
      console.error('Failed to archive request:', err);
      alert('Failed to archive request. Please try again.');
    } finally {
      setArchivingId(null);
    }
  };

  const filteredArchived = useMemo(
    () => archivedRequests.filter((req) => matchesRequestQuery(req, searchQuery)),
    [archivedRequests, searchQuery]
  );
  const source = showArchived ? filteredArchived : filteredByTab;
  const paginated = useMemo(
    () => source.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [source, currentPage]
  );

  const totalPages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));

  const goTo = (p) => setCurrentPage(Math.max(1, Math.min(totalPages, p)));

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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">TROID Bot Requests</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">View TROID bot deployment requests from barangays. Status updates will appear here.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate("/admin/request/send-request")}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={15} />
            Send Request
          </button>
          <button
            onClick={() => { setShowArchived((v) => !v); setCurrentPage(1); }}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${showArchived ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <Archive size={15} />
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <SearchBar
            value={searchQuery}
            onChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
            placeholder="Search requests..."
            className="w-56"
          />
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={counts.total} sub="All time" />
        <SummaryCard icon={Clock} label="Pending Admin" value={counts.pending} sub="Awaiting your approval" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={counts.approved} sub="Ready for deployment" />
        <SummaryCard icon={XCircle} label="Declined" value={counts.declined} sub="Declined requests" />
      </div>

      <Card>
        {!showArchived && (
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
        )}

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
                  <td className="px-5 py-3.5 text-slate-500">{req.dateSubmitted}</td>
                   <td className="px-5 py-3.5">
                     <div className="flex items-center gap-1.5">
                       <Badge status={req.status} dot />
                       {req.status === 'Approved' && !scheduledRequestIds.has(req.id) && (
                         <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-100">
                           Unscheduled
                         </span>
                       )}
                       {req.status === 'Approved' && scheduledRequestIds.has(req.id) && (
                         <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
                           Scheduled
                         </span>
                       )}
                     </div>
                   </td>
                   <td className="px-5 py-3.5">
                     <div className="flex items-center justify-end gap-2">
                       {showArchived ? (
                         <button
                           onClick={() => handleRestore(req)}
                           className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                         >
                           <CheckCircle2 size={13} />
                           Restore
                         </button>
                       ) : (
                         <>
                           {req.status === "Pending Admin Approval" ? (
                             <button
                               onClick={() => navigate(`/admin/requests/${req.id}`)}
                               className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1b4de4] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#153eb8]"
                             >
                               <Signature size={13} />
                               Review
                             </button>
                           ) : (
                             <button
                               onClick={() => navigate(`/admin/requests/${req.id}`)}
                               className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                             >
                               <Eye size={13} />
                               View
                             </button>
                           )}
                           <button
                             onClick={() => handleArchive(req)}
                             disabled={archivingId === req.id}
                             className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                           >
                             <Trash2 size={13} />
                             {archivingId === req.id ? "Archiving..." : "Archive"}
                           </button>
                         </>
                       )}
                     </div>
                   </td>
                </tr>
              ))}
              {showArchived && loadingArchived && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-400">Loading archived requests...</td>
                </tr>
              )}
              {!(showArchived && loadingArchived) && paginated.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title="No requests found." subtitle="Try adjusting your filters or send a new request." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {paginated.length > 0 && (
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={goTo}
            totalItems={filteredByTab.length}
            pageSize={PAGE_SIZE}
          />
        )}
      </Card>
    </div>
  );
}
