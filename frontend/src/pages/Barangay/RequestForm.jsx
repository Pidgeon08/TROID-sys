import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  User,
  Phone,
  Camera,
  Send,
  FileText,
  Calendar,
  Truck,
  ChevronDown,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import api from "../../services/api";

const REQUEST_TYPES = ["Cleanup", "Maintenance", "Inspection"];
const TIME_SLOTS = ["06:00 - 10:00", "08:00 - 12:00", "14:00 - 18:00"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SlotCell({ label, status, onClick, disabled }) {
  const base = "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors border";
  const color = status === "available"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100"
    : status === "full"
      ? "border-red-200 bg-red-50 text-red-700 cursor-not-allowed opacity-80"
      : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || status !== "available"}
      className={`${base} ${color}`}
      title={status === "full" ? "No slot available for this time" : status === "available" ? "Available" : "Pick a date first"}
    >
      <span className={`h-2 w-2 rounded-full ${status === "available" ? "bg-emerald-500" : status === "full" ? "bg-red-500" : "bg-slate-300"}`} />
      {label}
    </button>
  );
}

function RequestForm({ currentUser }) {
  const navigate = useNavigate();
  const barangayName = currentUser?.name || "Barangay";
  const barangayLocation = currentUser?.location || "";

  const [formData, setFormData] = useState({
    location: "",
    date: "",
    requestType: "Cleanup",
    notes: "",
  });
  const [preview, setPreview] = useState(null);
  const [photoBase64List, setPhotoBase64List] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [showFullLetter, setShowFullLetter] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [schedules, setSchedules] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const LETTER_TRUNCATE_LENGTH = 200;

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    api.deploymentSchedules().then((data) => {
      if (cancelled) return;
      setSchedules(Array.isArray(data) ? data : []);
      setLoadingSlots(false);
    }).catch(() => {
      if (!cancelled) setLoadingSlots(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getSlotStatus = (dateStr, slot) => {
    if (!dateStr) return "unavailable";
    const dt = new Date(dateStr);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const selected = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    if (selected < start) return "past";
    const dayKey = DAYS[dt.getDay()];
    const isFull = schedules.some(
      (s) => s.day === dayKey && s.status === "scheduled" && s.label === slot
    );
    return isFull ? "full" : "available";
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const readers = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((results) => {
      const newPhotos = results.map((src, index) => ({
        id: Date.now() + index,
        src: src,
        label: files[index].name,
        date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        photo_id: index + 1,
        image_data: src,
      }));
      setPhotoBase64List((prev) => [...prev, ...newPhotos]);
      setPreview(newPhotos[0].src);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.location || !formData.date) {
      alert("Please fill in all required fields.");
      return;
    }
    setShowOverview(true);
  };

  const confirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const date = new Date();
      const timestamp = date.getTime().toString().slice(-6);
      const photosPayload = photoBase64List.map((photo, index) => ({
        label: photo.label || `Area photo ${index + 1}`,
        date: photo.date || new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        photo_id: index + 1,
        image_data: photo.src,
      }));
      const payload = {
        request_id: `REQ-${timestamp}`,
        request_type: formData.requestType,
        requested_by_name: barangayName,
        requested_by_role: "barangay",
        requested_by_barangay: barangayName,
        email: `${barangayName.toLowerCase().replace(/\s+/g, '')}@barangay.gov.ph`,
        location_name: formData.location,
        barangay: barangayName,
        municipality: "",
        province: "",
        notes: formData.notes,
        photos: photosPayload,
      };
      await api.createRequest(payload);
      navigate("/barangay/requests");
    } catch (err) {
      console.error("Failed to submit request:", err);
      alert("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
      setShowOverview(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Submit Cleanup Request</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Request TROID bot deployment for cleanup operations in your area
          </p>
        </div>
        <button
          onClick={() => navigate("/barangay/requests")}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Requests
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Location / Address</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder={barangayLocation ? `Enter specific location (e.g., ${barangayLocation})` : "Enter specific location (e.g., nearby creek or riverbank)"}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Request Type</label>
              <select
                name="requestType"
                value={formData.requestType}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              >
                {REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Your Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={barangayName}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Preferred Date</label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>
            </div>

            {formData.date && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Available Time Slots</label>
                <p className="text-[11px] text-slate-400 mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                  <span>Available</span>
                  <span className="ml-2 h-2 w-2 rounded-full bg-red-500 inline-block" />
                  <span>Full</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <SlotCell
                      key={slot}
                      label={slot}
                      status={getSlotStatus(formData.date, slot)}
                      onClick={() => {}}
                      disabled={true}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Letter Contents</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Enter the letter content for the request..."
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Photo of Area (Optional)</label>
              <div className="flex flex-col gap-3">
                <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-600 hover:bg-slate-50 w-fit">
                  <Camera size={16} />
                  Upload Photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                {photoBase64List.length > 0 && (
                  <div className="grid grid-cols-3 gap-2.5">
                    {photoBase64List.slice(0, 3).map((photo) => (
                      <div key={photo.id} className="aspect-square rounded-lg overflow-hidden border border-slate-200 relative group">
                        <img src={photo.src} alt={photo.label} className="w-full h-full object-cover" />
                        <button
                          onClick={() => {
                            setPhotoBase64List((prev) => prev.filter((p) => p.id !== photo.id));
                          }}
                          className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photoBase64List.length === 0 && (
                  <p className="text-xs text-slate-400">No photos uploaded yet.</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1b4de4] py-3 px-4 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50"
            >
              <Send size={16} />
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <h2 className="text-[17px] font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-slate-500" />
              How It Works
            </h2>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <span className="text-slate-600">Submit a cleanup request for your barangay area</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <span className="text-slate-600">The Mayor's Office reviews and approves or declines your request</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <span className="text-slate-600">CENRO schedules deployment and assigns TROID bots and operators</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
                <span className="text-slate-600">TROID bots collect trash from your area and gather data</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">5</span>
                <span className="text-slate-600">Barangay performs segregation by bag, weight, and trash type</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">6</span>
                <span className="text-slate-600">Non-usable waste goes to landfill; recyclables go to recycling center</span>
              </li>
            </ol>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <h2 className="text-[17px] font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              Contact Info
            </h2>
            <div className="space-y-2.5 text-sm">
              <p className="text-slate-600">
                <span className="text-slate-400">Barangay:</span> {barangayName}
              </p>
              <p className="text-slate-600">
                <span className="text-slate-400">Hotline:</span> (072) 123-4567
              </p>
              <p className="text-slate-600">
                <span className="text-slate-400">Email:</span> {barangayName.toLowerCase().replace(/\s+/g, '')}@barangay.gov.ph
              </p>
            </div>
          </div>
        </div>
      </div>

      {showOverview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Review Request Overview</h3>
                <button onClick={() => setShowOverview(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Please review the details below before submitting.</p>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Location</span>
                <span className="font-medium text-slate-800 text-right">{formData.location}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Request Type</span>
                <span className="font-medium text-slate-800 text-right">{formData.requestType}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Barangay</span>
                <span className="font-medium text-slate-800 text-right">{barangayName}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Preferred Date</span>
                <span className="font-medium text-slate-800 text-right">{formData.date || '—'}</span>
              </div>
              {formData.date && (
                <div className="py-2 text-sm border-b border-slate-50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-500">Deployment Slots</span>
                    <span className="text-[11px] text-slate-400">on {formData.date}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TIME_SLOTS.map((slot) => {
                      const status = getSlotStatus(formData.date, slot);
                      return (
                        <span
                          key={slot}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold border ${
                            status === "available"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${status === "available" ? "bg-emerald-500" : "bg-red-500"}`} />
                          {slot}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="py-2 text-sm flex justify-between items-center">
                <span className="text-slate-500 block">Photos</span>
                {photoBase64List.length > 0 ? (
                  <div
                    className="grid grid-cols-2 grid-rows-2 gap-1 rounded-lg overflow-hidden border border-slate-200 cursor-pointer aspect-square w-32"
                    onClick={() => {
                      setSelectedPhotoIndex(0);
                      setViewPhoto(true);
                    }}
                  >
                    {photoBase64List.slice(0, 3).map((photo) => (
                      <div
                        key={photo.id}
                        className={`relative bg-slate-100 overflow-hidden ${
                          photoBase64List.length > 2 && photoBase64List.indexOf(photo) === 0
                            ? 'col-span-2 row-span-1'
                            : ''
                        }`}
                      >
                        <img
                          src={photo.src}
                          alt={photo.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs">No photos uploaded</p>
                )}
              </div>
              <div className="py-2 text-sm">
                <span className="text-slate-500 block mb-1">Letter Contents</span>
                {formData.notes ? (
                  <>
                    <p className="text-slate-800 bg-slate-50 rounded-lg p-3 text-xs leading-relaxed">
                      {!showFullLetter && formData.notes.length > LETTER_TRUNCATE_LENGTH
                        ? `${formData.notes.slice(0, LETTER_TRUNCATE_LENGTH)}...`
                        : formData.notes}
                    </p>
                    {formData.notes.length > LETTER_TRUNCATE_LENGTH && (
                      <button
                        onClick={() => setShowFullLetter(!showFullLetter)}
                        className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {showFullLetter ? 'View less' : `View more (${formData.notes.length - LETTER_TRUNCATE_LENGTH} characters remaining)`}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-slate-400 text-xs">—</p>
                )}
              </div>
            </div>

            {viewPhoto && photoBase64List.length > 0 && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80" onClick={() => setViewPhoto(false)}>
                <div className="relative w-full h-full flex flex-col">
                  <div className="flex items-center justify-between p-4 absolute top-0 left-0 right-0 z-10">
                    <button
                      onClick={() => setViewPhoto(false)}
                      className="text-white p-2 rounded-lg hover:bg-white/10"
                    >
                      <X size={24} />
                    </button>
                    <span className="text-white text-sm font-medium">
                      {selectedPhotoIndex + 1} / {photoBase64List.length}
                    </span>
                    <div className="w-10" />
                  </div>

                  <div className="flex-1 flex items-center justify-center relative">
                    {selectedPhotoIndex > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPhotoIndex((prev) => prev - 1);
                        }}
                        className="absolute left-4 text-white p-3 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
                      >
                        <ChevronLeft size={32} />
                      </button>
                    )}

                    <img
                      src={photoBase64List[selectedPhotoIndex].src}
                      alt={photoBase64List[selectedPhotoIndex].label}
                      className="max-h-[70vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {selectedPhotoIndex < photoBase64List.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPhotoIndex((prev) => prev + 1);
                        }}
                        className="absolute right-4 text-white p-3 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
                      >
                        <ChevronRight size={32} />
                      </button>
                    )}
                  </div>

                  <div className="p-4 bg-black/50">
                    <div className="flex gap-3 overflow-x-auto justify-center items-center scrollbar-hide">
                      {photoBase64List.map((photo, idx) => (
                        <button
                          key={photo.id}
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
                            src={photo.src}
                            alt={photo.label}
                            className={`w-full h-full object-cover rounded-lg border-2 ${
                              idx === selectedPhotoIndex ? 'border-white' : 'border-transparent'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="p-6 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowOverview(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubmit}
                disabled={isSubmitting}
                className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8] disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestForm;
