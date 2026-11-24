// Map layers shared by the Heatmap page and the dashboards' hotspot maps.
import { useEffect, useMemo } from 'react';
import { useMap, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { trailRuns } from '../utils/coverage';
import { HEAT_GRADIENTS, PATH_COLORS, PATH_START, formatClock } from '../constants/mapLayers';

/**
 * Leaflet.heat overlay. Waits until the map has a size so it never draws into a 0×0 canvas.
 * `options` overrides Leaflet.heat's (radius, blur, max).
 */
export function HeatmapLayer({ points, type, options }) {
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
        heat = L.heatLayer(valid, { radius: 35, blur: 25, maxZoom: 17, gradient: HEAT_GRADIENTS[type] || HEAT_GRADIENTS['Waste Density'], ...options }).addTo(map);
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
