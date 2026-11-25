import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  User,
  Camera,
  Send,
  Calendar,
  Clock,
  Truck,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Bot,
  Users,
  Map as MapIcon,
} from "lucide-react";
import api from "../../services/api";
import { BARANGAYS } from "../../utils/barangayBoundaries";
import { formatFileSize, formatTime12h } from "../../constants/requests";
import LetterDropzone from "../../components/LetterDropzone";
import AreaPickerModal from "../../components/AreaPickerModal";
import DocumentPreview from "../../components/DocumentPreview";
import { base64ToBlob, letterKind } from "../../utils/letters";
import { LIVE, useLiveRefresh } from "../../hooks/useLiveUpdates";
import { MonthAvailability, WeekTimetable } from "../../components/BotTimetable";
import { availabilityByDay, freeBots } from "../../utils/botAvailability";

const REQUEST_TYPE = "Cleanup";

// TROID-supported cleanups are sent to a collection area; unsupported (manual) ones only give a location.
const CLEANUP_TYPES = [
  { value: "troid_supported", label: "TROID Supported", hint: "A TROID bot cleans one of the collection areas", icon: Bot },
  { value: "unsupported", label: "Unsupported", hint: "A manual cleanup with no bot; give its location", icon: Users },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TIME_SLOTS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
];

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dateKey(date) {
  return toDateInput(date);
}
function getWeekDays(center) {
  const start = new Date(center);
  start.setDate(center.getDate() - center.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
// The same form for Barangay/NGO accounts and for CENRO (forCenro), which also picks the barangay.
function RequestForm({ currentUser, forCenro = false }) {
  const navigate = useNavigate();
  const barangayName = currentUser?.name || (forCenro ? "CENRO" : "Barangay");
  const barangayLocation = currentUser?.location || "";
  const requestsPath = forCenro ? "/admin/requests" : "/barangay/requests";
  const areasPath = forCenro ? "/admin/collection-areas" : "/barangay/areas";

  const [formData, setFormData] = useState({
    cleanupType: "troid_supported",
    barangay: "",
    location: "",
    collectionAreaId: "",
    date: "",
    time: "",
  });
  const [collectionAreas, setCollectionAreas] = useState([]);
  const [collectionAreasLoading, setCollectionAreasLoading] = useState(true);
  // The map of the areas that can be chosen, opened from beside the Collection Area field.
  const [areaMapOpen, setAreaMapOpen] = useState(false);
  const [photoBase64List, setPhotoBase64List] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [letterFile, setLetterFile] = useState(null);
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const letterFileKind = letterKind(letterFile?.name);
  const letterBlob = useMemo(
    () => (letterFile ? base64ToBlob(letterFile.data, letterFileKind) : null),
    [letterFile, letterFileKind]
  );
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showTimeTable, setShowTimeTable] = useState(false);
  const [bots, setBots] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [ttLoaded, setTtLoaded] = useState(false);
  const [ttFailed, setTtFailed] = useState(false);
  const [ttFilter, setTtFilter] = useState("month");
  const [ttAnchor, setTtAnchor] = useState(new Date());
  const [ttSelected, setTtSelected] = useState("");
  // The time picked in the week's timetable, if one was ("08:00").
  const [ttTime, setTtTime] = useState("");
  // Until the first answer comes in; a reload after a booking changes keeps the old one on screen.
  const ttLoading = showTimeTable && !ttLoaded && bots.length === 0 && !ttFailed;
  const availability = useMemo(() => availabilityByDay(bots, schedules), [bots, schedules]);
  const minSelectableDate = new Date();
  minSelectableDate.setHours(0, 0, 0, 0);
  minSelectableDate.setDate(minSelectableDate.getDate() + 7);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
    });
  };

  useEffect(() => {
    let cancelled = false;
    // CENRO can request for any barangay; a barangay account only for its own.
    api.collectionAreas(forCenro ? { status: "approved" } : { barangay: barangayLocation, status: "approved" })
      .then((data) => { if (!cancelled) setCollectionAreas(data || []); })
      .catch((err) => console.error("Failed to load collection areas:", err))
      .finally(() => { if (!cancelled) setCollectionAreasLoading(false); });
    return () => { cancelled = true; };
  }, [barangayLocation, forCenro]);

  useEffect(() => {
    if (!showTimeTable || ttLoaded) return undefined;
    let cancelled = false;
    Promise.all([api.boats(), api.deploymentSchedules()])
      .then(([boatsData, schedData]) => {
        if (cancelled) return;
        // The fleet: every robot that isn't archived.
        setBots((boatsData || []).filter((b) => !b.archived).map((b) => ({ id: b.id, name: b.name || `Bot ${b.id}` })));
        setSchedules(Array.isArray(schedData) ? schedData : []);
        setTtFailed(false);
        setTtLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load the bot timetable:", err);
        if (!cancelled) setTtFailed(true);
      });
    return () => { cancelled = true; };
  }, [showTimeTable, ttLoaded]);

  // Someone else's booking may take a day: load the timetable again when bookings change.
  useLiveRefresh([LIVE.schedules, LIVE.fleet], () => setTtLoaded(false));

  // A day (from its header) or a day and time (from the week's timetable).
  const selectDay = (d, slot = "") => {
    if (d < minSelectableDate) return;
    setTtSelected(dateKey(d));
    if (slot) setTtTime(slot);
  };

  const jumpToWeek = (d) => {
    if (d < minSelectableDate) return;
    setTtAnchor(d);
    setTtSelected(dateKey(d));
    setTtFilter("week");
  };

  const confirmTtDate = () => {
    setFormData({ ...formData, date: ttSelected, ...(ttTime ? { time: ttTime } : {}) });
    setShowTimeTable(false);
  };
  const selectedInfo = ttSelected ? availability[ttSelected] : null;
  const selectedFree = freeBots(selectedInfo, bots.length);

  const handleTtPrev = () => {
    const a = new Date(ttAnchor);
    if (ttFilter === "week") a.setDate(a.getDate() - 7);
    else a.setMonth(a.getMonth() - 1);
    setTtAnchor(a);
  };
  const handleTtNext = () => {
    const a = new Date(ttAnchor);
    if (ttFilter === "week") a.setDate(a.getDate() + 7);
    else a.setMonth(a.getMonth() + 1);
    setTtAnchor(a);
  };
  const ttRangeLabel =
    ttFilter === "week"
      ? `${getWeekDays(ttAnchor)[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${getWeekDays(ttAnchor)[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : `${MONTHS[ttAnchor.getMonth()]} ${ttAnchor.getFullYear()}`;

  const isTroid = formData.cleanupType === "troid_supported";
  // A TROID-supported request needs a collection area, so CENRO can only pick barangays that have one.
  const barangayOptions = !forCenro
    ? []
    : isTroid
      ? [...new Set(collectionAreas.map((a) => a.barangay).filter(Boolean))].sort()
      : BARANGAYS;
  const requestBarangay = forCenro ? formData.barangay : barangayLocation;
  const areaOptions = forCenro ? collectionAreas.filter((a) => a.barangay === formData.barangay) : collectionAreas;
  const selectedCollectionArea = areaOptions.find((a) => String(a.id) === String(formData.collectionAreaId));

  const handleSubmit = (e) => {
    e.preventDefault();
    const placeMissing = isTroid ? !formData.collectionAreaId : !formData.location.trim();
    if ((forCenro && !formData.barangay) || placeMissing || !formData.date || !formData.time) {
      alert("Please fill in all required fields.");
      return;
    }
    if (!letterFile) {
      alert("Please attach the letter of request (PDF or Word).");
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
        request_type: REQUEST_TYPE,
        requested_by_name: barangayName,
        requested_by_role: currentUser?.role || (forCenro ? "admin" : "barangay"),
        requested_by_barangay: requestBarangay,
        email: currentUser?.email || `${barangayName.toLowerCase().replace(/\s+/g, '')}@barangay.gov.ph`,
        cleanup_type: formData.cleanupType,
        location_name: formData.location.trim(),
        collection_area: formData.collectionAreaId || null,
        barangay: requestBarangay,
        municipality: "",
        province: "",
        preferred_date: formData.date,
        preferred_time: formData.time,
        letter: { name: letterFile.name, data: letterFile.data },
        photos: photosPayload,
      };
      await api.createRequest(payload);
      navigate(requestsPath);
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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
            {forCenro ? "Send Request" : "Submit Cleanup Request"}
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            {forCenro
              ? "Request TROID bot deployment for cleanup operations in a barangay"
              : "Request TROID bot deployment for cleanup operations in your area"}
          </p>
        </div>
        <button
          onClick={() => navigate(requestsPath)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Requests
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset>
              <legend className="block text-xs font-semibold text-slate-500 mb-1.5">Cleanup Type</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CLEANUP_TYPES.map(({ value, label, hint, icon: Icon }) => {
                  const active = formData.cleanupType === value;
                  return (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/40 ${
                        active ? "border-[#1b4de4] bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cleanupType"
                        value={value}
                        checked={active}
                        onChange={() => {
                          // The barangay list and the place fields differ by type, so start those over.
                          if (!active) setFormData({ ...formData, cleanupType: value, barangay: "", collectionAreaId: "" });
                        }}
                        className="sr-only"
                      />
                      <Icon size={18} className={active ? "mt-0.5 text-[#1b4de4]" : "mt-0.5 text-slate-400"} />
                      <span>
                        <span className={`block text-sm font-semibold ${active ? "text-slate-900" : "text-slate-700"}`}>{label}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {forCenro && (
              <div>
                <label htmlFor="request-barangay" className="block text-xs font-semibold text-slate-500 mb-1.5">Barangay</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    id="request-barangay"
                    value={formData.barangay}
                    onChange={(e) => setFormData({ ...formData, barangay: e.target.value, collectionAreaId: "" })}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    required
                  >
                    <option value="" disabled>
                      {isTroid && collectionAreasLoading
                        ? "Loading barangays..."
                        : barangayOptions.length === 0
                          ? "No approved collection areas yet"
                          : "Select a barangay"}
                    </option>
                    {barangayOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                {isTroid && (
                  <p className="text-[11px] text-slate-400 mt-1.5">Only barangays with an approved collection area are listed.</p>
                )}
              </div>
            )}

            {/* Required for a TROID-supported cleanup; optional for a manual one, whose trash then
                counts toward the area's priority and hotspots. */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                {isTroid ? "Collection Area" : "Collection Area (Optional)"}
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Layers size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    name="collectionAreaId"
                    value={formData.collectionAreaId}
                    onChange={handleChange}
                    disabled={forCenro && !formData.barangay}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                    required={isTroid}
                  >
                    <option value="">
                      {collectionAreasLoading
                        ? "Loading areas..."
                        : collectionAreas.length === 0
                          ? "No approved areas yet"
                          : forCenro && !formData.barangay
                            ? "Select a barangay first"
                            : isTroid
                              ? "Select a collection area"
                              : areaOptions.length === 0
                                ? "No approved areas in this barangay"
                                : "Not in a collection area"}
                    </option>
                    {areaOptions.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => setAreaMapOpen(true)}
                  disabled={collectionAreasLoading || areaOptions.length === 0 || (forCenro && !formData.barangay)}
                  title="See the collection areas on a map"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MapIcon size={16} />
                  <span className="hidden sm:inline">View on map</span>
                </button>
              </div>
              {areaMapOpen && (
                <AreaPickerModal
                  areas={areaOptions}
                  value={formData.collectionAreaId}
                  barangay={requestBarangay}
                  onChoose={(id) => setFormData((prev) => ({ ...prev, collectionAreaId: String(id) }))}
                  onClose={() => setAreaMapOpen(false)}
                />
              )}
              {!isTroid && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  If the cleanup is in a collection area, choose it so its trash counts toward that area&apos;s priority and hotspots.
                </p>
              )}
              {isTroid && !collectionAreasLoading && collectionAreas.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  {forCenro ? "There are no approved collection areas yet." : "You don't have any approved collection areas yet."}{" "}
                  <button type="button" onClick={() => navigate(areasPath)} className="underline font-medium">
                    {forCenro ? "Add one first" : "Draw one first"}
                  </button>.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="request-location" className="block text-xs font-semibold text-slate-500 mb-1.5">
                {isTroid ? "Landmark (Optional)" : "Location on the Waterway"}
              </label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="request-location"
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  required={!isTroid}
                  maxLength={100}
                  placeholder={isTroid ? "e.g., Beside the barangay hall, near the bridge" : "e.g., San Vicente Creek, behind the public market"}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {isTroid
                  ? "A guide only, for the operator and the workers accompanying them."
                  : "The river, creek or canal stretch the cleanup will be on, so CENRO and the workers can find it."}
              </p>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Preferred Date</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.date) {
                        setTtAnchor(new Date(formData.date + "T00:00:00"));
                        setTtSelected(formData.date);
                      } else {
                        setTtAnchor(minSelectableDate);
                        setTtSelected(dateKey(minSelectableDate));
                      }
                      setTtTime(formData.time || "");
                      setShowTimeTable(true);
                    }}
                    className="w-full flex items-center rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-left outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  >
                    <span className={formData.date ? "text-slate-700 font-medium" : "text-slate-400"}>
                      {formData.date
                        ? new Date(formData.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                        : "Select a date from the bot timetable"}
                    </span>
                  </button>
                  <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Requests must be scheduled at least one week (7 days) in advance.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Preferred Time</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    name="time"
                    value={formData.time}
                    onChange={handleChange}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="">Select a preferred time</option>
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{formatTime12h(slot)}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {isTroid ? "Approximate time you'd like the TROID bot to arrive." : "Approximate time you'd like the cleanup to start."}
                </p>
              </div>
            </div>

            <div>
              <p className="block text-xs font-semibold text-slate-500 mb-1.5">Letter of Request</p>
              <LetterDropzone value={letterFile} onChange={setLetterFile} />
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
              disabled={isSubmitting || (isTroid && !collectionAreasLoading && collectionAreas.length === 0)}
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
                <span className="text-slate-600">
                  {forCenro ? "Submit a cleanup request for a barangay's collection area" : "Submit a cleanup request for your barangay area"}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <span className="text-slate-600">The City Admin reviews and approves or declines your request</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <span className="text-slate-600">CENRO approves the request and schedules the cleanup, with a TROID bot and operator for a TROID-supported one</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
                <span className="text-slate-600">The cleanup is done; a TROID bot counts the trash it collects</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">5</span>
                <span className="text-slate-600">The trash collection report is filed and the request is Completed; it counts toward its collection area&apos;s priority and hotspots</span>
              </li>
            </ol>
          </div>

        </div>
      </div>

      {showOverview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`w-full ${showLetterPreview ? "max-w-3xl" : "max-w-lg"} bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transition-[max-width]`}>
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
                <span className="text-slate-500">Cleanup Type</span>
                <span className="font-medium text-slate-800 text-right">{isTroid ? "TROID Supported" : "Unsupported"}</span>
              </div>
              {isTroid && (
                <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                  <span className="text-slate-500">Collection Area</span>
                  <span className="font-medium text-slate-800 text-right">{selectedCollectionArea?.name || '—'}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">{isTroid ? "Landmark" : "Location"}</span>
                <span className="font-medium text-slate-800 text-right">{formData.location || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Barangay</span>
                <span className="font-medium text-slate-800 text-right">{forCenro ? formData.barangay : barangayName}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Preferred Date</span>
                <span className="font-medium text-slate-800 text-right">{formData.date || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Preferred Time</span>
                <span className="font-medium text-slate-800 text-right">{formData.time ? formatTime12h(formData.time) : '—'}</span>
              </div>
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-slate-500 block mb-1">Letter of Request</span>
                    <p className="text-slate-800 text-xs break-all">{letterFile?.name} ({formatFileSize(letterFile?.size || 0)})</p>
                  </div>
                  {letterBlob && (
                    <button
                      type="button"
                      onClick={() => setShowLetterPreview((shown) => !shown)}
                      className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      {showLetterPreview ? "Hide preview" : "Preview"}
                    </button>
                  )}
                </div>
                {showLetterPreview && letterBlob && (
                  <div className="mt-3">
                    <DocumentPreview blob={letterBlob} kind={letterFileKind} title={letterFile.name} className="h-[420px]" />
                  </div>
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

      {showTimeTable && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Bot Availability Timetable</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pick a preferred date (and, in the week, a time) from the cleanups already booked. Dates within the next 7 days are unavailable.
                </p>
              </div>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <Bot size={14} className="text-[#1b4de4]" />
                {bots.length} robot{bots.length === 1 ? "" : "s"} in the fleet
              </span>
              <button
                onClick={() => setShowTimeTable(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTtPrev}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-slate-700 min-w-[150px] text-center">{ttRangeLabel}</span>
                <button
                  type="button"
                  onClick={handleTtNext}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setTtAnchor(new Date())}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Today
                </button>
              </div>
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
                {["week", "month"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTtFilter(v)}
                    className={`rounded-md px-3 py-1.5 font-semibold capitalize transition-colors ${
                      ttFilter === v ? "bg-[#1b4de4] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 overflow-auto h-[470px]">
              {ttLoading ? (
                <div className="flex items-center justify-center h-48 text-sm text-slate-500">Loading timetable...</div>
              ) : ttFailed && bots.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-red-600">The timetable couldn&apos;t be loaded. Close it and try again.</div>
              ) : ttFilter === "week" ? (
                <WeekTimetable
                  days={getWeekDays(ttAnchor)}
                  slots={TIME_SLOTS}
                  availability={availability}
                  fleetSize={bots.length}
                  selectedDate={ttSelected}
                  selectedTime={ttTime}
                  onSelect={selectDay}
                  minSelectableDate={minSelectableDate}
                />
              ) : (
                <MonthAvailability
                  anchor={ttAnchor}
                  availability={availability}
                  fleetSize={bots.length}
                  selectedDate={ttSelected}
                  onSelectDate={jumpToWeek}
                  minSelectableDate={minSelectableDate}
                />
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {ttSelected ? (
                  <>
                    Selected: <span className="font-semibold text-slate-700">
                      {new Date(ttSelected + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      {ttTime ? ` at ${formatTime12h(ttTime)}` : ""}
                    </span>
                    {" · "}{selectedFree} of {bots.length} robot{bots.length === 1 ? "" : "s"} free, {selectedInfo?.cleanups || 0} cleanup{selectedInfo?.cleanups === 1 ? "" : "s"} booked
                    {isTroid && selectedFree === 0 && (
                      <span className="mt-0.5 block font-medium text-amber-600">No robot is free that day, so CENRO may have to move the cleanup.</span>
                    )}
                  </>
                ) : "Select a day to continue."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTimeTable(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTtDate}
                  disabled={!ttSelected || new Date(ttSelected + "T00:00:00") < minSelectableDate}
                  className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8] disabled:opacity-50"
                >
                  Confirm Date
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestForm;
