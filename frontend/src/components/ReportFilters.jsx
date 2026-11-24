import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, FileText, GitCompareArrows, ListChecks, MapPin, X } from "lucide-react";
import { Popover } from "./ui/Popover";
import { SearchBar } from "./ui/SearchBar";
import { FILTER_ACTIVE, FILTER_CONTROL, FILTER_IDLE } from "./ui/filterStyles";
import {
  COMPARE_OPTIONS, DATE_PRESETS, formatDay, matchingPreset, noComparisonReason, presetRange, reportPeriod, withComparison,
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
 * Which finished cleanups the report covers: all of them in the period and barangay (no
 * selection), or only the ones ticked. `candidates` are the cleanups the period and barangay
 * being edited allow; a selection outside them is dropped when the report is generated.
 */
function RequestPicker({ draft, onChange, candidates }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const chosen = useMemo(() => new Set(draft.requestIds), [draft.requestIds]);
  const chosenHere = candidates.filter((c) => chosen.has(c.requestId)).length;
  const label = chosenHere === 0 ? "All requests" : `${chosenHere} request${chosenHere === 1 ? "" : "s"} selected`;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => !q || [c.requestId, c.zone, c.barangay, c.areaName, c.unit, c.operator, c.status]
      .some((v) => (v || "").toLowerCase().includes(q)));
  }, [candidates, search]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const setChosen = (ids) => onChange({ requestIds: candidates.map((c) => c.requestId).filter((id) => ids.has(id)) });
  const toggle = (id) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChosen(next);
  };
  const allShownChosen = shown.length > 0 && shown.every((c) => chosen.has(c.requestId));
  const toggleShown = () => {
    const next = new Set(chosen);
    shown.forEach((c) => (allShownChosen ? next.delete(c.requestId) : next.add(c.requestId)));
    setChosen(next);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${FILTER_CONTROL} ${chosenHere ? FILTER_ACTIVE : FILTER_IDLE} ${SLOT} flex items-center gap-2 whitespace-nowrap`}
      >
        <ListChecks size={15} className="shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {chosenHere > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{chosenHere}</span>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select requests for the report"
            className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-100 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 pt-5 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Select requests</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Finished cleanups with a trash report in {reportPeriod(draft.dateFrom, draft.dateTo).label}
                  {draft.barangay ? ` in ${draft.barangay}` : ""}. Tick the ones the report should cover, or leave all unticked for every one of them.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-3 sm:flex-row sm:items-center">
              <SearchBar value={search} onChange={setSearch} placeholder="Search ID, area, barangay, robot..." className="flex-1" />
              <button
                type="button"
                onClick={toggleShown}
                disabled={shown.length === 0}
                className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {allShownChosen ? "Untick" : "Tick"} {search.trim() ? `the ${shown.length} shown` : `all ${shown.length}`}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-2">
              {shown.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">
                  {candidates.length === 0 ? "No finished cleanups in this period." : "No requests match your search."}
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="sticky top-0 border-b border-slate-100 bg-white text-left uppercase tracking-wider text-slate-400">
                      <th className="w-8 py-2" />
                      <th className="py-2 pr-3 font-medium">Request</th>
                      <th className="py-2 pr-3 font-medium">Finished</th>
                      <th className="py-2 pr-3 font-medium">Area / Location</th>
                      <th className="py-2 pr-3 font-medium">Robot</th>
                      <th className="py-2 text-right font-medium">Bags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {shown.map((c) => {
                      const on = chosen.has(c.requestId);
                      return (
                        <tr
                          key={c.requestId}
                          onClick={() => toggle(c.requestId)}
                          className={`cursor-pointer transition-colors ${on ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                        >
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(c.requestId)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Include ${c.requestId}`}
                              className="h-4 w-4 rounded accent-[#1b4de4]"
                            />
                          </td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-800">{c.requestId}</td>
                          <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">{formatDay(c.day)}</td>
                          <td className="py-2.5 pr-3 text-slate-700">
                            {c.zone}
                            {c.barangay && c.barangay !== c.zone && <span className="block text-[11px] text-slate-400">{c.barangay}</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-500">{c.unit}</td>
                          <td className="py-2.5 text-right font-semibold tabular-nums text-slate-800">{c.bags}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <p className="text-xs text-slate-500">
                {chosenHere === 0
                  ? `The report will cover all ${candidates.length} cleanups.`
                  : `${chosenHere} of ${candidates.length} selected. Comparison with an earlier period is off while requests are chosen.`}
              </p>
              <div className="flex gap-2">
                {chosenHere > 0 && (
                  <button type="button" onClick={() => onChange({ requestIds: [] })} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Use all requests
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#153eb8]">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * The Reports filter bar: one row of compact controls (period, barangay, comparison, requests)
 * and Generate Report, which wraps on narrow screens. Changes stay in `draft` until Generate
 * Report applies them; `children` is the status line shown under the controls.
 */
export default function ReportFilters({ draft, onChange, barangays, candidates = [], onGenerate, children }) {
  const requestsChosen = candidates.some((c) => draft.requestIds.includes(c.requestId));
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

        {requestsChosen ? (
          <span
            className={`${FILTER_CONTROL} ${SLOT} border-slate-200 bg-slate-50 text-slate-400 inline-flex items-center gap-2 whitespace-nowrap`}
            title="The chosen requests have nothing in an earlier period to compare with. Use all requests to compare again."
          >
            <GitCompareArrows size={15} /> No comparison
          </span>
        ) : (
          <CompareFilter draft={draft} onChange={onChange} />
        )}

        <RequestPicker draft={draft} onChange={onChange} candidates={candidates} />

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
