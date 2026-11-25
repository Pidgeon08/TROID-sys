// CENRO's dashboard: this month so far against the same dates last month, citywide. Every KPI and
// chart opens the Reports page on the same figures.
import { AlertTriangle, Inbox, Scale, Ship, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import api from '../../services/api';
import HotspotsCard from '../../components/HotspotsCard';
import PriorityAreaList from '../../components/PriorityAreaList';
import { Panel, RecentActivityList } from '../../components/DashboardPanels';
import {
  BagsChartCard, CleanupsChartCard, DashboardHeader, KpiCard, PlacesChartCard, WasteChartCard,
} from '../../components/DashboardOverview';
import { dashboardSummary, reportsLink } from '../../utils/dashboardData';
import { LIVE, useLiveVersion } from '../../hooks/useLiveUpdates';

const REPORTS = '/admin/reports';

const Dashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  const [loading, setLoading] = useState(true);
  const [requestsData, setRequestsData] = useState([]);
  const [priorityAreas, setPriorityAreas] = useState([]);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests, LIVE.areas);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [requestsRes, priorityRes] = await Promise.all([
          api.requests(),
          api.priorityAreas(),
        ]);
        setRequestsData(Array.isArray(requestsRes) ? requestsRes : []);
        setPriorityAreas(Array.isArray(priorityRes) ? priorityRes.filter((p) => p.is_priority) : []);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [live]);

  const summary = useMemo(() => dashboardSummary(requestsData), [requestsData]);
  const link = (chart) => reportsLink(REPORTS, summary.period, chart);
  const { now, before, change, received } = summary;

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <DashboardHeader
        subtitle={`Welcome back, ${currentUser?.name || 'Admin'}`}
        currentUser={currentUser}
        userType="admin"
        reportsPath={REPORTS}
        period={summary.period}
      />

      {/* KPIs: this month so far against the same dates last month */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Trash2} tint="bg-blue-50 text-blue-600" label="Bags Collected" value={now.bags} unit="bags"
          previous={before.bags} change={change.bags} comparedLabel="last month" to={link('bags')} />
        <KpiCard icon={Ship} tint="bg-emerald-50 text-emerald-600" label="Cleanups Finished" value={now.drives}
          previous={before.drives} change={change.drives} comparedLabel="last month" to={link('cleanups')} />
        <KpiCard icon={Scale} tint="bg-violet-50 text-violet-600" label="Weight Collected" value={now.weightKg} unit="kg"
          previous={before.weightKg} change={change.weightKg} comparedLabel="last month" to={link('comparison')} />
        <KpiCard icon={Inbox} tint="bg-amber-50 text-amber-600" label="Requests Received" value={received.now}
          previous={received.before} change={received.change} comparedLabel="last month"
          to="/admin/requests?range=thisMonth" hint="Open this month's requests" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BagsChartCard summary={summary} reportTo={link('bags')} />
        <CleanupsChartCard summary={summary} reportTo={link('cleanups')} />
      </div>

      <div className="mb-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        <HotspotsCard title="Collective Hotspots" moreTo="/admin/heatmap" mapClassName="min-h-[380px]" />
        {/* Collection areas whose cleanups bring in more bags each lately (last 30 days) than the month before. */}
        <Panel
          title={`Priority Areas (${priorityAreas.length})`}
          icon={AlertTriangle}
          action={{ label: 'View areas', onClick: () => navigate('/admin/collection-areas?priority=priority') }}
        >
          <PriorityAreaList
            areas={priorityAreas}
            emptyText="No collection area is bringing in more bags per cleanup than last month."
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WasteChartCard summary={summary} reportTo={link('waste')} />
        <PlacesChartCard summary={summary} title="Bags by Barangay" reportTo={link('places')} />
        <Panel title="Recent Activities" action={{ label: 'View all', onClick: () => navigate('/admin/requests') }}>
          <RecentActivityList
            requests={requestsData.slice(0, 6)}
            requestPath={(req) => `/admin/requests/${req.request_id}`}
            areaPath={(area) => `/admin/collection-areas?q=${encodeURIComponent(area.name)}&area=${encodeURIComponent(area.area_id)}`}
          />
        </Panel>
      </div>
    </div>
  );
};

export default Dashboard;
