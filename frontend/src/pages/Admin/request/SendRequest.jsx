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
} from "lucide-react";
import api from "../../../services/api";

const REQUEST_TYPES = ["Cleanup", "Maintenance", "Inspection"];

export default function SendRequest() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    location: "",
    assignedSpearheadId: "",
    contact: "",
    date: "",
    requestType: "Cleanup",
    notes: "",
  });
  const [preview, setPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [spearheads, setSpearheads] = useState([]);

  useEffect(() => {
    const fetchSpearheads = async () => {
      try {
        const data = await api.users();
        const spearheadUsers = Array.isArray(data) ? data.filter((u) => u.role === "spearhead") : [];
        setSpearheads(spearheadUsers);
      } catch (err) {
        console.error("Failed to fetch spearheads:", err);
      }
    };
    fetchSpearheads();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const selectedSpearhead = spearheads.find((sp) => sp.id === parseInt(formData.assignedSpearheadId)) || null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const date = new Date();
      const timestamp = date.getTime().toString().slice(-6);
      const payload = {
        request_id: `REQ-${timestamp}`,
        request_type: formData.requestType,
        requested_by_name: "CENRO Admin",
        requested_by_role: "admin",
        requested_by_barangay: "",
        contact: formData.contact || "000000000000",
        email: "admin@cenro.gov.ph",
        location_name: formData.location,
        barangay: selectedSpearhead ? selectedSpearhead.name : "",
        municipality: "",
        province: "",
        notes: formData.notes,
      };
      await api.createRequest(payload);
      navigate("/admin/requests");
    } catch (err) {
      console.error("Failed to submit request:", err);
      alert("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Send Request</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Submit a TROID bot request to a spearhead for cleanup operations
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/requests")}
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
                  placeholder="Enter specific location (e.g., Carlatan Creek near bridge)"
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
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Assign to Spearhead</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    name="assignedSpearheadId"
                    value={formData.assignedSpearheadId}
                    onChange={handleChange}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    required
                  >
                    <option value="" disabled>Select a spearhead</option>
                    {spearheads.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Contact Number</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    name="contact"
                    value={formData.contact}
                    onChange={handleChange}
                    placeholder="09XX XXX XXXX"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    required
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

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Additional Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Describe the area condition or any specific instructions..."
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Photo of Area (Optional)</label>
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-600 hover:bg-slate-50">
                    <Camera size={16} />
                    Upload Photo
                  </div>
                </label>
                {preview && (
                  <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
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
                <span className="text-slate-600">Select a spearhead to assign the cleanup request</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <span className="text-slate-600">The spearhead reviews and prepares for deployment</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <span className="text-slate-600">CENRO assigns operators and TROID bots to the spearhead</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1b4de4] text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
                <span className="text-slate-600">TROID bots collect trash from the assigned area</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">5</span>
                <span className="text-slate-600">Segregation of waste by the spearhead team</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">6</span>
                <span className="text-slate-600">Waste disposal at landfill or recycling center</span>
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
                <span className="text-slate-400">CENRO Office:</span> San Fernando City
              </p>
              <p className="text-slate-600">
                <span className="text-slate-400">Hotline:</span> (072) 123-4567
              </p>
              <p className="text-slate-600">
                <span className="text-slate-400">Email:</span> cenro@sanfernando.gov.ph
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}