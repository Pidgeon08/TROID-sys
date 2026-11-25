// The request form's bot timetable. The week is a timetable: the hours down the side, each cell
// with the robots assigned and the non-TROID cleanups at that time, and each day with how many
// robots are free. The month shows each day's free robots and the cleanups booked.
import { Bot, Users } from "lucide-react";
import { dateKey, freeBots, freeTone } from "../utils/botAvailability";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hourLabel(slot) {
  const hour = Number(slot.slice(0, 2));
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour >= 12 ? "PM" : "AM"}`;
}

/** The robots assigned and the non-TROID cleanups at one time, as small counts. */
function SlotCounts({ cell }) {
  if (!cell || (!cell.bots && !cell.manual)) return null;
  return (
    <span className="flex flex-wrap items-center justify-center gap-1">
      {cell.bots > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700" title={`${cell.bots} robot${cell.bots === 1 ? "" : "s"} assigned`}>
          <Bot size={11} /> {cell.bots}
        </span>
      )}
      {cell.manual > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700" title={`${cell.manual} non-TROID cleanup${cell.manual === 1 ? "" : "s"}`}>
          <Users size={11} /> {cell.manual}
        </span>
      )}
    </span>
  );
}

/**
 * One week as a timetable. Clicking a time picks the day and that time; clicking a day's header
 * picks only the day.
 */
export function WeekTimetable({ days, slots, availability, fleetSize, selectedDate, selectedTime, onSelect, minSelectableDate }) {
  const hasOther = days.some((d) => availability[dateKey(d)]?.slots.other);
  const rows = hasOther ? [...slots, "other"] : slots;
  const gridCols = `64px repeat(${days.length}, minmax(84px, 1fr))`;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <div className="overflow-auto">
        <div style={{ minWidth: 64 + days.length * 88 }}>
          <div className="sticky top-0 z-20 grid gap-1 border-b border-slate-100 bg-slate-50 p-1.5" style={{ gridTemplateColumns: gridCols }}>
            <span className="self-end px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Time</span>
            {days.map((d) => {
              const key = dateKey(d);
              const info = availability[key];
              const free = freeBots(info, fleetSize);
              const disabled = d < minSelectableDate;
              const selected = selectedDate === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(d, "")}
                  className={`flex flex-col items-center rounded-md px-1 py-1 transition-colors ${
                    disabled ? "cursor-not-allowed opacity-40" : selected ? "bg-[#1b4de4] text-white" : "bg-white hover:bg-slate-100"
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${selected && !disabled ? "text-blue-100" : "text-slate-500"}`}>{DAY_SHORT[d.getDay()]}</span>
                  <span className="text-sm font-bold">{d.getDate()}</span>
                  <span className={`text-[10px] font-semibold ${selected && !disabled ? "text-white" : freeTone(free, fleetSize)}`}>
                    {free}/{fleetSize} free
                  </span>
                </button>
              );
            })}
          </div>
          <div className="divide-y divide-slate-50">
            {rows.map((slot) => (
              <div key={slot} className="grid items-stretch gap-1 px-1.5 py-1" style={{ gridTemplateColumns: gridCols }}>
                <span className="self-center px-1 text-[11px] font-semibold text-slate-500">{slot === "other" ? "Other" : hourLabel(slot)}</span>
                {days.map((d) => {
                  const key = dateKey(d);
                  const cell = availability[key]?.slots[slot];
                  const disabled = d < minSelectableDate;
                  const selected = selectedDate === key && selectedTime === slot;
                  const sameDay = selectedDate === key && !disabled;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled || slot === "other"}
                      onClick={() => onSelect(d, slot)}
                      title={disabled ? "Requests need at least 7 days' notice" : `Pick ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${slot === "other" ? "another time" : hourLabel(slot)}`}
                      className={`flex min-h-[34px] items-center justify-center rounded-lg border text-xs transition-colors ${
                        disabled
                          ? "cursor-not-allowed border-transparent bg-slate-50/60 opacity-50"
                          : selected
                            ? "border-[#1b4de4] bg-blue-50 ring-2 ring-blue-400"
                            : sameDay
                              ? "border-blue-100 bg-blue-50/40 hover:bg-blue-50"
                              : "border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                      }`}
                    >
                      {/* Shown on days too soon to pick as well, as what is already booked then. */}
                      <SlotCounts cell={cell} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 p-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 text-blue-700"><Bot size={11} /> 2</span> Robots assigned at that time</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-amber-700"><Users size={11} /> 1</span> Non-TROID cleanups</span>
        <span><span className="font-semibold text-emerald-600">2/3 free</span>: robots with no cleanup or maintenance that day</span>
        <span className="ml-auto text-slate-400">Click a time to pick the day and time, or a day to pick only the day.</span>
      </div>
    </div>
  );
}

/** One month: each day's free robots and the cleanups booked. Clicking a day opens its week. */
export function MonthAvailability({ anchor, availability, fleetSize, selectedDate, onSelectDate, minSelectableDate }) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const cells = [];
  for (let i = 0; i < new Date(year, month, 1).getDay(); i++) cells.push(null);
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) cells.push(new Date(year, month, d));
  const today = dateKey(new Date());

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <div className="grid grid-cols-7 gap-px bg-slate-100">
        {DAY_SHORT.map((d) => (
          <div key={d} className="bg-slate-50 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-100">
        {cells.map((d, idx) => {
          if (d === null) return <div key={`blank-${idx}`} className="h-[74px] bg-white" />;
          const key = dateKey(d);
          const info = availability[key];
          const free = freeBots(info, fleetSize);
          const booked = info?.cleanups || 0;
          const disabled = d < minSelectableDate;
          const selected = selectedDate === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(d)}
              className={`flex h-[74px] flex-col items-start justify-between p-1.5 text-left transition-colors ${
                disabled ? "cursor-not-allowed bg-white opacity-40" : selected ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "bg-white hover:bg-slate-50"
              }`}
            >
              <span className={`text-sm font-semibold ${key === today ? "text-[#1b4de4]" : "text-slate-700"}`}>{d.getDate()}</span>
              <span className="w-full space-y-0.5">
                <span className={`flex items-center gap-1 text-[10px] font-semibold ${freeTone(free, fleetSize)}`}>
                  <Bot size={11} className="shrink-0" /> {free}/{fleetSize} free
                </span>
                <span className={`block truncate text-[10px] font-medium ${booked ? "text-slate-600" : "text-slate-300"}`}>
                  {booked ? `${booked} booked${info.manual ? ` (${info.manual} non-TROID)` : ""}` : "None booked"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 p-3 text-[11px] text-slate-500">
        <span><span className="font-semibold text-emerald-600">Free</span>: robots with no cleanup or maintenance that day</span>
        <span><span className="font-semibold text-slate-600">Booked</span>: cleanups booked, with a robot or not</span>
        <span className="ml-auto text-slate-400">Click a day to see its times.</span>
      </div>
    </div>
  );
}
