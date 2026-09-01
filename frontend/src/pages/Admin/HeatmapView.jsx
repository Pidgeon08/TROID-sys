import { MapContainer, TileLayer, useMap, Marker, Polygon, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { Calendar, Radar, ClipboardList, ArrowRightLeft, Map as MapIcon, ListFilter, X } from 'lucide-react';
import { api } from '../../services/api';
import { SearchBar } from '../../components/ui/SearchBar';

/**
 * ChangeView Component
 * Accesses the active Leaflet map instance using useMap().
 * Handles smooth flying/panning animations when the selected creek coordinates change.
 */
function ChangeView({ center, zoom }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom, {
      animate: true,
      duration: 1.0 // Smooth pan transition duration
    });
  }, [map, center, zoom]);
  
  return null;
}

/**
 * HeatmapLayer Component
 * Draws the waste density trail overlay on the canvas.
 * Correctly invalidates map size to prevent gray layout panels during render.
 */
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

/**
 * Interactive Creek Mock Data
 * Holds coordinates and metadata matching the revised screenshot labels.
 */
const HeatmapView = () => {
  const [activeView, setActiveView] = useState('live'); // 'live' | 'comparison'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeFilter, setTimeFilter] = useState('Today');
  const [heatmapType, setHeatmapType] = useState('Waste Density');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [heatmapData, setHeatmapData] = useState([]);
  const [categories, setCategories] = useState({});
  const [totalTrash, setTotalTrash] = useState(0);
  const [allCategories, setAllCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Post-cleanup comparison: TROID-detected trash vs what CENRO actually entered per drive.
  const [comparisonData, setComparisonData] = useState([]);
  const [comparisonSource, setComparisonSource] = useState('troid'); // 'troid' | 'user'
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestSearch, setRequestSearch] = useState('');
  const [requestBarangayFilter, setRequestBarangayFilter] = useState('All');
  const [requestStatusFilter, setRequestStatusFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;

    const fetchComparison = async () => {
      try {
        const data = await api.postCleanupComparison();
        if (cancelled) return;
        setComparisonData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch post-cleanup comparison data:', err);
      } finally {
        if (!cancelled) setComparisonLoading(false);
      }
    };

    fetchComparison();
    return () => { cancelled = true; };
  }, []);

  const selectedDrive = selectedRequestId
    ? comparisonData.find((d) => d.request_id === selectedRequestId) || null
    : null;

  // Scope the map + category breakdown to the selected request, or fall back to all drives.
  const comparisonScope = selectedDrive ? [selectedDrive] : comparisonData;

  const requestBarangays = useMemo(
    () => Array.from(new Set(comparisonData.map((d) => d.barangay).filter(Boolean))).sort(),
    [comparisonData]
  );
  const requestStatuses = useMemo(
    () => Array.from(new Set(comparisonData.map((d) => d.status).filter(Boolean))).sort(),
    [comparisonData]
  );

  const filteredComparisonData = comparisonData.filter((d) => {
    const q = requestSearch.trim().toLowerCase();
    const matchesSearch = !q || d.request_id.toLowerCase().includes(q) || (d.barangay || '').toLowerCase().includes(q);
    const matchesBarangay = requestBarangayFilter === 'All' || d.barangay === requestBarangayFilter;
    const matchesStatus = requestStatusFilter === 'All' || d.status === requestStatusFilter;
    return matchesSearch && matchesBarangay && matchesStatus;
  });

  // Polygon overlay for the selected request's collection area, if one was drawn for it.
  const selectedAreaPoints = selectedDrive?.collection_area?.points?.length >= 3
    ? selectedDrive.collection_area.points
    : null;
  const selectedAreaCenter = selectedAreaPoints
    ? selectedAreaPoints.reduce(
        (acc, p) => [acc[0] + p[0] / selectedAreaPoints.length, acc[1] + p[1] / selectedAreaPoints.length],
        [0, 0]
      )
    : null;

  const comparisonPoints = comparisonScope
    .filter((d) => typeof d.latitude === 'number' && typeof d.longitude === 'number')
    .map((d) => {
      const total = comparisonSource === 'troid' ? d.troid_total : d.user_total;
      return [d.latitude, d.longitude, Math.min((total || 0) * 0.15, 1)];
    });

  const comparisonCategoryTotals = comparisonScope.reduce(
    (acc, d) => {
      Object.entries(d.troid_categories || {}).forEach(([cat, count]) => {
        acc.troid[cat] = (acc.troid[cat] || 0) + count;
      });
      Object.entries(d.user_categories || {}).forEach(([cat, count]) => {
        acc.user[cat] = (acc.user[cat] || 0) + count;
      });
      return acc;
    },
    { troid: {}, user: {} }
  );

  const comparisonCategories = Array.from(
    new Set([...Object.keys(comparisonCategoryTotals.troid), ...Object.keys(comparisonCategoryTotals.user)])
  ).sort();

  const comparisonTroidGrandTotal = comparisonScope.reduce((sum, d) => sum + (d.troid_total || 0), 0);
  const comparisonUserGrandTotal = comparisonScope.reduce((sum, d) => sum + (d.user_total || 0), 0);

  useEffect(() => {
    let cancelled = false;

    const fetchHeatmapData = async () => {
      try {
        const params = {
          time_filter: timeFilter === 'Custom' ? undefined : timeFilter.toLowerCase(),
          category: selectedCategory === 'All' ? undefined : selectedCategory,
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
  }, [selectedCategory, timeFilter, dateRange]);

  const selectedBot = {
    name: 'All Detections',
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

  // Dynamically load Inter font to match the premium typography in the design
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Custom marker icon for "Point Baywalk" on the coast 
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

  // Custom visual label annotations to replicate water bodies and regions on the map
  const customLabels = [
    { position: [16.6358, 120.3235], text: 'Calibucao Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6338, 120.3275], text: 'Biday Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6315, 120.3168], text: 'San Fernando Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6292, 120.3285], text: 'Bacnotan Creek', color: 'text-blue-500 font-medium' },
    { position: [16.6300, 120.3220], text: 'San Fernando', color: 'text-slate-700 font-bold text-sm' }
  ];

  // Helper function to generate clean text overlays for map labels
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
        
        <div className="flex items-center gap-4">
          {/* View toggle: Live Heat Map <-> Post-Cleanup Comparison */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setActiveView('live')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all duration-200 ${
                activeView === 'live' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              Live Heat Map
            </button>
            <button
              onClick={() => setActiveView('comparison')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all duration-200 ${
                activeView === 'comparison' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Post-Cleanup Comparison
            </button>
          </div>

          {/* Started time & Status widget */}
          <div className="bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-xl px-5 py-2.5 flex flex-col gap-0.5 min-w-[160px]">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Started: {selectedBot.startedAt}</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                 selectedBot.status === 'Bot Online' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-rose-500'
               }`}></span>
              <span className={`text-[11px] font-bold ${
                         selectedBot.status === 'Bot Online' ? 'text-emerald-600' : 'text-rose-500'
                       }`}>
                         {selectedBot.status}
                       </span>
            </div>
          </div>
        </div>
      </header>

      {activeView === 'live' && (
      <>
      {/*  DASHBOARD GRID WORKSPACE */}
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

          {/* Leaflet Map wrapper - Using absolute positioning to prevent collapsing layout */}
          <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 relative min-h-[380px]">
            <MapContainer 
              center={selectedBot.center} 
              zoom={selectedBot.zoom} 
              zoomControl={false} 
              style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
            >
              {/* Fly map to new coordinates when active selection changes */}
              <ChangeView center={selectedBot.center} zoom={selectedBot.zoom} />

              {/* Minimal light base tiles */}
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              
              {/* Point Baywalk custom indicator marker */}
              <Marker position={[16.6335, 120.3110]} icon={baywalkIcon} />

              {/* River/Area name annotations */}
              {customLabels.map((lbl, idx) => (
                <Marker 
                  key={idx} 
                  position={lbl.position} 
                  icon={getLabelIcon(lbl.text, lbl.color)} 
                />
              ))}

              {/* Heatmap overlay canvas */}
              <HeatmapLayer points={selectedBot.points} type={heatmapType} />

              {/* Re-positioned zoom controls (bottom-right layout match) */}
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
          {selectedBot.categories && Object.keys(selectedBot.categories).length > 0 && (
            <div className="mt-4 bg-white border border-slate-100 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trash Categories Detected</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(selectedBot.categories).map(([category, count]) => (
                  <div key={category} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-slate-600 capitalize">{category}</span>
                    <span className="text-sm font-bold text-[#1b4de4]">{count}</span>
                  </div>
                ))}
              </div>
              {selectedBot.totalTrash > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Total Trash Collected</span>
                  <span className="text-lg font-bold text-[#1b4de4]">{selectedBot.totalTrash} items</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/*BOTTOM METRICS SECTION*/}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Metric 1: Area Covered */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-[100px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Area Covered</span>
          <div className="text-right">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight select-all">{selectedBot.areaCovered}</span>
          </div>
        </div>

        {/* Metric 2: Distance */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-[100px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Distance</span>
          <div className="text-right">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight select-all">{selectedBot.distance}</span>
          </div>
        </div>

        {/* Metric 3: Elapsed Time */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col justify-between h-[100px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Elapsed Time</span>
          <div className="text-right">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight select-all">{selectedBot.elapsedTime}</span>
          </div>
        </div>
      </div>
      </>
      )}

      {/* POST-CLEANUP COMPARISON SECTION */}
      {activeView === 'comparison' && (
      <div className="bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-slate-400" />
              Post-Cleanup Comparison
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Garbage data collected after each cleanup drive — TROID's onboard detections vs what CENRO actually reported.
            </p>
          </div>
          {/* Source toggle */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setComparisonSource('troid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all duration-200 ${
                comparisonSource === 'troid' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radar className="w-3.5 h-3.5" />
              TROID Detected
            </button>
            <button
              onClick={() => setComparisonSource('user')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all duration-200 ${
                comparisonSource === 'user' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              User Reported
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5">
          {selectedDrive ? (
            <span className="text-xs font-semibold text-slate-700">
              Showing TROID bot output for <span className="text-[#1b4de4]">{selectedDrive.request_id}</span>
              {selectedDrive.barangay ? ` — ${selectedDrive.barangay}` : ''}
              {selectedAreaPoints ? ' · collection area shown on map' : ''}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-500">Showing all completed cleanup drives</span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {selectedDrive && (
              <button
                onClick={() => setSelectedRequestId(null)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#1b4de4] hover:bg-blue-100 transition-colors"
              >
                Show all requests
              </button>
            )}
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#153eb8] transition-colors"
            >
              <ListFilter className="w-3.5 h-3.5" />
              Select request
            </button>
          </div>
        </div>

        {comparisonLoading ? (
          <div className="flex items-center justify-center h-75">
            <span className="text-sm font-medium text-slate-500">Loading post-cleanup data...</span>
          </div>
        ) : comparisonData.length === 0 ? (
          <div className="flex items-center justify-center h-50">
            <span className="text-sm font-medium text-slate-400">No completed cleanup drives with trash reports yet.</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-5">
              {/* Comparison heat map */}
              <div className="rounded-xl overflow-hidden border border-slate-100 relative min-h-130">
                <MapContainer
                  center={comparisonPoints.length > 0 ? [comparisonPoints[0][0], comparisonPoints[0][1]] : SAN_FERNANDO_CENTER}
                  zoom={14}
                  zoomControl={false}
                  style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <HeatmapLayer points={comparisonPoints} type="Trash Collected" />
                  {selectedAreaPoints && (
                    <Polygon
                      positions={selectedAreaPoints}
                      pathOptions={{
                        color: selectedDrive.collection_area.color || '#1b4de4',
                        weight: 2,
                        fillOpacity: 0.12,
                      }}
                    />
                  )}
                  {selectedDrive && (selectedAreaCenter || (typeof selectedDrive.latitude === 'number' && typeof selectedDrive.longitude === 'number')) && (
                    <ChangeView center={selectedAreaCenter || [selectedDrive.latitude, selectedDrive.longitude]} zoom={16} />
                  )}
                  <ZoomControl position="bottomright" />
                </MapContainer>
              </div>

              {/* Category comparison bars */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <span>{selectedDrive ? `${selectedDrive.request_id} category breakdown` : 'Category'}</span>
                  <span>TROID vs User</span>
                </div>
                <div className="flex flex-col gap-3 overflow-y-auto max-h-70 pr-1">
                  {comparisonCategories.map((cat) => {
                    const troidCount = comparisonCategoryTotals.troid[cat] || 0;
                    const userCount = comparisonCategoryTotals.user[cat] || 0;
                    const maxCount = Math.max(troidCount, userCount, 1);
                    return (
                      <div key={cat} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 capitalize">{cat}</span>
                          <span className="text-slate-400">
                            <span className="text-[#1b4de4] font-bold">{troidCount}</span>
                            {' / '}
                            <span className="text-emerald-600 font-bold">{userCount}</span>
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-[#1b4de4] rounded-full" style={{ width: `${(troidCount / maxCount) * 100}%` }} />
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(userCount / maxCount) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-[#1b4de4]" />
                    TROID total: <span className="text-slate-900 font-bold">{comparisonTroidGrandTotal}</span>
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    User total: <span className="text-slate-900 font-bold">{comparisonUserGrandTotal}</span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Request selection modal: search + filter, opened via "Select request" */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-1100 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl bg-white border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Select a cleanup request</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose a request to view its TROID bot output and collection area on the map.</p>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-b border-slate-100">
              <SearchBar
                value={requestSearch}
                onChange={setRequestSearch}
                placeholder="Search by request ID or barangay..."
                className="flex-1"
              />
              <select
                value={requestBarangayFilter}
                onChange={(e) => setRequestBarangayFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="All">All barangays</option>
                {requestBarangays.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="All">All statuses</option>
                {requestStatuses.map((s) => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </div>

            <div className="overflow-y-auto overflow-x-auto px-6 py-2 flex-1">
              {filteredComparisonData.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <span className="text-sm font-medium text-slate-400">No requests match your search/filters.</span>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase tracking-wider border-b border-slate-100 sticky top-0 bg-white">
                      <th className="py-2 pr-4 font-medium">Request</th>
                      <th className="py-2 pr-4 font-medium">Barangay</th>
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Area</th>
                      <th className="py-2 pr-4 font-medium text-right">TROID Detected</th>
                      <th className="py-2 pr-4 font-medium text-right">User Reported</th>
                      <th className="py-2 font-medium text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredComparisonData.map((d) => {
                      const diff = (d.troid_total || 0) - (d.user_total || 0);
                      const isSelected = selectedRequestId === d.request_id;
                      return (
                        <tr
                          key={d.request_id}
                          onClick={() => {
                            setSelectedRequestId(isSelected ? null : d.request_id);
                            setIsRequestModalOpen(false);
                          }}
                          title="Select to view this request's TROID bot output"
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 pr-4 font-semibold">{d.request_id}</td>
                          <td className="py-2.5 pr-4">{d.barangay || '—'}</td>
                          <td className="py-2.5 pr-4 text-slate-500">
                            {d.date_submitted ? new Date(d.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500">{d.collection_area?.name || '—'}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-[#1b4de4]">{d.troid_total}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-emerald-600">{d.user_total}</td>
                          <td className={`py-2.5 text-right font-bold ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      </>
      )}
    </div>
  );
};

export default HeatmapView;
