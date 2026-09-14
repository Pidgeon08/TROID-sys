import { MapContainer, TileLayer, useMap, Marker, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { Calendar } from 'lucide-react';
import api from '../../services/api';
import { useRealtime } from '../../hooks/useRealtime';

function ChangeView({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, {
      animate: true,
      duration: 1.0
    });
  }, [map, center, zoom]);

  return null;
}

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
          radius: 35,
          blur: 25,
          maxZoom: 17,
          gradient: gradients[type] || gradients['Waste Density']
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

// Default map center when no heatmap data is available yet: San Fernando, La Union.
const SAN_FERNANDO_CENTER = [16.6195, 120.314];

const Heatmap = ({ currentUser }) => {
  const barangayName = currentUser?.location || '';
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeFilter, setTimeFilter] = useState('Today');
  const [heatmapType, setHeatmapType] = useState('Waste Density');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [heatmapData, setHeatmapData] = useState([]);
  const [categories, setCategories] = useState({});
  const [totalTrash, setTotalTrash] = useState(0);
  const [allCategories, setAllCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realtimeNonce, setRealtimeNonce] = useState(0);

  // Live detection events from the Cloudflare Worker relay short-circuit the
  // 5s poll below; the poll stays as a fallback for when the Worker isn't
  // running/reachable.
  useRealtime(
    useCallback((message) => {
      if (message?.type === 'boat.detection') setRealtimeNonce((n) => n + 1);
    }, [])
  );

  useEffect(() => {
    let cancelled = false;

    const fetchHeatmapData = async () => {
      try {
        const params = {
          time_filter: timeFilter === 'Custom' ? undefined : timeFilter.toLowerCase(),
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          barangay: barangayName || undefined,
        };
        const data = await api.getHeatmap(params);
        if (cancelled) return;

        const points = [];
        const cats = {};
        let total = 0;

        const uniqueCats = new Set();

        data.forEach((p) => {
          if (!p.latitude || !p.longitude) return;
          if (isNaN(p.latitude) || isNaN(p.longitude)) return;
          if (p.latitude === 0 && p.longitude === 0) return;

          points.push([p.latitude, p.longitude, p.weight || 0.5]);

          if (p.trash_count) {
            total += p.trash_count;
          }

          if (p.categories) {
            Object.entries(p.categories).forEach(([cat, count]) => {
              cats[cat] = (cats[cat] || 0) + count;
              uniqueCats.add(cat);
            });
          }
        });

        setHeatmapData(points);
        setCategories(cats);
        setTotalTrash(total);
        setAllCategories(Array.from(uniqueCats).sort());
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch heatmap data:', err);
        setLoading(false);
      }
    };

    fetchHeatmapData();
    const interval = setInterval(fetchHeatmapData, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedCategory, timeFilter, dateRange, barangayName, realtimeNonce]);

  const selectedLoc = {
    name: selectedCategory === 'All' ? 'All Categories' : selectedCategory,
    center: heatmapData.length > 0 ? [heatmapData[0][0], heatmapData[0][1]] : SAN_FERNANDO_CENTER,
    zoom: 15,
    points: heatmapData,
    categories,
    totalTrash,
    areaCovered: heatmapData.length > 0 ? `${Math.min(95, Math.round(heatmapData.length * 5))}%` : '0%',
    distance: heatmapData.length > 0 ? `${(heatmapData.length * 0.4).toFixed(1)}km` : '0km',
    elapsedTime: heatmapData.length > 0 ? `${heatmapData.length * 5} min` : '0 min',
    startedAt: heatmapData.length > 0 ? '9:00 pm' : '-',
    status: heatmapData.length > 0 ? 'Bot Online' : 'Offline',
  };

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const baywalkIcon = L.divIcon({
    html: `
      <div class="flex items-center gap-1 bg-white/95 border border-slate-200 px-2 py-1 rounded shadow-[0_2px_6px_rgba(0,0,0,0.06)] whitespace-nowrap">
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 flex items-center justify-center">
          <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
        </div>
        <span class="text-[10px] font-bold text-slate-700 font-sans tracking-wide">Point Baywalk</span>
      </div>
    `,
    className: 'custom-baywalk-marker',
    iconSize: [110, 24],
    iconAnchor: [55, 12]
  });

  const customLabels = [
    { position: [16.6358, 120.3235], text: 'Calibucao Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6338, 120.3275], text: 'Biday Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6315, 120.3168], text: 'San Fernando Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6292, 120.3285], text: 'Bacnotan Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6300, 120.3220], text: 'San Fernando', color: 'text-slate-700 font-bold text-sm' }
  ];

  const getLabelIcon = (text, classes) => {
    return L.divIcon({
      html: `<span class="text-[11px] select-none pointer-events-none opacity-80 whitespace-nowrap font-sans ${classes}">${text}</span>`,
      className: 'bg-transparent border-none',
      iconSize: [100, 16],
      iconAnchor: [50, 8]
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 select-none">
      {loading && (
        <div className="flex items-center justify-center h-[500px]">
          <span className="text-sm font-medium text-slate-500">Loading coverage data...</span>
        </div>
      )}
      {!loading && (
        <>
          {/* HEADER BAR */}
          <header className="mb-6 flex justify-between items-center">
            <div className="flex flex-col">
              <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Coverage Tracking</h1>
              <p className="text-slate-500 text-xs mt-1.5 font-semibold uppercase tracking-wider">Live Gps Trail</p>
            </div>

            <div className="bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-xl px-5 py-2.5 flex flex-col gap-0.5 min-w-[160px]">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Started: {selectedLoc.startedAt}</span>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                   selectedLoc.status === 'Bot Online' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-rose-500'
                }`}></span>
                <span className={`text-[11px] font-bold ${
                  selectedLoc.status === 'Bot Online' ? 'text-emerald-600' : 'text-rose-500'
                }`}>
                  {selectedLoc.status}
                </span>
              </div>
            </div>
          </header>

          {/* DASHBOARD GRID WORKSPACE */}
          <div className="flex gap-6 items-start flex-1 min-h-[550px]">

            {/* Left vertical Category filter */}
            <div className="flex flex-col gap-3 flex-shrink-0">
              <button
                onClick={() => setSelectedCategory('All')}
                className={`w-32 py-3 px-4 rounded-xl border text-center text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                  selectedCategory === 'All'
                    ? 'bg-slate-300 border-slate-300 text-slate-800 shadow-sm'
                    : 'bg-white border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] text-slate-600 hover:text-slate-900 hover:border-slate-200'
                }`}
              >
                All
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-32 py-3 px-4 rounded-xl border text-center text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-slate-300 border-slate-300 text-slate-800 shadow-sm'
                      : 'bg-white border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] text-slate-600 hover:text-slate-900 hover:border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Center Live Heat Map Card */}
            <div className="flex-1 bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl p-6 flex flex-col min-h-[550px] gap-4">

              {/* Card Header Info */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-5">
                <h2 className="text-[17px] font-bold text-slate-900">Live Heat Map</h2>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition-all duration-200 outline-none"
                >
                  <option value="All">All Categories</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                  {/* Time Filter Tabs */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                    {['Today', 'Weekly', 'Monthly'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setTimeFilter(tab)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
                          timeFilter === tab ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                    <button
                      onClick={() => setTimeFilter('Custom')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 transition-all duration-200 ${
                        timeFilter === 'Custom' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>Custom</span>
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Date Range Pickers - shown when Custom is selected */}
                  {timeFilter === 'Custom' && (
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
                <span className="text-sm font-semibold text-slate-500">
                  {selectedCategory === 'All' ? 'All Categories' : selectedCategory}
                </span>
              </div>

              {/* Leaflet Map wrapper */}
              <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 relative min-h-[380px]">
                <MapContainer
                  center={selectedLoc.center}
                  zoom={selectedLoc.zoom}
                  zoomControl={false}
                  style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
                >
                  <ChangeView center={selectedLoc.center} zoom={selectedLoc.zoom} />

                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />

                  <Marker position={[16.6335, 120.3110]} icon={baywalkIcon} />

                  {customLabels.map((lbl, idx) => (
                    <Marker
                      key={idx}
                      position={lbl.position}
                      icon={getLabelIcon(lbl.text, lbl.color)}
                    />
                  ))}

                  <HeatmapLayer points={selectedLoc.points} type={heatmapType} />

                  <ZoomControl position="bottomright" />
                </MapContainer>
              </div>

              {/* Heatmap Legend */}
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

              {/* Category Breakdown */}
              {selectedLoc.categories && Object.keys(selectedLoc.categories).length > 0 && (
                <div className="mt-4 bg-white border border-slate-100 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trash Categories Detected</h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(selectedLoc.categories).map(([category, count]) => (
                      <div key={category} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <span className="text-xs font-semibold text-slate-600 capitalize">{category}</span>
                        <span className="text-sm font-bold text-[#1b4de4]">{count}</span>
                      </div>
                    ))}
                  </div>
                  {selectedLoc.totalTrash > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Total Trash Collected</span>
                      <span className="text-lg font-bold text-[#1b4de4]">{selectedLoc.totalTrash} items</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM METRICS SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-[100px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Area Covered</span>
              <div className="text-right">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight select-all">{selectedLoc.areaCovered}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-[100px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Distance</span>
              <div className="text-right">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight select-all">{selectedLoc.distance}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-[100px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Elapsed Time</span>
              <div className="text-right">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight select-all">{selectedLoc.elapsedTime}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Heatmap;
