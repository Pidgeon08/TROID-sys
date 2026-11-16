import { ArrowUpDown, CalendarDays, Check, SlidersHorizontal, X } from "lucide-react";
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

/** Barangay, water body, shape, requests and details: the filters that fit in one panel. */
function MoreFilters({ filters, onChange, barangays }) {
  const set = PANEL_FILTERS.filter((key) => filters[key]).length;
  return (
    <Popover label="Filters" icon={SlidersHorizontal} active={set > 0} badge={set}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">Filter areas</p>
        {set > 0 && (
          <button
            type="button"
            onClick={() => onChange(Object.fromEntries(PANEL_FILTERS.map((key) => [key, ""])))}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Clear
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        <PanelSelect id="area-filter-priority" label="Priority" value={filters.priority} onChange={(priority) => onChange({ priority })}
          allLabel="Priority or not" options={Object.entries(PRIORITY)} />
        <PanelSelect id="area-filter-barangay" label="Barangay" value={filters.barangay} onChange={(barangay) => onChange({ barangay })}
          allLabel="All barangays" options={barangays.map((b) => [b, b])} />
        <PanelSelect id="area-filter-water" label="Water body" value={filters.water} onChange={(water) => onChange({ water })}
          allLabel="Any water body" options={[...WATER_BODY_TYPES.map((t) => [t.value, t.label]), [NO_WATER_BODY, "Not set"]]} />
        <PanelSelect id="area-filter-shape" label="Shape" value={filters.shape} onChange={(shape) => onChange({ shape })}
          allLabel="Polygons and lines" options={Object.entries(SHAPES)} />
        <PanelSelect id="area-filter-usage" label="Cleanup requests" value={filters.usage} onChange={(usage) => onChange({ usage })}
          allLabel="With or without requests" options={Object.entries(USAGE)} />
        <PanelSelect id="area-filter-details" label="Details" value={filters.details} onChange={(details) => onChange({ details })}
          allLabel="Any" options={Object.entries(DETAILS)} />
      </div>
    </Popover>
  );
}

function DateFilter({ filters, onChange }) {
  const label = describeAreaDate(filters) || "Any date added";
  return (
    <Popover label={label} icon={CalendarDays} active={Boolean(describeAreaDate(filters))} align="right">
      <p className="mb-2 text-xs font-semibold text-slate-500">Date the area was added</p>
      <div className="flex flex-col">
        {[["", "Any date"], ...Object.entries(DATE_PRESETS)].map(([value, name]) => (
          <button
            key={value || "any"}
            type="button"
            onClick={() => onChange({ range: value, ...(value === "custom" ? {} : { from: "", to: "" }) })}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${filters.range === value ? "font-medium text-blue-700" : "text-slate-700"}`}
          >
            {name}
            {filters.range === value && <Check size={14} />}
          </button>
        ))}
      </div>
      {filters.range === "custom" && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
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
        </div>
      )}
    </Popover>
  );
}

/**
 * The filter bar above CENRO's collection area list: search, a status tab per status with
 * how many areas it would show, the other filters in a panel, the date added, and the order.
 * `total` is how many areas there are, `shown` how many pass, and `counts` the per-status
 * counts from statusCounts().
 */
export default function AreaFilters({ filters, onChange, onClear, barangays, total, shown, counts }) {
  const chips = areaFilterChips(filters).filter((chip) => chip.key !== "status");
  const tabs = [{ value: "", label: "All" }, ...AREA_STATUSES];

  return (
    <div className="border-b border-slate-100">
      <div className="space-y-2 px-4 pt-4">
        <SearchBar
          value={filters.q}
          onChange={(q) => onChange({ q })}
          placeholder="Search name, ID, barangay, water body..."
        />
        <div className="grid grid-cols-2 gap-2">
          <MoreFilters filters={filters} onChange={onChange} barangays={barangays} />
          <DateFilter filters={filters} onChange={onChange} />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="shrink-0 text-slate-400" />
          <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })} aria-label="Sort areas by" className={FIELD}>
            {Object.entries(SORT_OPTIONS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </div>
      </div>

      {(chips.length > 0 || filters.q) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-xs">
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

      <div className="mt-2 flex items-center gap-4 overflow-x-auto px-4" role="tablist" aria-label="Status">
        {tabs.map((tab) => {
          const active = filters.status === tab.value;
          return (
            <button
              key={tab.value || "all"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ status: tab.value })}
              className={`relative flex items-center gap-1.5 whitespace-nowrap py-3 text-sm font-medium transition-colors ${active ? "text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 text-[11px] font-semibold ${active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                {counts[tab.value] || 0}
              </span>
              {active && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-blue-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
