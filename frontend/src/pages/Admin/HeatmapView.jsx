import { MapContainer, TileLayer, useMap, useMapEvents, Polygon, Polyline, Circle, CircleMarker, ZoomControl } from 'react-leaflet';
import { AreaOutlines, ShowAreasSwitch } from '../../components/AreaOutlines';
import { TILE_URL, TILE_ATTRIBUTION } from '../../services/mapTiles';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Calendar, ArrowRightLeft, Map as MapIcon, ListFilter, X, Target, Route, Layers, Bot, MapPin, Info, Flame, ArrowLeft, History,
} from 'lucide-react';
import AreaHistoryOverlay, { AreaHistoryHeat } from '../../components/AreaHistoryOverlay';
import { useAreaHistory } from '../../hooks/useAreaHistory';
import { mapArea } from '../../utils/collectionAreaInfo';
import HotspotsView from '../../components/HotspotsView';
import { api } from '../../services/api';
import { SearchBar } from '../../components/ui/SearchBar';
import { useRealtime } from '../../hooks/useRealtime';
import {
  areaCoverage, splitByArea, travelLines, trailStats, isMeasurableArea, formatArea, formatDistance, formatDuration,
  TRAVEL_REACH_M,
} from '../../utils/coverage';
import { HeatmapLayer, PathLayer } from '../../components/MapLayers';
import { BarangayOutline, WaterwaysLayer } from '../../components/AreaDrawing';
import { EmptyState } from '../../components/ui/EmptyState';
import { barangayBounds } from '../../utils/barangayBoundaries';
import { MAP_LAYERS, PATHING, LEGEND_CLASSES, PATH_COLORS, PATH_START, formatClock } from '../../constants/mapLayers';
import { TROID_CLASSES } from '../../constants/trashReport';
import { LIVE, useLiveVersion } from '../../hooks/useLiveUpdates';

// Default map view when there is nothing to show yet: San Fernando, La Union.
const SAN_FERNANDO_CENTER = [16.6195, 120.314];
// Drawing a marker per point outside the area gets heavy past this; coverage still counts them all.
const MAX_OUTSIDE_MARKERS = 1500;
const BLUE = '#1b4de4';
const COVERED = '#10b981';
const OUTSIDE = '#f59e0b';

/**
 * Moves the map to `bounds` once per `fitKey`, so the 5-second refresh doesn't keep pulling it back.
 * `bottom` keeps that many pixels at the bottom clear (of a panel floating there).
 */
function FitBounds({ fitKey, bounds, bottom = 40 }) {
  const map = useMap();
  const fitted = useRef(null);
  useEffect(() => {
    if (!bounds || bounds.length === 0 || fitted.current === fitKey) return;
    fitted.current = fitKey;
    map.fitBounds(bounds, { paddingTopLeft: [40, 40], paddingBottomRight: [40, bottom], maxZoom: 17, animate: true });
  }, [map, fitKey, bounds, bottom]);
  return null;
}


/** The robot's travel path drawn as the strip it cleared: TRAVEL_REACH_M either side, at any zoom. */
function TravelStrip({ lines }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const lat = map.getCenter().lat;
  const pxPerM = (256 * 2 ** zoom) / (40075016.686 * Math.cos((lat * Math.PI) / 180));
  const weight = Math.max(2, 2 * TRAVEL_REACH_M * pxPerM);
  return lines.map((line, i) => (line.length === 1 ? (
    <Circle key={i} center={line[0]} radius={TRAVEL_REACH_M} interactive={false}
      pathOptions={{ stroke: false, fillColor: COVERED, fillOpacity: 0.35 }} />
  ) : (
    <Polyline key={i} positions={line} interactive={false}
      pathOptions={{ color: COVERED, weight, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }} />
  )));
}

/** The collection area being compared, plus what TROID covered of it: its travel path, cleared either side. */
function CoverageOverlay({ area, reports, showCoverage }) {
  const points = useMemo(() => (reports || []).map((r) => [r.latitude, r.longitude]), [reports]);
  const split = useMemo(() => splitByArea(area?.points, points), [area, points]);
  const lines = useMemo(() => (showCoverage ? travelLines(reports) : []), [reports, showCoverage]);
  if (!area) return null;
  const outside = showCoverage ? split.outside.slice(0, MAX_OUTSIDE_MARKERS) : [];
  return (
    <>
      <Polygon
        positions={area.points}
        pathOptions={{ color: area.color || BLUE, weight: 2.5, dashArray: '6 5', fillColor: area.color || BLUE, fillOpacity: 0.06 }}
      />
      {showCoverage && <TravelStrip lines={lines} />}
      {outside.map((p, i) => (
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

/** A side panel. `info` is the longer explanation, shown on hovering the ⓘ by its title. */
function Panel({ icon: Icon, title, aside, info, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {Icon && <Icon className="w-4 h-4 text-slate-400" />}
          {title}
          {info && (
            <span title={info} className="cursor-help text-slate-300 hover:text-slate-500" aria-label={info}>
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
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

function CleanupTypeBadge({ type, className = '' }) {
  const supported = type === 'troid_supported';
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        supported ? 'bg-blue-50 text-[#1b4de4]' : 'bg-slate-100 text-slate-500'
      } ${className}`}
    >
      {supported ? 'TROID supported' : 'Unsupported'}
    </span>
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

function CoveragePanel({ area, coverage, showCoverage, onToggleCoverage, emptyText }) {
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

  const info = [
    coverage.waterMapped
      ? `${formatArea(coverage.areaM2)} of its ${formatArea(coverage.outlineM2)} outline is waterway. Only the waterway counts, as that is all TROID can cover.`
      : 'No mapped waterway lies inside this area, so its whole outline is measured.',
    `Covered is what TROID's travel path cleared: the points it reported on the waterway, joined in the order it reported them, and ${TRAVEL_REACH_M} m either side of that line. Waterways (rivers, creeks, canals, ponds) are from OpenStreetMap.`,
  ].join(' ');
  return (
    <Panel icon={Target} title="Area covered" info={info}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">{formatPct(coverage.coveredPct)}</span>
        <span className="text-xs text-slate-500 text-right truncate" title={area.name}>
          of {area.name}
          {area.barangay ? `, ${area.barangay}` : ''}
        </span>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(coverage.coveredPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${Math.min(coverage.coveredPct, 100)}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label={coverage.waterMapped ? 'Water' : 'Area'} value={formatArea(coverage.areaM2)} />
        <Stat label="Covered" value={formatArea(coverage.coveredM2)} tone="text-emerald-700" />
        <Stat label="Inside" value={coverage.inside.toLocaleString()} />
        <Stat label="Outside" value={coverage.outside.toLocaleString()} tone={coverage.outside > 0 ? 'text-amber-600' : 'text-slate-900'} />
      </dl>
      {(coverage.onLand > 0 || coverage.total === 0) && (
        <p className="mt-2 text-[11px] text-slate-500">
          {coverage.total === 0
            ? "TROID hasn't reported any points for this view yet."
            : `${coverage.onLand.toLocaleString()} point${coverage.onLand === 1 ? ' was' : 's were'} reported off the waterways and cover nothing.`}
        </p>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
        <input type="checkbox" checked={showCoverage} onChange={(e) => onToggleCoverage(e.target.checked)} className="rounded accent-[#1b4de4]" />
        Show covered ground on the map
      </label>
    </Panel>
  );
}

function TrailPanel({ trail, count }) {
  return (
    <Panel
      icon={Route}
      title="Bot trail"
      info="Measured between consecutive points of the same cleanup: each request's run, per robot and day, is measured on its own and never joined to another."
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Distance" value={count > 1 ? formatDistance(trail.distanceM) : '—'} />
        <Stat label="Active time" value={count > 1 ? formatDuration(trail.activeMs) : '—'} />
        <Stat label="First point" value={formatClock(trail.first)} />
        <Stat label="Last point" value={formatClock(trail.last)} />
        <Stat label="Points" value={count.toLocaleString()} />
        <Stat label="Robots" value={trail.robots.toLocaleString()} />
      </dl>
    </Panel>
  );
}

/** What the robots detected, by TROID class (what TROID's vision sorts trash into), in their order. */
function CategoryPanel({ categories, total }) {
  const rows = total > 0 ? TROID_CLASSES.map((cls) => [cls, categories[cls] || 0]) : [];
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <Panel icon={Layers} title="Trash detected" aside={<span className="text-xs font-semibold text-slate-500 tabular-nums">{total.toLocaleString()} items</span>}>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No trash detected in this view.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {rows.map(([cat, n]) => (
            <li key={cat}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{cat}</span>
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

function MapLegend({ type, area, showCoverage }) {
  return (
    <div className="absolute left-3 bottom-3 z-[400] w-56 rounded-xl bg-white/95 border border-slate-200 shadow-sm px-3 py-2.5 text-[11px] text-slate-600">
      <div className="font-semibold text-slate-700">{type}</div>
      {type === PATHING ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: PATH_START, background: PATH_START }} />
            Start of a cleanup run
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: PATH_COLORS[0] }} />
            Point reported
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: PATH_COLORS[0] }} />
            Latest point
          </li>
          <li className="text-slate-400">One colour per cleanup request, per robot and day. Points with no request are gray and not joined. Hover a point for details.</li>
        </ul>
      ) : (
        <>
          <div className={`mt-1.5 h-1.5 rounded-full ${LEGEND_CLASSES[type] || LEGEND_CLASSES['Waste Density']}`} />
          <div className="mt-1 flex justify-between text-slate-400"><span>Low</span><span>High</span></div>
        </>
      )}
      {area && (
        <ul className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1">
          <li className="flex items-center gap-2">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: area.color || BLUE }} />
            Collection area
          </li>
          {showCoverage && (
            <>
              <li className="flex items-center gap-2">
                <span className="w-4 h-2 rounded-full" style={{ background: COVERED, opacity: 0.5 }} />
                Covered (path, {TRAVEL_REACH_M} m either side)
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

/**
 * The page's map. `outlines` draws those collection areas' outlines (`onSelectArea` on a click,
 * `areaHint` the hover's note).
 * For an area's monthly hotspots, `focusArea` is the area it fits to, `layers` its heat, `overlay`
 * the panel floating over the map's bottom; the live legend and empty note are left out then.
 */
function CoverageMap({
  heatPoints, heatType, reports, area, showCoverage, fitKey, emptyText, barangay,
  outlines = [], onSelectArea, areaHint, focusArea, layers, overlay, sizeClass = 'h-[460px] lg:h-[600px]',
}) {
  // A barangay's own page starts on the whole barangay; CENRO's on wherever TROID found trash.
  const fitTo = focusArea || area;
  const bounds = fitTo?.points?.length ? fitTo.points : (barangay && barangayBounds(barangay)) || boundsOf(heatPoints);
  return (
    <div className={`relative ${sizeClass} rounded-2xl overflow-hidden border border-slate-200 bg-slate-50`}>
      <MapContainer
        center={SAN_FERNANDO_CENTER}
        zoom={14}
        zoomControl={false}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBounds fitKey={fitKey} bounds={bounds} bottom={overlay ? 260 : 40} />
        {barangay && <BarangayOutline barangay={barangay} fit={false} />}
        <AreaOutlines areas={outlines} onSelect={onSelectArea} hint={areaHint} highlightId={focusArea?.id} />
        {layers || (
          <>
            {heatType !== PATHING && <HeatmapLayer points={heatPoints} type={heatType} />}
            <CoverageOverlay area={area} reports={reports} showCoverage={showCoverage} />
            {heatType === PATHING && <PathLayer reports={reports} />}
          </>
        )}
        <ZoomControl position={overlay ? 'topright' : 'bottomright'} />
      </MapContainer>
      {overlay}
      {!overlay && <MapLegend type={heatType} area={area} showCoverage={showCoverage} />}
      {!overlay && heatPoints.length === 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] rounded-full bg-white/95 border border-slate-200 shadow-sm px-3 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          {emptyText}
        </div>
      )}
    </div>
  );
}

/**
 * Where TROID found trash and how much of a collection area it covered. CENRO sees the whole
 * city. Given `barangay`, it is a barangay or NGO account's own page (Bot Tracking): only that
 * barangay's detections, collection areas and drives (the API limits those accounts the same way).
 */
const HeatmapView = ({ barangay }) => {
  const scoped = barangay !== undefined;
  // 'live' | 'hotspots' | 'comparison'; an area's monthly hotspots (?area=) open on Hotspots.
  const [activeView, setActiveView] = useState(() => (
    !scoped && new URLSearchParams(window.location.search).get('area') ? 'hotspots' : 'live'
  ));
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeFilter, setTimeFilter] = useState('Today');
  const [heatmapType, setHeatmapType] = useState('Waste Density');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [detections, setDetections] = useState([]);
  // The TROID classes the robots have detected so far, for the category filter.
  const [detectedClasses, setDetectedClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realtimeNonce, setRealtimeNonce] = useState(0);

  const [areas, setAreas] = useState([]);
  // Every approved collection area (mapped), for "Show collection areas" and an area's monthly hotspots.
  const [allAreas, setAllAreas] = useState([]);
  const [showAreas, setShowAreas] = useState(false);
  const [compareAreaId, setCompareAreaId] = useState('');
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

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests, LIVE.areas);
  useEffect(() => {
    let cancelled = false;
    api.postCleanupComparison()
      .then((data) => { if (!cancelled) setComparisonData(Array.isArray(data) ? data : []); })
      .catch((err) => console.error('Failed to fetch post-cleanup comparison data:', err))
      .finally(() => { if (!cancelled) setComparisonLoading(false); });
    // Only areas a TROID-supported cleanup was sent to: unsupported cleanups had no robot to compare.
    api.collectionAreas({ status: 'approved', troid_supported: true, barangay: barangay || undefined })
      .then((data) => { if (!cancelled) setAreas(Array.isArray(data) ? data : []); })
      .catch((err) => console.error('Failed to fetch collection areas:', err));
    api.collectionAreas({ status: 'approved', barangay: barangay || undefined })
      .then((data) => { if (!cancelled) setAllAreas(Array.isArray(data) ? data.map(mapArea) : []); })
      .catch((err) => console.error('Failed to fetch collection areas:', err));
    return () => { cancelled = true; };
  }, [barangay, live]);

  // CENRO's monthly hotspots of one collection area (?area=CA-0001, from "View more" on its card in
  // Collection Areas, or a click on it in Hotspots): its heatmap month by month, on the Hotspots tab.
  const { currentUser } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const historyId = scoped ? null : params.get('area');
  const historyArea = historyId ? allAreas.find((a) => a.id === historyId) || null : null;
  const history = useAreaHistory(historyArea);
  const openHistory = (area) => {
    setActiveView('hotspots');
    setParams((prev) => { const next = new URLSearchParams(prev); next.set('area', area.id); return next; });
  };
  const closeHistory = () => setParams((prev) => { const next = new URLSearchParams(prev); next.delete('area'); return next; });

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
          barangay: barangay || undefined,
          start: custom ? toIso(dateRange.from) : undefined,
          end: custom ? toIso(dateRange.to) : undefined,
        });
        if (cancelled) return;
        const valid = (Array.isArray(data) ? data : []).filter(
          (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0)
        );
        setDetections(valid);
        // Keep every class seen so far listed, even while one is filtered.
        setDetectedClasses((prev) => {
          const seen = new Set(prev);
          valid.forEach((p) => Object.entries(p.categories || {}).forEach(([c, n]) => { if (n > 0) seen.add(c); }));
          return seen.size === prev.length ? prev : TROID_CLASSES.filter((c) => seen.has(c));
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
  }, [selectedCategory, timeFilter, dateRange, realtimeNonce, barangay]);

  // ---- Live view ----
  const heatPoints = useMemo(() => detections.map((p) => [p.latitude, p.longitude, p.weight ?? 0.5]), [detections]);
  const liveCategories = useMemo(() => {
    const cats = {};
    detections.forEach((p) => Object.entries(p.categories || {}).forEach(([c, n]) => { cats[c] = (cats[c] || 0) + n; }));
    return cats;
  }, [detections]);
  const liveTotal = useMemo(() => detections.reduce((sum, p) => sum + (p.trash_count || 0), 0), [detections]);
  const compareArea = areas.find((a) => String(a.id) === String(compareAreaId)) || null;
  const liveCoverage = useMemo(
    () => (isMeasurableArea(compareArea) ? areaCoverage(compareArea.points, detections) : null),
    [compareArea, detections]
  );
  const liveTrail = useMemo(() => trailStats(detections), [detections]);
  const areasByBarangay = useMemo(() => {
    const groups = {};
    areas.filter(isMeasurableArea).forEach((a) => { (groups[a.barangay || 'Other'] ||= []).push(a); });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [areas]);
  // The areas "Compare with" offers, by area ID: clicking one's outline on the live map picks it.
  const comparableById = useMemo(
    () => new Map(areasByBarangay.flatMap(([, list]) => list).map((a) => [a.area_id, a])),
    [areasByBarangay]
  );
  const selectCompareArea = (area) => {
    const match = comparableById.get(area.id);
    if (match) setCompareAreaId(String(match.id));
  };

  // ---- Comparison view ----
  const selectedDrive = selectedRequestId ? comparisonData.find((d) => d.request_id === selectedRequestId) || null : null;
  const comparisonScope = useMemo(() => (selectedDrive ? [selectedDrive] : comparisonData), [selectedDrive, comparisonData]);
  const driveDetections = useMemo(
    () => comparisonScope.flatMap((d) => (d.detections || []).map((e) => ({ ...e, boat: d.bot || d.request_id }))),
    [comparisonScope]
  );
  const driveHeatPoints = useMemo(
    () => driveDetections.map((e) => [e.latitude, e.longitude, Math.min((e.trash_count ?? 1) * 0.2, 1)]),
    [driveDetections]
  );
  const driveArea = useMemo(
    () => (selectedDrive?.collection_area ? { ...selectedDrive.collection_area, barangay: selectedDrive.barangay } : null),
    [selectedDrive]
  );
  const driveCoverage = useMemo(
    () => (isMeasurableArea(driveArea) ? areaCoverage(driveArea.points, driveDetections) : null),
    [driveArea, driveDetections]
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

  if (scoped && !barangay) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
        <EmptyState
          title="No barangay set for this account"
          subtitle="Bot Tracking shows your barangay's cleanups. Ask CENRO to set your barangay in User Management."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <span className="text-sm font-medium text-slate-500">Loading coverage data...</span>
      </div>
    );
  }

  return (
    <div className={`max-w-[1400px] mx-auto animate-fade-in pb-12 ${activeView === 'live' ? 'lg:flex lg:h-full lg:flex-col lg:overflow-hidden lg:pb-0' : ''}`}>
      <header className="mb-4 shrink-0 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">{scoped ? 'Bot Tracking' : 'Heatmap'}</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            {scoped
              ? `Where TROID found trash in ${barangay}, and how much of your collection areas it covered.`
              : 'Where TROID found trash, and how much of a collection area it covered.'}
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
              { value: 'hotspots', label: 'Hotspots', icon: Flame },
              { value: 'comparison', label: 'Post-Cleanup Comparison', icon: ArrowRightLeft },
            ]}
          />
        </div>
      </header>

      {activeView === 'hotspots' && !historyArea && (
        <HotspotsView
          barangay={barangay}
          areas={allAreas}
          showAreas={showAreas}
          onShowAreas={setShowAreas}
          onSelectArea={scoped ? undefined : openHistory}
        />
      )}

      {activeView === 'hotspots' && historyArea && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={closeHistory}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All hotspots
            </button>
            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <History className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: historyArea.color }} />
              <span className="truncate">
                <span className="font-semibold text-slate-900">{historyArea.name}</span> · {historyArea.barangay} · monthly hotspots
              </span>
            </span>
            <span className="text-xs text-slate-400 lg:ml-auto">Pick a month below to see its heatmap; the Compare switch adds the month before in gray.</span>
          </div>
          <CoverageMap
            heatPoints={[]}
            heatType="Waste Density"
            reports={[]}
            area={null}
            showCoverage={false}
            fitKey={`history-${historyArea.id}`}
            barangay={barangay}
            outlines={[historyArea]}
            focusArea={historyArea}
            layers={(
              <>
                <WaterwaysLayer />
                <AreaHistoryHeat history={history} />
              </>
            )}
            overlay={<AreaHistoryOverlay key={historyArea.id} history={history} currentUser={currentUser} onClose={closeHistory} />}
          />
        </>
      )}

      {activeView === 'live' && (
        <>
          <div className="mb-4 shrink-0 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
              <option value="All">All trash classes</option>
              {/* Only the classes TROID's vision sorts trash into, and only those it has detected. */}
              {detectedClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={heatmapType} onChange={(e) => setHeatmapType(e.target.value)} className={selectClass} aria-label="Map layer">
              {MAP_LAYERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <ShowAreasSwitch on={showAreas} onChange={setShowAreas} title="Outline every collection area; click one to compare with it" />
            <label className="flex items-center gap-2 lg:ml-auto">
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <MapPin className="w-3.5 h-3.5" />
                Compare with
              </span>
              <select value={compareAreaId} onChange={(e) => setCompareAreaId(e.target.value)} className={`${selectClass} max-w-[240px]`}>
                <option value="">{areasByBarangay.length === 0 ? 'No TROID-supported areas yet' : 'No collection area'}</option>
                {scoped
                  ? areasByBarangay.flatMap(([, list]) => list).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)
                  : areasByBarangay.map(([group, list]) => (
                    <optgroup key={group} label={group}>
                      {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] gap-4 items-start lg:items-stretch lg:min-h-0 lg:flex-1">
            <CoverageMap
              heatPoints={heatPoints}
              heatType={heatmapType}
              reports={detections}
              area={compareArea}
              showCoverage={showCoverage}
              sizeClass="h-[460px] lg:h-full"
              fitKey={compareArea ? `area-${compareArea.id}` : scoped ? `barangay-${barangay}` : `points-${timeFilter}-${selectedCategory}-${heatPoints.length > 0}`}
              emptyText="No detections in this period"
              barangay={barangay}
              outlines={showAreas ? allAreas.filter((a) => a.id !== compareArea?.area_id) : []}
              onSelectArea={selectCompareArea}
              areaHint={(a) => (comparableById.has(a.id) ? 'Click to compare with it' : 'No TROID-supported cleanup sent here yet')}
            />
            <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
              <CoveragePanel
                area={compareArea}
                coverage={liveCoverage}
                showCoverage={showCoverage}
                onToggleCoverage={setShowCoverage}
                emptyText={scoped
                  ? 'Choose one of your collection areas under "Compare with" to see how much of it TROID covered in this period. Only areas a TROID-supported cleanup was sent to are listed.'
                  : 'Choose a collection area under "Compare with" to see how much of it TROID covered in this period. Only areas a TROID-supported cleanup was sent to are listed.'}
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
                <CleanupTypeBadge type={selectedDrive.cleanup_type} className="ml-2" />
              </span>
            ) : (
              <span className="text-sm text-slate-500">
                {scoped ? `All completed cleanup drives in ${barangay}.` : 'All completed cleanup drives.'} Select one to compare its collection area.
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select value={heatmapType} onChange={(e) => setHeatmapType(e.target.value)} className={selectClass} aria-label="Map layer">
                {MAP_LAYERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ShowAreasSwitch on={showAreas} onChange={setShowAreas} title="Outline every collection area" />
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
              <span className="text-sm font-medium text-slate-400">
                No completed cleanup drives with trash reports{scoped ? ` in ${barangay}` : ''} yet.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
              <CoverageMap
                heatPoints={driveHeatPoints}
                heatType={heatmapType}
                reports={driveDetections}
                area={isMeasurableArea(driveArea) ? driveArea : null}
                showCoverage={showCoverage}
                fitKey={selectedDrive ? `drive-${selectedDrive.request_id}` : 'drives-all'}
                emptyText={selectedDrive ? 'TROID reported no points for this drive' : 'TROID reported no points for these drives'}
                barangay={barangay}
                outlines={showAreas ? allAreas.filter((a) => a.id !== driveArea?.area_id) : []}
              />
              <div className="flex flex-col gap-4">
                <CoveragePanel
                  area={driveArea}
                  coverage={driveCoverage}
                  showCoverage={showCoverage}
                  onToggleCoverage={setShowCoverage}
                  emptyText={
                    !selectedDrive
                      ? 'Select a TROID-supported request to compare where TROID went with the collection area it was sent to.'
                      : selectedDrive.cleanup_type !== 'troid_supported'
                        ? 'This was an unsupported cleanup: no robot went, so there is no collection area to compare.'
                        : 'This request has no collection area attached, so there is nothing to compare its coverage with.'
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
                              <span className="font-medium text-slate-700">{cat}</span>
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
                placeholder={scoped ? 'Search by request ID...' : 'Search by request ID or barangay...'}
                className="flex-1"
              />
              {!scoped && (
                <select value={requestBarangayFilter} onChange={(e) => setRequestBarangayFilter(e.target.value)} className={selectClass}>
                  <option value="All">All barangays</option>
                  {requestBarangays.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
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
                      <th className="py-2 pr-4 font-medium">Cleanup</th>
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
                          <td className="py-2.5 pr-4"><CleanupTypeBadge type={d.cleanup_type} /></td>
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
