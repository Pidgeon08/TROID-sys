import { Trash2, Ship, MapPin, Calendar, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { TILE_URL, TILE_ATTRIBUTION } from '../../services/mapTiles';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.heat';
import api from '../../services/api';
import MonthSparkline from '../../components/MonthSparkline';
import { cleanupsThisMonth, requestArea, topCollectionAreas } from '../../constants/requests';

// --- HeatmapLayer Component ---
function HeatmapLayer({ points, type }) {
  const map = useMap();

  useEffect(() => {
    let heat;
    let timer;

    const initHeatLayer = () => {
      try {
        const size = map.getSize();
        if (!size || size.x === 0 || size.y === 0) {
          timer = setTimeout(initHeatLayer, 50);
          return;
        }
        map.invalidateSize();

        const validPoints = (Array.isArray(points) ? points : [])
          .filter(p => {
            if (!p || typeof p[0] !== 'number' || typeof p[1] !== 'number') return false;
            if (isNaN(p[0]) || isNaN(p[1])) return false;
            if (p[0] === 0 && p[1] === 0) return false;
            return true;
          });

        if (validPoints.length === 0) return;

        const gradients = {
          'Waste Density': {
            0.4: 'blue',
            0.6: 'cyan',
            0.7: 'lime',
            0.8: 'yellow',
            1.0: 'red'
          },
          'Bot Pathing': {
            0.0: '#0ea5e9',
            0.5: '#22d3ee',
            1.0: '#1e40af'
          },
          'Trash Collected': {
            0.0: '#cbd5e1',
            0.5: '#64748b',
            1.0: '#0f172a'
          }
        };

        heat = L.heatLayer(validPoints, {
          radius: 30,
          blur: 20,
          maxZoom: 17,
          gradient: gradients[type] || gradients['Waste Density'],
        }).addTo(map);
      } catch (err) {
        console.error('Heatmap render error:', err);
      }
    };

    initHeatLayer();

    return () => {
      if (heat && map) {
        try {
          map.removeLayer(heat);
        } catch {
          // ignore cleanup errors
        }
      }
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [map, points, type]);

  return null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  const [activeTab, setActiveTab] = useState('Monthly');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [heatmapType, setHeatmapType] = useState('Waste Density');

  const [loading, setLoading] = useState(true);
  const [addressPoints, setAddressPoints] = useState([]);
  const [topAreas, setTopAreas] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [requestsData, setRequestsData] = useState([]);
  const [priorityAreas, setPriorityAreas] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [heatmapRes, requestsRes, priorityRes] = await Promise.all([
          api.getHeatmap(),
          api.requests(),
          api.priorityAreas(),
        ]);

        setAddressPoints(Array.isArray(heatmapRes) ? heatmapRes : []);
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

          {/* ── HEATMAP CARD ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col flex-1 min-h-0 gap-4">

            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-5">
              <h2 className="text-[17px] font-bold text-slate-900">Collective Hotspots</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {['Today', 'Weekly', 'Monthly'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
                        activeTab === tab ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                  <button
                    onClick={() => setActiveTab('Custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 transition-all duration-200 ${
                      activeTab === 'Custom' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Custom</span>
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                </div>
                {activeTab === 'Custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={dateRange.from}
                      onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                      className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 outline-none"
                    />
                    <span className="text-xs text-slate-400 font-medium">to</span>
                    <input
                      type="datetime-local"
                      value={dateRange.to}
                      onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                      className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 outline-none"
                    />
                  </div>
                )}
                <select
                  value={heatmapType}
                  onChange={(e) => setHeatmapType(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition-all duration-200 outline-none"
                >
                  <option value="Waste Density">Waste Density</option>
                  <option value="Bot Pathing">Bot Pathing</option>
                  <option value="Trash Collected">Trash Collected</option>
                </select>
              </div>
            </div>

            <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-100 relative">
              <MapContainer
                center={[16.6332, 120.3191]}
                zoom={15}
                style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
              >
                <TileLayer
                  url={TILE_URL}
                  attribution={TILE_ATTRIBUTION}
                />
                <HeatmapLayer points={addressPoints} type={heatmapType} />
              </MapContainer>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low {heatmapType === 'Bot Pathing' ? 'activity' : 'concentration'}</span>
              <div className={`flex-1 h-2 rounded-full ${
                heatmapType === 'Waste Density'
                  ? 'bg-gradient-to-r from-blue-500 via-cyan-400 via-emerald-400 via-yellow-400 to-red-500'
                  : heatmapType === 'Bot Pathing'
                  ? 'bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-700'
                  : 'bg-gradient-to-r from-slate-300 via-slate-400 to-slate-600'
              }`}></div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">High {heatmapType === 'Bot Pathing' ? 'activity' : 'concentration'}</span>
            </div>
          </div>

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
