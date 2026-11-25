// Drawing a collection area on a Leaflet map, kept inside the chosen barangay of San Fernando.
// Used by the Barangay/NGO Collection Areas page and CENRO's Collection Areas page.
import { useEffect } from "react";
import { Polygon, Polyline, CircleMarker, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { barangayBounds, barangayRing } from "../utils/barangayBoundaries";
import { WATER_POLYGONS } from "../utils/water";

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

// Handles for editing a finished shape. Kept per colour, so a marker's icon is never swapped mid-drag.
const handleIcons = new Map();
function handleIcon(kind, color) {
  const key = `${kind}:${color}`;
  if (!handleIcons.has(key)) {
    const size = kind === "point" ? 16 : 11;
    const style = kind === "point"
      ? `background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.45);cursor:grab;`
      : `background:#fff;border:2px solid ${color};opacity:.85;cursor:copy;`;
    handleIcons.set(key, L.divIcon({
      className: "",
      html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;${style}"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }));
  }
  return handleIcons.get(key);
}

const toPoint = (latlng) => [latlng.lat, latlng.lng];

/**
 * A finished shape's points, dragged to move them; the small dot halfway along each side adds a
 * point there when clicked, and right-clicking a point removes it.
 */
function EditHandles({ draft, barangay, color }) {
  const { points, isPolygon } = draft;
  const sides = isPolygon ? points.length : points.length - 1;
  return (
    <>
      {Array.from({ length: Math.max(sides, 0) }, (_, i) => {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return (
          <Marker
            key={`mid-${i}`}
            position={mid}
            icon={handleIcon("mid", color)}
            title="Click to add a point here"
            eventHandlers={{ click: () => draft.insertPoint(i + 1, mid, barangay) }}
          />
        );
      })}
      {points.map((p, i) => (
        <Marker
          key={`pt-${i}`}
          position={p}
          draggable
          icon={handleIcon("point", color)}
          title="Drag to move · right-click to remove"
          eventHandlers={{
            dragstart: () => draft.beginMove(),
            drag: (e) => draft.movePoint(i, toPoint(e.target.getLatLng())),
            dragend: (e) => draft.endMove(i, toPoint(e.target.getLatLng()), barangay),
            contextmenu: (e) => {
              e.originalEvent?.preventDefault();
              draft.removePoint(i);
            },
          }}
        />
      ))}
    </>
  );
}

/** Map layers for the shape being drawn or edited. Render inside a MapContainer. */
const WATER_COLOR = "#0284c7";

/**
 * The mapped waterways (rivers, creeks, canals, ponds), shown while an area is drawn: an area must
 * take some in, since that is all a boat can clean. They let clicks through to the drawing.
 */
export function WaterwaysLayer() {
  return WATER_POLYGONS.map((rings, i) => (
    <Polygon
      key={i}
      positions={rings}
      interactive={false}
      pathOptions={{ color: WATER_COLOR, weight: 1, opacity: 0.7, fillColor: WATER_COLOR, fillOpacity: 0.35 }}
    />
  ));
}

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
      {!drawing && points.length > 0 ? (
        <EditHandles draft={draft} barangay={barangay} color={color} />
      ) : points.map((p, i) => {
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
