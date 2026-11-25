// The collection area being drawn or edited, with each point checked against the barangay's boundary.
// Drawn on the map by components/AreaDrawing: new points are clicked on the map, and a finished
// shape's points are dragged to move them.
import { useCallback, useEffect, useRef, useState } from "react";
import { placePoint } from "../utils/barangayBoundaries";

const EMPTY = { points: [], isPolygon: false };
const replaceAt = (points, i, point) => points.map((p, j) => (j === i ? point : p));

/** The shape being drawn or edited, with each point checked against the barangay's boundary. */
export function useAreaDraft() {
  const [drawing, setDrawing] = useState(false);
  const [shape, setShape] = useState(EMPTY);
  // Earlier shapes, for Undo.
  const [history, setHistory] = useState([]);
  // Started from nothing (drawing a new shape), rather than loaded to be edited.
  const [fresh, setFresh] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(null);
  // The shape as it was when a point started being dragged.
  const dragBase = useRef(null);

  const showNotice = useCallback((text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const clear = useCallback(() => {
    setShape(EMPTY);
    setHistory([]);
    setFresh(false);
    setNotice("");
  }, []);

  /** Says why the point can't go there, or returns true when it can. */
  const fits = (point, barangay) => {
    if (!barangay) {
      showNotice("Choose the barangay first, then draw inside its outline.");
      return false;
    }
    const problem = placePoint(point, barangay);
    if (problem) {
      showNotice(`${problem}. Areas must stay inside ${barangay}, or on the water just off it.`);
      return false;
    }
    setNotice("");
    return true;
  };

  const change = (next) => {
    setHistory((prev) => [...prev, shape]);
    setShape(next);
  };

  const { points, isPolygon } = shape;
  return {
    drawing,
    points,
    isPolygon,
    notice,
    isDrafting: drawing || points.length > 0,
    /** The shape differs from the one loaded (or a new one is being drawn). */
    dirty: fresh || history.length > 0,
    canUndo: history.length > 0,
    canSave: points.length >= (isPolygon ? 3 : 2),
    start: () => {
      clear();
      setFresh(true);
      setDrawing(true);
    },
    stop: () => setDrawing(false),
    clear,
    /** An existing shape, to edit by dragging its points. */
    load: (loadedPoints, closed) => {
      clear();
      setDrawing(false);
      setShape({ points: loadedPoints.map((p) => [p[0], p[1]]), isPolygon: Boolean(closed) && loadedPoints.length >= 3 });
    },
    undo: () => {
      if (!history.length) return;
      const previous = history[history.length - 1];
      setHistory(history.slice(0, -1));
      setShape(previous);
      setNotice("");
      // Undoing the click that closed a new polygon carries on drawing it.
      if (fresh && !previous.isPolygon) setDrawing(true);
    },
    close: () => {
      if (drawing && points.length >= 3 && !isPolygon) {
        change({ points, isPolygon: true });
        setDrawing(false);
      }
    },
    /** Adds the point if it fits the barangay; otherwise says why and leaves the shape as it was. */
    addPoint: (point, barangay) => {
      if (fits(point, barangay)) change({ points: [...points, point], isPolygon });
    },
    /** Dragging a point: beginMove when it is picked up, movePoint as it moves, endMove when dropped. */
    beginMove: () => {
      dragBase.current = shape;
    },
    movePoint: (i, point) => {
      setShape((prev) => ({ ...prev, points: replaceAt(prev.points, i, point) }));
    },
    endMove: (i, point, barangay) => {
      const base = dragBase.current || shape;
      dragBase.current = null;
      if (!fits(point, barangay)) {
        setShape(base); // back where it was
        return;
      }
      setHistory((prev) => [...prev, base]);
      setShape({ ...base, points: replaceAt(base.points, i, point) });
    },
    /** Adds a point at index i (between two points), if it fits the barangay. */
    insertPoint: (i, point, barangay) => {
      if (fits(point, barangay)) change({ points: [...points.slice(0, i), point, ...points.slice(i)], isPolygon });
    },
    removePoint: (i) => {
      const least = isPolygon ? 3 : 2;
      if (points.length <= least) {
        showNotice(`A ${isPolygon ? "polygon" : "line"} needs at least ${least} points.`);
        return;
      }
      change({ points: points.filter((_, j) => j !== i), isPolygon });
    },
  };
}
