// An area's condition report: one hotspot period (a month, as it stood at its end, looking at the
// 30 days before) against the one before it, from the area's history (GET /collection-areas/<id>/history/).
// Builds the comparison table and the findings written out in words.
import { TROID_CLASSES } from "../constants/trashReport";

/** One heat scale for every period on show, so the same colour means the same amount of trash. */
export function heatOptionsFor(...periods) {
  const most = Math.max(1, ...periods.map((d) => (d || []).length));
  return { radius: 22, blur: 18, max: Math.max(1, most / 25) };
}

export const monthName = (month, style = "long") =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: style, year: "numeric" });

const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Oct 2 – Oct 31, 2026": the 30 days a period looks at. */
export const periodRange = (period) => `${day(period.start)} – ${day(period.as_of)}`;

export const periodLabel = (period) => `${monthName(period.month)}${period.so_far ? " (so far)" : ""}`;

const plural = (n, word) => `${Number(n).toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const kg = (n) => `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;

export const STATUS = {
  priority: { label: "Hotspot", tone: "hot" },
  steady: { label: "Not a hotspot", tone: "ok" },
  no_baseline: { label: "Not a hotspot (first cleanups)", tone: "ok" },
  no_recent: { label: "No cleanups", tone: "none" },
  no_cleanups: { label: "No cleanups", tone: "none" },
};

export const statusLabel = (period) => (STATUS[period?.status] || STATUS.no_cleanups).label;

/** Why a period is or isn't a hotspot, in a sentence. */
export function statusSentence(p) {
  const avg = p.average_bags;
  const before = p.previous?.average;
  switch (p.status) {
    case "priority":
      return `A hotspot: ${avg} bags per cleanup over these 30 days, up from ${before} the 30 days before (+${p.change_pct}%).`;
    case "steady":
      return `Not a hotspot: ${avg} bags per cleanup over these 30 days, ${avg === before ? "the same as" : "down from"} ${before} the 30 days before${p.change_pct != null && p.change_pct !== 0 ? ` (${p.change_pct}%)` : ""}.`;
    case "no_baseline":
      return `Not a hotspot: ${avg} bags per cleanup, but no cleanups the 30 days before to compare with.`;
    case "no_recent":
      return `No cleanups were finished in these 30 days (${before} bags per cleanup the 30 days before).`;
    default:
      return "No cleanups were finished in these 30 days or the 30 days before.";
  }
}

const sumValues = (obj) => Object.values(obj || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

/** The change from `before` to `now` as text: "+35%", "−12%", "new", "none" or "no change". */
export function changeText(before, now) {
  if (before == null || now == null) return "—";
  if (before === now) return "no change";
  if (!before) return now ? "new" : "—";
  const pct = Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/**
 * The report's content. `coverage` is { now, before } of areaCoverage results (or null for each
 * when the area is a line or its detections are still loading).
 * Each row: { label, before, now, change, worse } where `worse` says the change is for the worse
 * (true), the better (false) or neither (null), for colouring.
 */
export function buildAreaReport(current, previous, coverage = {}) {
  const prev = previous || { cleanups: 0, troid_cleanups: 0, bags: 0, average_bags: null, weight_kg: 0, recyclable_kg: 0, non_usable_kg: 0, classes: {}, items: {}, detections: 0, detected_items: 0, people: 0, hours: 0, status: "no_cleanups" };
  const num = (v, unit = "") => (v == null ? "—" : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`);
  const pct = (c) => (c ? Math.round(c.coveredPct * 10) / 10 : null);
  const covNow = pct(coverage.now);
  const covBefore = pct(coverage.before);
  const row = (label, b, n, { unit = "", upIsWorse = null } = {}) => ({
    label,
    before: num(b, unit),
    now: num(n, unit),
    change: changeText(b, n),
    worse: upIsWorse === null || b == null || n == null || b === n ? null : (n > b) === upIsWorse,
  });

  const rows = [
    { label: "Hotspot status", before: statusLabel(prev), now: statusLabel(current), change: "", worse: current.is_hotspot ? true : prev.is_hotspot ? false : null },
    row("Bags per cleanup", prev.average_bags, current.average_bags, { upIsWorse: true }),
    row("Cleanups finished", prev.cleanups, current.cleanups),
    row("  with a TROID robot", prev.troid_cleanups, current.troid_cleanups),
    row("Bags collected", prev.bags, current.bags),
    row("Weight collected", prev.weight_kg, current.weight_kg, { unit: " kg" }),
    row("  recyclable", prev.recyclable_kg, current.recyclable_kg, { unit: " kg" }),
    row("  non-usable", prev.non_usable_kg, current.non_usable_kg, { unit: " kg" }),
    row("Pieces counted", sumValues(prev.classes), sumValues(current.classes)),
    row("Items the robots detected", prev.detected_items, current.detected_items),
    row("Waterway covered by the robots", covBefore, covNow, { unit: "%", upIsWorse: false }),
    row("People who worked", prev.people, current.people),
    row("Hours worked", prev.hours, current.hours, { unit: " h" }),
  ];

  const classes = TROID_CLASSES.map((cls) => {
    const b = prev.classes?.[cls] || 0;
    const n = current.classes?.[cls] || 0;
    return { cls, before: b, now: n, change: changeText(b, n) };
  });
  const topItems = Object.entries(current.items || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([item, n]) => ({ item, now: n, before: prev.items?.[item] || 0, change: changeText(prev.items?.[item] || 0, n) }));

  // --- findings, in words -----------------------------------------------------------
  const findings = [];
  const was = prev.is_hotspot;
  const is = current.is_hotspot;
  if (!current.cleanups) {
    findings.push(`No cleanups were finished in ${periodLabel(current)}, so its condition can't be judged from trash reports.`);
  } else if (is && was) {
    findings.push(`It is still a hotspot: ${current.average_bags} bags per cleanup, up again from ${current.previous?.average} (+${current.change_pct}%). It was a hotspot in ${monthName(prev.month)} too.`);
  } else if (is) {
    findings.push(`It became a hotspot: ${current.average_bags} bags per cleanup, up from ${current.previous?.average} the 30 days before (+${current.change_pct}%).`);
  } else if (was) {
    findings.push(`It is no longer a hotspot: ${current.average_bags} bags per cleanup, against ${current.previous?.average ?? "—"} the 30 days before.`);
  } else {
    findings.push(`It was not a hotspot in either period. ${statusSentence(current)}`);
  }
  if (current.cleanups || prev.cleanups) {
    findings.push(
      `${plural(current.cleanups, "cleanup")} brought in ${plural(current.bags, "bag")} (${kg(current.weight_kg)}), `
      + `against ${plural(prev.cleanups, "cleanup")} and ${plural(prev.bags, "bag")} (${kg(prev.weight_kg)}) in ${monthName(prev.month || current.month)}.`,
    );
  }
  const moved = classes
    .filter((c) => c.before !== c.now)
    .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before))[0];
  if (moved) {
    findings.push(`${moved.cls} changed the most: ${moved.now.toLocaleString()} pieces, ${moved.now > moved.before ? "up" : "down"} from ${moved.before.toLocaleString()} (${moved.change}).`);
  }
  if (topItems[0]) {
    findings.push(`The item found most was ${topItems[0].item.toLowerCase()}: ${topItems[0].now.toLocaleString()} pieces.`);
  }
  if (covNow != null && covBefore != null && (current.detections || prev.detections)) {
    findings.push(`The robots' travel path covered ${covNow}% of the area's waterway, against ${covBefore}% before.`);
  }

  let outlook;
  if (!current.cleanups) outlook = "Schedule a cleanup here to see how it is doing.";
  else if (is) outlook = "Trash per cleanup is rising here. Clean it more often, and look upstream for where the trash comes from.";
  else if (was || (current.average_bags != null && prev.average_bags != null && current.average_bags < prev.average_bags)) {
    outlook = "Trash per cleanup is falling: the cleanups are keeping up with it.";
  } else outlook = "Trash per cleanup is holding steady.";

  return { rows, classes, topItems, findings, outlook };
}
