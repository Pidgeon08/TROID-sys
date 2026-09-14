import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  User,
  Camera,
  Send,
  FileText,
  Calendar,
  Clock,
  Truck,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import api from "../../services/api";
import { formatTime12h } from "../../constants/requests";

const REQUEST_TYPE = "Cleanup";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
const STATUS_STYLES = {
  scheduled: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  maintenance: "bg-amber-50 text-amber-700 border border-amber-100",
  available: "bg-sky-50 text-sky-700 border border-sky-100",
  none: "bg-slate-50 text-slate-400 border border-slate-100",
};

function TimeTable({ days, bots, scheduleMap, selectedDate, onSelectDate, minSelectableDate }) {
  const gridCols = `160px repeat(${days.length}, minmax(40px, 1fr))`;
  const minWidth = Math.max(640, 160 + days.length * 48);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div className="overflow-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-1 p-2 border-b border-slate-100 bg-slate-50 sticky top-0 z-20"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="bg-slate-50 sticky left-0 z-20 border-r border-slate-200">
              <span className="block px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bot</span>
            </div>
            {days.map((d) => {
              const isSelected = selectedDate === dateKey(d);
              const isDisabled = d < minSelectableDate;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelectDate(d)}
                  className={`flex flex-col items-center py-1 rounded-md transition-colors ${
                    isDisabled
                      ? "bg-slate-50 opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "bg-[#1b4de4] hover:bg-[#153eb8]"
                        : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${isSelected && !isDisabled ? "text-white" : "text-slate-500"}`}>{DAY_SHORT[d.getDay()]}</span>
                  <span className={`text-sm font-bold ${isSelected && !isDisabled ? "text-white" : "text-slate-800"}`}>{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <div className="divide-y divide-slate-50">
            {bots.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">No bots available.</p>
            )}
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="grid gap-1 p-1 items-center"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="bg-white sticky left-0 z-10 border-r border-slate-200">
                  <span className="block px-2 py-2 text-xs font-semibold text-slate-600 truncate" title={bot.name}>
                    {bot.name}
                  </span>
                </div>
                {days.map((d) => {
                  const entry = scheduleMap[String(bot.id)]?.[dateKey(d)];
                  const isSelected = selectedDate === dateKey(d);
                  const isDisabled = d < minSelectableDate;
                  const styles = isDisabled
                    ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                    : `${STATUS_STYLES[entry?.status] || STATUS_STYLES.none}${isSelected ? " ring-2 ring-blue-500" : ""}`;
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onSelectDate(d)}
                      className={`h-9 rounded-lg text-[11px] font-medium transition-colors ${styles}`}
                    >
                      {!isDisabled && entry?.status === "scheduled" ? entry.label : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 p-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Scheduled</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Available</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Maintenance</span>
        <span className="ml-auto text-slate-400">Click a day header to select it, then Confirm.</span>
      </div>
    </div>
  );
}

function MonthCalendar({ anchor, scheduleMap, bots, selectedDate, onSelectDate, minSelectableDate }) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 gap-px bg-slate-100">
        {DAY_SHORT.map((d) => (
          <div key={d} className="bg-slate-50 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-100">
        {cells.map((d, idx) =>
          d === null ? (
            <div key={`blank-${idx}`} className="bg-white h-12" />
          ) : (
            (() => {
              const key = dateKey(d);
              const isToday = key === dateKey(new Date());
              const isSelected = selectedDate === key;
              const isDisabled = d < minSelectableDate;
              const scheduled = bots.filter((b) => scheduleMap[String(b.id)]?.[key]?.status === "scheduled");
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelectDate(d)}
                  className={`h-12 flex flex-col items-center justify-center p-1 transition-colors ${
                    isDisabled
                      ? "bg-white opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "bg-[#b8dbff] ring-1 ring-inset ring-[#d6ecff]"
                        : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className={`text-sm font-semibold ${isSelected && !isDisabled ? "text-[#0369a1]" : isToday && !isDisabled ? "text-[#1b4de4]" : "text-slate-700"}`}>{d.getDate()}</span>
                  {!isDisabled && scheduled.length > 0 && (
                    <span className="mt-0.5 text-[10px] font-medium text-emerald-600">
                      {scheduled.length} bot{scheduled.length > 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              );
            })()
          )
        )}
      </div>
    </div>
  );
}

function RequestForm({ currentUser }) {
  const navigate = useNavigate();
  const barangayName = currentUser?.name || "Barangay";
  const barangayLocation = currentUser?.location || "";

  const [formData, setFormData] = useState({
    location: "",
    collectionAreaId: "",
    date: "",
    time: "",
    notes: "",
  });
  const [collectionAreas, setCollectionAreas] = useState([]);
  const [collectionAreasLoading, setCollectionAreasLoading] = useState(true);
  const [photoBase64List, setPhotoBase64List] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [showFullLetter, setShowFullLetter] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showTimeTable, setShowTimeTable] = useState(false);
  const [bots, setBots] = useState([]);
  const [scheduleMap, setScheduleMap] = useState({});
  const [ttLoading, setTtLoading] = useState(false);
  const [ttLoaded, setTtLoaded] = useState(false);
  const [ttFilter, setTtFilter] = useState("month");
  const [ttAnchor, setTtAnchor] = useState(new Date());
  const [ttSelected, setTtSelected] = useState("");
  const [ttBotPage, setTtBotPage] = useState(0);
  const BOTS_PER_PAGE = 6;
  const totalBotPages = Math.max(1, Math.ceil(bots.length / BOTS_PER_PAGE));
  const pagedBots = bots.slice(ttBotPage * BOTS_PER_PAGE, (ttBotPage + 1) * BOTS_PER_PAGE);
  const LETTER_TRUNCATE_LENGTH = 200;
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
    api.collectionAreas({ barangay: barangayLocation, status: "approved" })
      .then((data) => { if (!cancelled) setCollectionAreas(data || []); })
      .catch((err) => console.error("Failed to load collection areas:", err))
      .finally(() => { if (!cancelled) setCollectionAreasLoading(false); });
    return () => { cancelled = true; };
  }, [barangayLocation]);

  useEffect(() => {
    if (!showTimeTable || ttLoaded) return;
    setTtLoading(true);
    Promise.all([api.boats(), api.deploymentSchedules()])
      .then(([boatsData, schedData]) => {
        setBots((boatsData || []).map((b) => ({ id: b.id, name: b.name || `Bot ${b.id}` })));
        const map = {};
        (schedData || []).forEach((s) => {
          const botId = String(s.bot);
          map[botId] = map[botId] || {};
          map[botId][s.day] = { status: s.status || "none", label: s.label || "", zone: s.zone || "" };
        });
        setScheduleMap(map);
        setTtLoaded(true);
        setTtLoading(false);
      })
      .catch(() => setTtLoading(false));
  }, [showTimeTable, ttLoaded]);

  const selectDay = (d) => {
    if (d < minSelectableDate) return;
    setTtSelected(dateKey(d));
  };

  const jumpToWeek = (d) => {
    if (d < minSelectableDate) return;
    setTtAnchor(d);
    setTtSelected(dateKey(d));
    setTtFilter("week");
  };

  const confirmTtDate = () => {
    setFormData({ ...formData, date: ttSelected });
    setShowTimeTable(false);
  };

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

  const selectedCollectionArea = collectionAreas.find((a) => String(a.id) === String(formData.collectionAreaId));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.location || !formData.collectionAreaId || !formData.date || !formData.time) {
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
        request_type: REQUEST_TYPE,
        requested_by_name: barangayName,
        requested_by_role: currentUser?.role || "barangay",
        requested_by_barangay: barangayLocation,
        email: currentUser?.email || `${barangayName.toLowerCase().replace(/\s+/g, '')}@barangay.gov.ph`,
        location_name: formData.location,
        collection_area: formData.collectionAreaId,
        barangay: barangayLocation,
        municipality: "",
        province: "",
        preferred_date: formData.date,
        preferred_time: formData.time,
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
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Collection Area</label>
              <div className="relative">
                <Layers size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  name="collectionAreaId"
                  value={formData.collectionAreaId}
                  onChange={handleChange}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  required
                >
                  <option value="">
                    {collectionAreasLoading ? "Loading areas..." : collectionAreas.length === 0 ? "No approved areas yet" : "Select a collection area"}
                  </option>
                  {collectionAreas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              {!collectionAreasLoading && collectionAreas.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  You don't have any approved collection areas yet.{" "}
                  <button type="button" onClick={() => navigate("/barangay/areas")} className="underline font-medium">
                    Draw one first
                  </button>.
                </p>
              )}
            </div>

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
                  Approximate time you'd like the TROID bot to arrive.
                </p>
              </div>
            </div>

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
              disabled={isSubmitting || (!collectionAreasLoading && collectionAreas.length === 0)}
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
                <span className="text-slate-400">Email:</span> {currentUser?.email || `${barangayName.toLowerCase().replace(/\s+/g, '')}@barangay.gov.ph`}
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
                <span className="text-slate-500">Collection Area</span>
                <span className="font-medium text-slate-800 text-right">{selectedCollectionArea?.name || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Location</span>
                <span className="font-medium text-slate-800 text-right">{formData.location}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm border-b border-slate-50">
                <span className="text-slate-500">Barangay</span>
                <span className="font-medium text-slate-800 text-right">{barangayName}</span>
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

      {showTimeTable && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Bot Availability Timetable</h3>
                <p className="text-xs text-slate-500 mt-1">Pick a preferred date based on TROID bot deployment schedules. Dates within the next 7 days are unavailable.</p>
              </div>
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

            <div className="p-4 overflow-auto h-[380px]">
              {ttLoading ? (
                <div className="flex items-center justify-center h-48 text-sm text-slate-500">Loading timetable...</div>
              ) : ttFilter === "week" ? (
                <TimeTable
                  days={getWeekDays(ttAnchor)}
                  bots={pagedBots}
                  scheduleMap={scheduleMap}
                  selectedDate={ttSelected}
                  onSelectDate={selectDay}
                  minSelectableDate={minSelectableDate}
                />
              ) : (
                <MonthCalendar
                  anchor={ttAnchor}
                  scheduleMap={scheduleMap}
                  bots={bots}
                  selectedDate={ttSelected}
                  onSelectDate={jumpToWeek}
                  minSelectableDate={minSelectableDate}
                />
              )}
            </div>

            {ttFilter === "week" && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Page {ttBotPage + 1} of {totalBotPages}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTtBotPage((p) => Math.max(0, p - 1))}
                    disabled={ttBotPage === 0}
                    aria-label="Previous page"
                    className="flex items-center justify-center rounded-lg border border-slate-200 w-8 h-8 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalBotPages }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTtBotPage(i)}
                      className={`flex items-center justify-center rounded-lg border w-8 h-8 text-xs font-medium transition-colors ${
                        i === ttBotPage
                          ? "border-[#1b4de4] bg-[#1b4de4] text-white"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTtBotPage((p) => Math.min(totalBotPages - 1, p + 1))}
                    disabled={ttBotPage >= totalBotPages - 1}
                    aria-label="Next page"
                    className="flex items-center justify-center rounded-lg border border-slate-200 w-8 h-8 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {ttSelected
                  ? `Selected: ${new Date(ttSelected + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                  : "Select a day to continue."}
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
