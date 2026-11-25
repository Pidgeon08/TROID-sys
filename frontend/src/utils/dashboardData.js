// The numbers on the dashboards (CENRO, City Admin, barangay/NGO): this month so far against the same
// dates last month, worked out the same way as the Reports page (reportData), so following a
// dashboard's "View in Reports" lands on the same figures.
import { manilaDate } from "../constants/requests";
import {
  collectionsIn, compareGroups, inPeriod, monthToDate, pctChange, requestsSubmittedIn, summarize, toCollections,
  trendSeries, wasteBreakdown,
} from "./reportData";

/**
 * Everything a dashboard compares, for one barangay or all of them. `byArea` groups bags by
 * collection area (a barangay's own dashboard) instead of by barangay.
 */
export function dashboardSummary(requests, { barangay = "", byArea = false, today } = {}) {
  const period = monthToDate(today);
  const collections = toCollections(requests);
  const current = collectionsIn(collections, period, barangay);
  const previous = collectionsIn(collections, period.previous, barangay);
  const now = summarize(current);
  const before = summarize(previous);
  const received = requestsSubmittedIn(requests, period, barangay).length;
  const receivedBefore = requestsSubmittedIn(requests, period.previous, barangay).length;
  return {
    period,
    now,
    before,
    // Each total's change, this month against last (null: none last month to compare with).
    change: Object.fromEntries(Object.keys(now).map((key) => [key, pctChange(now[key], before[key])])),
    received: { now: received, before: receivedBefore, change: pctChange(received, receivedBefore) },
    trend: trendSeries(current, period, "Daily", previous),
    waste: wasteBreakdown(current, previous),
    groups: compareGroups(current, previous, byArea ? (c) => c.areaName || c.zone : (c) => c.barangay),
  };
}

/**
 * Status history steps (by label, or by role) dated inside a period, counted across requests,
 * e.g. how many requests the City Admin approved this month.
 */
export function historyStepsIn(requests, period, matches) {
  let count = 0;
  requests.forEach((r) => (r.status_history || []).forEach((step) => {
    if (step.date && matches(step) && inPeriod(manilaDate(new Date(step.date)), period)) count += 1;
  }));
  return count;
}

/** The latest status history steps that match, newest first, with the request they belong to. */
export function latestSteps(requests, matches, limit = 5) {
  const steps = [];
  requests.forEach((r) => (r.status_history || []).forEach((step) => {
    if (step.date && matches(step)) steps.push({ ...step, request: r });
  }));
  return steps.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
}

/**
 * The Reports page, opened on the dashboard's period and comparison, scrolled to one of its charts
 * (Reports' CHART_NAMES), and in one barangay if given.
 */
export function reportsLink(reportsPath, period, chart, barangay = "") {
  const params = new URLSearchParams({ from: period.from, to: period.to, compare: "month" });
  if (chart) params.set("chart", chart);
  if (barangay) params.set("barangay", barangay);
  return `${reportsPath}?${params}`;
}
