// The condition report of a collection area: one hotspot period against the one before it,
// generated from the area's history, with both periods' heatmaps side by side. It can be printed
// or saved as a PDF from the browser's print dialog.
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { FileText, Printer, X } from "lucide-react";
import AreaHeatMap from "./AreaHeatMap";
import { LEGEND_CLASSES } from "../constants/mapLayers";
import { waterBodyLabel } from "../constants/collectionAreas";
import { shapeSize } from "../utils/collectionAreaInfo";
import { buildAreaReport, heatOptionsFor, monthName, periodLabel, periodRange } from "../utils/areaReport";

const CELL = "px-3 py-1.5 text-left";

function ChangeCell({ change, worse }) {
  const tone = worse === true ? "text-amber-700" : worse === false ? "text-emerald-700" : "text-slate-500";
  return <td className={`${CELL} text-right font-semibold tabular-nums ${tone}`}>{change}</td>;
}

export default function AreaConditionReport({ area, current, previous, currentHeat, previousHeat, coverage, preparedBy, onClose }) {
  const report = useMemo(() => buildAreaReport(current, previous, coverage), [current, previous, coverage]);
  const heatOptions = useMemo(() => heatOptionsFor(currentHeat, previousHeat), [currentHeat, previousHeat]);
  const generated = new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const water = [waterBodyLabel(area.waterBodyType), area.waterBodyName].filter(Boolean).join(" · ");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const done = () => document.body.classList.remove("printing-area-report");
    window.addEventListener("afterprint", done);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("afterprint", done);
      done();
    };
  }, [onClose]);

  const print = () => {
    // Only the report is printed (index.css), not the page behind it.
    document.body.classList.add("printing-area-report");
    window.print();
  };

  return createPortal(
    <div className="area-report-print fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Condition report for ${area.name}`}
        className="my-4 w-full max-w-4xl rounded-2xl border border-slate-100 bg-white shadow-2xl print:my-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-3 print:hidden">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FileText size={16} className="text-blue-600" /> Condition report</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={print} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#153eb8]">
              <Printer size={14} /> Print or save as PDF
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <article className="space-y-6 px-8 py-7 text-slate-800 print:px-0 print:py-0">
          <header className="border-b border-slate-200 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">CENRO San Fernando · TROID · Collection Area Condition Report</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{area.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {[area.id, `Barangay ${area.barangay}`, water, shapeSize(area)].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">{periodLabel(current)}</span> ({periodRange(current)}) compared with{" "}
              <span className="font-semibold">{previous ? monthName(previous.month) : "the month before"}</span>
              {previous ? ` (${periodRange(previous)})` : ""}.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Generated {generated}{preparedBy ? ` by ${preparedBy}` : ""}. Each period is the 30 days before its month&apos;s end, the way
              hotspots are decided: an area is a hotspot when its bags per cleanup are higher than the 30 days before.
            </p>
          </header>

          <section className="break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Findings</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {report.findings.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">{report.outlook}</p>
          </section>

          <section className="grid grid-cols-1 gap-4 break-inside-avoid sm:grid-cols-2">
            {[
              { title: previous ? monthName(previous.month) : "The month before", detections: previousHeat },
              { title: periodLabel(current), detections: currentHeat },
            ].map((m) => (
              <figure key={m.title} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="h-56">
                  <AreaHeatMap area={area} detections={m.detections} heatOptions={heatOptions} interactive={false} />
                </div>
                <figcaption className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-700">{m.title}</span>
                  <span className="text-slate-400">{m.detections ? `${m.detections.length.toLocaleString()} robot reports` : "Loading…"}</span>
                </figcaption>
              </figure>
            ))}
            <p className="flex items-center gap-2 text-[11px] text-slate-400 sm:col-span-2">
              Where the robots found trash. Both maps use the same scale: Low
              <span className={`h-1.5 w-24 rounded-full ${LEGEND_CLASSES["Waste Density"]}`} /> High
            </p>
          </section>

          <section className="break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Compared</h2>
            <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className={CELL}>Measure</th>
                  <th className={`${CELL} text-right`}>{previous ? monthName(previous.month, "short") : "Before"}</th>
                  <th className={`${CELL} text-right`}>{monthName(current.month, "short")}</th>
                  <th className={`${CELL} text-right`}>Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((r) => (
                  <tr key={r.label}>
                    <td className={`${CELL} ${r.label.startsWith("  ") ? "pl-7 text-slate-500" : "font-medium"}`}>{r.label.trim()}</td>
                    <td className={`${CELL} text-right tabular-nums text-slate-600`}>{r.before}</td>
                    <td className={`${CELL} text-right font-semibold tabular-nums`}>{r.now}</td>
                    <ChangeCell change={r.change} worse={r.worse} />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="grid grid-cols-1 gap-6 break-inside-avoid sm:grid-cols-2">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Pieces by class</h2>
              <table className="mt-2 w-full text-sm">
                <thead className="text-xs text-slate-400">
                  <tr>
                    <th className="py-1 text-left font-medium">Class</th>
                    <th className="py-1 text-right font-medium">{previous ? monthName(previous.month, "short") : "Before"}</th>
                    <th className="py-1 text-right font-medium">{monthName(current.month, "short")}</th>
                    <th className="py-1 pl-3 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.classes.map((c) => (
                    <tr key={c.cls}>
                      <td className="py-1.5">{c.cls}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{c.before.toLocaleString()}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{c.now.toLocaleString()}</td>
                      <td className="py-1.5 pl-3 text-right text-xs tabular-nums text-slate-500">{c.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Items found most</h2>
              {report.topItems.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No items were counted in this period.</p>
              ) : (
                <ol className="mt-2 space-y-1.5 text-sm">
                  {report.topItems.map((t, i) => (
                    <li key={t.item} className="flex items-baseline justify-between gap-3">
                      <span>{i + 1}. {t.item}</span>
                      <span className="tabular-nums"><span className="font-semibold">{t.now.toLocaleString()}</span> <span className="text-xs text-slate-400">({t.change} from {t.before.toLocaleString()})</span></span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <footer className="border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400">
            Figures come from the trash reports filed for the cleanups finished in each period (merged and archived requests left out)
            and from what the TROID robots reported. Waterway covered is the share of the area&apos;s mapped waterway within 5 m of the robots&apos; travel path.
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  );
}
