import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  FileText,
  Download,
  Trash2,
  User,
  MapPin,
  CheckCircle2,
  Eye,
  X,
  Ban,
  RotateCcw,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  ShieldCheck,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import api from "../../services/api";
import { logAudit } from "../../services/auditLog";
import { Card } from "../../components/ui/Card";
import NotificationBell from "../../components/NotificationBell";
import { REQUEST_STATUS_STYLES, TRASH_CATEGORIES, mapRequest, getDeploymentStatus, formatTime12h } from "../../constants/requests";

function toStatusLabel(rawStatus) {
  return (rawStatus || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function emptyCategoryValues() {
  return TRASH_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: "" }), {});
}

function stripLeadingZero(raw) {
  return raw.replace(/^0+(?=\d)/, "");
}

const Field = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right">{value}</span>
  </div>
);

function PhotoViewer({ photos, currentIndex, onClose, onNavigate }) {
  if (!photos || photos.length === 0) return null;
  
  const handlePrev = () => {
    onNavigate(currentIndex > 0 ? currentIndex - 1 : photos.length - 1);
  };
  
  const handleNext = () => {
    onNavigate(currentIndex < photos.length - 1 ? currentIndex + 1 : 0);
  };
  
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="fixed top-4 right-4 text-white hover:text-gray-300 transition-colors z-[110]"
        >
          <X size={24} />
        </button>
        
        {photos.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="fixed left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors bg-black/30 p-2 rounded-full z-[110]"
            >
              <ChevronLeftIcon size={24} />
            </button>
            <button
              onClick={handleNext}
              className="fixed right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors bg-black/30 p-2 rounded-full z-[110]"
            >
              <ChevronRightIcon size={24} />
            </button>
          </>
        )}
        
        <img
          src={photos[currentIndex]?.image_data}
          alt={photos[currentIndex]?.label || `Photo ${currentIndex + 1}`}
          className="max-w-full max-h-[80vh] object-contain"
        />
        
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full">
          {currentIndex + 1} / {photos.length}
        </div>
      </div>
    </div>
  );
}

export default function ViewRequest({ id: propId, onClose }) {
  const { currentUser } = useOutletContext() || {};
  const { id: routeId } = useParams();
  const id = propId || routeId;
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [reasonStep, setReasonStep] = useState(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [markingCompleted, setMarkingCompleted] = useState(false);
  const [showTrashReport, setShowTrashReport] = useState(false);
  const [trashCategoryValues, setTrashCategoryValues] = useState(emptyCategoryValues);
  const [trashBags, setTrashBags] = useState("");
  const [trashWeightKg, setTrashWeightKg] = useState("");
  const [trashNonUsableKg, setTrashNonUsableKg] = useState("");
  const [trashRecyclableKg, setTrashRecyclableKg] = useState("");
  const [trashNotes, setTrashNotes] = useState("");
  const [submittingTrashReport, setSubmittingTrashReport] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [loadingBotDetections, setLoadingBotDetections] = useState(false);
  const [verifiedCategoryValues, setVerifiedCategoryValues] = useState(emptyCategoryValues);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchRequest = async () => {
      try {
        const [res, schedulesData] = await Promise.all([api.requestDetail(id), api.deploymentSchedules()]);
        if (cancelled) return;
        const mapped = mapRequest(res);
        setRequest(mapped);
        const sched = (schedulesData || []).find((s) => s.request_id === mapped.id) || null;
        setSchedule(sched);
      } catch (err) {
        console.error("Failed to fetch request:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRequest();
    return () => { cancelled = true; };
  }, [id]);

  const handleArchive = async () => {
    if (!request) return;
    setArchiving(true);
    try {
      await api.deleteRequest(request.id);
      navigate("/admin/requests");
    } catch (err) {
      console.error("Failed to archive request:", err);
      setArchiving(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    const reason = declineReason.trim();
    setConfirmSubmitting(true);
    try {
      if (action === 'approve') {
        await api.adminApproveRequest(request.id);
        setRequest(prev => ({ ...prev, status: 'Approved' }));
        logAudit({
          currentUser,
          action: 'Request approved',
          module: 'Requests',
          details: `${request.id} (${request.location?.barangay || 'unknown zone'}) approved`,
        });
      } else if (action === 'park') {
        await api.parkRequest(request.id, { reason });
        setRequest(prev => ({ ...prev, status: 'Parked', declineReason: reason }));
        logAudit({
          currentUser,
          action: 'Request parked',
          module: 'Requests',
          details: `${request.id} (${request.location?.barangay || 'unknown zone'}) parked: ${reason}`,
          status: 'warning',
        });
      } else {
        const res = await api.unparkRequest(request.id);
        const restoredStatus = (res.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        setRequest(prev => ({ ...prev, status: restoredStatus, declineReason: '' }));
        logAudit({
          currentUser,
          action: 'Request unparked',
          module: 'Requests',
          details: `${request.id} (${request.location?.barangay || 'unknown zone'}) returned to review`,
        });
      }
      setConfirmAction(null);
      setDeclineReason("");
    } catch (err) {
      console.error(`Failed to ${action} request:`, err);
      alert(`Failed to ${action} request. Please try again.`);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const openReschedule = () => {
    setRescheduleDate(request.preferredDate || "");
    setRescheduleTime(request.preferredTime || "");
    setRescheduleReason("");
    setShowReschedule(true);
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) return;
    setRescheduling(true);
    try {
      await api.rescheduleRequest(request.id, {
        preferred_date: rescheduleDate,
        preferred_time: rescheduleTime,
        reason: rescheduleReason.trim(),
      });
      setRequest((prev) => ({ ...prev, preferredDate: rescheduleDate, preferredTime: rescheduleTime }));
      logAudit({
        currentUser,
        action: "Request rescheduled",
        module: "Requests",
        details: `${request.id} (${request.location?.barangay || "unknown zone"}) rescheduled to ${rescheduleDate}${rescheduleTime ? ` ${rescheduleTime}` : ""}`,
      });
      setShowReschedule(false);
    } catch (err) {
      console.error("Failed to reschedule request:", err);
      alert("Failed to reschedule request. Please try again.");
    } finally {
      setRescheduling(false);
    }
  };

  const handleMarkSessionCompleted = async () => {
    setMarkingCompleted(true);
    try {
      await api.markSessionCompleted(request.id);
      setRequest((prev) => ({ ...prev, status: "Processing" }));
      logAudit({
        currentUser,
        action: "Session marked completed",
        module: "Requests",
        details: `${request.id} (${request.location?.barangay || "unknown zone"}) marked as session completed`,
      });
    } catch (err) {
      console.error("Failed to mark session completed:", err);
      alert("Failed to mark session completed. Please try again.");
    } finally {
      setMarkingCompleted(false);
    }
  };

  const openTrashReport = () => {
    setTrashCategoryValues(emptyCategoryValues());
    setTrashBags("");
    setTrashWeightKg("");
    setTrashNonUsableKg("");
    setTrashRecyclableKg("");
    setTrashNotes("");
    setShowTrashReport(true);
  };

  const handleSubmitTrashReport = async () => {
    const trashCategoriesPayload = Object.fromEntries(
      Object.entries(trashCategoryValues).map(([cat, v]) => [cat, Number(v)])
    );
    setSubmittingTrashReport(true);
    try {
      const res = await api.submitTrashReport(request.id, {
        bags: Number(trashBags),
        weight_kg: Number(trashWeightKg),
        non_usable_kg: Number(trashNonUsableKg),
        recyclable_kg: Number(trashRecyclableKg),
        trash_categories: trashCategoriesPayload,
        notes: trashNotes.trim(),
      });
      const newStatus = toStatusLabel(res.status);
      setRequest((prev) => ({
        ...prev,
        status: newStatus,
        bags: Number(trashBags),
        weightKg: Number(trashWeightKg),
        nonUsableKg: Number(trashNonUsableKg),
        recyclableKg: Number(trashRecyclableKg),
        trashCategories: trashCategoriesPayload,
      }));
      logAudit({
        currentUser,
        action: "Trash report filed",
        module: "Requests",
        details: `${request.id} (${request.location?.barangay || "unknown zone"}) trash report filed by CENRO`,
      });
      setShowTrashReport(false);
    } catch (err) {
      console.error("Failed to submit trash report:", err);
      alert("Failed to submit trash report. Please try again.");
    } finally {
      setSubmittingTrashReport(false);
    }
  };

  const openVerification = async () => {
    setVerificationNotes("");
    setShowVerification(true);
    setLoadingBotDetections(true);
    try {
      const res = await api.botDetections(request.id);
      const detected = res.categories || {};
      setVerifiedCategoryValues({
        ...emptyCategoryValues(),
        ...detected,
      });
    } catch (err) {
      console.error("Failed to fetch bot detections:", err);
      setVerifiedCategoryValues(emptyCategoryValues());
    } finally {
      setLoadingBotDetections(false);
    }
  };

  const handleSubmitVerification = async () => {
    const verifiedCategoriesPayload = Object.fromEntries(
      Object.entries(verifiedCategoryValues).map(([cat, v]) => [cat, Number(v)])
    );
    setSubmittingVerification(true);
    try {
      await api.submitVerification(request.id, {
        verified_categories: verifiedCategoriesPayload,
        verification_notes: verificationNotes.trim(),
      });
      setRequest((prev) => ({
        ...prev,
        status: "Verified",
        verifiedCategories: verifiedCategoriesPayload,
        verificationNotes: verificationNotes.trim(),
      }));
      logAudit({
        currentUser,
        action: "Detection verified",
        module: "Requests",
        details: `${request.id} (${request.location?.barangay || "unknown zone"}) bot detection verified by CENRO`,
      });
      setShowVerification(false);
    } catch (err) {
      console.error("Failed to submit verification:", err);
      alert("Failed to submit verification. Please try again.");
    } finally {
      setSubmittingVerification(false);
    }
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
    <div className="max-w-[1600px] mx-auto animate-fade-in pb-12">
      <div className="mb-4 flex items-center justify-between">
        <button
          data-hide-in-schedule-overview
          onClick={() => (onClose ? onClose() : navigate(-1))}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ChevronLeft size={15} />
          Back to Requests
        </button>
        <div className="flex items-center gap-2.5">
          <NotificationBell currentUser={currentUser} userType="admin" />
          <button data-hide-in-schedule-overview className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <FileText size={15} />
            Download All
          </button>
          {(request.status === "Pending Admin Approval" || request.status === "Approved") && (
            <button
              onClick={openReschedule}
              className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <CalendarClock size={15} />
              Reschedule
            </button>
          )}
          {request.status === "Approved" && (
            <button
              onClick={handleMarkSessionCompleted}
              disabled={markingCompleted}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3.5 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
            >
              <ClipboardCheck size={15} />
              {markingCompleted ? "Marking..." : "Mark Session Completed"}
            </button>
          )}
          <button
            data-hide-in-schedule-overview
            onClick={handleArchive}
            disabled={archiving}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={15} />
            {archiving ? "Archiving..." : "Archive"}
          </button>
          {onClose && (
            <button
              data-hide-in-schedule-overview
              onClick={onClose}
              className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Close"
            >
              <X size={16} />
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
            {request.collectionArea && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                <p className="text-xs text-slate-400 mb-0.5">Collection Area</p>
                <p className="font-medium text-slate-800">{request.collectionArea.name}</p>
              </div>
            )}
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
            <div className="bg-white rounded shadow-sm p-8 flex-1 text-sm text-slate-700 leading-relaxed break-words">
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
              <h3 className="text-sm font-semibold text-slate-800">Photo Documentation</h3>
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${getDeploymentStatus(schedule).cls}`}>
                {getDeploymentStatus(schedule).label}
              </span>
            </div>

            {request.status === "Approved" && getDeploymentStatus(schedule).label === "Deployed" && (
              <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 mb-4">
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
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
                      <div
                        key={photo.id || idx}
                        className="relative group flex-shrink-0"
                      >
                        <button
                          onClick={() => setSelectedPhotoIndex(idx)}
                          className={`relative transition-all duration-200 ${
                            idx === selectedPhotoIndex 
                              ? 'w-20 h-20 opacity-100 scale-105 ring-2 ring-blue-500' 
                              : 'w-16 h-16 opacity-60 hover:opacity-80'
                          }`}
                        >
                          <img 
                            src={photo.image_data} 
                            alt={photo.label || `Photo ${idx + 1}`}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </button>
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          view photo
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No photos uploaded yet.</p>
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
          
          {request.status === "Pending Admin Approval" && (
          <Card title="Decision">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-500">
                Your decision will be recorded and the request status will update immediately.
              </p>
              <div className="flex items-center justify-evenly gap-3">
                <button
                  onClick={() => setConfirmAction('park')}
                  className="flex items-center gap-2 rounded-lg border-2 border-purple-200 px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 transition-colors"
                >
                  <Ban size={16} />
                  Park
                </button>
                <button
                  onClick={() => setConfirmAction('approve')}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle2 size={16} />
                  Approve
                </button>
              </div>
            </div>
          </Card>
          )}

          {request.status === "Parked" && (
          <Card title="Parked">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-500">
                This request is parked and not yet accepted. Unpark it to return it to review, where it can still be approved later.
              </p>
              {request.declineReason && (
                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                  {request.declineReason}
                </p>
              )}
              <button
                onClick={() => setConfirmAction('unpark')}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153eb8] transition-colors"
              >
                <RotateCcw size={16} />
                Unpark
              </button>
            </div>
          </Card>
          )}

          {request.status === "Processing" && (
          <Card title="Trash Report Required">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-500">
                The session has been marked completed. File the trash collection report before this request can be closed out.
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

          {request.status === "Pending Verification" && (
          <Card title="Verify Bot Detection">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-500">
                This was a TROID-supported cleanup. Review the bot's detected trash categories against your trash report and correct any inaccuracies.
              </p>
              <button
                onClick={openVerification}
                className="flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
              >
                <ShieldCheck size={16} />
                Review & Verify
              </button>
            </div>
          </Card>
          )}
        </div>
      </div>

      {confirmAction && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {confirmAction === 'approve' ? 'Approve Request' : confirmAction === 'park' ? 'Park Request' : 'Unpark Request'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {confirmAction === 'approve'
                  ? 'This request will be marked approved and ready for deployment.'
                  : confirmAction === 'park'
                    ? 'This request will be parked as not yet accepted. It can still be approved later and the barangay will be notified with your remarks.'
                    : 'This request will be returned to review, where it can be approved or parked again.'}
              </p>
            </div>
            {confirmAction === 'park' && (
              <div className="px-6 pt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Reason for parking <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                  disabled={confirmSubmitting}
                  placeholder="Explain why this request is being parked..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )}
            <div className="p-6 flex gap-3">
              <button
                onClick={() => { setConfirmAction(null); setDeclineReason(""); }}
                disabled={confirmSubmitting}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                disabled={confirmSubmitting || (confirmAction === 'park' && !declineReason.trim())}
                onClick={handleConfirmAction}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : confirmAction === 'park' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-[#1b4de4] hover:bg-[#153eb8]'}`}
              >
                {confirmSubmitting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {confirmSubmitting
                  ? (confirmAction === 'approve' ? 'Approving...' : confirmAction === 'park' ? 'Parking...' : 'Unparking...')
                  : (confirmAction === 'approve' ? 'Approve' : confirmAction === 'park' ? 'Park' : 'Unpark')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showReschedule && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Reschedule Request</h3>
              <p className="text-xs text-slate-500 mt-1">
                Propose a new date/time for this cleanup. The requester will be notified.
              </p>
            </div>
            <div className="px-6 pt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  New date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">New time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Reason (optional)</label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this request is being rescheduled..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div className="p-6 flex gap-3">
              <button
                onClick={() => setShowReschedule(false)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!rescheduleDate || rescheduling}
                onClick={handleReschedule}
                className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rescheduling ? "Saving..." : "Reschedule"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showTrashReport && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitTrashReport();
            }}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Trash Collection Report</h3>
              <p className="text-xs text-slate-500 mt-1">
                {schedule?.cleanup_type === "troid_supported"
                  ? "This cleanup is TROID-supported — the counts you enter here stand in as TROID's detected output until a live detection feed is connected. You'll review and correct them in the verification step next."
                  : "This cleanup is unsupported by TROID — record what was actually collected manually."}
              </p>
            </div>
            <div className="px-6 pt-4 space-y-4 overflow-y-auto">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-500">Trash by category</p>
                <div className="grid grid-cols-2 gap-3">
                  {TRASH_CATEGORIES.map((cat) => (
                    <div key={cat}>
                      <label className="mb-1 block text-[11px] text-slate-500">{cat}</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={trashCategoryValues[cat]}
                        onChange={(e) => {
                          const raw = stripLeadingZero(e.target.value);
                          setTrashCategoryValues((prev) => ({ ...prev, [cat]: raw }));
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Total Bags</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={trashBags}
                    onChange={(e) => setTrashBags(stripLeadingZero(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Total Weight (kg)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={trashWeightKg}
                    onChange={(e) => setTrashWeightKg(stripLeadingZero(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Non-usable (kg)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={trashNonUsableKg}
                    onChange={(e) => setTrashNonUsableKg(stripLeadingZero(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Recyclable (kg)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={trashRecyclableKg}
                    onChange={(e) => setTrashRecyclableKg(stripLeadingZero(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Notes (optional)</label>
                <textarea
                  value={trashNotes}
                  onChange={(e) => setTrashNotes(e.target.value)}
                  rows={3}
                  placeholder="Any additional observations..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
            <div className="p-6 flex gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTrashReport(false)}
                disabled={submittingTrashReport}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingTrashReport}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {submittingTrashReport ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {showVerification && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitVerification();
            }}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Verify Bot Detection</h3>
              <p className="text-xs text-slate-500 mt-1">
                Pre-filled with what the bot detected. Correct any values that don't match your trash report — corrections help improve the detection model.
              </p>
            </div>
            <div className="px-6 pt-4 space-y-4 overflow-y-auto">
              {loadingBotDetections ? (
                <p className="text-sm text-slate-400 text-center py-6">Loading bot detections...</p>
              ) : (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">Detected trash by category</p>
                  <div className="grid grid-cols-2 gap-3">
                    {TRASH_CATEGORIES.map((cat) => (
                      <div key={cat}>
                        <label className="mb-1 block text-[11px] text-slate-500">{cat}</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={verifiedCategoryValues[cat]}
                          onChange={(e) => {
                            const raw = stripLeadingZero(e.target.value);
                            setVerifiedCategoryValues((prev) => ({ ...prev, [cat]: raw }));
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Verification Notes (optional)</label>
                <textarea
                  value={verificationNotes}
                  onChange={(e) => setVerificationNotes(e.target.value)}
                  rows={3}
                  placeholder="Explain any corrections made..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>
            <div className="p-6 flex gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowVerification(false)}
                disabled={submittingVerification}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingVerification || loadingBotDetections}
                className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {submittingVerification ? "Submitting..." : "Submit Verification"}
              </button>
            </div>
          </form>
        </div>,
        document.body
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
        <PhotoViewer
          photos={request.photos}
          currentIndex={selectedPhotoIndex}
          onClose={() => setShowPhotoViewer(false)}
          onNavigate={setSelectedPhotoIndex}
        />,
        document.body
      )}
    </div>
  );
}
