import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Calendar, Trash2, Ship } from "lucide-react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";
import api from "../../services/api";
import { REQUEST_STATUS_STYLES } from "../../constants/requests";

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

const Dashboard = ({ currentUser }) => {
  const navigate = useNavigate();
  const [barangayData, setBarangayData] = useState({});
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Monthly');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [heatmapType, setHeatmapType] = useState('Waste Density');
  const [addressPoints, setAddressPoints] = useState([]);
  const [topLocations, setTopLocations] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [locationConditions, setLocationConditions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [heatmapRes, requestsRes, boatsRes] = await Promise.all([
          api.getHeatmap(),
          api.requests(),
          api.boats(),
        ]);

        if (cancelled) return;

        const barangayName = (currentUser?.name || "").toLowerCase();
        const barangayRequests = requestsRes.filter((r) => {
          const reqBarangay = (r.requested_by_barangay || r.barangay || "").toLowerCase();
          return reqBarangay.includes(barangayName);
        });

        const totalRequests = barangayRequests.length;
        const pendingRequests = barangayRequests.filter((r) => r.status === "Pending" || r.status === "Pending Mayor Approval" || r.status === "Pending Admin Approval").length;
        const approvedRequests = barangayRequests.filter((r) => r.status === "Approved").length;
        const completedCleanups = barangayRequests.filter((r) => r.status === "Completed" || r.status === "Segregated").length;
        const activeBots = boatsRes.filter(b => b.is_active).length;

        let totalBags = 0;
        let totalWeight = 0;
        let recyclable = 0;
        let nonUsable = 0;

        barangayRequests.forEach((r) => {
          totalBags += Number(r.bags) || 0;
          totalWeight += Number(r.weight_kg) || 0;
          recyclable += Number(r.recyclable_kg) || 0;
          nonUsable += Number(r.non_usable_kg) || 0;
        });

        const mappedRecent = barangayRequests.slice(0, 5).map((r) => ({
          id: r.id,
          type: r.request_type || "Cleanup",
          date: r.date_submitted
            ? new Date(r.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '-',
          status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
          botId: r.bot_id ? `TRD-${String(r.bot_id).padStart(3, '0')}` : null,
        }));

        setAddressPoints(Array.isArray(heatmapRes) ? heatmapRes : []);

        const locationMap = {};
        barangayRequests.forEach(req => {
          if (req.location_name) {
            if (!locationMap[req.location_name]) {
              locationMap[req.location_name] = { name: req.location_name, bags: 0, max: 25 };
            }
            locationMap[req.location_name].bags += (Number(req.bags) || 0);
          }
        });
        setTopLocations(Object.values(locationMap).sort((a, b) => b.bags - a.bags).slice(0, 5));

        setRecentActivities(
          barangayRequests.slice(0, 5).map(req => ({
            text: `Request ${req.request_id} submitted for ${req.location_name}`,
            time: req.date_submitted
              ? new Date(req.date_submitted).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : req.date_submitted,
          }))
        );

        const latestPerLocation = {};
        barangayRequests.forEach(req => {
          if (req.location_name) {
            const current = latestPerLocation[req.location_name];
            if (!current || new Date(req.date_submitted) > new Date(current.date_submitted)) {
              latestPerLocation[req.location_name] = req;
            }
          }
        });
        const statusToColor = {
          'Pending': 'amber',
          'Approved': 'emerald',
          'Declined': 'red',
          'Parked': 'purple',
          'Processing': 'blue',
          'Completed': 'emerald',
          'Segregated': 'purple',
        };
        setLocationConditions(
          Object.values(latestPerLocation).map(req => ({
            name: req.location_name,
            status: req.status.charAt(0).toUpperCase() + req.status.slice(1),
            color: statusToColor[req.status] || 'emerald',
          }))
        );

        if (!cancelled) {
          setBarangayData({
            name: currentUser?.name || "Barangay",
            address: currentUser?.location || "",
            stats: {
              totalRequests,
              pendingRequests,
              approvedRequests,
              completedCleanups,
              activeBots,
              upcomingSchedule: barangayRequests.find((r) => r.status === "Approved")?.date_submitted || "N/A",
              totalBagsCollected: totalBags,
              totalWeightKg: totalWeight,
              recyclableKg: recyclable,
              nonUsableKg: nonUsable,
            },
          });
          setRecentRequests(mappedRecent);
        }
      } catch (err) {
        console.error("Failed to load barangay dashboard", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentUser?.name]);

  const stats = barangayData.stats || {};
  const recent = recentRequests;

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
        <p className="text-slate-500 text-sm mt-1.5 font-medium">{stats.address || currentUser?.location || ""}</p>
      </header>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-6">

          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Trash Collected</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">{stats.totalBagsCollected ?? 0}</span>
                    <span className="text-sm font-semibold text-slate-500">Bags</span>
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

            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Ship className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Active Bot Cleanups</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                     <span className="text-3xl font-bold text-slate-950 tracking-tight">{stats.activeBots ?? 0}</span>
                    <span className="text-sm font-semibold text-slate-500">Bots</span>
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

          {/* Heatmap Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col min-h-[550px] gap-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-5">
              <h2 className="text-[17px] font-bold text-slate-900">Waste Hotspots</h2>
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
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Top Waste Locations</h2>
            </div>
            <div className="flex flex-col gap-4">
              {topLocations.map((item, idx) => (
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
              {topLocations.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">No location data yet</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Recent Activities</h2>
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
              {recentActivities.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">No recent activities</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">Location Conditions</h2>
            </div>
            <div className="flex flex-col gap-3">
              {locationConditions.map((loc, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 truncate">{loc.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[11px] font-semibold ${
                      loc.color === 'red' ? 'text-red-500' :
                      loc.color === 'amber' ? 'text-yellow-600' : 'text-emerald-500'
                    }`}>
                      {loc.status}
                    </span>
                    <div className={`w-3 h-3 rounded-full ${
                      loc.color === 'red' ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' :
                      loc.color === 'amber' ? 'bg-yellow-400 shadow-[0_0_6px_#facc15]' : 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                    }`}></div>
                  </div>
                </div>
              ))}
              {locationConditions.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">No location conditions yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden mt-6">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-[17px] font-bold text-slate-900">Recent Requests</h2>
          <button
            onClick={() => navigate("/barangay/requests")}
            className="text-xs font-semibold text-[#1b4de4] hover:text-[#153eb8]"
          >
            View all
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-4 py-2.5 font-medium">Request Type</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Bot Assigned</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((req) => (
                <tr key={req.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{req.type}</td>
                  <td className="px-4 py-2.5 text-slate-500">{req.date}</td>
                  <td className="px-4 py-2.5">
                     <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${REQUEST_STATUS_STYLES[req.status] || 'bg-slate-100 text-slate-600'}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{req.botId || "Not assigned"}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                    No requests found.
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
