import { useEffect, useState } from "react";
import { FileText, Clock, CheckCircle2, Eye, MapPin, Trash2, Recycle, ArrowLeft, Download, User } from "lucide-react";
import api from "../../services/api";

const BCOL_STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
  Processing: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Segregated: "bg-purple-50 text-purple-700",
};

const BCOL_STATUS_DOT = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Declined: "bg-red-500",
  Processing: "bg-blue-500",
  Completed: "bg-emerald-500",
  Segregated: "bg-purple-500",
};

const mapApiRequest = (r) => ({
  id: r.id,
  type: r.type,
  status: r.status,
  dateSubmitted: r.date_submitted,
  requestedBy: {
    name: r.requested_by_name,
    role: r.requested_by_role,
    barangay: r.requested_by_barangay,
    contact: r.contact,
    email: r.email,
  },
  location: {
    name: r.location_name,
    barangay: r.barangay,
    municipality: r.municipality,
    province: r.province,
  },
  notes: r.notes,
  letter: {
    fileName: r.letter_file_name,
    size: r.letter_size,
  },
  photos: r.photos || [],
  statusHistory: r.status_history || [],
  botId: r.bot_id || null,
  operator: r.operator || null,
  bags: r.bags || 0,
  weightKg: r.weight_kg || 0,
  nonUsableKg: r.non_usable_kg || 0,
  recyclableKg: r.recyclable_kg || 0,
});

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

function DetailModal({ request, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 w-full bg-slate-50">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 mb-4 mt-4">
          <ArrowLeft size={15} />
          Back to Requests
        </button>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Request Details</h1>
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${BCOL_STATUS_STYLES[request.status]}`}>
                {request.status}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1.5 font-medium">
              {request.id} &bull; {request.type}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Download size={15} />
              Download All
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_360px] gap-5 items-start">
          <div className="flex flex-col gap-5">
            <Card title="Request Information">
              <div className="divide-y divide-slate-100">
                <Field label="Request ID" value={request.id} />
                <Field label="Type of Request" value={request.type} />
                <Field label="Status" value={
                  <span className={`inline-flex items-center gap-1.5 font-medium ${
                    request.status === "Pending" ? "text-amber-700" :
                    request.status === "Approved" ? "text-emerald-700" :
                    request.status === "Declined" ? "text-red-700" :
                    "text-slate-700"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      request.status === "Pending" ? "bg-amber-500" :
                      request.status === "Approved" ? "bg-emerald-500" :
                      request.status === "Declined" ? "bg-red-500" :
                      "bg-slate-500"
                    }`} />
                    {request.status}
                  </span>
                } />
                <Field label="Date Submitted" value={request.dateSubmitted} />
              </div>
            </Card>

            <Card title="Requested By">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <User size={16} className="text-blue-600" />
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-800">{request.requestedBy?.name}</p>
                  <p className="text-slate-500 mt-0.5">{request.requestedBy?.role}</p>
                  <p className="text-slate-500">{request.requestedBy?.barangay}</p>
                  <p className="text-slate-500 mt-1.5">Contact No. {request.requestedBy?.contact}</p>
                  <p className="text-slate-500">{request.requestedBy?.email}</p>
                </div>
              </div>
            </Card>

            <Card title="Location of Concern">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-emerald-600" />
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-800">{request.location?.name}</p>
                  <p className="text-slate-500 mt-0.5">{request.location?.barangay}</p>
                  <p className="text-slate-500">{request.location?.municipality}</p>
                  <p className="text-slate-500">{request.location?.province}</p>
                </div>
              </div>
            </Card>

            <Card title="Additional Notes">
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3">{request.notes}</p>
            </Card>
          </div>

          <Card title="Letter of Request" className="lg:sticky lg:top-5">
            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 mb-4">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-blue-600" />
                <div className="text-sm">
                  <p className="font-medium text-slate-800 leading-tight">{request.letter?.fileName}</p>
                  <p className="text-slate-400 text-xs">PDF &bull; {request.letter?.size}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Eye size={13} />
                  Preview
                </button>
                <button className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Download size={13} />
                  Download
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-100 p-6 min-h-[560px] flex flex-col">
              <div className="bg-white rounded shadow-sm p-8 flex-1 text-sm text-slate-700 leading-relaxed">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full border-2 border-blue-800 flex items-center justify-center text-[9px] text-center text-blue-800 font-semibold leading-tight shrink-0">
                    SEAL
                  </div>
                  <div className="text-xs text-slate-500 leading-snug">
                    Republic of the Philippines
                    <br />
                    Province of La Union
                    <br />
                    City of San Fernando
                    <br />
                    <span className="font-bold text-slate-800 text-sm">{request.location?.barangay?.toUpperCase()}</span>
                  </div>
                </div>
                <p className="text-right text-xs text-slate-500 mb-4">{request.dateSubmitted}</p>
                <p className="mb-3 text-xs text-slate-600">
                  The Community Environment and
                  <br />
                  Natural Resources Office (CENRO)
                  <br />
                  San Fernando, La Union
                </p>
                <p className="font-semibold text-slate-800 mb-3 text-xs">Subject: Request for Assistance – {request.type}</p>
                <p className="mb-3 text-xs">Dear Sir/Madam,</p>
                <p className="mb-3 text-xs">{request.notes}</p>
                <p className="mb-6 text-xs">Thank you very much for your immediate attention and support.</p>
                <p className="text-xs">Respectfully yours,</p>
                <p className="font-semibold text-slate-800 mt-6 text-xs">{request.requestedBy?.name}</p>
                <p className="text-xs text-slate-500">
                  {request.requestedBy?.role}
                  <br />
                  {request.requestedBy?.barangay}
                </p>
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Collection Data</h3>
                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  request.status === "Approved" || request.status === "Completed" || request.status === "Segregated" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {request.status}
                </span>
              </div>

              {request.bags && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Total Bags</p>
                    <p className="text-xl font-bold text-slate-900">{request.bags}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Total Weight</p>
                    <p className="text-xl font-bold text-slate-900">{request.weightKg} kg</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3 border border-red-100">
                    <p className="text-xs text-red-600 mb-1 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Non-Usable</p>
                    <p className="text-xl font-bold text-red-700">{request.nonUsableKg} kg</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                    <p className="text-xs text-emerald-600 mb-1 flex items-center gap-1"><Recycle className="w-3 h-3" /> Recyclable</p>
                    <p className="text-xl font-bold text-emerald-700">{request.recyclableKg} kg</p>
                  </div>
                </div>
              )}

              {request.botId && (
                <div className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500 mb-1">Assigned Bot</p>
                  <p className="text-lg font-bold text-slate-900">{request.botId}</p>
                  <p className="text-xs text-slate-500">Operator: {request.operator}</p>
                </div>
              )}
            </Card>

            <Card title="Status History">
              <div className="relative pl-5">
                <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-slate-200" />
                <div className="flex flex-col gap-5">
                  {(request.statusHistory || []).map((step, i) => (
                    <div key={i} className="relative">
                      <span
                        className={`absolute -left-5 top-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-2 ${
                          step.state === "current" ? "bg-emerald-500 ring-emerald-100" : "bg-blue-500 ring-blue-100"
                        }`}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{step.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{step.date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-slate-600">{step.actor}</p>
                          <p className="text-[11px] text-slate-400">{step.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BarangayRequests() {
  const [activeTab, setActiveTab] = useState("All");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await api.requests();
        const mapped = all
          .filter((r) => (r.requested_by_barangay || "").toLowerCase().includes("carlatan"))
          .map(mapApiRequest);
        if (!cancelled) setRequests(mapped);
      } catch (err) {
        console.error("Failed to load requests", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const tabs = ["All", "Pending", "Approved", "Deployed", "Completed"];

  const filtered = requests.filter((r) => {
    if (activeTab === "All") return true;
    if (activeTab === "Deployed") return r.status === "Approved" && r.deploymentDate;
    if (activeTab === "Completed") return r.status === "Completed" || r.status === "Segregated";
    return r.status === activeTab;
  }).filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.id.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q);
  });

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
        <SummaryCard icon={Clock} label="Pending" value={requests.filter((r) => r.status === "Pending").length} sub="Awaiting approval" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={requests.filter((r) => r.status === "Approved").length} sub="Ready for deployment" />
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
               {filtered.map((req) => (
                 <tr key={req.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                   <td className="px-5 py-3.5 font-semibold text-slate-800">{req.id}</td>
                   <td className="px-5 py-3.5 text-slate-600">{req.type}</td>
                   <td className="px-5 py-3.5 text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{req.location?.barangay}</td>
                   <td className="px-5 py-3.5 text-slate-500">
                     {req.dateSubmitted}
                   </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${BCOL_STATUS_STYLES[req.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${BCOL_STATUS_DOT[req.status]}`} />
                      {req.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <Eye size={13} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
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

      {selectedRequest && (
        <DetailModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
      )}
      </>
      )}
    </div>
  );
}
