import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  FileText,
  User,
  MapPin,
  X,
  ChevronLeftIcon,
  ChevronRightIcon,
  XCircle,
  Ban,
  ClipboardCheck,
  FileCheck2,
  Send,
  Hourglass,
} from "lucide-react";
import api from "../../services/api";
import LetterAttachment from "../../components/LetterAttachment";
import { AreaPreviewButton } from "../../components/AreaPreviewModal";
import TrashReportForm from "../../components/TrashReportForm";
import TrashReportSummary from "../../components/TrashReportSummary";
import { classTotals } from "../../constants/trashReport";
import { logAudit } from "../../services/auditLog";
import { Card } from "../../components/ui/Card";
import { useMarkRequestRead } from "../../hooks/useUnreadNotifications";
import { REQUEST_STATUS_STYLES, mapRequest, getDeploymentStatus, formatTime12h, toStatusLabel, formatDate } from "../../constants/requests";
import { MergedIntoCard, MergedRequestsCard } from "../../components/MergedRequestPanels";
import { LIVE, useLiveVersion } from "../../hooks/useLiveUpdates";

const AWAITING_DECISION = { "Pending City Admin Approval": "City Admin", "Pending Admin Approval": "CENRO" };

const Field = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right">{value}</span>
  </div>
);

export default function BarangayViewRequest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  useMarkRequestRead(currentUser?.id, id);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [reasonStep, setReasonStep] = useState(null);
  const [showTrashReport, setShowTrashReport] = useState(false);
  const [resending, setResending] = useState(false);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests, LIVE.schedules);
  useEffect(() => {
    let cancelled = false;
    const fetchRequest = async () => {
      try {
        const [res, schedulesData] = await Promise.all([api.requestDetail(id), api.deploymentSchedules()]);
        if (cancelled) return;
        const mapped = mapRequest(res);
        setRequest(mapped);
        // A merged request's cleanup is the main request's, so its schedule is shown.
        const scheduledAs = mapped.mergedInto?.id || mapped.id;
        const sched = (schedulesData || []).find((s) => s.request_id === scheduledAs) || null;
        setSchedule(sched);
      } catch (err) {
        console.error("Failed to fetch request:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRequest();
    return () => { cancelled = true; };
  }, [id, live]);

  const handleResend = async () => {
    const waitingOn = AWAITING_DECISION[request.status];
    if (!confirm(`Resend ${request.id}? The ${waitingOn} will be reminded that it's still waiting for their decision.`)) return;
    setResending(true);
    try {
      const res = await api.resendRequest(request.id);
      setRequest(mapRequest(res));
      logAudit({
        currentUser,
        action: "Request resent",
        module: "Requests",
        details: `${request.id} resent to the ${waitingOn} after 20 days without a decision`,
      });
    } catch (err) {
      console.error("Failed to resend request:", err);
      alert(err.message || "Failed to resend the request. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const openTrashReport = () => setShowTrashReport(true);

  const handleTrashReportFiled = (report, res) => {
    setRequest((prev) => ({
      ...prev,
      status: toStatusLabel(res.status),
      bags: report.bags,
      weightKg: report.weight_kg,
      nonUsableKg: report.non_usable_kg,
      recyclableKg: report.recyclable_kg,
      trashCategories: classTotals(report.trash_items),
      trashItems: report.trash_items,
      siteType: report.site_type,
      peopleCount: report.people_count,
      hoursSpent: report.hours_spent,
      distanceKm: report.distance_km,
      entangledAnimals: report.entangled_animals,
      peculiarItem: report.peculiar_item,
    }));
    logAudit({
      currentUser,
      action: "Trash report filed",
      module: "Requests",
      details: `${request.id} (${request.location?.barangay || "unknown zone"}) trash report filed by Barangay`,
    });
    setShowTrashReport(false);
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Request not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/barangay/requests")}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ChevronLeft size={15} />
          Back to Requests
        </button>
        <div className="flex items-center gap-2.5">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <FileText size={15} />
            Download All
          </button>
          {(request.status === "Approved" || request.status === "Ongoing") && (
            <button
              onClick={openTrashReport}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3.5 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
            >
              <ClipboardCheck size={15} />
              Mark as Finished
            </button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Request Details</h1>
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${REQUEST_STATUS_STYLES[request.status] || 'bg-slate-100 text-slate-600'}`}>
            {request.status}
          </span>
        </div>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          {request.id} &bull; {request.type}
        </p>
      </div>

      {request.status === "Declined" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3.5">
          <XCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">This request was declined</p>
            <p className="text-sm text-red-700 mt-0.5">
              See the reason under Status History below.
            </p>
          </div>
        </div>
      )}

      {request.status === "Parked" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-purple-100 bg-purple-50 px-4 py-3.5">
          <Ban size={18} className="text-purple-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-purple-800">This request is parked</p>
            <p className="text-sm text-purple-700 mt-0.5">
              It's not yet accepted, but it may still be approved later. See the reason under Status History below.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_360px] gap-5 items-start">
        <div className="flex flex-col gap-5">
          <Card title="Request Information">
            <div className="divide-y divide-slate-100">
              <Field label="Request ID" value={request.id} />
              <Field label="Type of Request" value={request.type} />
              <Field label="Status" value={request.status} />
              <Field label="Date Submitted" value={request.dateSubmitted} />
              {request.preferredDate && (
                <Field
                  label="Preferred Date/Time"
                  value={`${new Date(request.preferredDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${request.preferredTime ? ` · ${formatTime12h(request.preferredTime)}` : ""}`}
                />
              )}
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
                <p className="text-slate-500 mt-1.5">{request.requestedBy?.email}</p>
              </div>
            </div>
          </Card>

          <Card title="Location of Concern">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-emerald-600" />
              </div>
              <div className="text-sm">
                {request.location?.name && (
                  <p className="font-semibold text-slate-800">
                    <span className="font-normal text-slate-500">{request.cleanupType === 'unsupported' ? 'Location: ' : 'Landmark: '}</span>{request.location.name}
                  </p>
                )}
                <p className="text-slate-500 mt-0.5">{request.location?.barangay}</p>
                <p className="text-slate-500">{request.location?.municipality}</p>
                <p className="text-slate-500">{request.location?.province}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
              <p className="text-xs text-slate-400 mb-0.5">Cleanup Type</p>
              <p className="font-medium text-slate-800">{request.cleanupType === 'unsupported' ? 'Unsupported' : 'TROID Supported'}</p>
            </div>
            {request.collectionArea && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                <p className="text-xs text-slate-400 mb-0.5">Collection Area</p>
                <AreaPreviewButton area={request.collectionArea} className="font-medium text-slate-800" openPath={`/barangay/areas?area=${encodeURIComponent(request.collectionArea.areaId)}`} />
              </div>
            )}
          </Card>
        </div>

        <Card title="Letter of Request" className="lg:sticky lg:top-5">
          <LetterAttachment request={request} />
        </Card>

        <div className="flex flex-col gap-5">
          {AWAITING_DECISION[request.status] && (
            <Card>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <Hourglass size={16} className="text-amber-600" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-slate-800">Waiting for the {AWAITING_DECISION[request.status]}</p>
                  {request.canResend ? (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      There's been no decision for 20 days. You can resend the request to remind them.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {request.resentAt ? `You resent it on ${formatDate(request.resentAt)}. ` : ""}
                      If there's still no decision by {formatDate(request.resendAvailableAt)}, you can resend it.
                    </p>
                  )}
                </div>
              </div>
              {request.canResend && (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50"
                >
                  <Send size={15} />
                  {resending ? "Resending..." : "Resend Request"}
                </button>
              )}
            </Card>
          )}
          {request.mergedInto && (
            <MergedIntoCard mergedInto={request.mergedInto} mergedAt={request.mergedAt} schedule={schedule} routePrefix="barangay" />
          )}
          <MergedRequestsCard requests={request.mergedRequests} routePrefix="barangay" />
          <Card>
<div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Photo Documentation</h3>
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${getDeploymentStatus(schedule).cls}`}>
                {getDeploymentStatus(schedule).label}
              </span>
            </div>

            {request.status === "Approved" && getDeploymentStatus(schedule).label === "Deployed" && (
              <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 mb-4">
                <svg className="text-emerald-600 mt-0.5 shrink-0 w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Clean-up and waste collection were already conducted.
                  <br />
                  <span className="text-emerald-600">
                    Date Completed: {new Date(schedule.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {formatTime12h(schedule.label)}
                  </span>
                </p>
              </div>
            )}

            {request.photos && request.photos.length > 0 ? (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-100 cursor-zoom-in" onClick={() => setShowPhotoViewer(true)}>
                  <img 
                    src={request.photos[selectedPhotoIndex]?.image_data} 
                    alt={request.photos[selectedPhotoIndex]?.label || `Photo ${selectedPhotoIndex + 1}`}
                    className="w-full h-full object-contain hover:scale-105 transition-transform"
                  />
                  
                  {request.photos.length > 1 && (
                    <>
                      {selectedPhotoIndex > 0 && (
                        <button
                          onClick={() => setSelectedPhotoIndex(prev => prev - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full transition-colors"
                        >
                          <ChevronLeftIcon size={20} />
                        </button>
                      )}
                      
                      {selectedPhotoIndex < request.photos.length - 1 && (
                        <button
                          onClick={() => setSelectedPhotoIndex(prev => prev + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full transition-colors"
                        >
                          <ChevronRightIcon size={20} />
                        </button>
                      )}
                      
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                        {selectedPhotoIndex + 1} / {request.photos.length}
                      </div>
                    </>
                  )}
                </div>
                
                {request.photos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center items-center">
                    {request.photos.map((photo, idx) => (
                      <button
                        key={photo.id || idx}
                        onClick={() => setSelectedPhotoIndex(idx)}
                        className={`relative flex-shrink-0 transition-all duration-200 ${
                          idx === selectedPhotoIndex 
                            ? 'w-20 h-20 opacity-100 scale-105 ring-2 ring-blue-500' 
                            : 'w-16 h-16 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <img 
                          src={photo.image_data || photo} 
                          alt={photo.label || `Photo ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No photos uploaded yet.</p>
            )}
          </Card>

          {Object.keys(request.trashCategories || {}).length > 0 && (
            <Card title="Trash Collection Report">
              <TrashReportSummary report={request} />
            </Card>
          )}

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
                        {step.details && (
                          <button
                            type="button"
                            onClick={() => setReasonStep(step)}
                            className="mt-1 text-xs font-semibold text-red-600 hover:text-red-700 underline underline-offset-2"
                          >
                            View reason
                          </button>
                        )}
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

          {request.status === "Processing" && (
          <Card title="Trash Report Required">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-500">
                The session has been marked finished. File the trash collection report to close out this request.
              </p>
              <button
                onClick={openTrashReport}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <FileCheck2 size={16} />
                Fill Trash Report
              </button>
            </div>
          </Card>
          )}
        </div>
      </div>

      {showTrashReport && (
        <TrashReportForm request={request} onClose={() => setShowTrashReport(false)} onFiled={handleTrashReportFiled} />
      )}

      {reasonStep && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setReasonStep(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{reasonStep.label}</h3>
                <p className="text-xs text-slate-500 mt-1">{reasonStep.date}</p>
              </div>
              <button onClick={() => setReasonStep(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{reasonStep.details}</p>
            </div>
            <div className="px-6 pb-6 flex justify-end">
              <button
                onClick={() => setReasonStep(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showPhotoViewer && request.photos && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={() => setShowPhotoViewer(false)}>
          <div className="relative w-full h-full flex flex-col">
            <div className="flex items-center justify-between p-4 absolute top-0 left-0 right-0 z-10">
              <button
                onClick={() => setShowPhotoViewer(false)}
                className="text-white p-2 rounded-lg hover:bg-white/10"
              >
                <X size={24} />
              </button>
              <span className="text-white text-sm font-medium">
                {selectedPhotoIndex + 1} / {request.photos.length}
              </span>
              <div className="w-10" />
            </div>
            
            <div className="flex-1 flex items-center justify-center relative">
              {selectedPhotoIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPhotoIndex(prev => prev - 1);
                  }}
                  className="fixed left-4 top-1/2 -translate-y-1/2 text-white p-3 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-[110]"
                >
                  <ChevronLeftIcon size={32} />
                </button>
              )}
              
              <img 
                src={request.photos[selectedPhotoIndex]?.image_data || request.photos[selectedPhotoIndex]} 
                alt={request.photos[selectedPhotoIndex]?.label || `Photo ${selectedPhotoIndex + 1}`}
                className="max-h-[70vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              
              {selectedPhotoIndex < request.photos.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPhotoIndex(prev => prev + 1);
                  }}
                  className="fixed right-4 top-1/2 -translate-y-1/2 text-white p-3 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-[110]"
                >
                  <ChevronRightIcon size={32} />
                </button>
              )}
            </div>
            
            <div className="p-4 bg-black/50">
              <div className="flex gap-3 overflow-x-auto justify-center items-center scrollbar-hide">
                {request.photos.map((photo, idx) => (
                  <button
                    key={photo.id || idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPhotoIndex(idx);
                    }}
                    className={`relative flex-shrink-0 transition-all duration-200 ${
                      idx === selectedPhotoIndex 
                        ? 'w-20 h-20 opacity-100 scale-110' 
                        : 'w-16 h-16 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <img 
                      src={photo.image_data} 
                      alt={photo.label || `Photo ${idx + 1}`}
                      className={`w-full h-full object-cover rounded-lg border-2 ${
                        idx === selectedPhotoIndex ? 'border-white' : 'border-transparent'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
