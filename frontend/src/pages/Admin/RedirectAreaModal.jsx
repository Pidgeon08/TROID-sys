import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPinned, X } from "lucide-react";
import api from "../../services/api";
import { mapRequest } from "../../constants/requests";

/** CENRO sends a request's cleanup to another approved collection area, with a reason the requester sees. */
export default function RedirectAreaModal({ request, onClose, onRedirected }) {
  const [areas, setAreas] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [areaId, setAreaId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.collectionAreas({ status: "approved" })
      .then((res) => { if (!cancelled) setAreas(Array.isArray(res) ? res : []); })
      .catch((err) => {
        console.error("Failed to load collection areas:", err);
        if (!cancelled) setLoadError("Collection areas couldn't be loaded.");
      });
    return () => { cancelled = true; };
  }, []);

  // The request's own barangay first, as that's where it usually goes.
  const options = useMemo(() => {
    const barangay = request.location?.barangay || "";
    return (areas || [])
      .filter((area) => area.status === "approved" && !area.archived && area.id !== request.collectionArea?.id)
      .sort((a, b) => (b.barangay === barangay) - (a.barangay === barangay) || (a.barangay || "").localeCompare(b.barangay || "") || a.name.localeCompare(b.name));
  }, [areas, request]);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.redirectRequestArea(request.id, { collection_area: Number(areaId), reason: reason.trim() });
      onRedirected(mapRequest(res), options.find((area) => String(area.id) === areaId));
    } catch (err) {
      setError(err.message || "The collection area couldn't be changed. Please try again.");
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><MapPinned size={18} className="text-blue-600" /> Change Collection Area</h3>
            <p className="text-xs text-slate-500 mt-1">
              Send this cleanup to another approved collection area. The requester will be told where and why.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 pt-4 space-y-3">
          <div className="text-xs text-slate-500">
            Current area: <span className="font-semibold text-slate-700">{request.collectionArea ? `${request.collectionArea.areaId} · ${request.collectionArea.name}` : "None"}</span>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              New collection area <span className="text-red-500">*</span>
            </label>
            {loadError ? (
              <p className="text-xs text-red-600">{loadError}</p>
            ) : !areas ? (
              <p className="text-xs text-slate-400">Loading areas...</p>
            ) : options.length === 0 ? (
              <p className="text-xs text-slate-500">There are no other approved collection areas.</p>
            ) : (
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Choose an area...</option>
                {options.map((area) => (
                  <option key={area.id} value={String(area.id)}>
                    {area.area_id} · {area.name}{area.barangay ? ` (${area.barangay})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={saving}
              placeholder="e.g. The trash has drifted downstream to the river mouth."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="p-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !areaId || !reason.trim()}
            className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Change Area"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
