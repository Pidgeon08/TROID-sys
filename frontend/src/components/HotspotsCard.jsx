// The hotspots map on the dashboards. CENRO sees the whole city; a barangay or NGO account sees
// only its assigned barangay (the API also limits those accounts to their own barangay).
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar } from 'lucide-react';
import api from '../services/api';
import { TILE_URL, TILE_ATTRIBUTION } from '../services/mapTiles';
import { HeatmapLayer, PathLayer } from './MapLayers';
import { BarangayOutline } from './AreaDrawing';
import { LEGEND_CLASSES, MAP_LAYERS, PATHING, PATH_COLORS, PATH_START } from '../constants/mapLayers';

const SAN_FERNANDO_CENTER = [16.6195, 120.314];
const PERIODS = [
  { label: 'Today', filter: 'today' },
  { label: 'Weekly', filter: 'weekly' },
  { label: 'Monthly', filter: 'monthly' },
];
const EMPTY_TEXT = {
  today: 'No trash detected today.',
  weekly: 'No trash detected in the last 7 days.',
  monthly: 'No trash detected in the last 30 days.',
  custom: 'No trash detected in this range.',
};

/** The custom range's ISO start and end; an empty end is left open. */
function customRange({ from, to }) {
  const iso = (value) => (value ? new Date(value).toISOString() : undefined);
  return { start: iso(from), end: iso(to) };
}

export default function HotspotsCard({ title, barangay, className = '', mapClassName = 'min-h-[380px]' }) {
  const [period, setPeriod] = useState('monthly');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [layer, setLayer] = useState(MAP_LAYERS[0]);
  const [reports, setReports] = useState([]);
  const [failed, setFailed] = useState(false);
  // The query the shown reports answer; it differs from `query` while the next one loads.
  const [loadedQuery, setLoadedQuery] = useState(null);

  const query = useMemo(() => {
    const params = { time_filter: period, barangay: barangay || undefined };
    if (period === 'custom') Object.assign(params, customRange(dateRange));
    return JSON.stringify(params);
  }, [period, dateRange, barangay]);
  const loading = loadedQuery !== query;

  useEffect(() => {
    let cancelled = false;
    api.getHeatmap(JSON.parse(query))
      .then((data) => {
        if (cancelled) return;
        setReports(Array.isArray(data) ? data : []);
        setFailed(false);
      })
      .catch((err) => {
        console.error('Failed to load hotspots:', err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => { if (!cancelled) setLoadedQuery(query); });
    return () => { cancelled = true; };
  }, [query]);

  const heatPoints = useMemo(() => {
    if (layer === 'Trash Collected') {
      const most = Math.max(1, ...reports.map((r) => r.trash_count || 0));
      return reports.map((r) => [r.latitude, r.longitude, (r.trash_count || 0) / most]);
    }
    return reports.map((r) => [r.latitude, r.longitude, r.weight || 0.5]);
  }, [reports, layer]);

  const items = reports.reduce((sum, r) => sum + (r.trash_count || 0), 0);

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col gap-4 ${className}`}>
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {loading ? 'Loading…' : `${reports.length} detection${reports.length === 1 ? '' : 's'} · ${items} item${items === 1 ? '' : 's'}`}
            {barangay ? ` in ${barangay}` : ''}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {PERIODS.map(({ label, filter }) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPeriod(filter)}
                aria-pressed={period === filter}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  period === filter ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              aria-pressed={period === 'custom'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 transition-all duration-200 ${
                period === 'custom' ? 'bg-[#1b4de4] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Custom</span>
              <Calendar className="w-3.5 h-3.5" />
            </button>
          </div>
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
            aria-label="Map layer"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition-all duration-200 outline-none"
          >
            {MAP_LAYERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            aria-label="From"
            className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 outline-none"
          />
          <span className="text-xs text-slate-400 font-medium">to</span>
          <input
            type="datetime-local"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            aria-label="To"
            className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 outline-none"
          />
        </div>
      )}

      <div className={`flex-1 rounded-xl overflow-hidden border border-slate-100 relative ${mapClassName}`}>
        <MapContainer
          center={SAN_FERNANDO_CENTER}
          zoom={14}
          style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          {barangay && <BarangayOutline barangay={barangay} />}
          {layer === PATHING ? <PathLayer reports={reports} /> : <HeatmapLayer points={heatPoints} type={layer} />}
        </MapContainer>
        {!loading && (failed || reports.length === 0) && (
          <div className="absolute inset-x-0 top-3 z-[400] flex justify-center pointer-events-none">
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow">
              {failed ? "The hotspots couldn't be loaded." : EMPTY_TEXT[period]}
            </span>
          </div>
        )}
      </div>

      {layer === PATHING ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: PATH_START }} /> Start of a run
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: PATH_COLORS[0] }} /> Reported point
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: PATH_COLORS[0] }} /> Latest point
          </span>
          <span>One colour per bot</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low</span>
          <div className={`flex-1 h-2 rounded-full ${LEGEND_CLASSES[layer] || LEGEND_CLASSES['Waste Density']}`} />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">High</span>
        </div>
      )}
    </div>
  );
}
