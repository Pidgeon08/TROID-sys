import { Trash2, Ship, MapPin, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import api from '../../services/api';
import MonthSparkline from '../../components/MonthSparkline';
import HotspotsCard from '../../components/HotspotsCard';
import { cleanupsThisMonth, requestArea, topCollectionAreas } from '../../constants/requests';

const Dashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  const [loading, setLoading] = useState(true);
  const [topAreas, setTopAreas] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [requestsData, setRequestsData] = useState([]);
  const [priorityAreas, setPriorityAreas] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [requestsRes, priorityRes] = await Promise.all([
          api.requests(),
          api.priorityAreas(),
        ]);

        setRequestsData(Array.isArray(requestsRes) ? requestsRes : []);
        setPriorityAreas(Array.isArray(priorityRes) ? priorityRes : []);

        setTopAreas(topCollectionAreas(requestsRes));

        setRecentActivities(
          requestsRes.slice(0, 5).map(req => ({
            text: `Request ${req.request_id} submitted for ${requestArea(req)}`,
            time: req.date_submitted
              ? new Date(req.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : req.date_submitted,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

          {/* ── STAT CARDS ROW ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">

            {/* Stat Card: Trash Collected */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Trash Collected</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">{monthBags}</span>
                    <span className="text-sm font-semibold text-slate-500">Bags in {monthName}</span>
                  </div>
                </div>
              </div>
              <MonthSparkline days={monthDays.map((d) => ({ date: d.date, value: d.bags }))} color="#2563eb" unit="bag" />
            </div>

            {/* Stat Card: Cleanup Drives Done */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Ship className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Cleanup Drives Done</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">{monthDrives}</span>
                    <span className="text-sm font-semibold text-slate-500">Drives in {monthName}</span>
                  </div>
                </div>
              </div>
              <MonthSparkline days={monthDays.map((d) => ({ date: d.date, value: d.drives }))} color="#10b981" unit="drive" />
            </div>

          </div>

          {/* ── HOTSPOTS MAP ── */}
          <HotspotsCard title="Collective Hotspots" className="flex-1 min-h-0" mapClassName="min-h-0" />

        </div>

        {/* ── RIGHT COLUMN (Sidebar Panels) ── */}
        <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto">

          {/* Panel 0: Priority Areas — barangays auto-flagged from recent high-volume cleanups,
              each with a follow-up drive already booked on the fleet's schedule. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Priority Areas
              </h2>
              <button
                onClick={() => navigate('/admin/deployment')}
                className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
              >
                View schedule
              </button>
            </div>
            {priorityAreas.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No barangay has crossed the follow-up threshold yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {priorityAreas.slice(0, 5).map((area) => (
                  <div key={area.id} className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs font-bold text-slate-900">
                        <span className="truncate">{area.barangay}</span>
                        <span className="shrink-0">{area.total_bags} bags</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {area.bot_name
                          ? `Follow-up: ${area.bot_name} on ${area.scheduled_day}`
                          : 'Flagged — no bot available to auto-schedule yet'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel 1: Most Trash Collected */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Most Trash Collected</h2>
              <button
                onClick={() => navigate('/admin/reports')}
                className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
              >
                View all
              </button>
            </div>
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
                    <div className="flex justify-between gap-2 text-xs font-bold text-slate-900">
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0">{item.bags} Bags</span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500 mt-0.5 mb-1.5">{item.barangay}</p>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1b4de4] rounded-full transition-all duration-500"
                        style={{ width: `${(item.bags / item.max) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Panel 2: Recent Activities */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Recent Activities</h2>
              <button
                onClick={() => navigate('/admin/requests')}
                className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
              >
                View all
              </button>
            </div>
            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No recent activity yet.</p>
            ) : (
            <div className="flex flex-col gap-4">
              {recentActivities.map((act, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-400/80"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 leading-normal break-words">{act.text}</p>
                    <span className="text-[10px] font-semibold text-slate-400 mt-1 block">{act.time}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>


        </div>
      </div>
    </div>
  );
};

export default Dashboard;
