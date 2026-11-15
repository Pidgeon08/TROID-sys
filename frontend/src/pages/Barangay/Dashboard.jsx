// Dashboard for barangay and NGO accounts: CENRO's dashboard, limited to the barangay the
// account is assigned to (its location in User Management).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, MapPin, Ship, Trash2 } from "lucide-react";
import api from "../../services/api";
import MonthSparkline from "../../components/MonthSparkline";
import HotspotsCard from "../../components/HotspotsCard";
import { canonicalBarangay } from "../../utils/barangayBoundaries";
import {
  REQUEST_STATUS_STYLES,
  cleanupsThisMonth,
  requestArea,
  toStatusLabel,
  topCollectionAreas,
} from "../../constants/requests";

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]";

// How the website names a bot, e.g. "TRD-004" (Boat.label in the backend).
const botLabel = (id) => (id ? `TRD-${String(id).padStart(3, "0")}` : null);

function formatDay(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

function StatCard({ icon: Icon, title, value, unit, days, color, sparkUnit }) {
  return (
    <div className={`${CARD} flex flex-col justify-between overflow-hidden relative hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200`}>
      <div className="p-6 pb-0 flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 truncate">{title}</h3>
          <div className="flex items-baseline gap-2.5 mt-2">
            <span className="text-3xl font-bold text-slate-950 tracking-tight">{value}</span>
            <span className="text-sm font-semibold text-slate-500">{unit}</span>
          </div>
        </div>
      </div>
      <MonthSparkline days={days} color={color} unit={sparkUnit} />
    </div>
  );
}

const Dashboard = ({ currentUser: userProp }) => {
  const navigate = useNavigate();
  const outlet = useOutletContext() || {};
  const currentUser = userProp || outlet.currentUser;
  // Everything here is limited to this barangay, for barangay and NGO accounts alike.
  const barangay = canonicalBarangay(currentUser?.location || "") || (currentUser?.location || "").trim();

  const [requests, setRequests] = useState([]);
  const [priority, setPriority] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.requests(), api.priorityAreas()])
      .then(([requestsRes, priorityRes]) => {
        if (cancelled) return;
        if (requestsRes.status === "rejected") console.error("Failed to load requests:", requestsRes.reason);
        setRequests(requestsRes.status === "fulfilled" && Array.isArray(requestsRes.value) ? requestsRes.value : []);
        setPriority(priorityRes.status === "fulfilled" && Array.isArray(priorityRes.value) ? priorityRes.value : []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const ownRequests = useMemo(() => {
    if (!barangay) return [];
    const key = barangay.toLowerCase();
    return requests.filter((r) => {
      const place = r.barangay || r.requested_by_barangay || "";
      return (canonicalBarangay(place) || place).toLowerCase() === key;
    });
  }, [requests, barangay]);

  const ownPriority = useMemo(
    () => priority.filter((p) => (p.barangay || "").toLowerCase() === barangay.toLowerCase()),
    [priority, barangay]
  );

  const monthDays = cleanupsThisMonth(ownRequests);
  const monthBags = monthDays.reduce((sum, day) => sum + day.bags, 0);
  const monthDrives = monthDays.reduce((sum, day) => sum + day.drives, 0);
  const monthName = new Date().toLocaleDateString("en-US", { month: "long", timeZone: "Asia/Manila" });
  const topAreas = topCollectionAreas(ownRequests);
  const recent = ownRequests.slice(0, 5);
  const flagged = ownPriority[0];

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
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          {barangay ? `Barangay ${barangay} · ` : ""}Welcome back, {currentUser?.name || "there"}
        </p>
      </header>

      {!barangay && (
        <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
          Your account isn't assigned to a barangay yet, so there's nothing to show. Ask CENRO to set it in User Management.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatCard
              icon={Trash2}
              title="Trash Collected"
              value={monthBags}
              unit={`Bags in ${monthName}`}
              days={monthDays.map((d) => ({ date: d.date, value: d.bags }))}
              color="#2563eb"
              sparkUnit="bag"
            />
            <StatCard
              icon={Ship}
              title="Cleanup Drives Done"
              value={monthDrives}
              unit={`Drives in ${monthName}`}
              days={monthDays.map((d) => ({ date: d.date, value: d.drives }))}
              color="#10b981"
              sparkUnit="drive"
            />
          </div>

          {barangay && <HotspotsCard title="Waste Hotspots" barangay={barangay} className="min-h-[550px]" />}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <div className={`${CARD} p-5`}>
            <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-1.5 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Priority Area
            </h2>
            {flagged ? (
              <div className="flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs font-bold text-slate-900">
                    <span className="truncate">{flagged.barangay}</span>
                    <span className="shrink-0">{flagged.total_bags} bags</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Flagged {formatDay(flagged.identified_at)} for {flagged.total_bags} bags in {flagged.window_days} days.{" "}
                    {flagged.bot_name ? `Follow-up: ${flagged.bot_name} on ${flagged.scheduled_day}.` : "CENRO will schedule a follow-up drive."}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-2">
                {barangay ? `${barangay} hasn't been flagged for a follow-up drive.` : "No barangay assigned."}
              </p>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <h2 className="text-[15px] font-bold text-slate-900 mb-4">Most Trash Collected</h2>
            {topAreas.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No collection data yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {topAreas.map((item) => (
                  <div key={item.key} className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2 text-xs font-bold text-slate-900 mb-1.5">
                        <span className="truncate">{item.name}</span>
                        <span className="shrink-0">{item.bags} Bags</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1b4de4] rounded-full transition-all duration-500" style={{ width: `${(item.bags / item.max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Recent Activities</h2>
              <button
                type="button"
                onClick={() => navigate("/barangay/requests")}
                className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
              >
                View all
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No recent activity yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {recent.map((req) => (
                  <div key={req.request_id} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-400/80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 leading-normal break-words">
                        Request {req.request_id} submitted for {requestArea(req)}
                      </p>
                      <span className="text-[10px] font-semibold text-slate-400 mt-1 block">
                        {req.date_submitted
                          ? new Date(req.date_submitted).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent requests */}
      <div className={`${CARD} overflow-hidden mt-6`}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-[17px] font-bold text-slate-900">Recent Requests</h2>
          <button
            type="button"
            onClick={() => navigate("/barangay/requests")}
            className="text-xs font-semibold text-[#1b4de4] hover:text-[#153eb8]"
          >
            View all
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-4 py-2.5 font-medium">Request</th>
                <th className="px-4 py-2.5 font-medium">Collection Area / Location</th>
                <th className="px-4 py-2.5 font-medium">Submitted</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Bot Assigned</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((req) => {
                const status = toStatusLabel(req.status);
                return (
                  <tr
                    key={req.request_id}
                    onClick={() => navigate(`/barangay/requests/${req.request_id}`)}
                    className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-mono font-medium text-slate-800">{req.request_id}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {req.cleanup_type === "unsupported" ? req.location_name || "—" : requestArea(req) || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDay(req.date_submitted)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${REQUEST_STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {req.cleanup_type === "unsupported" ? "No bot (manual)" : botLabel(req.bot_id) || "Not assigned"}
                    </td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    No requests for {barangay || "your barangay"} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
