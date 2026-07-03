import { Trash2, Ship, ArrowUpRight, MapPin, Calendar } from 'lucide-react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import api from '../../services/api';

// --- HeatmapLayer Component ---
function HeatmapLayer({ points, type }) {
  const map = useMap();

  useEffect(() => {
    let heat;
    let timer;

    const initHeatLayer = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) {
        timer = setTimeout(initHeatLayer, 50);
        return;
      }
      map.invalidateSize();

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

      heat = L.heatLayer(points, {
        radius: 30,
        blur: 20,
        maxZoom: 17,
        gradient: gradients[type] || gradients['Waste Density'],
      }).addTo(map);
    };

    initHeatLayer();

    return () => {
      if (heat) map.removeLayer(heat);
      if (timer) clearTimeout(timer);
    };
  }, [map, points, type]);

  return null;
}

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('Monthly');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [heatmapType, setHeatmapType] = useState('Waste Density');

  const [loading, setLoading] = useState(true);
  const [addressPoints, setAddressPoints] = useState([]);
  const [topCreeks, setTopCreeks] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [creekConditions, setCreekConditions] = useState([]);
  const [boatsData, setBoatsData] = useState([]);
  const [requestsData, setRequestsData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [heatmapRes, requestsRes, boatsRes] = await Promise.all([
          api.getHeatmap(),
          api.requests(),
          api.boats(),
        ]);

        setAddressPoints(Array.isArray(heatmapRes) ? heatmapRes : []);
        setRequestsData(Array.isArray(requestsRes) ? requestsRes : []);
        setBoatsData(Array.isArray(boatsRes) ? boatsRes : []);

        const creekMap = {};
        requestsRes.forEach(req => {
          if (req.location_name) {
            if (!creekMap[req.location_name]) {
              creekMap[req.location_name] = { name: req.location_name, bags: 0, max: 25 };
            }
            creekMap[req.location_name].bags += (Number(req.bags) || 0);
          }
        });
        setTopCreeks(Object.values(creekMap).sort((a, b) => b.bags - a.bags).slice(0, 5));

        setRecentActivities(
          requestsRes.slice(0, 5).map(req => ({
            text: `Request ${req.request_id} submitted for ${req.location_name}`,
            time: req.date_submitted
              ? new Date(req.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : req.date_submitted,
          }))
        );

        const latestPerLocation = {};
        requestsRes.forEach(req => {
          if (req.location_name) {
            const current = latestPerLocation[req.location_name];
            if (!current || new Date(req.date_submitted) > new Date(current.date_submitted)) {
              latestPerLocation[req.location_name] = req;
            }
          }
        });
        const statusToColor = {
          'Pending': 'red',
          'Approved': 'green',
          'Declined': 'yellow',
          'Processing': 'yellow',
          'Completed': 'green',
          'Segregated': 'green',
        };
        setCreekConditions(
          Object.values(latestPerLocation).map(req => ({
            name: req.location_name,
            status: req.status.charAt(0).toUpperCase() + req.status.slice(1),
            color: statusToColor[req.status] || 'green',
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

  const totalBags = requestsData.reduce((sum, r) => sum + (Number(r.bags) || 0), 0);
  const activeBots = boatsData.filter(b => b.is_active).length;

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">

      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">Welcome back, John</p>
      </header>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-6">

          {/* ── STAT CARDS ROW ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Stat Card: Trash Collected */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Trash Collected by Bots</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">{totalBags}</span>
                    <span className="text-sm font-semibold text-slate-500">Bags</span>
                    <div className="flex items-center text-xs font-semibold text-red-500 ml-1">
                      <ArrowUpRight className="w-4 h-4 mr-0.5" />
                      <span>35.1% vs last week</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full h-16 mt-6 relative overflow-hidden rounded-b-2xl">
                <svg className="w-full h-full" viewBox="0 0 340 64" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>
                  <path d="M0,52 C60,42 90,12 130,22 C170,32 210,4 270,38 C300,55 320,40 340,48 L340,64 L0,64 Z" fill="url(#blueGrad)" />
                  <path d="M0,52 C60,42 90,12 130,22 C170,32 210,4 270,38 C300,55 320,40 340,48" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Stat Card: Deployed Bots */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Ship className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Deployed Cleaning in Barangays</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">{activeBots}</span>
                    <span className="text-sm font-semibold text-slate-500">Bots</span>
                    <div className="flex items-center text-xs font-semibold text-[#10b981] ml-1">
                      <ArrowUpRight className="w-4 h-4 mr-0.5" />
                      <span>24.3% vs last week</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full h-16 mt-6 relative overflow-hidden rounded-b-2xl">
                <svg className="w-full h-full" viewBox="0 0 340 64" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>
                  <path d="M0,54 C40,48 70,22 110,32 C150,42 190,8 240,24 C280,36 310,25 340,38 L340,64 L0,64 Z" fill="url(#greenGrad)" />
                  <path d="M0,54 C40,48 70,22 110,32 C150,42 190,8 240,24 C280,36 310,25 340,38" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>

          </div>

          {/* ── HEATMAP CARD ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col min-h-[550px] gap-4">

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

            <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 relative min-h-[380px]">
              <MapContainer
                center={[16.6332, 120.3191]}
                zoom={15}
                style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
        <div className="flex flex-col gap-6">

          {/* Panel 1: Most Trash Collected */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Most Trash Collected</h2>
              <button className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer">
                View all
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {topCreeks.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs font-bold text-slate-900 mb-1.5">
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0">{item.bags} Bags</span>
                    </div>
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
          </div>

          {/* Panel 2: Recent Activities */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Recent Activities</h2>
              <button className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer">
                View all
              </button>
            </div>
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
          </div>

          {/* Panel 3: Creek Conditions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Creek Conditions</h2>
              <button className="text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer">
                View in map
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {creekConditions.map((creek, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 truncate">{creek.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[11px] font-semibold ${
                      creek.color === 'red' ? 'text-red-500' :
                      creek.color === 'yellow' ? 'text-yellow-600' : 'text-emerald-500'
                    }`}>
                      {creek.status}
                    </span>
                    <div className={`w-3 h-3 rounded-full ${
                      creek.color === 'red' ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' :
                      creek.color === 'yellow' ? 'bg-yellow-400 shadow-[0_0_6px_#facc15]' : 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                    }`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
