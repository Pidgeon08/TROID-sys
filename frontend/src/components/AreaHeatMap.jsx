// One collection area on a map with the heatmap of what the robots found there in a period, and
// optionally a second period's heat in gray beneath it. Used by the area's history page and its report.
import { useEffect, useMemo } from "react";
import { MapContainer, Polygon, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_URL } from "../services/mapTiles";
import { HeatmapLayer } from "./MapLayers";
import { WaterwaysLayer } from "./AreaDrawing";

const toPoints = (detections) => (detections || []).map((d) => [d.latitude, d.longitude, d.weight ?? 0.5]);

function FitArea({ points }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 17 });
    }, 60);
    return () => clearTimeout(timer);
  }, [map, points]);
  return null;
}

export default function AreaHeatMap({ area, detections, before, heatOptions, interactive = true, className = "h-full w-full", showWater = false }) {
  const now = useMemo(() => toPoints(detections), [detections]);
  const past = useMemo(() => toPoints(before), [before]);
  const points = area?.points || [];
  const color = area?.color || "#1b4de4";
  const shapeOptions = { color, weight: 3, fillColor: color, fillOpacity: 0.05 };
  return (
    <MapContainer
      center={points[0] || [16.6195, 120.314]}
      zoom={15}
      className={className}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      doubleClickZoom={interactive}
      attributionControl={interactive}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      {showWater && <WaterwaysLayer />}
      {area && (area.closed === false
        ? <Polyline positions={points} pathOptions={shapeOptions} />
        : <Polygon positions={points} pathOptions={shapeOptions} />)}
      {past.length > 0 && <HeatmapLayer points={past} type="Past Hotspots" options={heatOptions} />}
      {now.length > 0 && <HeatmapLayer points={now} type="Waste Density" options={heatOptions} />}
      <FitArea points={points} />
    </MapContainer>
  );
}
