import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  FileText,
  Download,
  User,
  MapPin,
  Eye,
  X,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import api from "../../services/api";
import { Card } from "../../components/ui/Card";
import { REQUEST_STATUS_STYLES, mapRequest, getDeploymentStatus } from "../../constants/requests";

const Field = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right">{value}</span>
  </div>
);

export default function BarangayViewRequest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [schedule, setSchedule] = useState(null);

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
      <div className="mb-6 flex items-center justify-between">
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
        </div>
      </div>

      <div className="mb-6">
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
              <h3 className="text-sm font-semibold text-slate-800">Photo Documentation</h3>
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${getDeploymentStatus(schedule).cls}`}>
                {getDeploymentStatus(schedule).label}
              </span>
            </div>

            {request.status === "Approved" && (
              <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 mb-4">
                <svg className="text-emerald-600 mt-0.5 shrink-0" size={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Clean-up and waste collection were already conducted.
                  <br />
                  <span className="text-emerald-600">Date Completed: {request.dateSubmitted}</span>
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
