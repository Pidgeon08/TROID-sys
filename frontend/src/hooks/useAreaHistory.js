// The hotspot history of one collection area (GET /collection-areas/<id>/history/), month by month,
// and the robots' detections of the picked month and the one before. Shown by AreaHistoryOverlay.
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { areaCoverage, isMeasurableArea } from "../utils/coverage";

// One more month is loaded than shown, so the first month shown has one before it to compare with.
const MONTHS_SHOWN = 12;

/**
 * The history of `area` (null when none is open): its months, the one picked, the one before it,
 * and the robots' detections of each. Everything starts over when the area changes.
 */
export function useAreaHistory(area) {
  const areaId = area?.id || null;
  const [loaded, setLoaded] = useState({ areaId: null }); // { areaId, months } or { areaId, error }
  const [picked, setPicked] = useState({ areaId: null, month: "" });
  const [compare, setCompare] = useState(false);
  const [heat, setHeat] = useState({}); // "areaId|month" -> detections
  const requested = useRef(new Set());

  useEffect(() => {
    if (!areaId) return undefined;
    let cancelled = false;
    api.collectionAreaHistory(areaId, MONTHS_SHOWN + 1)
      .then((history) => { if (!cancelled) setLoaded({ areaId, months: history.months || [] }); })
      .catch((err) => {
        console.error("Failed to load the area's hotspot history:", err);
        if (!cancelled) setLoaded({ areaId, error: "The area's hotspot history couldn't be loaded." });
      });
    return () => { cancelled = true; };
  }, [areaId]);

  const current = areaId && loaded.areaId === areaId ? loaded : null;
  const allMonths = useMemo(() => current?.months || [], [current]);
  const months = allMonths.slice(-MONTHS_SHOWN);
  const pickedMonth = picked.areaId === areaId ? picked.month : "";
  const selected = months.find((m) => m.month === pickedMonth) || months[months.length - 1] || null;
  const index = selected ? allMonths.indexOf(selected) : -1;
  const previous = index > 0 ? allMonths[index - 1] : null;

  // The robots' reports for the picked period and the one before. Each is asked for once and kept.
  useEffect(() => {
    if (!areaId) return;
    [selected, previous].forEach((m) => {
      const key = m && `${areaId}|${m.month}`;
      if (!m || requested.current.has(key)) return;
      requested.current.add(key);
      api.getHeatmap({ time_filter: "custom", start: m.start, end: m.as_of, collection_area: areaId })
        .then((res) => setHeat((prev) => ({ ...prev, [key]: Array.isArray(res) ? res : [] })))
        .catch(() => setHeat((prev) => ({ ...prev, [key]: [] })));
    });
  }, [selected, previous, areaId]);

  const nowHeat = selected ? heat[`${areaId}|${selected.month}`] : undefined;
  const beforeHeat = previous ? heat[`${areaId}|${previous.month}`] : undefined;
  const comparing = compare && Boolean(previous);
  const coverage = useMemo(() => {
    if (!area || !isMeasurableArea(area)) return {};
    return {
      now: nowHeat ? areaCoverage(area.points, nowHeat) : null,
      before: beforeHeat ? areaCoverage(area.points, beforeHeat) : null,
    };
  }, [area, nowHeat, beforeHeat]);

  return {
    area: areaId ? area : null,
    loading: Boolean(areaId) && !current,
    error: current?.error || "",
    months,
    latest: allMonths[allMonths.length - 1] || null,
    selected,
    previous,
    pick: (month) => setPicked({ areaId, month }),
    compare: comparing,
    setCompare,
    nowHeat,
    beforeHeat,
    coverage,
  };
}
