// Map layers shared by the Heatmap page and the dashboards' hotspot maps.
import { useEffect, useMemo } from 'react';
import { useMap, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { trailRuns } from '../utils/coverage';
import { HEAT_GRADIENTS, PATH_COLORS, PATH_START, formatClock } from '../constants/mapLayers';

const HEAT_DEFAULTS = { radius: 35, blur: 25, maxZoom: 17 };
// Each spot's heat is scaled so this share of the busiest spots shows at full strength.
const HEAT_TOP_SHARE = 0.03;
// Spots overlap as they are blurred together, so a busy stretch reads hotter than one spot.
const HEAT_OVERLAP = 2.5;

/**
 * The heat that shows as "high" at the map's zoom: what the busiest few spots add up to, the way
 * Leaflet.heat adds points up (into cells half a radius wide, fainter when zoomed out). Without it a
 * fixed scale turns everywhere a robot passed often solid red, hiding where the trash gathered.
 */
function heatScale(map, points, { radius, maxZoom }) {
  const zoom = map.getZoom();
  const fade = 1 / 2 ** Math.max(0, Math.min(maxZoom - zoom, 12));
  const cell = radius / 2;
  const sums = new Map();
  for (const p of points) {
    const at = map.project([p[0], p[1]], zoom);
    const key = `${Math.floor(at.x / cell)},${Math.floor(at.y / cell)}`;
    sums.set(key, (sums.get(key) || 0) + (Number.isFinite(p[2]) ? p[2] : 1) * fade);
  }
  const values = [...sums.values()].sort((a, b) => a - b);
  if (values.length === 0) return 1;
  const busy = values[Math.min(values.length - 1, Math.floor(values.length * (1 - HEAT_TOP_SHARE)))];
  return Math.max(busy * HEAT_OVERLAP, 0.05);
}

/**
 * Leaflet.heat overlay. Waits until the map has a size so it never draws into a 0×0 canvas.
 * `options` overrides Leaflet.heat's (radius, blur, max); without a `max`, the scale follows the
 * data at each zoom (heatScale).
 */
export function HeatmapLayer({ points, type, options }) {
  const map = useMap();

  useEffect(() => {
    let heat;
    let timer;
    let valid = [];
    const settings = { ...HEAT_DEFAULTS, ...options };
    const rescale = () => {
      if (heat && !options?.max) heat.setOptions({ max: heatScale(map, valid, settings) });
    };
    const init = () => {
      const size = map.getSize();
      if (!size || size.x === 0 || size.y === 0) {
        timer = setTimeout(init, 50);
        return;
      }
      map.invalidateSize();
      valid = (points || []).filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]) && !(p[0] === 0 && p[1] === 0));
      if (valid.length === 0) return;
      try {
        heat = L.heatLayer(valid, {
          gradient: HEAT_GRADIENTS[type] || HEAT_GRADIENTS['Waste Density'],
          ...settings,
          max: options?.max ?? heatScale(map, valid, settings),
        }).addTo(map);
        map.on('zoomend', rescale);
      } catch (err) {
        console.error('Heatmap render error:', err);
      }
    };
    init();
    return () => {
      if (timer) clearTimeout(timer);
      map.off('zoomend', rescale);
      if (heat) {
        try { map.removeLayer(heat); } catch { /* map already gone */ }
      }
    };
  }, [map, points, type, options]);

  return null;
}

/**
 * Bot Pathing: each point the robot reported is a node, joined in time order, one colour per robot.
 * A run starts with a green node and ends with a larger node; hover a node for its time and count.
 */
export function PathLayer({ reports }) {
  const runs = useMemo(() => trailRuns(reports), [reports]);
  const colorOf = useMemo(() => {
    const boats = [...new Set(runs.map((r) => r.boat))];
    return (boat) => PATH_COLORS[boats.indexOf(boat) % PATH_COLORS.length];
  }, [runs]);

  return runs.map((run, r) => {
    const color = colorOf(run.boat);
    const last = run.nodes.length - 1;
    return (
      <PathRun key={`${run.boat}-${run.nodes[0].time}-${r}`} run={run} color={color} last={last} />
    );
  });
}

function PathRun({ run, color, last }) {
  return (
    <>
      {run.nodes.length > 1 && (
        <Polyline
          positions={run.nodes.map((n) => n.at)}
          pathOptions={{ color, weight: 3, opacity: 0.6, lineJoin: 'round' }}
          interactive={false}
        />
      )}
      {run.nodes.map((node, i) => {
        const isStart = i === 0;
        const isEnd = i === last && last > 0;
        const items = node.report.trash_count || 0;
        return (
          <CircleMarker
            key={`${node.time}-${i}`}
            center={node.at}
            radius={isStart || isEnd ? 7 : 5}
            pathOptions={{
              color: isStart ? PATH_START : color,
              weight: 2,
              fillColor: isStart ? PATH_START : isEnd ? color : '#ffffff',
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="text-[11px] leading-snug">
                <div className="font-semibold">
                  {run.boat ? `${run.boat} · ` : ''}Point {i + 1} of {run.nodes.length}
                  {isStart ? ' (start)' : isEnd ? ' (latest)' : ''}
                </div>
                <div>{formatClock(node.time)}</div>
                <div>{items} item{items === 1 ? '' : 's'} detected</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
