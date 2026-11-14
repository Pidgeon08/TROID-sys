// The collection area being drawn, with each new point checked against the barangay's boundary.
// Drawn on the map by components/AreaDrawing.
import { useCallback, useEffect, useRef, useState } from "react";
import { placePoint } from "../utils/barangayBoundaries";

/** The shape being drawn, with each new point checked against the barangay's boundary. */
export function useAreaDraft() {
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [isPolygon, setIsPolygon] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(null);

  const showNotice = useCallback((text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const clear = useCallback(() => {
    setPoints([]);
    setIsPolygon(false);
    setNotice("");
  }, []);

  return {
    drawing,
    points,
    isPolygon,
    notice,
    isDrafting: drawing || points.length > 0,
    canSave: points.length >= (isPolygon ? 3 : 2),
    start: () => {
      clear();
      setDrawing(true);
    },
    stop: () => setDrawing(false),
    clear,
    undo: () => setPoints((prev) => prev.slice(0, -1)),
    close: () => {
      if (drawing && points.length >= 3 && !isPolygon) {
        setIsPolygon(true);
        setDrawing(false);
      }
    },
    /** Adds the point if it fits the barangay; otherwise says why and leaves the shape as it was. */
    addPoint: (point, barangay) => {
      if (!barangay) {
        showNotice("Choose the barangay first, then draw inside its outline.");
        return;
      }
      const problem = placePoint(point, barangay);
      if (problem) {
        showNotice(`${problem}. Areas must stay inside ${barangay}, or on the water just off it.`);
        return;
      }
      setNotice("");
      setPoints((prev) => [...prev, point]);
    },
  };
}
