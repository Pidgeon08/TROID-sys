import { AlertTriangle } from "lucide-react";

const bags = (n) => `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 })} bag${n === 1 ? "" : "s"}`;

/**
 * The priority collection areas from /api/priority-areas/ (pass only the ones with
 * is_priority): each one's average bags per cleanup over the last 30 days, against the 30
 * days before. Shows `limit` of them and how many more there are.
 */
export default function PriorityAreaList({ areas, limit = 5, emptyText, showBarangay = true }) {
  if (areas.length === 0) {
    return <p className="text-xs text-slate-400 py-2">{emptyText}</p>;
  }
  const shown = areas.slice(0, limit);
  return (
    <div className="flex flex-col gap-3">
      {shown.map((p) => (
        <div key={p.collection_area.id} className="flex items-center gap-3.5">
          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-2 text-xs font-bold text-slate-900">
              <span className="truncate" title={p.collection_area.name}>{p.collection_area.name}</span>
              <span className="shrink-0">{bags(p.current.average)} / cleanup</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Up from {bags(p.previous.average)}
              {p.change_pct !== null && <span className="font-semibold text-amber-700"> (+{p.change_pct}%)</span>}
              {" · "}{p.current.cleanups} cleanup{p.current.cleanups === 1 ? "" : "s"} in {p.window_days} days
              {showBarangay && p.barangay ? ` · ${p.barangay}` : ""}
            </p>
          </div>
        </div>
      ))}
      {areas.length > limit && (
        <p className="text-[11px] font-medium text-slate-400">+{areas.length - limit} more priority area{areas.length - limit === 1 ? "" : "s"}</p>
      )}
    </div>
  );
}
