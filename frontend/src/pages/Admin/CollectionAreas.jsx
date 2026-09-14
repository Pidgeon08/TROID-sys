import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Polyline, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Map as MapIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Layers,
  X,
} from "lucide-react";
import api from "../../services/api";
import { logAudit } from "../../services/auditLog";
import { SummaryCard } from "../../components/ui/SummaryCard";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";

const DEFAULT_CENTER = [16.6195, 120.314];
const DEFAULT_ZOOM = 14;
const AREA_COLOR = "#1b4de4";

const TABS = ["All", "Pending", "Approved", "Declined"];

const STATUS_META = {
  pending: { label: "Pending Approval", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  declined: { label: "Declined", cls: "bg-red-50 text-red-700", icon: XCircle },
};

function mapArea(raw) {
  return {
    id: raw.area_id,
    name: raw.name,
    barangay: raw.barangay || "",
    submittedBy: raw.submitted_by || "",
    closed: raw.closed,
    points: raw.points || [],
    color: raw.color || AREA_COLOR,
    status: raw.status || "pending",
    declineReason: raw.decline_reason || "",
    reviewedBy: raw.reviewed_by || "",
    dateSubmitted: raw.date_submitted
      ? new Date(raw.date_submitted).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "",
  };
}

function centroid(points) {
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function FlyTo({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, zoom || DEFAULT_ZOOM + 1, { duration: 0.8 });
    }
  }, [map, position, zoom]);
  return null;
}

export default function CollectionAreas() {
  const { currentUser } = useOutletContext() || {};
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Pending");
  const [activeId, setActiveId] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [approveTarget, setApproveTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.collectionAreas()
      .then((data) => { if (!cancelled) setAreas((data || []).map(mapArea)); })
      .catch((err) => console.error("Failed to load collection areas:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    total: areas.length,
    pending: areas.filter((a) => a.status === "pending").length,
    approved: areas.filter((a) => a.status === "approved").length,
    declined: areas.filter((a) => a.status === "declined").length,
  }), [areas]);

  const filtered = useMemo(() => {
    if (activeTab === "All") return areas;
    return areas.filter((a) => a.status === activeTab.toLowerCase());
  }, [areas, activeTab]);

  const focusArea = (a) => {
    setActiveId(a.id);
    setFlyTo(centroid(a.points));
  };

  const handleApprove = async (area) => {
    setBusyId(area.id);
    try {
      const updated = await api.approveCollectionArea(area.id, { reviewed_by: currentUser?.name });
      setAreas((prev) => prev.map((a) => (a.id === area.id ? mapArea(updated) : a)));
      logAudit({
        currentUser,
        action: "Collection area approved",
        module: "Collection Areas",
        details: `${area.name} (${area.id}) approved for ${area.barangay}`,
      });
    } catch (err) {
      console.error("Failed to approve collection area:", err);
      alert("Failed to approve area. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const openApprove = (area) => {
    setApproveTarget(area);
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const area = approveTarget;
    setApproveTarget(null);
    await handleApprove(area);
  };

  const openDecline = (area) => {
    setDeclineTarget(area);
    setDeclineReason("");
  };

  const submitDecline = async () => {
    if (!declineTarget || !declineReason.trim()) return;
    setBusyId(declineTarget.id);
    try {
      const updated = await api.declineCollectionArea(declineTarget.id, { reason: declineReason.trim(), reviewed_by: currentUser?.name });
      setAreas((prev) => prev.map((a) => (a.id === declineTarget.id ? mapArea(updated) : a)));
      logAudit({
        currentUser,
        action: "Collection area declined",
        module: "Collection Areas",
        details: `${declineTarget.name} (${declineTarget.id}) declined: ${declineReason.trim()}`,
        status: "warning",
      });
      setDeclineTarget(null);
      setDeclineReason("");
    } catch (err) {
      console.error("Failed to decline collection area:", err);
      alert("Failed to decline area. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Collection Areas</h1>
        <p className="text-slate-500 mt-1.5 text-sm font-medium">
          Review and approve collection zones submitted by barangays.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Layers} label="Total Areas" value={counts.total} sub="All submissions" />
        <SummaryCard icon={Clock} label="Pending" value={counts.pending} sub="Awaiting your approval" />
        <SummaryCard icon={CheckCircle2} label="Approved" value={counts.approved} sub="Active collection zones" />
        <SummaryCard icon={XCircle} label="Declined" value={counts.declined} sub="Declined submissions" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-4 px-5 border-b border-slate-100 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab}
                {activeTab === tab && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-blue-600 rounded-full" />}
              </button>
            ))}
          </div>
          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-50">
            {filtered.length === 0 && (
              <div className="p-5">
                <EmptyState title="No areas found." subtitle="Submissions from barangays will appear here." />
              </div>
            )}
            {filtered.map((a) => {
              const meta = STATUS_META[a.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              return (
                <div key={a.id} className={`p-5 ${activeId === a.id ? "bg-blue-50/40" : ""}`}>
                  <button type="button" onClick={() => focusArea(a)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                        <StatusIcon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {a.barangay || "Unknown barangay"} · {a.closed ? "Polygon" : "Polyline"} · {a.points.length} pts
                    </p>
                    <p className="text-xs text-slate-400">{a.submittedBy} &bull; {a.dateSubmitted}</p>
                  </button>
                  {a.status === "declined" && a.declineReason && (
                    <p className="mt-2 text-xs text-red-600">Reason: {a.declineReason}</p>
                  )}
                  {a.status === "pending" && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDecline(a)}
                        disabled={busyId === a.id}
                        className="flex items-center gap-1.5 rounded-lg border-2 border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => openApprove(a)}
                        disabled={busyId === a.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        {busyId === a.id ? "Approving…" : "Approve"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Map */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-3">
          <div className="relative h-[600px] rounded-xl overflow-hidden border border-slate-100">
            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {flyTo && <FlyTo position={flyTo} />}
              {filtered.map((a) =>
                a.points.length >= (a.closed ? 3 : 2) ? (
                  a.closed ? (
                    <Polygon
                      key={a.id}
                      positions={a.points}
                      pathOptions={{
                        color: a.color || AREA_COLOR,
                        weight: activeId === a.id ? 5 : 3,
                        opacity: activeId && activeId !== a.id ? 0.4 : 0.9,
                        fillColor: a.color || AREA_COLOR,
                        fillOpacity: 0.2,
                      }}
                    />
                  ) : (
                    <Polyline
                      key={a.id}
                      positions={a.points}
                      pathOptions={{
                        color: a.color || AREA_COLOR,
                        weight: activeId === a.id ? 5 : 3,
                        opacity: activeId && activeId !== a.id ? 0.4 : 0.9,
                      }}
                    />
                  )
                ) : null
              )}
            </MapContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AREA_COLOR }} />
              Collection Area
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapIcon className="h-3.5 w-3.5" /> Select an area to focus the map
            </span>
          </div>
        </div>
      </div>

      {approveTarget && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Approve Area</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {approveTarget.name} will be approved as an active collection zone for {approveTarget.barangay || "this barangay"}.
                </p>
              </div>
              <button onClick={() => setApproveTarget(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 flex gap-3">
              <button
                onClick={() => setApproveTarget(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={busyId === approveTarget.id}
                onClick={confirmApprove}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyId === approveTarget.id ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {declineTarget && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Decline Area</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {declineTarget.name} will be declined and the barangay will be notified with your remarks.
                </p>
              </div>
              <button onClick={() => setDeclineTarget(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 pt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                Reason for declining <span className="text-red-500">*</span>
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="Explain why this area is being declined..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
              />
            </div>
            <div className="p-6 flex gap-3">
              <button
                onClick={() => setDeclineTarget(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!declineReason.trim() || busyId === declineTarget.id}
                onClick={submitDecline}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyId === declineTarget.id ? "Declining..." : "Decline"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
