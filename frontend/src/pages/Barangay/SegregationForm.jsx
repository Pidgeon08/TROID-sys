import { useState } from "react";
import { Recycle, Trash2, MapPin, Calendar, Package, Scale, Send, CheckCircle2, AlertTriangle, Droplets, ChevronDown, Plus, Truck } from "lucide-react";

const TRASH_TYPES = [
  "Plastic Bottles",
  "Food Wrappers",
  "Mixed Waste",
  "Plastic Packaging",
  "Glass",
  "Metal Cans",
  "Organic Waste",
  "E-Waste",
  "Hazardous",
  "Others",
];

const BARANGAY_ZONES = [
  "Carlatan Creek",
  "Biday Creek",
  "Catbangen River",
  "San Fernando Creek",
  "Poro Coastal Line",
];

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

export default function SegregationForm() {
  const [formData, setFormData] = useState({
    zone: "",
    date: new Date().toISOString().split("T")[0],
    totalBags: "",
    totalWeightKg: "",
    trashItems: [],
    nonUsableWeightKg: "",
    recyclableWeightKg: "",
    notes: "",
  });
  const [success, setSuccess] = useState(false);

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      trashItems: [...prev.trashItems, { type: "", weightKg: "", bags: "", condition: "Usable" }],
    }));
  };

  const handleRemoveItem = (idx) => {
    setFormData((prev) => ({
      ...prev,
      trashItems: prev.trashItems.filter((_, i) => i !== idx),
    }));
  };

  const handleItemChange = (idx, field, value) => {
    setFormData((prev) => ({
      ...prev,
      trashItems: prev.trashItems.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSuccess(true);
    setTimeout(() => setSuccess(false), 4000);
    setFormData({
      zone: "",
      date: new Date().toISOString().split("T")[0],
      totalBags: "",
      totalWeightKg: "",
      trashItems: [],
      nonUsableWeightKg: "",
      recyclableWeightKg: "",
      notes: "",
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Trash Segregation</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          Record trash collected by TROID bots after cleanup. Segregate by type, weight, and bags.
        </p>
      </header>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Package} label="Total Bags" value={formData.totalBags || "0"} sub="Collected this entry" />
        <SummaryCard icon={Scale} label="Total Weight" value={`${formData.totalWeightKg || 0} kg`} sub="Combined weight" />
        <SummaryCard icon={Trash2} label="Non-Usable Waste" value={`${formData.nonUsableWeightKg || 0} kg`} sub="Sends to landfill" />
        <SummaryCard icon={Recycle} label="Recyclables" value={`${formData.recyclableWeightKg || 0} kg`} sub="Sends to recycling center" />
      </div>

      {success && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">Segregation data submitted successfully! The non-usable waste will be sent to the landfill and recyclables to the recycling center.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section: Collection Summary */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <h2 className="text-[17px] font-bold text-slate-900 mb-5 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-slate-500" />
            Collection Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Barangay Zone</label>
              <div className="relative">
                <select
                  value={formData.zone}
                  onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
                  required
                >
                  <option value="">Select zone</option>
                  {BARANGAY_ZONES.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                <MapPin className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Date of Collection</label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Number of Bags</label>
              <div className="relative">
                <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  value={formData.totalBags}
                  onChange={(e) => setFormData({ ...formData, totalBags: e.target.value })}
                  placeholder="e.g., 12"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  required
                  min="0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Trash Items Detail */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[17px] font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-slate-500" />
              Trash Item Breakdown
            </h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {formData.trashItems.map((item, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Trash Type</label>
                  <select
                    value={item.type}
                    onChange={(e) => handleItemChange(idx, "type", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    required
                  >
                    <option value="">Select type</option>
                    {TRASH_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={item.weightKg}
                    onChange={(e) => handleItemChange(idx, "weightKg", e.target.value)}
                    placeholder="0.0"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    required
                    min="0"
                    step="0.1"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Bags</label>
                  <input
                    type="number"
                    value={item.bags}
                    onChange={(e) => handleItemChange(idx, "bags", e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    required
                    min="0"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Condition</label>
                  <div className="relative">
                    <select
                      value={item.condition}
                      onChange={(e) => handleItemChange(idx, "condition", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
                    >
                      <option value="Usable">Recyclable</option>
                      <option value="Damaged">Non-Usable</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
                  title="Remove item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            {formData.trashItems.length === 0 && (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No items added yet. Click "Add Item" to start recording trash details.</p>
              </div>
            )}
          </div>
        </div>

        {/* Section: Disposal Routing */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <h2 className="text-[17px] font-bold text-slate-900 mb-5 flex items-center gap-2">
            <Truck className="w-5 h-5 text-slate-500" />
            Disposal Routing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-red-100 bg-red-50/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-bold text-red-700">Non-Usable Waste</h3>
              </div>
              <p className="text-xs text-red-600/80 mb-3">Useless trash bags will be sent to the landfill.</p>
              <div className="relative">
                <Scale size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" />
                <input
                  type="number"
                  value={formData.nonUsableWeightKg}
                  onChange={(e) => setFormData({ ...formData, nonUsableWeightKg: e.target.value })}
                  placeholder="Total weight in kg"
                  className="w-full rounded-lg border border-red-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
                  required
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Recycle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-emerald-700">Recyclables</h3>
              </div>
              <p className="text-xs text-emerald-600/80 mb-3">Good trash or recyclables will be sent to the recycling center.</p>
              <div className="relative">
                <Droplets size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                <input
                  type="number"
                  value={formData.recyclableWeightKg}
                  onChange={(e) => setFormData({ ...formData, recyclableWeightKg: e.target.value })}
                  placeholder="Total weight in kg"
                  className="w-full rounded-lg border border-emerald-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20"
                  required
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <h2 className="text-[17px] font-bold text-slate-900 mb-4">Additional Notes</h2>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Any additional observations about the segregation..."
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 resize-none"
          />
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1b4de4] py-3 px-4 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
        >
          <Send size={16} />
          Submit Segregation Data
        </button>
      </form>
    </div>
  );
}
