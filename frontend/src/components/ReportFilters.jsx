import { Calendar, Check, FileText, GitCompareArrows, MapPin } from "lucide-react";
import { Popover } from "./ui/Popover";
import { FILTER_CONTROL, FILTER_IDLE } from "./ui/filterStyles";
import {
  COMPARE_OPTIONS, DATE_PRESETS, matchingPreset, noComparisonReason, presetRange, reportPeriod, withComparison,
} from "../utils/reportData";

const DATE_INPUT = `${FILTER_CONTROL} ${FILTER_IDLE} w-full px-2 py-1.5`;
const OPTION = "flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50";
// Two controls a row on smaller screens; one row from xl, where they all fit.
const SLOT = "w-full xl:w-auto";

function DateRangeFilter({ draft, onChange }) {
  const preset = matchingPreset(draft.dateFrom, draft.dateTo);
  const label = preset ? DATE_PRESETS[preset] : reportPeriod(draft.dateFrom, draft.dateTo).label;
  return (
    <Popover label={label} icon={Calendar} active={preset !== "last30"} width="w-80" className={SLOT}>
      <p className="mb-2 text-xs font-semibold text-slate-500">Report period</p>
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(DATE_PRESETS).map(([key, name]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const range = presetRange(key);
              onChange({ dateFrom: range.from, dateTo: range.to });
            }}
            className={`${OPTION} ${preset === key ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700"}`}
          >
            {name}
            {preset === key && <Check size={14} className="mt-0.5 shrink-0" />}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
        <label className="text-xs font-medium text-slate-500">
          From
          <input
            type="date"
            value={draft.dateFrom}
            max={draft.dateTo || undefined}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            className={`${DATE_INPUT} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          To
          <input
            type="date"
            value={draft.dateTo}
            min={draft.dateFrom || undefined}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            className={`${DATE_INPUT} mt-1`}
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Leave "To" empty to run to today, or both empty for all time.</p>
    </Popover>
  );
}

function CompareFilter({ draft, onChange }) {
  const base = reportPeriod(draft.dateFrom, draft.dateTo);
  const custom = { from: draft.compareFrom, to: draft.compareTo };
  const chosen = withComparison(base, draft.compare, custom);
  let label;
  if (draft.compare === "none") label = "No comparison";
  else if (draft.compare === "custom") label = chosen.previous ? `vs ${chosen.previous.label}` : "vs another range";
  else label = `vs ${COMPARE_OPTIONS[draft.compare].toLowerCase()}`;

  return (
    <Popover label={label} icon={GitCompareArrows} active={draft.compare !== "previous"} width="w-80" className={SLOT}>
      <p className="mb-2 text-xs font-semibold text-slate-500">Compare the report with</p>
      <div className="flex flex-col">
        {Object.entries(COMPARE_OPTIONS).map(([mode, name]) => {
          const option = withComparison(base, mode, custom);
          const detail = mode === "none" ? "Show the period on its own"
            : option.previous ? option.previous.label
            : mode === "custom" ? "Choose the dates below"
            : "Needs a start date for the report";
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ compare: mode })}
              className={`${OPTION} ${draft.compare === mode ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
            >
              <span className="min-w-0">
                <span className={`block ${draft.compare === mode ? "font-medium" : ""}`}>{name}</span>
                <span className="block text-[11px] text-slate-400">{detail}</span>
              </span>
              {draft.compare === mode && <Check size={14} className="mt-0.5 shrink-0" />}
            </button>
          );
        })}
      </div>
      {draft.compare === "custom" && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <label className="text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              value={draft.compareFrom}
              max={draft.compareTo || undefined}
              onChange={(e) => onChange({ compareFrom: e.target.value })}
              className={`${DATE_INPUT} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              value={draft.compareTo}
              min={draft.compareFrom || undefined}
              onChange={(e) => onChange({ compareTo: e.target.value })}
              className={`${DATE_INPUT} mt-1`}
            />
          </label>
          <p className="col-span-2 text-[11px] text-slate-400">Use the dates of an earlier report to compare against it.</p>
        </div>
      )}
      {draft.compare !== "none" && !chosen.previous && draft.compare !== "custom" && (
        <p className="mt-2 text-[11px] text-amber-600">{noComparisonReason(chosen)}.</p>
      )}
    </Popover>
  );
}

/**
 * The Reports filter bar: one row of compact controls (period, barangay, comparison, report
 * type) and Generate Report, which wraps on narrow screens. Changes stay in `draft` until
 * Generate Report applies them; `children` is the status line shown under the controls.
 */
export default function ReportFilters({ draft, onChange, barangays, onGenerate, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] px-4 py-4 sm:px-5 mb-6 print:hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 xl:flex xl:items-center">
        <DateRangeFilter draft={draft} onChange={onChange} />

        <div className={`relative ${SLOT}`}>
          <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <select
            value={draft.barangay}
            onChange={(e) => onChange({ barangay: e.target.value })}
            aria-label="Barangay"
            className={`${FILTER_CONTROL} ${draft.barangay ? "border-blue-300 bg-blue-50 text-blue-700" : FILTER_IDLE} w-full cursor-pointer pl-9 pr-8 xl:w-[200px]`}
          >
            <option value="">All barangays</option>
            {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <CompareFilter draft={draft} onChange={onChange} />

        <span
          className={`${FILTER_CONTROL} border-slate-200 bg-slate-50 text-slate-500 hidden xl:inline-flex items-center gap-2 whitespace-nowrap`}
          title="The only report type for now"
        >
          <FileText size={15} /> Collection Report
        </span>

        <button
          type="button"
          onClick={onGenerate}
          className="flex w-full xl:w-auto xl:ml-auto items-center justify-center gap-2 rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#153eb8]"
        >
          <FileText size={16} />
          Generate Report
        </button>
      </div>
      {children && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">{children}</div>}
    </div>
  );
}
