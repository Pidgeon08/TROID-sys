import { useState } from "react";

const WIDTH = 340;
const HEIGHT = 64;
const TOP = 8;
const BASELINE = 54;

// Eases between points without overshooting, so a zero day never dips below the baseline.
function linePath(values) {
  const max = Math.max(...values, 1);
  const points = values.map((value, i) => [
    (i / (values.length - 1)) * WIDTH,
    BASELINE - (value / max) * (BASELINE - TOP),
  ]);
  return points.reduce((path, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [prevX, prevY] = points[i - 1];
    const midX = (prevX + x) / 2;
    return `${path} C${midX},${prevY} ${midX},${y} ${x},${y}`;
  }, "");
}

function formatDay(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// `days` is [{ date: "YYYY-MM-DD", value }], oldest first. `unit` is singular, e.g. "bag".
export default function MonthSparkline({ days, color, unit }) {
  const [hovered, setHovered] = useState(null);
  const values = days.map((day) => day.value);
  // A line needs two points; on the 1st of the month there is only one day.
  const line = linePath(values.length === 1 ? [values[0], values[0]] : values);
  const gradientId = `sparkline-${color.slice(1)}`;

  const handlePointerMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHovered(Math.round(((e.clientX - box.left) / box.width) * (days.length - 1)));
  };

  const day = hovered === null ? null : days[hovered];
  const position = days.length > 1 ? (hovered / (days.length - 1)) * 100 : 50;
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div
      className="w-full h-16 mt-6 relative overflow-hidden rounded-b-2xl"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHovered(null)}
    >
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${total} ${unit}s so far this month`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.00" />
          </linearGradient>
        </defs>
        <path d={`${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {day && (
        <>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-slate-300" style={{ left: `${position}%` }} />
          <div
            className="pointer-events-none absolute top-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm"
            style={{ left: `${position}%`, transform: `translateX(-${position}%)` }}
          >
            {formatDay(day.date)}: {day.value} {unit}{day.value === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}
