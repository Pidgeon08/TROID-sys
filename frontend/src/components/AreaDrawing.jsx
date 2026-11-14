// Drawing a collection area on a Leaflet map, kept inside the chosen barangay of San Fernando.
// Used by the Barangay/NGO Collection Areas page and CENRO's Collection Areas page.
import { useEffect } from "react";
import { Polygon, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { barangayBounds, barangayRing } from "../utils/barangayBoundaries";

// The shape itself is held by hooks/useAreaDraft.
const START_NODE_COLOR = "#1b4de4";
// How close (in screen pixels) a click must be to the first point to close the shape.
const CLOSE_SNAP_PX = 18;

function ClickToDraw({ draft, barangay }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (!draft.drawing) return;
      const first = draft.points[0];
      if (first && draft.points.length >= 3 && !draft.isPolygon) {
        const a = map.latLngToLayerPoint(e.latlng);
        const b = map.latLngToLayerPoint(L.latLng(first[0], first[1]));
        if (Math.hypot(a.x - b.x, a.y - b.y) <= CLOSE_SNAP_PX) {
          draft.close();
          return;
        }
      }
      draft.addPoint([e.latlng.lat, e.latlng.lng], barangay);
    },
  });
  return null;
}

/** The barangay's outline; the map moves to it whenever the barangay changes. */
export function BarangayOutline({ barangay, fit = true }) {
  const map = useMap();
  const ring = barangayRing(barangay);
  useEffect(() => {
    const bounds = fit && barangayBounds(barangay);
    if (bounds) map.flyToBounds(bounds, { padding: [30, 30], duration: 0.8 });
  }, [map, barangay, fit]);
  if (!ring) return null;
  return (
    <Polygon
      positions={ring}
      interactive={false}
      pathOptions={{ color: "#0f172a", weight: 2, dashArray: "6 6", opacity: 0.7, fillColor: "#0f172a", fillOpacity: 0.04 }}
    />
  );
}

/** Map layers for the shape being drawn. Render inside a MapContainer. */
export function AreaDraftLayers({ draft, barangay, color }) {
  const { points, isPolygon, drawing } = draft;
  return (
    <>
      <ClickToDraw draft={draft} barangay={barangay} />
      {isPolygon && points.length >= 3 ? (
        <Polygon positions={points} pathOptions={{ color, weight: 3, fillColor: color, fillOpacity: 0.2 }} />
      ) : (
        points.length >= 2 && (
          <Polyline positions={points} pathOptions={{ color, weight: 3, dashArray: "6 6", opacity: 0.9 }} />
        )
      )}
      {points.map((p, i) => {
        const canClose = i === 0 && drawing && points.length >= 3 && !isPolygon;
        return (
          <CircleMarker
            key={i}
            center={p}
            radius={canClose ? 7 : 5}
            eventHandlers={canClose ? { click: (e) => { e.originalEvent.stopPropagation(); draft.close(); } } : undefined}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: canClose ? START_NODE_COLOR : color, fillOpacity: 1 }}
          />
        );
      })}
    </>
  );
}
