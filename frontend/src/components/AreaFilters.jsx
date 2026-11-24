import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react";
import { SearchBar } from "./ui/SearchBar";
import { Popover } from "./ui/Popover";
import { FILTER_CONTROL, FILTER_IDLE } from "./ui/filterStyles";
import { WATER_BODY_TYPES } from "../constants/collectionAreas";
import {
  AREA_STATUSES, DATE_PRESETS, DETAILS, NO_WATER_BODY, PANEL_FILTERS, PRIORITY, SHAPES, SORT_OPTIONS, USAGE,
  areaFilterChips, describeAreaDate,
} from "../utils/areaFilters";

const FIELD = `${FILTER_CONTROL} ${FILTER_IDLE} w-full cursor-pointer`;
const LABEL = "mb-1 block text-xs font-semibold text-slate-500";

function PanelSelect({ id, label, value, onChange, allLabel, options }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
        <option value="">{allLabel}</option>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </div>
  );
}

/** Every filter but the search and status, in one panel: priority, barangay, water body, shape, requests, details and date added. */
function FiltersPanel({ filters, onChange, barangays }) {
  const dated = Boolean(describeAreaDate(filters));
  const set = PANEL_FILTERS.filter((key) => filters[key]).length + (dated ? 1 : 0);
  return (
    <Popover label="Filters" icon={SlidersHorizontal} active={set > 0} badge={set} width="w-96" className="shrink-0">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">Filter areas</p>
        {set > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...Object.fromEntries(PANEL_FILTERS.map((key) => [key, ""])), range: "", from: "", to: "" })}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <PanelSelect id="area-filter-priority" label="Priority" value={filters.priority} onChange={(priority) => onChange({ priority })}
          allLabel="Priority or not" options={Object.entries(PRIORITY)} />
        {barangays.length > 0 && (
          <PanelSelect id="area-filter-barangay" label="Barangay" value={filters.barangay} onChange={(barangay) => onChange({ barangay })}
            allLabel="All barangays" options={barangays.map((b) => [b, b])} />
        )}
        <PanelSelect id="area-filter-water" label="Water body" value={filters.water} onChange={(water) => onChange({ water })}
          allLabel="Any water body" options={[...WATER_BODY_TYPES.map((t) => [t.value, t.label]), [NO_WATER_BODY, "Not set"]]} />
        <PanelSelect id="area-filter-shape" label="Shape" value={filters.shape} onChange={(shape) => onChange({ shape })}
          allLabel="Polygons and lines" options={Object.entries(SHAPES)} />
        <PanelSelect id="area-filter-usage" label="Cleanup requests" value={filters.usage} onChange={(usage) => onChange({ usage })}
          allLabel="With or without" options={Object.entries(USAGE)} />
        <PanelSelect id="area-filter-details" label="Details" value={filters.details} onChange={(details) => onChange({ details })}
          allLabel="Any" options={Object.entries(DETAILS)} />
        <div className="col-span-2">
          <PanelSelect id="area-filter-date" label="Date added" value={filters.range}
            onChange={(range) => onChange({ range, ...(range === "custom" ? {} : { from: "", to: "" }) })}
            allLabel="Any date" options={Object.entries(DATE_PRESETS)} />
        </div>
        {filters.range === "custom" && (
          <>
            <label className="text-xs font-medium text-slate-500">
              From
              <input type="date" value={filters.from} max={filters.to || undefined}
                onChange={(e) => onChange({ from: e.target.value })} className={`${FIELD} mt-1 px-2 py-1.5`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              To
              <input type="date" value={filters.to} min={filters.from || undefined}
                onChange={(e) => onChange({ to: e.target.value })} className={`${FIELD} mt-1 px-2 py-1.5`} />
            </label>
          </>
        )}
      </div>
    </Popover>
  );
}

/** The status tabs (All, Pending, Approved, Archived), each with how many areas it would show. */
export function AreaStatusTabs({ value, onChange, counts }) {
  const tabs = [{ value: "", label: "All" }, ...AREA_STATUSES];
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Status">
      {tabs.map((tab) => {
        const active = value === tab.value;
        const count = counts[tab.value] || 0;
        const needsReview = tab.value === "pending" && count > 0;
        return (
          <button
            key={tab.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange({ status: tab.value })}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
              needsReview ? "bg-amber-100 text-amber-700" : active ? "bg-blue-50 text-blue-700" : "bg-white/70 text-slate-500"
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The tool row above CENRO's collection area list: search, the Filters panel and the order,
 * then a chip per active filter. `total` is how many areas there are and `shown` how many pass.
 */
export default function AreaFilters({ filters, onChange, onClear, barangays, total, shown }) {
  const chips = areaFilterChips(filters).filter((chip) => chip.key !== "status");

  return (
    <div className="border-b border-slate-100 p-3 space-y-2.5">
      <SearchBar
        value={filters.q}
        onChange={(q) => onChange({ q })}
        placeholder="Search name, ID, barangay, water body..."
      />
      <div className="flex items-center gap-2">
        <FiltersPanel filters={filters} onChange={onChange} barangays={barangays} />
        <label className="relative flex min-w-0 flex-1 items-center">
          <ArrowUpDown size={14} className="pointer-events-none absolute left-3 text-slate-400" />
          <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })} aria-label="Sort areas by" className={`${FIELD} pl-8`}>
            {Object.entries(SORT_OPTIONS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
      </div>

      {(chips.length > 0 || filters.q) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-0.5 font-medium text-slate-500" aria-live="polite">Showing {shown} of {total}</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear)}
              className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 py-0.5 pl-2.5 pr-1.5 font-medium text-blue-700 hover:bg-blue-100"
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X size={12} />
            </button>
          ))}
          <button type="button" onClick={onClear} className="font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
