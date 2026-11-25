// A filed trash report (TrashReportForm), as the request page and a merged request show it. Items
// are listed under their TROID class; for a TROID-supported cleanup each class also shows what the
// robot counted, so it shows how accurate the robot's read was.
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import api from "../services/api";
import { readAccuracy, reportByClass, siteTypeLabel } from "../constants/trashReport";

const formatNumber = (value, unit) => (value === null || value === undefined || value === "" ? "—" : `${Number(value).toLocaleString()}${unit ? ` ${unit}` : ""}`);

function Rows({ rows }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500">{label}</dt>
          <dd className="text-right font-medium text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Heading({ children }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>;
}

/** `report` is a mapped request (constants/requests.js mapRequest). */
export default function TrashReportSummary({ report }) {
  const classes = reportByClass(report.trashCategories, report.trashItems);
  const pieces = classes.reduce((sum, c) => sum + c.count, 0);
  // Reports filed before the data card was used have no site details.
  const hasSite = Boolean(report.siteType || report.peopleCount);

  // What the robot counted per class, for a TROID-supported cleanup.
  const [troid, setTroid] = useState(null);
  const troidSupported = report.cleanupType === "troid_supported";
  useEffect(() => {
    if (!troidSupported || !report.id) return undefined;
    let cancelled = false;
    api.troidCount(report.id)
      .then((res) => { if (!cancelled && res.troid_assisted && res.total > 0) setTroid(res.categories || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [report.id, troidSupported]);

  return (
    <div className="space-y-4">
      {hasSite && (
        <div>
          <Heading>Cleanup site</Heading>
          <Rows rows={[
            ["Type of site", siteTypeLabel(report.siteType) || "—"],
            ["People who worked on it", formatNumber(report.peopleCount)],
            ["Time spent", formatNumber(report.hoursSpent, "h")],
            ["Distance cleaned", formatNumber(report.distanceKm, "km")],
          ]} />
        </div>
      )}

      <div>
        <Heading>Totals</Heading>
        <Rows rows={[
          ["Bags filled", formatNumber(report.bags)],
          ["Total weight", formatNumber(report.weightKg, "kg")],
          ["Recyclable", formatNumber(report.recyclableKg, "kg")],
          ["Non-usable", formatNumber(report.nonUsableKg, "kg")],
        ]} />
      </div>

      <div>
        <Heading>Items collected · {pieces.toLocaleString()} pieces</Heading>
        {pieces === 0 ? (
          <p className="text-xs text-slate-400">No items were counted.</p>
        ) : (
          <ul className="space-y-2.5">
            {classes.filter((c) => c.count > 0 || (troid && troid[c.cls])).map((c) => {
              const accuracy = troid ? readAccuracy(c.count, troid[c.cls] || 0) : null;
              return (
                <li key={c.cls} className="text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-slate-800">{c.cls}</span>
                    <span className="tabular-nums text-slate-800">
                      <span className="font-semibold">{c.count.toLocaleString()}</span>
                      {troid && <span className="text-slate-400"> · TROID <span className="font-medium text-sky-700">{(troid[c.cls] || 0).toLocaleString()}</span></span>}
                    </span>
                  </div>
                  {accuracy && (
                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold ${
                      accuracy.tone === "match" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {accuracy.tone === "match" && <Check size={10} />}
                      {accuracy.text}
                    </span>
                  )}
                  {c.items.length > 0 && (
                    <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-l-2 border-slate-100 pl-2.5">
                      {c.items.map((item) => (
                        <div key={item.name} className="contents">
                          <dt className="text-slate-500">{item.name}</dt>
                          <dd className="text-right tabular-nums text-slate-700">{item.count.toLocaleString()}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {report.entangledAnimals?.length > 0 && (
        <div>
          <Heading>Entangled animals</Heading>
          <ul className="space-y-1 text-xs text-slate-700">
            {report.entangledAnimals.map((a, i) => (
              <li key={i}>
                <span className="font-medium">{a.animal}</span>
                {" · "}
                <span className={a.condition === "dead" ? "text-red-600" : "text-emerald-700"}>{a.condition === "dead" ? "Dead" : "Alive"}</span>
                {a.entangled_in && <span className="text-slate-500"> · caught in {a.entangled_in}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.peculiarItem && (
        <div>
          <Heading>Most peculiar item</Heading>
          <p className="text-xs text-slate-700">{report.peculiarItem}</p>
        </div>
      )}
    </div>
  );
}
