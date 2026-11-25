import { Fragment } from "react";
import { hasAreaDetails, waterBodyLabel } from "../constants/collectionAreas";
import { priorityText } from "../utils/collectionAreaInfo";

/** What CENRO knows about an area, shown under it in the list. */
export default function AreaDetails({ area }) {
  const rows = [
    ["Bags per cleanup", priorityText(area.priority)],
    ["Water body", [waterBodyLabel(area.waterBodyType), area.waterBodyName].filter(Boolean).join(" · ")],
    ["Hazards", area.hazards],
    ["Cleanups", area.requestCount === 1 ? "1 request sent here" : `${area.requestCount} requests sent here`],
    ["Made by", area.submittedBy || "Unknown"],
    ["Created", area.dateSubmitted],
    [
      area.status === "declined" ? "Archived by" : "Approved by",
      area.status === "pending"
        ? "Not approved yet"
        : [area.reviewedBy || "Unknown", area.dateReviewed].filter(Boolean).join(" • "),
    ],
    ["Last edited", area.updatedBy ? `${area.updatedBy} • ${area.dateUpdated}` : ""],
  ].filter(([, value]) => value);

  return (
    <div className="py-3 text-xs">
      {area.description && <p className="mb-2 whitespace-pre-line text-slate-600">{area.description}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className={`break-words whitespace-pre-line font-medium ${label === "Hazards" || (label === "Bags per cleanup" && area.priority?.is_priority) ? "text-amber-700" : "text-slate-700"}`}>{value}</dd>
          </Fragment>
        ))}
      </dl>
      {!hasAreaDetails(area) && (
        <p className="mt-2 text-slate-400">No details yet. Click Edit to add a description, the water body and its hazards.</p>
      )}
    </div>
  );
}
