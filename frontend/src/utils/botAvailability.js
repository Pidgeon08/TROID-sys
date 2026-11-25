// What the request form's timetable shows about each day: how many robots are free, how many
// cleanups are booked, and what is booked at each hour. A robot takes one cleanup (or maintenance) a
// day (DeploymentScheduleSerializer refuses a second); non-TROID cleanups take no robot.

/** A Date's "YYYY-MM-DD", in the browser's own day (the timetable's days are local dates). */
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The hour slot ("08:00") a booking's time ("08:00", "8:30 AM") falls in, or "" when it has none. */
export function slotOf(label) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(label || "").trim());
  if (!match) return "";
  let hour = Number(match[1]);
  const half = match[3]?.toUpperCase();
  if (half === "PM" && hour < 12) hour += 12;
  if (half === "AM" && hour === 12) hour = 0;
  return hour > 23 ? "" : `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Each day's bookings, keyed "YYYY-MM-DD": the robots booked for a cleanup (`busy`) or for
 * maintenance, the cleanups booked (with and without a robot), and per hour slot the robots
 * assigned and the non-TROID cleanups. Only robots in `bots` (the fleet) count toward `busy`.
 */
export function availabilityByDay(bots, schedules) {
  const fleet = new Set(bots.map((b) => String(b.id)));
  const days = {};
  const dayOf = (key) => {
    days[key] = days[key] || { busy: new Set(), maintenance: new Set(), cleanups: 0, troid: 0, manual: 0, slots: {} };
    return days[key];
  };
  (schedules || []).forEach((s) => {
    if (!s.day) return;
    const bot = s.bot == null ? null : String(s.bot);
    if (s.status === "maintenance") {
      if (bot && fleet.has(bot)) dayOf(s.day).maintenance.add(bot);
      return;
    }
    if (s.status !== "scheduled") return;
    const day = dayOf(s.day);
    const manual = s.cleanup_type === "unsupported" || bot === null;
    const slot = slotOf(s.label) || "other";
    day.slots[slot] = day.slots[slot] || { bots: 0, manual: 0 };
    day.cleanups += 1;
    if (manual) {
      day.manual += 1;
      day.slots[slot].manual += 1;
    } else {
      day.troid += 1;
      day.slots[slot].bots += 1;
      if (fleet.has(bot)) day.busy.add(bot);
    }
  });
  return days;
}

/** Robots with neither a cleanup nor maintenance that day. */
export function freeBots(day, fleetSize) {
  if (!day) return fleetSize;
  return Math.max(0, fleetSize - new Set([...day.busy, ...day.maintenance]).size);
}

/** Green when most robots are free, amber when few are, red when none is. */
export function freeTone(free, fleetSize) {
  if (fleetSize === 0 || free === 0) return "text-red-600";
  if (free < fleetSize / 2) return "text-amber-600";
  return "text-emerald-600";
}
