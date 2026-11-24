import { Trash2, Ship, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import api from '../../services/api';
import HotspotsCard from '../../components/HotspotsCard';
import PriorityAreaList from '../../components/PriorityAreaList';
import { Panel, RecentActivityList, StatCard, TopAreasList } from '../../components/DashboardPanels';
import { cleanupsThisMonth, topCollectionAreas } from '../../constants/requests';
import { LIVE, useLiveVersion } from '../../hooks/useLiveUpdates';

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

  const monthDays = cleanupsThisMonth(requestsData);
  const monthBags = monthDays.reduce((sum, day) => sum + day.bags, 0);
  const monthDrives = monthDays.reduce((sum, day) => sum + day.drives, 0);
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', timeZone: 'Asia/Manila' });

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
        <p className="text-slate-500 text-sm mt-1.5 font-medium">Welcome back, {currentUser?.name || 'Admin'}</p>
      </header>

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

          <HotspotsCard title="Collective Hotspots" moreTo="/admin/heatmap" className="flex-1 min-h-0" mapClassName="min-h-0" />
        </div>

        {/* ── RIGHT COLUMN (Sidebar Panels) ── */}
        <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto">
          {/* Collection areas whose cleanups bring in more bags each lately (last 30 days) than the month before. */}
          <Panel
            title="Priority Areas"
            icon={AlertTriangle}
            action={{ label: 'View areas', onClick: () => navigate('/admin/collection-areas?priority=priority') }}
          >
            <PriorityAreaList
              areas={priorityAreas}
              emptyText="No collection area is bringing in more bags per cleanup than last month."
            />
          </Panel>

          <Panel title="Most Trash Collected" action={{ label: 'View all', onClick: () => navigate('/admin/reports') }}>
            <TopAreasList areas={topCollectionAreas(requestsData)} />
          </Panel>

          <Panel title="Recent Activities" action={{ label: 'View all', onClick: () => navigate('/admin/requests') }}>
            <RecentActivityList
              requests={requestsData.slice(0, 5)}
              requestPath={(req) => `/admin/requests/${req.request_id}`}
              areaPath={(area) => `/admin/collection-areas?q=${encodeURIComponent(area.name)}&area=${encodeURIComponent(area.area_id)}`}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
