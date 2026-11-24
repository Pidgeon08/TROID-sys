// The cleanup requests sent to one collection area, opened from CENRO's Collection Areas page.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardList, X } from "lucide-react";
import api from "../../services/api";
import { REQUEST_STATUS_STYLES, formatTime12h, mapRequest } from "../../constants/requests";
import { LIVE, useLiveVersion } from "../../hooks/useLiveUpdates";

const ALL = "All";

function formatDay(isoDate) {
  if (!isoDate) return "";
  const day = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(day.getTime())
    ? isoDate
    : day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function collected(req) {
  const parts = [];
  if (req.bags) parts.push(`${req.bags} ${req.bags === 1 ? "bag" : "bags"}`);
  if (req.weightKg) parts.push(`${req.weightKg} kg`);
  return parts.join(" · ");
}

export default function AreaRequestsModal({ area, onClose, routePrefix = "admin" }) {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests);
  useEffect(() => {
    let cancelled = false;
    api.requestsForArea(area.id)
      .then((data) => { if (!cancelled) setRequests((data || []).map(mapRequest)); })
      .catch((err) => {
        console.error("Failed to load the area's requests:", err);
        if (!cancelled) setError("The requests couldn't be loaded. Please try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [area.id, live]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // One filter per status these requests are in, with how many are in it.
  const statusCounts = useMemo(() => {
    const counts = new Map();
    requests.forEach((r) => counts.set(r.status, (counts.get(r.status) || 0) + 1));
    return [...counts.entries()];
  }, [requests]);

  const shown = statusFilter === ALL ? requests : requests.filter((r) => r.status === statusFilter);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-requests-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-6">
          <div className="min-w-0">
            <h3 id="area-requests-title" className="truncate text-lg font-bold text-slate-900">Requests for {area.name}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {area.id} · {area.barangay || "Unknown barangay"} · Cleanup requests sent to this area, newest first
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!loading && !error && requests.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-3">
            {[[ALL, requests.length], ...statusCounts].map(([status, count]) => {
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "border-[#1b4de4] bg-blue-50 text-[#1b4de4]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {status} <span className="text-slate-400">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Loading requests…</p>
          ) : error ? (
            <p className="p-6 text-sm font-medium text-red-600" role="alert">{error}</p>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <ClipboardList className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No requests yet</p>
              <p className="text-xs text-slate-400">Cleanup requests that choose this area will be listed here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {shown.map((req) => {
                const totals = collected(req);
                return (
                  <li key={req.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/${routePrefix}/requests/${req.id}`)}
                      className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-800">{req.id}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${REQUEST_STATUS_STYLES[req.status] || "bg-slate-100 text-slate-600"}`}>
                            {req.status}
                          </span>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                          {req.preferredDate
                            ? `${formatDay(req.preferredDate)}${req.preferredTime ? `, ${formatTime12h(req.preferredTime)}` : ""}`
                            : "No date chosen"}
                          {totals && <span className="text-slate-400">· Collected {totals}</span>}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {[req.requestedBy.name, req.requestedBy.barangay].filter(Boolean).join(" · ") || "Unknown requester"} · Submitted {req.dateSubmitted}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
