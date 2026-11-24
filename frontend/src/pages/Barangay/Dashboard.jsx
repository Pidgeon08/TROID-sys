// Dashboard for barangay and NGO accounts: CENRO's dashboard and layout, limited to the
// barangay the account is assigned to (its location in User Management).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, Ship, Trash2 } from "lucide-react";
import api from "../../services/api";
import HotspotsCard from "../../components/HotspotsCard";
import PriorityAreaList from "../../components/PriorityAreaList";
import {
  DASHBOARD_CARD, Panel, RecentActivityList, RecentRequestsList, StatCard, TopAreasList,
} from "../../components/DashboardPanels";
import { canonicalBarangay } from "../../utils/barangayBoundaries";
import { cleanupsThisMonth, topCollectionAreas } from "../../constants/requests";
import { LIVE, useLiveVersion } from '../../hooks/useLiveUpdates';

const requestPath = (req) => `/barangay/requests/${req.request_id}`;
const areaPath = (area) => `/barangay/areas?area=${encodeURIComponent(area.area_id)}`;

const Dashboard = ({ currentUser: userProp }) => {
  const navigate = useNavigate();
  const outlet = useOutletContext() || {};
  const currentUser = userProp || outlet.currentUser;
  // Everything here is limited to this barangay, for barangay and NGO accounts alike.
  const barangay = canonicalBarangay(currentUser?.location || "") || (currentUser?.location || "").trim();

  const [requests, setRequests] = useState([]);
  const [priority, setPriority] = useState([]);
  const [loading, setLoading] = useState(true);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests, LIVE.areas);
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
  }, [live]);

  const ownRequests = useMemo(() => {
    if (!barangay) return [];
    const key = barangay.toLowerCase();
    return requests.filter((r) => {
      const place = r.barangay || r.requested_by_barangay || "";
      return (canonicalBarangay(place) || place).toLowerCase() === key;
    });
  }, [requests, barangay]);

  // The API already limits these to the account's barangay.
  const ownPriority = useMemo(() => priority.filter((p) => p.is_priority), [priority]);

  const monthDays = cleanupsThisMonth(ownRequests);
  const monthBags = monthDays.reduce((sum, day) => sum + day.bags, 0);
  const monthDrives = monthDays.reduce((sum, day) => sum + day.drives, 0);
  const monthName = new Date().toLocaleDateString("en-US", { month: "long", timeZone: "Asia/Manila" });
  const recent = ownRequests.slice(0, 5);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full max-w-[1400px] mx-auto animate-fade-in flex flex-col overflow-hidden">

      {/* Page header */}
      <header className="mb-6 shrink-0">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          {barangay ? `Barangay ${barangay} · ` : ""}Welcome back, {currentUser?.name || "there"}
        </p>
      </header>

      {!barangay && (
        <div className="mb-6 shrink-0 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
          Your account isn't assigned to a barangay yet, so there's nothing to show. Ask CENRO to set it in User Management.
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-6 h-full min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
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

          {barangay ? (
            <HotspotsCard title="Waste Hotspots" barangay={barangay} moreTo="/barangay/heatmap" className="flex-1 min-h-0" mapClassName="min-h-0" />
          ) : (
            <div className={`${DASHBOARD_CARD} flex-1 min-h-0 flex items-center justify-center p-6 text-sm text-slate-400`}>
              The hotspots map appears once your account has a barangay.
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN (Sidebar Panels) ── */}
        <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto">
          <Panel
            title="Priority Areas"
            icon={AlertTriangle}
            action={barangay ? { label: "View areas", onClick: () => navigate("/barangay/areas") } : null}
          >
            {barangay ? (
              <PriorityAreaList
                areas={ownPriority}
                showBarangay={false}
                emptyText="Your collection areas are bringing in the same or fewer bags per cleanup than last month."
              />
            ) : (
              <p className="text-xs text-slate-400 py-2">No barangay assigned.</p>
            )}
          </Panel>

          <Panel title="Most Trash Collected">
            <TopAreasList areas={topCollectionAreas(ownRequests)} showBarangay={false} />
          </Panel>

          <Panel title="Recent Activities" action={{ label: "View all", onClick: () => navigate("/barangay/requests") }}>
            <RecentActivityList requests={recent} requestPath={requestPath} areaPath={areaPath} />
          </Panel>

          <Panel title="Recent Requests" action={{ label: "View all", onClick: () => navigate("/barangay/requests") }}>
            <RecentRequestsList
              requests={recent}
              requestPath={requestPath}
              emptyText={`No requests for ${barangay || "your barangay"} yet.`}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
