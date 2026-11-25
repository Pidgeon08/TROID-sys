import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GitMerge, X } from "lucide-react";
import api from "../../services/api";
import { REQUEST_STATUS_STYLES, mapRequest, matchesRequestQuery } from "../../constants/requests";
import { mergeCandidates } from "../../utils/requestFilters";
import { SearchBar } from "../../components/ui/SearchBar";

/**
 * CENRO merges other requests into this one, so a single cleanup covers them all. Only
 * TROID-supported requests for the same barangay and collection area that haven't started their
 * cleanup can be merged: the barangay's own and an NGO's for the same stretch, say. Every
 * requester then gets the cleanup's progress and results (the server checks this too).
 */
export default function MergeRequestsModal({ request, onClose, onMerged }) {
  const [candidates, setCandidates] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.requests()
      .then((res) => { if (!cancelled) setCandidates(Array.isArray(res) ? res.map(mapRequest) : []); })
      .catch((err) => {
        console.error("Failed to load requests:", err);
        if (!cancelled) setLoadError("Requests couldn't be loaded.");
      });
    return () => { cancelled = true; };
  }, []);

  const options = useMemo(
    () => mergeCandidates(request, candidates || []).sort((a, b) => a.id.localeCompare(b.id)),
    [candidates, request]
  );

  const shown = options.filter((r) => matchesRequestQuery(r, query) || (r.location?.barangay || "").toLowerCase().includes(query.toLowerCase()));

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const ids = [...selected];
      const res = await api.mergeRequests(request.id, { request_ids: ids, reason: reason.trim() });
      onMerged(mapRequest(res), ids);
    } catch (err) {
      setError(err.message || "The requests couldn't be merged. Please try again.");
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><GitMerge size={18} className="text-indigo-600" /> Merge Requests into {request.id}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Barangay <span className="font-semibold text-slate-700">{request.location?.barangay || "—"}</span>
              {" · "}Collection area: <span className="font-semibold text-slate-700">{request.collectionArea?.areaId} · {request.collectionArea?.name}</span>
              {" · "}Cleanup: <span className="whitespace-nowrap font-semibold text-slate-700">{request.cleanupType === "unsupported" ? "Non-TROID" : "TROID-supported"}</span>
            </p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Only requests for this barangay and collection area can be merged, TROID-supported or not, and whether the barangay or an NGO sent them. One cleanup, under {request.id}, will cover
              the requests you choose. Each keeps its own page and gets {request.id}'s progress, schedule and trash report, and its requester is told about every
              update. Their own deployment schedules are removed.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 pt-4">
          <SearchBar value={query} onChange={setQuery} placeholder="Search by ID, requester or barangay..." className="w-full" />
        </div>

        <div className="px-6 py-3 overflow-y-auto flex-1 min-h-[160px]">
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : !candidates ? (
            <p className="text-sm text-slate-400">Loading requests...</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-slate-500">
              {options.length === 0
                ? "No other requests for this barangay and collection area are waiting for a cleanup."
                : "No requests match your search."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((r) => (
                <li key={r.id}>
                  <label className="flex items-start gap-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={saving}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-800">{r.id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REQUEST_STATUS_STYLES[r.status] || "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.cleanupType === "unsupported" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                          {r.cleanupType === "unsupported" ? "Non-TROID" : "TROID"}
                        </span>
                        {r.requestedBy?.role && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {r.requestedBy.role.toLowerCase() === "ngo" ? "NGO" : r.requestedBy.role.charAt(0).toUpperCase() + r.requestedBy.role.slice(1)}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500 truncate">
                        {[r.requestedBy?.name, r.location?.barangay, r.location?.name].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 pt-1">
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Reason (optional, shown to the requesters)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            disabled={saving}
            placeholder="e.g. These requests are for the same stretch of river."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
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
            disabled={saving || selected.size === 0}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Merging..." : selected.size ? `Merge ${selected.size} request${selected.size === 1 ? "" : "s"}` : "Merge"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
