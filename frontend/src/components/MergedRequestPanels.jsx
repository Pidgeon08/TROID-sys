import { Link } from "react-router-dom";
import { GitMerge, Undo2 } from "lucide-react";
import { Card } from "./ui/Card";
import TrashReportSummary from "./TrashReportSummary";
import { AreaPreviewButton } from "./AreaPreviewModal";

// Where each side keeps its Collection Areas page; the City Admin has none.
const areaPagePath = (routePrefix, area) => ({
  admin: `/admin/collection-areas?area=${encodeURIComponent(area.areaId)}`,
  barangay: `/barangay/areas?area=${encodeURIComponent(area.areaId)}`,
}[routePrefix]);
import { REQUEST_STATUS_STYLES, formatDate, formatTime12h, getDeploymentStatus } from "../constants/requests";

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right">{value}</span>
  </div>
);

/**
 * On a request CENRO merged into another: that request's cleanup is this one's, so its
 * progress, schedule and trash report are shown here for this requester too.
 */
export function MergedIntoCard({ mergedInto, mergedAt, schedule, routePrefix, onUnmerge, unmerging }) {
  const main = mergedInto;
  const reported = Object.keys(main.trashCategories || {}).length > 0;
  const deployment = getDeploymentStatus(schedule);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
          <GitMerge size={16} className="text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Merged into{" "}
            <Link to={`/${routePrefix}/requests/${main.id}`} className="text-blue-600 hover:text-blue-700 underline underline-offset-2">
              {main.id}
            </Link>
          </p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            CENRO merged this request{mergedAt ? ` on ${formatDate(mergedAt)}` : ""}, so one cleanup covers both. Its progress and results below apply to this request too.
          </p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2">
        <Row
          label="Status"
          value={
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${REQUEST_STATUS_STYLES[main.status] || "bg-slate-100 text-slate-600"}`}>
              {main.archived ? "Archived" : main.status}
            </span>
          }
        />
        <Row
          label="Deployment"
          value={<span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${deployment.cls}`}>{deployment.label}</span>}
        />
        {schedule?.day && (
          <Row label="Scheduled" value={`${formatDate(`${schedule.day}T00:00:00`)}${schedule.label ? ` · ${formatTime12h(schedule.label)}` : ""}`} />
        )}
        {!schedule?.day && main.preferredDate && (
          <Row label="Preferred Date/Time" value={`${formatDate(`${main.preferredDate}T00:00:00`)}${main.preferredTime ? ` · ${formatTime12h(main.preferredTime)}` : ""}`} />
        )}
        {main.collectionArea && (
          <Row label="Collection Area" value={<AreaPreviewButton area={main.collectionArea} openPath={areaPagePath(routePrefix, main.collectionArea)} />} />
        )}
        {main.cleanupType === "unsupported" && main.locationName && <Row label="Location" value={main.locationName} />}
        <Row label="Requested by" value={[main.requestedByName, main.barangay].filter(Boolean).join(" · ") || "—"} />
        {main.sessionCompletedAt && <Row label="Cleanup finished" value={formatDate(main.sessionCompletedAt)} />}
      </div>

      {reported && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="text-xs font-semibold text-emerald-800 mb-2">Trash collected</p>
          <TrashReportSummary report={main} />
          {main.verifiedAt && <p className="mt-2 text-[11px] text-emerald-700">Verified by CENRO on {formatDate(main.verifiedAt)}</p>}
        </div>
      )}

      {main.statusHistory.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">{main.id} history</p>
          <ol className="space-y-2">
            {main.statusHistory.map((step, i) => (
              <li key={i} className="text-xs">
                <p className="font-medium text-slate-700">{step.label}</p>
                <p className="text-slate-400">{step.date} · {step.actor}</p>
                {step.details && <p className="text-slate-500 mt-0.5 whitespace-pre-wrap">{step.details}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {onUnmerge && (
        <button
          onClick={onUnmerge}
          disabled={unmerging}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <Undo2 size={15} />
          {unmerging ? "Unmerging..." : "Unmerge"}
        </button>
      )}
    </Card>
  );
}

/** On the main request: the requests merged into it, whose requesters get its updates too. */
export function MergedRequestsCard({ requests, routePrefix, onUnmerge, unmergingId }) {
  if (!requests?.length) return null;
  return (
    <Card title={`Merged Requests (${requests.length})`}>
      <p className="text-xs text-slate-500 mb-3">
        This cleanup covers these requests too. Their requesters are told about every update and can see its results.
      </p>
      <ul className="divide-y divide-slate-100">
        {requests.map((merged) => (
          <li key={merged.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 text-sm">
              <Link to={`/${routePrefix}/requests/${merged.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                {merged.id}
              </Link>
              <p className="text-xs text-slate-500 truncate">
                {[merged.requestedByName, merged.requestedByRole, merged.barangay].filter(Boolean).join(" · ")}
              </p>
            </div>
            {onUnmerge && (
              <button
                onClick={() => onUnmerge(merged.id)}
                disabled={unmergingId === merged.id}
                className="shrink-0 flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <Undo2 size={12} />
                {unmergingId === merged.id ? "Unmerging..." : "Unmerge"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
