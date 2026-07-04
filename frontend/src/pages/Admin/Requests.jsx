import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search,
  Filter,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import api from '../../services/api';

const TABS = ["All Requests", "Pending", "Approved", "Declined"];

const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
};

const STATUS_DOT = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Declined: "bg-red-500",
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

const Card = ({ title, children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5 ${className}`}>
    {title && <h3 className="text-sm font-semibold text-slate-800 mb-4">{title}</h3>}
    {children}
  </div>
);

const Field = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right">{value}</span>
  </div>
);

export default function Requests({ userRole = "admin" }) {
  const [activeTab, setActiveTab] = useState("All Requests");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const isCenro = userRole === "admin";
  const isBarangay = userRole === "barangay";

  const title = "TROID Bot Requests";
  const subtitle = "View TROID bot deployment requests from barangays. Status updates will appear here.";

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await api.requests();
        const mapped = Array.isArray(res) ? res.map((r) => ({
          id: r.request_id,
          type: r.request_type || "TROID Bot Deployment",
          status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
          dateSubmitted: r.date_submitted
            ? new Date(r.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : r.date_submitted,
          requestedBy: {
            name: r.requested_by_name || "",
            role: r.requested_by_role || "",
            barangay: r.requested_by_barangay || "",
            contact: r.contact || "",
            email: r.email || "",
          },
          location: {
            name: r.location_name || "",
            barangay: r.barangay || "",
            municipality: r.municipality || "",
            province: r.province || "",
          },
          notes: r.notes || "",
          letter: {
            fileName: r.letter_file_name || "",
            size: r.letter_size || "",
          },
          photos: (r.photos || []).map(p => ({
            id: p.photo_id || p.id,
            label: p.label || "",
            date: p.date || "",
          })),
          statusHistory: (r.status_history || []).map(sh => ({
            label: sh.label || "",
            date: sh.date
              ? new Date(sh.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : sh.date,
            actor: sh.actor || "",
            role: sh.role || "",
            state: sh.state || "done",
          })),
        })) : [];
        setRequests(mapped);
      } catch (err) {
        console.error('Failed to fetch requests:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, []);

  const filteredRequests = requests.filter((req) => {
    if (isBarangay) {
      const name = req.requestedBy?.name || "";
      const brgy = req.location?.barangay || "";
      return name.toLowerCase().includes("santos") || brgy.toLowerCase().includes("carlatan");
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
        return (
          req.id.toLowerCase().includes(q) ||
          req.type.toLowerCase().includes(q) ||
          (req.requestedBy?.name || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

  const filteredByTab = activeTab === "All Requests"
    ? filteredRequests
    : filteredRequests.filter((r) => r.status === activeTab);

  const paginated = filteredByTab.slice((currentPage - 1) * 5, currentPage * 5);

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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">{title}</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate("/admin/request/send-request")}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={15} />
            Send Request
          </button>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search requests..."
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          {isCenro && (
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Filter size={15} />
              Filter
            </button>
          )}
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={FileText} label="Total Requests" value={requests.length} sub="All time" />
        <SummaryCard icon={Clock} label="Pending" value={requests.filter((r) => r.status === "Pending").length} sub="Awaiting review" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={requests.filter((r) => r.status === "Approved").length} sub="Ready for deployment" />
        <SummaryCard icon={XCircle} label="Declined" value={requests.filter((r) => r.status === "Declined").length} sub="Declined" />
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
                      <button
                        onClick={() => navigate(`/admin/requests/${req.id}`)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        <Eye size={13} />
                        View
                      </button>
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

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100">
          <p className="text-xs text-slate-500">Showing {filteredByTab.length === 0 ? 0 : (currentPage - 1) * 5 + 1}–{Math.min(currentPage * 5, filteredByTab.length)} of {filteredByTab.length} requests</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            {[1, 2, 3].map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium border ${
                  currentPage === page ? "bg-blue-50 border-blue-200 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredByTab.length / 5), p + 1))}
              disabled={currentPage >= Math.ceil(filteredByTab.length / 5)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
