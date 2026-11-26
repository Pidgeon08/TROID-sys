// Dashboard for barangay and NGO accounts: CENRO's dashboard, limited to the barangay the account is
// assigned to (its location in User Management). This month so far against the same dates last
// month. These accounts have no Reports page. On wide screens it fits the window without scrolling.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, Inbox, Scale, Ship, Trash2 } from "lucide-react";
import api from "../../services/api";
import HotspotsCard from "../../components/HotspotsCard";
import PriorityAreaList from "../../components/PriorityAreaList";
import { DASHBOARD_CARD, Panel, RecentRequestsList } from "../../components/DashboardPanels";
import { DashboardHeader, KpiCard, TrendsCard } from "../../components/DashboardOverview";
import { canonicalBarangay } from "../../utils/barangayBoundaries";
import { dashboardSummary } from "../../utils/dashboardData";
import { LIVE, useLiveVersion } from '../../hooks/useLiveUpdates';

const requestPath = (req) => `/barangay/requests/${req.request_id}`;

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
  // Bags are grouped by collection area here, since it is all one barangay.
  const summary = useMemo(() => dashboardSummary(ownRequests, { byArea: true }), [ownRequests]);
  const { now, before, change, received } = summary;
  const recent = ownRequests.slice(0, 5);
  const role = currentUser?.role === "ngo" ? "ngo" : "barangay";

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-6 xl:flex xl:h-full xl:flex-col xl:overflow-hidden xl:pb-0">
      <DashboardHeader
        subtitle={`${barangay ? `Barangay ${barangay} · ` : ""}Welcome back, ${currentUser?.name || "there"}`}
        currentUser={currentUser}
        userType={role}
        period={barangay ? summary.period : null}
      />

      {!barangay && (
        <div className="mb-4 shrink-0 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
          Your account isn't assigned to a barangay yet, so there's nothing to show. Ask CENRO to set it in User Management.
        </div>
      )}

      {barangay && (
        <div className="mb-4 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Trash2} tint="bg-blue-50 text-blue-600" label="Bags Collected" value={now.bags} unit="bags"
            previous={before.bags} change={change.bags} comparedLabel="last month" />
          <KpiCard icon={Ship} tint="bg-emerald-50 text-emerald-600" label="Cleanups Finished" value={now.drives}
            previous={before.drives} change={change.drives} comparedLabel="last month" />
          <KpiCard icon={Scale} tint="bg-violet-50 text-violet-600" label="Weight Collected" value={now.weightKg} unit="kg"
            previous={before.weightKg} change={change.weightKg} comparedLabel="last month" />
          <KpiCard icon={Inbox} tint="bg-amber-50 text-amber-600" label="Requests Sent" value={received.now}
            previous={received.before} change={received.change} comparedLabel="last month"
            to="/barangay/requests?range=thisMonth" hint="Open this month's requests" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)]">
        {barangay ? (
          <HotspotsCard title="Waste Hotspots" barangay={barangay} moreTo="/barangay/heatmap" className="min-h-[420px] xl:min-h-0" mapClassName="min-h-[300px] xl:min-h-0" />
        ) : (
          <div className={`${DASHBOARD_CARD} flex min-h-[200px] items-center justify-center p-6 text-sm text-slate-400`}>
            The hotspots map appears once your account has a barangay.
          </div>
        )}
        {barangay ? (
          <TrendsCard summary={summary} placesLabel="By area" className="min-h-[360px] xl:min-h-0" />
        ) : (
          <div className={`${DASHBOARD_CARD} flex min-h-[200px] items-center justify-center p-6 text-sm text-slate-400`}>
            This month&apos;s figures appear once your account has a barangay.
          </div>
        )}
        <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1 xl:min-h-0">
          <Panel
            fill
            className="max-h-[360px] xl:max-h-none xl:flex-1"
            title={`Priority Areas (${ownPriority.length})`}
            icon={AlertTriangle}
            action={barangay ? { label: "View areas", onClick: () => navigate("/barangay/areas") } : null}
          >
            {barangay ? (
              <PriorityAreaList
                areas={ownPriority}
                limit={20}
                showBarangay={false}
                emptyText="Your collection areas are bringing in the same or fewer bags per cleanup than last month."
              />
            ) : (
              <p className="text-xs text-slate-400 py-2">No barangay assigned.</p>
            )}
          </Panel>
          <Panel fill className="max-h-[360px] xl:max-h-none xl:flex-1" title="Recent Requests" action={{ label: "View all", onClick: () => navigate("/barangay/requests") }}>
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
