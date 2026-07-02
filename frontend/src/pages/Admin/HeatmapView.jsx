import { MapContainer, TileLayer, useMap, Marker, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { Calendar } from 'lucide-react';

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
        radius: 35,
        blur: 25,
        maxZoom: 17,
        gradient: gradients[type] || gradients['Waste Density']
      }).addTo(map);
    };

    initHeatLayer();
    
    return () => {
      if (heat) {
        map.removeLayer(heat);
      }
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [map, points, type]);

  return null;
}

/**
 * Interactive Creek Mock Data
 * Holds coordinates and metadata matching the revised screenshot labels.
 */
const botData = {
'Carlatan Creek': {
     name: 'Carlatan Creek',
    center: [16.6325, 120.3200],
    zoom: 15,
    points: [
      [16.6332, 120.3191, 0.8], // Carlatan Creek bridge area
      [16.6325, 120.3200, 0.6], 
      [16.6315, 120.3210, 0.9], 
      [16.6305, 120.3225, 0.5], 
      [16.6340, 120.3180, 0.7], 
      [16.6350, 120.3165, 0.4], 
      [16.6360, 120.3150, 0.3], 
      [16.6320, 120.3205, 0.8], 
      [16.6338, 120.3262, 0.7], 
      [16.6345, 120.3255, 0.9], 
      [16.6355, 120.3250, 0.5], 
    ],
    areaCovered: '34%',
    distance: '2.4km',
    elapsedTime: '30 min',
    startedAt: '9:54 pm',
    status: 'Bot Online'
  },
  'Biday Creek': {
    name: 'Biday Creek',
    center: [16.6338, 120.3275],
    zoom: 15,
    points: [
      [16.6338, 120.3275, 0.9], // Main Biday Creek branch
      [16.6345, 120.3285, 0.8],
      [16.6350, 120.3295, 0.7],
      [16.6330, 120.3265, 0.6],
      [16.6325, 120.3255, 0.5],
      [16.6320, 120.3245, 0.4],
      [16.6315, 120.3235, 0.9],
    ],
    areaCovered: '48%',
    distance: '3.8km',
    elapsedTime: '50 min',
    startedAt: '9:12 pm',
    status: 'Bot Online'
  },
  'San Fernando Creek': {
    name: 'San Fernando Creek',
    center: [16.6300, 120.3220],
    zoom: 15,
    points: [
      [16.6300, 120.3220, 0.5], // Downtown creek reaches
      [16.6290, 120.3230, 0.6],
      [16.6280, 120.3245, 0.8],
      [16.6270, 120.3260, 0.9],
      [16.6310, 120.3205, 0.4],
      [16.6318, 120.3190, 0.3],
      [16.6260, 120.3270, 0.7],
    ],
    areaCovered: '61%',
    distance: '5.2km',
    elapsedTime: '90 min',
    startedAt: '8:30 pm',
    status: 'Bot Online'
  }
};

const HeatmapView = () => {
  const [selectedBotKey, setSelectedBotKey] = useState('Carlatan Creek');
  const [timeFilter, setTimeFilter] = useState('Today');
  const [heatmapType, setHeatmapType] = useState('Waste Density');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const selectedBot = botData[selectedBotKey];

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
      
      {/* HEADER BAR */}
      <header className="mb-6 flex justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Coverage Tracking</h1>
          <p className="text-slate-500 text-xs mt-1.5 font-semibold uppercase tracking-wider">Live Gps Trail</p>
        </div>
        
        {/* Started time & Status widget */}
        <div className="bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-xl px-5 py-2.5 flex flex-col gap-0.5 min-w-[160px]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Started: {selectedBot.startedAt}</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${selectedBot.status === 'Bot Online' ? 'bg-[#10b981] animate-pulse' : 'bg-rose-500'}`}></span>
            <span className={`text-[11px] font-bold ${selectedBot.status === 'Bot Online' ? 'text-[#10b981]' : 'text-rose-500'}`}>
              {selectedBot.status}
            </span>
          </div>
        </div>
      </header>

      {/*  DASHBOARD GRID WORKSPACE */}
      <div className="flex gap-6 items-start flex-1 min-h-[550px]">
        
        {/* Left vertical Creek select buttons stack */}
        <div className="flex flex-col gap-3 flex-shrink-0">
          {Object.keys(botData).map((botKey) => {
            const isSelected = selectedBotKey === botKey;
            return (
              <button
                key={botKey}
                onClick={() => setSelectedBotKey(botKey)}
                className={`w-32 py-3 px-4 rounded-xl border text-center text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-300 border-slate-300 text-slate-800 shadow-sm'
                    : 'bg-white border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] text-slate-600 hover:text-slate-900 hover:border-slate-200'
                }`}
              >
                {botKey}
              </button>
            );
          })}
        </div>

        {/* Center Live Heat Map Card */}
        <div className="flex-1 bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-2xl p-6 flex flex-col min-h-[550px] gap-4">
          
          {/* Card Header Info */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-5">
            <h2 className="text-[17px] font-bold text-slate-900">Live Heat Map</h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
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
            <span className="text-sm font-semibold text-slate-500">{selectedBot.name}</span>
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
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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

    </div>
  );
};

export default HeatmapView;
