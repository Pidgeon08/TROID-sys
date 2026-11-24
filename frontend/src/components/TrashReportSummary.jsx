// A filed trash report (TrashReportForm), as the request page and a merged request show it.
import { reportedItems, siteTypeLabel } from "../constants/trashReport";

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
  const items = reportedItems(report.trashCategories);
  const pieces = items.reduce((sum, item) => sum + item.count, 0);
  // Reports filed before the data card was used have no site details.
  const hasSite = Boolean(report.siteType || report.peopleCount);

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
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">No items were counted.</p>
        ) : (
          <Rows rows={items.map((item) => [item.name, item.count.toLocaleString()])} />
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
