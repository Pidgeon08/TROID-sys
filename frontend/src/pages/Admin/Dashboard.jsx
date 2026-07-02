import { Trash2, Ship, ArrowUpRight, MapPin, Calendar } from 'lucide-react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';

// --- Sample heatmap data points ---
// Each entry is [latitude, longitude, intensity (0–1)]
// These represent trash hotspot coordinates around San Fernando, La Union
const addressPoints = [
  [16.6332, 120.3191, 0.8],
  [16.6325, 120.3200, 0.6],
  [16.6315, 120.3210, 0.9],
  [16.6305, 120.3225, 0.5],
  [16.6340, 120.3180, 0.7],
  [16.6350, 120.3165, 0.4],
  [16.6360, 120.3150, 0.3],
  [16.6320, 120.3205, 0.8],
];

// --- HeatmapLayer Component ---
// A child component used inside <MapContainer>.
// Uses useMap() hook to access the Leaflet map instance directly,
// then adds a heatLayer once the map has a valid size.
function HeatmapLayer({ points, type }) {
  const map = useMap(); // Access the parent Leaflet map instance

  useEffect(() => {
    let heat;   // Reference to the heatmap layer (for cleanup)
    let timer;  // Retry timer if the map isn't ready yet

    const initHeatLayer = () => {
      const size = map.getSize();

      // Guard: if the map container has no dimensions yet, retry after 50ms.
      // This prevents leaflet.heat from rendering a blank layer.
      if (size.x === 0 || size.y === 0) {
        timer = setTimeout(initHeatLayer, 50);
        return;
      }

      map.invalidateSize(); // Force Leaflet to recalculate its container size

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

      // Create and add the heatmap layer with styling options
      heat = L.heatLayer(points, {
        radius: 30,    // Size of each heat point
        blur: 20,      // Blur amount for smoother blending
        maxZoom: 17,   // Zoom level at which points reach max intensity
        gradient: gradients[type] || gradients['Waste Density'],
      }).addTo(map);
    };

    initHeatLayer();

    // Cleanup: remove the layer and cancel the timer when the component unmounts
    return () => {
      if (heat) map.removeLayer(heat);
      if (timer) clearTimeout(timer);
    };
  }, [map, points, type]); // Re-run if the map instance or data points change

  return null; // This component renders nothing — it only controls the map layer
}

// --- Dashboard Component ---
// Main page layout with stats cards, heatmap, and sidebar panels.
const Dashboard = () => {

  // Active tab for the heatmap time filter (Today / Weekly / Monthly / Custom)
  const [activeTab, setActiveTab] = useState('Monthly');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [heatmapType, setHeatmapType] = useState('Waste Density');

  // Toggle states — currently unused in the UI but wired for future accordion panels
  const [showTrash, setShowTrash] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [showCreeks, setShowCreeks] = useState(false);

  // --- Static Data ---

  // Top creeks ranked by number of trash bags collected
  const topCreeks = [
    { name: 'Carlatan Creek', bags: 23, max: 25 },
    { name: 'Biday Creek', bags: 23, max: 25 },
    { name: 'Catbangen River', bags: 18, max: 25 },
    { name: 'San Fernando Creek', bags: 15, max: 25 },
    { name: 'Poro Coastal Line', bags: 12, max: 25 },
  ];

  // Feed of recent bot and system events shown in the activity panel
  const recentActivities = [
    { text: 'Bot 02 completed cleanup at Carlatan', time: '14 mins ago' },
    { text: 'System alert: Bot 05 battery low (15%)', time: '45 mins ago' },
    { text: 'Collection report submitted for Barangay Biday', time: '2 hours ago' },
    { text: 'Bot 01 successfully deployed at Catbangen', time: '4 hours ago' },
    { text: 'Scheduled maintenance completed for Bot 03', time: '1 day ago' },
  ];

  // Current pollution status per creek: color drives badge styling
  const creekConditions = [
    { name: 'Carlatan Creek', status: 'Critical', color: 'red' },
    { name: 'Biday Creek', status: 'Warning', color: 'yellow' },
    { name: 'San Fernando Creek', status: 'Normal', color: 'green' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">

      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">Welcome back, John</p>
      </header>

      {/* Two-column layout: main content (left) + sidebar panels (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-6">

          {/* ── STAT CARDS ROW ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Stat Card: Trash Collected */}
            {/* Shows total bags collected by bots with a sparkline chart at the bottom */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Trash Collected by Bots</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">67</span>
                    <span className="text-sm font-semibold text-slate-500">Bags</span>
                    {/* Week-over-week change indicator */}
                    <div className="flex items-center text-xs font-semibold text-red-500 ml-1">
                      <ArrowUpRight className="w-4 h-4 mr-0.5" />
                      <span>35.1% vs last week</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* SVG sparkline with a blue gradient fill */}
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
            {/* Same structure as the trash card but uses green styling */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <div className="p-6 pb-0 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Ship className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 truncate">Deployed Cleaning in Barangays</h3>
                  <div className="flex items-baseline gap-2.5 mt-2">
                    <span className="text-3xl font-bold text-slate-950 tracking-tight">34</span>
                    <span className="text-sm font-semibold text-slate-500">Bots</span>
                    <div className="flex items-center text-xs font-semibold text-[#10b981] ml-1">
                      <ArrowUpRight className="w-4 h-4 mr-0.5" />
                      <span>24.3% vs last week</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* SVG sparkline with a green gradient fill */}
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

            {/* Card header with time filter tabs */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-5">
              <h2 className="text-[17px] font-bold text-slate-900">Collective Hotspots</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                {/* Standard time tabs */}
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
                  {/* Custom date range tab with calendar icon */}
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
                {/* Date Range Pickers - shown when Custom is selected */}
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
                {/* Heatmap Type Filter */}
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

            {/* Map container — flex-1 + relative ensures Leaflet gets real pixel dimensions */}
            <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 relative min-h-[380px]">
              <MapContainer
                center={[16.6332, 120.3191]} // Center on Carlatan Creek area
                zoom={15}
                // position: absolute fills the relative parent fully
                style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
              >
                {/* CartoDB light basemap — clean, minimal tile layer */}
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {/* Heatmap overlay rendered on top of the base tiles */}
                <HeatmapLayer points={addressPoints} type={heatmapType} />
              </MapContainer>
            </div>

            {/* Heatmap legend: low → high intensity color scale */}
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

          {/* Panel 1: Most Trash Collected — ranked list with progress bars */}
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
                    {/* Progress bar width = (bags / max) * 100% */}
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

          {/* Panel 2: Recent Activities — chronological event feed */}
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
                  {/* Timeline dot indicator */}
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

          {/* Panel 3: Creek Conditions — status badges per creek */}
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
                    {/* Status label — color driven by creek.color value */}
                    <span className={`text-[11px] font-semibold ${
                      creek.color === 'red' ? 'text-red-500' :
                      creek.color === 'yellow' ? 'text-yellow-600' : 'text-emerald-500'
                    }`}>
                      {creek.status}
                    </span>
                    {/* Glowing status dot — color + box-shadow match the severity */}
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