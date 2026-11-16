import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, CalendarDays, Check, ChevronDown, ListFilter, X } from "lucide-react";
import { SearchBar } from "./ui/SearchBar";
import {
  CLEANUP_TYPES, DATE_FIELDS, DATE_PRESETS, SCHEDULE_OPTIONS, SORT_OPTIONS,
  activeFilterChips, describeDateFilter, filterOptions, filterRequests,
} from "../utils/requestFilters";

const CONTROL = "rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30";
const IDLE = "border-slate-200 text-slate-600 hover:bg-slate-50";
const ACTIVE = "border-blue-300 bg-blue-50 text-blue-700";

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function Popover({ label, icon: Icon, active, badge, children, width = "w-72" }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${CONTROL} ${active ? ACTIVE : IDLE} flex items-center gap-2 whitespace-nowrap`}
      >
        <Icon size={15} />
        <span className="max-w-[220px] truncate">{label}</span>
        {badge ? <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{badge}</span> : null}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`absolute left-0 z-30 mt-1.5 ${width} max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg`}>
          {children}
        </div>
      )}
    </div>
  );
}

function StatusFilter({ filters, onChange, statuses, counts }) {
  const selected = filters.status;
  const toggle = (status) => onChange({
    status: selected.includes(status) ? selected.filter((s) => s !== status) : [...selected, status],
  });
  const label = selected.length === 0 ? "All statuses" : selected.length === 1 ? selected[0] : "Status";
  return (
    <Popover label={label} icon={ListFilter} active={selected.length > 0} badge={selected.length > 1 ? selected.length : 0}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">Status</p>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange({ status: [] })} className="text-xs font-medium text-blue-600 hover:text-blue-700">
            Clear
          </button>
        )}
      </div>
      <ul className="max-h-72 overflow-y-auto">
        {statuses.map((status) => {
          const checked = selected.includes(status);
          const count = counts[status] || 0;
          return (
            <li key={status}>
              <label className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 ${count === 0 && !checked ? "text-slate-400" : "text-slate-700"}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(status)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                <span className="flex-1">{status}</span>
                <span className="text-xs tabular-nums text-slate-400">{count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

function DateFilter({ filters, onChange }) {
  const presets = DATE_PRESETS[filters.dateField];
  const label = describeDateFilter(filters) || "Any date";
  // Changing which date is filtered keeps the range when it still makes sense for the other.
  const switchField = (field) => onChange({
    dateField: field,
    range: DATE_PRESETS[field][filters.range] ? filters.range : "",
  });
  return (
    <Popover label={label} icon={CalendarDays} active={Boolean(describeDateFilter(filters))} width="w-80">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {Object.entries(DATE_FIELDS).map(([field, name]) => (
          <button
            key={field}
            type="button"
            onClick={() => switchField(field)}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${filters.dateField === field ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        {[["", "Any date"], ...Object.entries(presets)].map(([value, name]) => (
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
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => onChange({ from: e.target.value })}
              className={`${CONTROL} ${IDLE} mt-1 w-full px-2 py-1.5`}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => onChange({ to: e.target.value })}
              className={`${CONTROL} ${IDLE} mt-1 w-full px-2 py-1.5`}
            />
          </label>
        </div>
      )}
    </Popover>
  );
}

function SelectFilter({ value, onChange, allLabel, options, label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`${CONTROL} ${value ? ACTIVE : IDLE} max-w-[220px] cursor-pointer pr-8`}
    >
      <option value="">{allLabel}</option>
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
  );
}

/**
 * The filter bar above a request list. `requests` is the whole list (before filtering),
 * used for the options and counts; `shown` is how many pass the filters. Pass
 * `scheduledIds` to offer the schedule filter, and `fields` to choose which other
 * filters appear (a barangay account only sees its own barangay, so it has no use for that one).
 */
export default function RequestFilters({
  filters, onChange, onClear, requests, shown, scheduledIds,
  fields = { barangay: true, area: true, role: true, type: true },
  searchPlaceholder = "Search ID, requester, barangay, area...",
}) {
  const options = useMemo(() => filterOptions(requests), [requests]);
  const statusCounts = useMemo(() => {
    const counts = {};
    filterRequests(requests, filters, { scheduledIds, except: "status" }).forEach((req) => {
      counts[req.status] = (counts[req.status] || 0) + 1;
    });
    return counts;
  }, [requests, filters, scheduledIds]);
  const chips = activeFilterChips(filters, options);

  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          value={filters.q}
          onChange={(q) => onChange({ q })}
          placeholder={searchPlaceholder}
          className="w-full sm:w-72"
        />
        <StatusFilter filters={filters} onChange={onChange} statuses={options.statuses} counts={statusCounts} />
        <DateFilter filters={filters} onChange={onChange} />
        {fields.type && (
          <SelectFilter label="Cleanup type" value={filters.type} onChange={(type) => onChange({ type })} allLabel="All cleanup types" options={Object.entries(CLEANUP_TYPES)} />
        )}
        {fields.barangay && options.barangays.length > 0 && (
          <SelectFilter label="Barangay" value={filters.barangay} onChange={(barangay) => onChange({ barangay })} allLabel="All barangays" options={options.barangays.map((b) => [b, b])} />
        )}
        {fields.area && options.areas.length > 0 && (
          <SelectFilter label="Collection area" value={filters.area} onChange={(area) => onChange({ area })} allLabel="All collection areas" options={options.areas.map((a) => [String(a.id), a.areaId ? `${a.name} (${a.areaId})` : a.name])} />
        )}
        {fields.role && options.roles.length > 1 && (
          <SelectFilter label="Requester" value={filters.role} onChange={(role) => onChange({ role })} allLabel="All requesters" options={options.roles.map((r) => [r, r])} />
        )}
        {scheduledIds && (
          <SelectFilter label="Schedule" value={filters.schedule} onChange={(schedule) => onChange({ schedule })} allLabel="Any schedule" options={Object.entries(SCHEDULE_OPTIONS)} />
        )}
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <ArrowUpDown size={14} className="text-slate-400" />
          <select
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
            aria-label="Sort by"
            className={`${CONTROL} ${IDLE} cursor-pointer pr-8`}
          >
            {Object.entries(SORT_OPTIONS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-slate-500">
          {shown === requests.length ? `${requests.length} request${requests.length === 1 ? "" : "s"}` : `Showing ${shown} of ${requests.length}`}
        </span>
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
        {(chips.length > 0 || filters.q) && (
          <button type="button" onClick={onClear} className="font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
