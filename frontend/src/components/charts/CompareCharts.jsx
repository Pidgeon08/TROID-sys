// Charts that put a period beside the one it is compared with (the Reports page and the
// dashboards): a line for bags over time, bars for cleanups, a donut for waste types, and the
// change badge they share.
import { useId, useState } from "react";
import { formatChange } from "../../utils/reportData";

export const CURRENT_COLOR = "#3B82F6";
export const PREVIOUS_COLOR = "#94A3B8";

/** Up/down arrow and percent for a change; green is more, red is less, grey is none. */
export const Change = ({ change, className = "" }) => {
  if (change === undefined) return null;
  const tone = change === null || change === 0 ? "text-slate-400" : change > 0 ? "text-emerald-600" : "text-rose-600";
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold whitespace-nowrap ${tone} ${className}`}>
      {change !== null && change !== 0 && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className={change > 0 ? "" : "rotate-180"} aria-hidden="true">
          <path d="M5 1L9 6H1L5 1Z" fill="currentColor" />
        </svg>
      )}
      {formatChange(change)}
    </span>
  );
};

const previousKey = (key) => `previous${key.charAt(0).toUpperCase()}${key.slice(1)}`;
const plural = (n, unit) => `${n.toLocaleString()} ${n === 1 ? unit.replace(/s$/, "") : unit}`;

/** The day/week labels under a chart, in HTML so they keep their shape however wide the chart is. */
function AxisLabels({ data, xPercent }) {
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div className="relative h-5 text-[10px] text-slate-400" aria-hidden="true">
      {data.map((d, i) => (i % every === 0 ? (
        <span key={d.key} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${xPercent(i)}%` }}>{d.label}</span>
      ) : null))}
    </div>
  );
}

/** The hover box beside a point: this period's value, and the compared period's under it. */
function Tooltip({ point, x, flip, valueKey, unit, comparing, kind }) {
  const before = point[previousKey(valueKey)];
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg print:hidden"
      style={{ left: `${x}%`, transform: `translateX(${flip ? "-105%" : "5%"})` }}
    >
      <p className="font-semibold text-slate-800">{point.label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
        {plural(point[valueKey], unit)}
      </p>
      {comparing && before !== null && before !== undefined && (
        <p className="mt-0.5 flex items-center gap-1.5 text-slate-500">
          <span className={kind === "bar" ? "h-2 w-2 rounded-sm" : "h-0.5 w-2.5"} style={{ backgroundColor: PREVIOUS_COLOR }} />
          {plural(before, unit)} ({point.previousLabel})
        </p>
      )}
    </div>
  );
}

/**
 * A line of `valueKey` per point (bags by default) across the period, with the compared period
 * dashed behind it (`previousBags` and the like, from trendSeries).
 */
export const TrendChart = ({ data, comparing, valueKey = "bags", unit = "bags", height = 240, emptyText = "No bags were collected in this period." }) => {
  const [hover, setHover] = useState(null);
  const gradient = useId();
  const prevKey = previousKey(valueKey);
  const hasData = data.some((d) => d[valueKey] > 0 || (d[prevKey] || 0) > 0);
  if (!hasData) {
    return <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>{emptyText}</div>;
  }

  const width = 600;
  const svgHeight = height - 20;
  const padX = 12;
  const padTop = 14;
  const padBottom = 4;
  const max = Math.max(...data.map((d) => Math.max(d[valueKey], d[prevKey] || 0)), 1) * 1.15;
  const innerW = width - padX * 2;
  const innerH = svgHeight - padTop - padBottom;
  const stepX = innerW / Math.max(data.length - 1, 1);
  const xAt = (i) => (data.length === 1 ? width / 2 : padX + i * stepX);
  const yAt = (v) => padTop + innerH - (v / max) * innerH;

  const path = (key) => data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d[key] || 0)}`).join(" ");
  const linePath = path(valueKey);
  const areaPath = `${linePath} L${xAt(data.length - 1)},${padTop + innerH} L${xAt(0)},${padTop + innerH} Z`;
  const showMarkers = data.length <= 45;
  const point = hover !== null ? data[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${svgHeight}`} className="w-full" style={{ height: svgHeight }} preserveAspectRatio="none" role="img" aria-label={`${unit} over time`}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CURRENT_COLOR} stopOpacity="0.18" />
            <stop offset="100%" stopColor={CURRENT_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padX} x2={width - padX} y1={padTop + innerH * g} y2={padTop + innerH * g} stroke="#F1F5F9" strokeWidth="1" />
        ))}
        <path d={areaPath} fill={`url(#${gradient})`} />
        {comparing && (
          <path d={path(prevKey)} fill="none" stroke={PREVIOUS_COLOR} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
        <path d={linePath} fill="none" stroke={CURRENT_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={padTop} y2={padTop + innerH} stroke="#CBD5E1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        {data.map((d, i) => (showMarkers || hover === i) && (
          <circle key={d.key} cx={xAt(i)} cy={yAt(d[valueKey])} r={hover === i ? 4.5 : 3} fill={CURRENT_COLOR} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
        {/* Hover targets: one full-height column per point, wider than the marker */}
        {data.map((d, i) => (
          <rect key={d.key} x={xAt(i) - Math.max(stepX, 8) / 2} y={0} width={Math.max(stepX, 8)} height={padTop + innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <AxisLabels data={data} xPercent={(i) => (xAt(i) / width) * 100} />
      {point && (
        <Tooltip point={point} x={(xAt(hover) / width) * 100} flip={hover > data.length / 2} valueKey={valueKey} unit={unit} comparing={comparing} kind="line" />
      )}
    </div>
  );
};

/**
 * Bars of `valueKey` per point (cleanups by default), each with the compared period's bar beside
 * it in gray, for counts small enough that a line would hide them.
 */
export const CompareBarChart = ({ data, comparing, valueKey = "cleanups", unit = "cleanups", height = 240, emptyText = "No cleanups were finished in this period." }) => {
  const [hover, setHover] = useState(null);
  const prevKey = previousKey(valueKey);
  const hasData = data.some((d) => d[valueKey] > 0 || (d[prevKey] || 0) > 0);
  if (!hasData) {
    return <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>{emptyText}</div>;
  }

  const width = 600;
  const svgHeight = height - 20;
  const padX = 8;
  const padTop = 14;
  const padBottom = 4;
  const max = Math.max(...data.map((d) => Math.max(d[valueKey], d[prevKey] || 0)), 1);
  const top = Math.ceil(max * 1.15);
  const innerW = width - padX * 2;
  const innerH = svgHeight - padTop - padBottom;
  const slot = innerW / data.length;
  const barW = Math.max(2, Math.min(18, slot * (comparing ? 0.36 : 0.6)));
  const yAt = (v) => padTop + innerH - (v / top) * innerH;
  const point = hover !== null ? data[hover] : null;
  const centre = (i) => padX + slot * i + slot / 2;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${svgHeight}`} className="w-full" style={{ height: svgHeight }} preserveAspectRatio="none" role="img" aria-label={`${unit} over time`}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padX} x2={width - padX} y1={padTop + innerH * g} y2={padTop + innerH * g} stroke="#F1F5F9" strokeWidth="1" />
        ))}
        {hover !== null && <rect x={padX + slot * hover} y={padTop} width={slot} height={innerH} fill="#F8FAFC" />}
        {data.map((d, i) => {
          const before = d[prevKey] || 0;
          return (
            <g key={d.key}>
              {comparing && before > 0 && (
                <rect x={centre(i) - barW - 1} y={yAt(before)} width={barW} height={padTop + innerH - yAt(before)} rx="1.5" fill={PREVIOUS_COLOR} opacity="0.55" />
              )}
              {d[valueKey] > 0 && (
                <rect x={comparing ? centre(i) + 1 : centre(i) - barW / 2} y={yAt(d[valueKey])} width={barW} height={padTop + innerH - yAt(d[valueKey])} rx="1.5" fill={CURRENT_COLOR} />
              )}
            </g>
          );
        })}
        {data.map((d, i) => (
          <rect key={d.key} x={padX + slot * i} y={0} width={slot} height={padTop + innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <AxisLabels data={data} xPercent={(i) => (centre(i) / width) * 100} />
      {point && (
        <Tooltip point={point} x={(centre(hover) / width) * 100} flip={hover > data.length / 2} valueKey={valueKey} unit={unit} comparing={comparing} kind="bar" />
      )}
    </div>
  );
};

/** Donut chart of trash items by waste type. */
export const DonutChart = ({ data, size = 140 }) => {
  const radius = size * (60 / 140);
  const stroke = size * (20 / 140);
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  let running = 0;
  const segments = total > 0 ? data.filter((d) => d.value > 0).map((d) => {
    const dash = (d.value / total) * circumference;
    const rotation = (running / total) * 360;
    running += d.value;
    return (
      <circle
        key={d.name}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={d.color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
      >
        <title>{`${d.name}: ${d.value.toLocaleString()} (${d.pct}%)`}</title>
      </circle>
    );
  }) : [];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {segments.length ? segments : <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-[10px] font-semibold text-slate-400">Total Items</span>
      </div>
    </div>
  );
};
