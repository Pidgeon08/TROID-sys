import { MapContainer, TileLayer, useMap, Polygon, Circle, CircleMarker, ZoomControl } from 'react-leaflet';
import { TILE_URL, TILE_ATTRIBUTION } from '../../services/mapTiles';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import {
  Calendar, ArrowRightLeft, Map as MapIcon, ListFilter, X, Target, Route, Layers, Bot, MapPin, Info,
} from 'lucide-react';
import { api } from '../../services/api';
import { SearchBar } from '../../components/ui/SearchBar';
import { useRealtime } from '../../hooks/useRealtime';
import {
  areaCoverage, splitByArea, trailStats, isMeasurableArea, formatArea, formatDistance, formatDuration, TRAIL_GAP_MS,
} from '../../utils/coverage';

// Default map view when there is nothing to show yet: San Fernando, La Union.
const SAN_FERNANDO_CENTER = [16.6195, 120.314];
const COVERAGE_RADII_M = [5, 10, 20, 30];
// Drawing a circle per point gets heavy past this; coverage is still measured on every point.
const MAX_COVERAGE_CIRCLES = 1500;
const BLUE = '#1b4de4';
const COVERED = '#10b981';
const OUTSIDE = '#f59e0b';

const HEAT_GRADIENTS = {
  'Waste Density': { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
  'Bot Pathing': { 0.0: '#0ea5e9', 0.5: '#22d3ee', 1.0: '#1e40af' },
  'Trash Collected': { 0.0: '#cbd5e1', 0.5: '#64748b', 1.0: '#0f172a' },
};
const LEGEND_CLASSES = {
  'Waste Density': 'bg-gradient-to-r from-blue-500 via-cyan-400 via-emerald-400 via-yellow-400 to-red-500',
  'Bot Pathing': 'bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-800',
  'Trash Collected': 'bg-gradient-to-r from-slate-300 via-slate-500 to-slate-900',
};

/** Leaflet.heat overlay. Waits until the map has a size so it never draws into a 0×0 canvas. */
function HeatmapLayer({ points, type }) {
  const map = useMap();

  useEffect(() => {
    let heat;
    let timer;
    const init = () => {
      const size = map.getSize();
      if (!size || size.x === 0 || size.y === 0) {
        timer = setTimeout(init, 50);
        return;
      }
      map.invalidateSize();
      const valid = (points || []).filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]) && !(p[0] === 0 && p[1] === 0));
      if (valid.length === 0) return;
      try {
        heat = L.heatLayer(valid, { radius: 35, blur: 25, maxZoom: 17, gradient: HEAT_GRADIENTS[type] || HEAT_GRADIENTS['Waste Density'] }).addTo(map);
      } catch (err) {
        console.error('Heatmap render error:', err);
      }
    };
    init();
    return () => {
      if (timer) clearTimeout(timer);
      if (heat) {
        try { map.removeLayer(heat); } catch { /* map already gone */ }
      }
    };
  }, [map, points, type]);

  return null;
}

/** Moves the map to `bounds` once per `fitKey`, so the 5-second refresh doesn't keep pulling it back. */
function FitBounds({ fitKey, bounds }) {
  const map = useMap();
  const fitted = useRef(null);
  useEffect(() => {
    if (!bounds || bounds.length === 0 || fitted.current === fitKey) return;
    fitted.current = fitKey;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true });
  }, [map, fitKey, bounds]);
  return null;
}

/** The collection area being compared, plus what TROID covered of it. */
function CoverageOverlay({ area, points, radiusM, showCoverage }) {
  const split = useMemo(() => splitByArea(area?.points, points), [area, points]);
  if (!area) return null;
  const circles = showCoverage ? split.inside.slice(0, MAX_COVERAGE_CIRCLES) : [];
  // A point just past the edge can still reach into the area, so its reach is drawn too.
  const outsideCircles = showCoverage ? split.outside.slice(0, MAX_COVERAGE_CIRCLES) : [];
  return (
    <>
      <Polygon
        positions={area.points}
        pathOptions={{ color: area.color || BLUE, weight: 2.5, dashArray: '6 5', fillColor: area.color || BLUE, fillOpacity: 0.06 }}
      />
      {circles.map((p, i) => (
        <Circle
          key={`c${i}`}
          center={[p[0], p[1]]}
          radius={radiusM}
          pathOptions={{ stroke: false, fillColor: COVERED, fillOpacity: 0.28 }}
          interactive={false}
        />
      ))}
      {outsideCircles.map((p, i) => (
        <Circle
          key={`oc${i}`}
          center={[p[0], p[1]]}
          radius={radiusM}
          pathOptions={{ stroke: false, fillColor: OUTSIDE, fillOpacity: 0.15 }}
          interactive={false}
        />
      ))}
      {outsideCircles.map((p, i) => (
        <CircleMarker
          key={`o${i}`}
          center={[p[0], p[1]]}
          radius={4}
          pathOptions={{ color: OUTSIDE, weight: 1.5, fillColor: OUTSIDE, fillOpacity: 0.85 }}
          interactive={false}
        />
      ))}
    </>
  );
}

function boundsOf(points) {
  return (points || []).filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).map((p) => [p[0], p[1]]);
}

function formatPct(pct) {
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function formatClock(ms) {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Panel({ icon: Icon, title, aside, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {Icon && <Icon className="w-4 h-4 text-slate-400" />}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold tabular-nums truncate ${tone}`}>{value}</dd>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            value === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );
}

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30';

function CoveragePanel({ area, coverage, radiusM, onRadiusChange, showCoverage, onToggleCoverage, emptyText }) {
  const radiusPicker = (
    <select value={radiusM} onChange={(e) => onRadiusChange(Number(e.target.value))} className={selectClass} aria-label="Coverage radius">
      {COVERAGE_RADII_M.map((r) => (
        <option key={r} value={r}>{r} m reach</option>
      ))}
    </select>
  );

  if (!area) {
    return (
      <Panel icon={Target} title="Area covered">
        <p className="text-xs text-slate-500 leading-relaxed">{emptyText}</p>
      </Panel>
    );
  }
  if (!isMeasurableArea(area)) {
    return (
      <Panel icon={Target} title="Area covered">
        <p className="text-xs text-slate-500 leading-relaxed">
          {area.name} is drawn as a line, not a closed shape, so how much of it was covered can't be measured.
        </p>
      </Panel>
    );
  }

  return (
    <Panel icon={Target} title="Area covered" aside={radiusPicker}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-3xl font-bold text-slate-900 tracking-tight tabular-nums">{formatPct(coverage.coveredPct)}</span>
        <span className="text-xs text-slate-500 text-right truncate" title={area.name}>
          of {area.name}
          {area.barangay ? `, ${area.barangay}` : ''}
        </span>
      </div>
      <div
        className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(coverage.coveredPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${Math.min(coverage.coveredPct, 100)}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Area size" value={formatArea(coverage.areaM2)} />
        <Stat label="Covered" value={formatArea(coverage.coveredM2)} tone="text-emerald-700" />
        <Stat label="Points inside" value={coverage.inside.toLocaleString()} />
        <Stat label="Points outside" value={coverage.outside.toLocaleString()} tone={coverage.outside > 0 ? 'text-amber-600' : 'text-slate-900'} />
      </dl>
      {coverage.total === 0 && (
        <p className="mt-4 text-xs text-slate-500">TROID hasn't reported any points for this view yet.</p>
      )}
      <label className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
        <input type="checkbox" checked={showCoverage} onChange={(e) => onToggleCoverage(e.target.checked)} className="rounded accent-[#1b4de4]" />
        Show covered ground on the map
      </label>
      <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
        Each point TROID reported counts as covering {radiusM} m around it. Covered is the share of the area within that reach of a point.
      </p>
    </Panel>
  );
}

function TrailPanel({ trail, count }) {
  return (
    <Panel icon={Route} title="Bot trail">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Distance" value={count > 1 ? formatDistance(trail.distanceM) : '—'} />
        <Stat label="Active time" value={count > 1 ? formatDuration(trail.activeMs) : '—'} />
        <Stat label="First point" value={formatClock(trail.first)} />
        <Stat label="Last point" value={formatClock(trail.last)} />
        <Stat label="Points" value={count.toLocaleString()} />
        <Stat label="Robots" value={trail.robots.toLocaleString()} />
      </dl>
      <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
        Measured between consecutive points from the same robot. Gaps over {TRAIL_GAP_MS / 60000} min are treated as separate runs.
      </p>
    </Panel>
  );
}

function CategoryPanel({ categories, total }) {
  const rows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <Panel icon={Layers} title="Trash detected" aside={<span className="text-xs font-semibold text-slate-500 tabular-nums">{total.toLocaleString()} items</span>}>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No trash detected in this view.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
          {rows.map(([cat, n]) => (
            <li key={cat}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 capitalize">{cat.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{n}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[#1b4de4]" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MapLegend({ type, area, showCoverage, radiusM }) {
  return (
    <div className="absolute left-3 bottom-3 z-[400] w-56 rounded-xl bg-white/95 border border-slate-200 shadow-sm px-3 py-2.5 text-[11px] text-slate-600">
      <div className="font-semibold text-slate-700">{type}</div>
      <div className={`mt-1.5 h-1.5 rounded-full ${LEGEND_CLASSES[type] || LEGEND_CLASSES['Waste Density']}`} />
      <div className="mt-1 flex justify-between text-slate-400"><span>Low</span><span>High</span></div>
      {area && (
        <ul className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1">
          <li className="flex items-center gap-2">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: area.color || BLUE }} />
            Collection area
          </li>
          {showCoverage && (
            <>
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: COVERED, opacity: 0.5 }} />
                Covered ({radiusM} m reach)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: OUTSIDE }} />
                Point outside the area
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function CoverageMap({ heatPoints, heatType, area, coveragePoints, radiusM, showCoverage, fitKey, emptyText }) {
  const bounds = area?.points?.length ? area.points : boundsOf(heatPoints);
  return (
    <div className="relative h-[460px] lg:h-[600px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
      <MapContainer
        center={SAN_FERNANDO_CENTER}
        zoom={14}
        zoomControl={false}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBounds fitKey={fitKey} bounds={bounds} />
        <HeatmapLayer points={heatPoints} type={heatType} />
        <CoverageOverlay area={area} points={coveragePoints} radiusM={radiusM} showCoverage={showCoverage} />
        <ZoomControl position="bottomright" />
      </MapContainer>
      <MapLegend type={heatType} area={area} showCoverage={showCoverage} radiusM={radiusM} />
      {heatPoints.length === 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] rounded-full bg-white/95 border border-slate-200 shadow-sm px-3 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          {emptyText}
        </div>
      )}
    </div>
  );
}

const HeatmapView = () => {
  const [activeView, setActiveView] = useState('live'); // 'live' | 'comparison'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeFilter, setTimeFilter] = useState('Today');
  const [heatmapType, setHeatmapType] = useState('Waste Density');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [detections, setDetections] = useState([]);
  const [knownCategories, setKnownCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realtimeNonce, setRealtimeNonce] = useState(0);

  const [areas, setAreas] = useState([]);
  const [compareAreaId, setCompareAreaId] = useState('');
  const [radiusM, setRadiusM] = useState(10);
  const [showCoverage, setShowCoverage] = useState(true);
  const [boats, setBoats] = useState([]);

  // Post-cleanup comparison: TROID-detected trash vs what was reported, per drive.
  const [comparisonData, setComparisonData] = useState([]);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestSearch, setRequestSearch] = useState('');
  const [requestBarangayFilter, setRequestBarangayFilter] = useState('All');
  const [requestStatusFilter, setRequestStatusFilter] = useState('All');

  // Live detection events from the Cloudflare Worker relay short-circuit the
  // 5s poll below; the poll stays as a fallback for when the Worker isn't reachable.
  useRealtime(
    useMemo(() => (message) => {
      if (message?.type === 'boat.detection') setRealtimeNonce((n) => n + 1);
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    api.postCleanupComparison()
      .then((data) => { if (!cancelled) setComparisonData(Array.isArray(data) ? data : []); })
      .catch((err) => console.error('Failed to fetch post-cleanup comparison data:', err))
      .finally(() => { if (!cancelled) setComparisonLoading(false); });
    api.collectionAreas({ status: 'approved' })
      .then((data) => { if (!cancelled) setAreas(Array.isArray(data) ? data : []); })
      .catch((err) => console.error('Failed to fetch collection areas:', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.boats()
      .then((data) => { if (!cancelled) setBoats(Array.isArray(data) ? data.filter((b) => !b.archived) : []); })
      .catch(() => {});
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const toIso = (value) => (value ? new Date(value).toISOString() : undefined);

    const fetchHeatmapData = async () => {
      try {
        const custom = timeFilter === 'Custom';
        const data = await api.getHeatmap({
          time_filter: timeFilter.toLowerCase(),
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          start: custom ? toIso(dateRange.from) : undefined,
          end: custom ? toIso(dateRange.to) : undefined,
        });
        if (cancelled) return;
        const valid = (Array.isArray(data) ? data : []).filter(
          (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0)
        );
        setDetections(valid);
        // Keep every category seen so far listed, even while one is filtered.
        setKnownCategories((prev) => {
          const all = new Set(prev);
          valid.forEach((p) => Object.keys(p.categories || {}).forEach((c) => all.add(c)));
          return all.size === prev.length ? prev : Array.from(all).sort();
        });
      } catch (err) {
        console.error('Failed to fetch heatmap data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHeatmapData();
    const interval = setInterval(fetchHeatmapData, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedCategory, timeFilter, dateRange, realtimeNonce]);

  // ---- Live view ----
  const heatPoints = useMemo(() => detections.map((p) => [p.latitude, p.longitude, p.weight || 0.5]), [detections]);
  const liveCategories = useMemo(() => {
    const cats = {};
    detections.forEach((p) => Object.entries(p.categories || {}).forEach(([c, n]) => { cats[c] = (cats[c] || 0) + n; }));
    return cats;
  }, [detections]);
  const liveTotal = useMemo(() => detections.reduce((sum, p) => sum + (p.trash_count || 0), 0), [detections]);
  const compareArea = areas.find((a) => String(a.id) === String(compareAreaId)) || null;
  const liveCoverage = useMemo(
    () => (isMeasurableArea(compareArea) ? areaCoverage(compareArea.points, heatPoints, radiusM) : null),
    [compareArea, heatPoints, radiusM]
  );
  const liveTrail = useMemo(() => trailStats(detections), [detections]);
  const areasByBarangay = useMemo(() => {
    const groups = {};
    areas.filter(isMeasurableArea).forEach((a) => { (groups[a.barangay || 'Other'] ||= []).push(a); });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [areas]);

  // ---- Comparison view ----
  const selectedDrive = selectedRequestId ? comparisonData.find((d) => d.request_id === selectedRequestId) || null : null;
  const comparisonScope = useMemo(() => (selectedDrive ? [selectedDrive] : comparisonData), [selectedDrive, comparisonData]);
  const driveDetections = useMemo(
    () => comparisonScope.flatMap((d) => (d.detections || []).map((e) => ({ ...e, boat: d.bot || d.request_id }))),
    [comparisonScope]
  );
  const driveHeatPoints = useMemo(
    () => driveDetections.map((e) => [e.latitude, e.longitude, Math.min((e.trash_count || 1) * 0.2, 1)]),
    [driveDetections]
  );
  const driveArea = useMemo(
    () => (selectedDrive?.collection_area ? { ...selectedDrive.collection_area, barangay: selectedDrive.barangay } : null),
    [selectedDrive]
  );
  const driveCoverage = useMemo(
    () => (isMeasurableArea(driveArea) ? areaCoverage(driveArea.points, driveHeatPoints, radiusM) : null),
    [driveArea, driveHeatPoints, radiusM]
  );
  const driveTrail = useMemo(() => trailStats(driveDetections), [driveDetections]);

  const categoryTotals = useMemo(() => comparisonScope.reduce(
    (acc, d) => {
      Object.entries(d.troid_categories || {}).forEach(([c, n]) => { acc.troid[c] = (acc.troid[c] || 0) + n; });
      Object.entries(d.user_categories || {}).forEach(([c, n]) => { acc.user[c] = (acc.user[c] || 0) + n; });
      return acc;
    },
    { troid: {}, user: {} }
  ), [comparisonScope]);
  const comparisonCategories = Array.from(new Set([...Object.keys(categoryTotals.troid), ...Object.keys(categoryTotals.user)])).sort();
  const troidGrandTotal = comparisonScope.reduce((sum, d) => sum + (d.troid_total || 0), 0);
  const userGrandTotal = comparisonScope.reduce((sum, d) => sum + (d.user_total || 0), 0);

  const requestBarangays = useMemo(() => Array.from(new Set(comparisonData.map((d) => d.barangay).filter(Boolean))).sort(), [comparisonData]);
  const requestStatuses = useMemo(() => Array.from(new Set(comparisonData.map((d) => d.status).filter(Boolean))).sort(), [comparisonData]);
  const filteredComparisonData = comparisonData.filter((d) => {
    const q = requestSearch.trim().toLowerCase();
    const matchesSearch = !q || d.request_id.toLowerCase().includes(q) || (d.barangay || '').toLowerCase().includes(q);
    const matchesBarangay = requestBarangayFilter === 'All' || d.barangay === requestBarangayFilter;
    const matchesStatus = requestStatusFilter === 'All' || d.status === requestStatusFilter;
    return matchesSearch && matchesBarangay && matchesStatus;
  });

  const onlineBots = boats.filter((b) => b.is_online).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <span className="text-sm font-medium text-slate-500">Loading coverage data...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Heatmap</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Where TROID found trash, and how much of a collection area it covered.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <span className={`w-2 h-2 rounded-full ${onlineBots > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <Bot className="w-3.5 h-3.5 text-slate-400" />
            {boats.length === 0 ? 'No bots registered' : `${onlineBots} of ${boats.length} bot${boats.length === 1 ? '' : 's'} online`}
          </span>
          <Segmented
            value={activeView}
            onChange={setActiveView}
            options={[
              { value: 'live', label: 'Live Heat Map', icon: MapIcon },
              { value: 'comparison', label: 'Post-Cleanup Comparison', icon: ArrowRightLeft },
            ]}
          />
        </div>
      </header>

      {activeView === 'live' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Segmented
              value={timeFilter}
              onChange={setTimeFilter}
              options={[
                { value: 'Today', label: 'Today' },
                { value: 'Weekly', label: '7 days' },
                { value: 'Monthly', label: '30 days' },
                { value: 'Custom', label: 'Custom', icon: Calendar },
              ]}
            />
            {timeFilter === 'Custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  aria-label="From"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className={selectClass}
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="datetime-local"
                  aria-label="To"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className={selectClass}
                />
              </div>
            )}
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className={selectClass} aria-label="Category">
              <option value="All">All categories</option>
              {knownCategories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={heatmapType} onChange={(e) => setHeatmapType(e.target.value)} className={selectClass} aria-label="Map layer">
              {Object.keys(HEAT_GRADIENTS).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="flex items-center gap-2 lg:ml-auto">
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <MapPin className="w-3.5 h-3.5" />
                Compare with
              </span>
              <select value={compareAreaId} onChange={(e) => setCompareAreaId(e.target.value)} className={`${selectClass} max-w-[240px]`}>
                <option value="">No collection area</option>
                {areasByBarangay.map(([barangay, list]) => (
                  <optgroup key={barangay} label={barangay}>
                    {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            <CoverageMap
              heatPoints={heatPoints}
              heatType={heatmapType}
              area={compareArea}
              coveragePoints={heatPoints}
              radiusM={radiusM}
              showCoverage={showCoverage}
              fitKey={compareArea ? `area-${compareArea.id}` : `points-${timeFilter}-${selectedCategory}-${heatPoints.length > 0}`}
              emptyText="No detections in this period"
            />
            <div className="flex flex-col gap-4">
              <CoveragePanel
                area={compareArea}
                coverage={liveCoverage}
                radiusM={radiusM}
                onRadiusChange={setRadiusM}
                showCoverage={showCoverage}
                onToggleCoverage={setShowCoverage}
                emptyText='Choose a collection area under "Compare with" to see how much of it TROID covered in this period.'
              />
              <TrailPanel trail={liveTrail} count={detections.length} />
              <CategoryPanel categories={liveCategories} total={liveTotal} />
            </div>
          </div>
        </>
      )}

      {activeView === 'comparison' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            {selectedDrive ? (
              <span className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{selectedDrive.request_id}</span>
                {selectedDrive.barangay ? ` · ${selectedDrive.barangay}` : ''}
                {selectedDrive.collection_area ? ` · ${selectedDrive.collection_area.name}` : ''}
              </span>
            ) : (
              <span className="text-sm text-slate-500">All completed cleanup drives. Select one to compare its collection area.</span>
            )}
            <div className="flex items-center gap-2">
              {selectedDrive && (
                <button
                  type="button"
                  onClick={() => setSelectedRequestId(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1b4de4] hover:bg-blue-50 transition-colors"
                >
                  Show all drives
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#153eb8] transition-colors"
              >
                <ListFilter className="w-3.5 h-3.5" />
                Select request
              </button>
            </div>
          </div>

          {comparisonLoading ? (
            <div className="flex items-center justify-center h-75 rounded-2xl border border-slate-200 bg-white">
              <span className="text-sm font-medium text-slate-500">Loading post-cleanup data...</span>
            </div>
          ) : comparisonData.length === 0 ? (
            <div className="flex items-center justify-center h-50 rounded-2xl border border-slate-200 bg-white">
              <span className="text-sm font-medium text-slate-400">No completed cleanup drives with trash reports yet.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
              <CoverageMap
                heatPoints={driveHeatPoints}
                heatType="Waste Density"
                area={isMeasurableArea(driveArea) ? driveArea : null}
                coveragePoints={driveHeatPoints}
                radiusM={radiusM}
                showCoverage={showCoverage}
                fitKey={selectedDrive ? `drive-${selectedDrive.request_id}` : 'drives-all'}
                emptyText={selectedDrive ? 'TROID reported no points for this drive' : 'TROID reported no points for these drives'}
              />
              <div className="flex flex-col gap-4">
                <CoveragePanel
                  area={driveArea}
                  coverage={driveCoverage}
                  radiusM={radiusM}
                  onRadiusChange={setRadiusM}
                  showCoverage={showCoverage}
                  onToggleCoverage={setShowCoverage}
                  emptyText={
                    selectedDrive
                      ? 'This request has no collection area attached, so there is nothing to compare its coverage with.'
                      : 'Select a request to compare where TROID went with the collection area it was sent to.'
                  }
                />
                {selectedDrive && <TrailPanel trail={driveTrail} count={driveDetections.length} />}
                <Panel
                  icon={ArrowRightLeft}
                  title="TROID vs reported"
                  aside={
                    <span className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1b4de4]" />TROID</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Reported</span>
                    </span>
                  }
                >
                  {comparisonCategories.length === 0 ? (
                    <p className="text-xs text-slate-500">No category counts for this selection.</p>
                  ) : (
                    <ul className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
                      {comparisonCategories.map((cat) => {
                        const troid = categoryTotals.troid[cat] || 0;
                        const user = categoryTotals.user[cat] || 0;
                        const max = Math.max(troid, user, 1);
                        return (
                          <li key={cat}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700 capitalize">{cat}</span>
                              <span className="tabular-nums">
                                <span className="font-semibold text-[#1b4de4]">{troid}</span>
                                <span className="text-slate-300"> / </span>
                                <span className="font-semibold text-emerald-600">{user}</span>
                              </span>
                            </div>
                            <div className="mt-1 flex flex-col gap-0.5">
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-[#1b4de4] rounded-full" style={{ width: `${(troid / max) * 100}%` }} />
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(user / max) * 100}%` }} />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <dl className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
                    <Stat label="TROID" value={troidGrandTotal.toLocaleString()} tone="text-[#1b4de4]" />
                    <Stat label="Reported" value={userGrandTotal.toLocaleString()} tone="text-emerald-700" />
                    <Stat
                      label="Difference"
                      value={`${troidGrandTotal - userGrandTotal > 0 ? '+' : ''}${troidGrandTotal - userGrandTotal}`}
                      tone={troidGrandTotal === userGrandTotal ? 'text-slate-400' : troidGrandTotal > userGrandTotal ? 'text-amber-600' : 'text-rose-600'}
                    />
                  </dl>
                </Panel>
              </div>
            </div>
          )}
        </>
      )}

      {/* Request selection modal: search + filter, opened via "Select request" */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-1100 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl bg-white border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Select a cleanup request</h3>
                <p className="text-xs text-slate-500 mt-0.5">Compare where TROID went with the request's collection area.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                aria-label="Close"
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
              <select value={requestBarangayFilter} onChange={(e) => setRequestBarangayFilter(e.target.value)} className={selectClass}>
                <option value="All">All barangays</option>
                {requestBarangays.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={requestStatusFilter} onChange={(e) => setRequestStatusFilter(e.target.value)} className={selectClass}>
                <option value="All">All statuses</option>
                {requestStatuses.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
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
                      <th className="py-2 pr-4 font-medium text-right">Points</th>
                      <th className="py-2 pr-4 font-medium text-right">TROID</th>
                      <th className="py-2 pr-4 font-medium text-right">Reported</th>
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
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <td className="py-2.5 pr-4 font-semibold">{d.request_id}</td>
                          <td className="py-2.5 pr-4">{d.barangay || '—'}</td>
                          <td className="py-2.5 pr-4 text-slate-500">
                            {d.date_submitted ? new Date(d.date_submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500">{d.collection_area?.name || '—'}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-500 tabular-nums">{(d.detections || []).length}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-[#1b4de4] tabular-nums">{d.troid_total}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-emerald-600 tabular-nums">{d.user_total}</td>
                          <td className={`py-2.5 text-right font-bold tabular-nums ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
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
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeatmapView;
