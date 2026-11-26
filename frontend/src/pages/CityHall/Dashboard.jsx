// The City Admin's dashboard: only requests, since approving them is the City Admin's part. What is
// waiting on their approval (and how long), this month's requests against the same dates last
// month, where the requests stand, and their latest decisions. The City Admin sees only the
// requests that reached them, each as awaiting their approval, overdue or approved. On wide screens it fits the window
// without scrolling.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FileText, Inbox, ListChecks, MapPin, ShieldCheck } from "lucide-react";
import api from "../../services/api";
import { DASHBOARD_CARD, Panel } from "../../components/DashboardPanels";
import { DashboardHeader, KpiCard, PairedBars } from "../../components/DashboardOverview";
import { historyStepsIn, latestSteps } from "../../utils/dashboardData";
import { monthToDate, pctChange, requestBarangay, requestsSubmittedIn } from "../../utils/reportData";
import {
  CITY_ADMIN_OVERDUE_DAYS, CITY_ADMIN_STATUSES, REQUEST_STATUS_STYLES, cityAdminStatus, cityAdminWording, daysWaiting, requestArea,
} from "../../constants/requests";
import { LIVE, useLiveVersion } from "../../hooks/useLiveUpdates";

const APPROVED_STEP = "Approved by City Admin";
const statusFilter = (...statuses) => `/mayorsoffice/requests?status=${statuses.map(encodeURIComponent).join(",")}`;
const PENDING_FILTER = statusFilter("Awaiting City Admin Approval", "Overdue");
const OVERDUE_FILTER = statusFilter("Overdue");

const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-");
const shortTime = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const isCityAdminStep = (step) => step.role === "City Admin" || /city admin/i.test(step.label || "");

/** Requests received this month and the same dates last month, by barangay, most first. */
function byBarangay(now, before) {
  const counts = new Map();
  const add = (list, field) => list.forEach((r) => {
    const name = requestBarangay(r) || "Unknown barangay";
    const row = counts.get(name) || { name, now: 0, before: 0 };
    row[field] += 1;
    counts.set(name, row);
  });
  add(now, "now");
  add(before, "before");
  return [...counts.values()]
    .map((row) => ({ ...row, change: pctChange(row.now, row.before) }))
    .sort((a, b) => b.now - a.now || b.before - a.before || a.name.localeCompare(b.name));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  // Only the requests that reached the City Admin (cityAdminStatus).
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests);
  useEffect(() => {
    let cancelled = false;
    api.requests()
      .then((res) => { if (!cancelled) setRequests(Array.isArray(res) ? res.filter((r) => cityAdminStatus(r)) : []); })
      .catch((err) => console.error("Failed to load the City Admin dashboard:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [live]);

  const period = useMemo(() => monthToDate(), []);

  // Waiting on the City Admin, oldest first: those have waited longest.
  const pending = useMemo(
    () => requests
      .filter((r) => !r.archived && r.status === "pending_mayor_approval")
      .sort((a, b) => new Date(a.date_submitted) - new Date(b.date_submitted)),
    [requests]
  );
  const overdue = pending.filter((r) => daysWaiting(r.date_submitted) >= CITY_ADMIN_OVERDUE_DAYS).length;

  const received = useMemo(() => {
    const now = requestsSubmittedIn(requests, period);
    const before = requestsSubmittedIn(requests, period.previous);
    return { now: now.length, before: before.length, change: pctChange(now.length, before.length), barangays: byBarangay(now, before) };
  }, [requests, period]);

  const approved = useMemo(() => {
    const now = historyStepsIn(requests, period, (s) => s.label === APPROVED_STEP);
    const before = historyStepsIn(requests, period.previous, (s) => s.label === APPROVED_STEP);
    return { now, before, change: pctChange(now, before) };
  }, [requests, period]);

  // The City Admin's requests by where they stand for them: awaiting, overdue or approved.
  const statuses = useMemo(() => {
    const counts = Object.fromEntries(CITY_ADMIN_STATUSES.map((s) => [s, 0]));
    requests.forEach((r) => { counts[cityAdminStatus(r)] += 1; });
    return CITY_ADMIN_STATUSES.map((s) => [s, counts[s]]);
  }, [requests]);
  const statusTotal = statuses.reduce((sum, [, n]) => sum + n, 0);

  const decisions = useMemo(() => latestSteps(requests, isCityAdminStep, 8), [requests]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-6 xl:flex xl:h-full xl:flex-col xl:overflow-hidden xl:pb-0">
      <DashboardHeader
        title="City Admin Dashboard"
        subtitle={`Welcome back, ${currentUser?.name || "City Admin"}`}
        currentUser={currentUser}
        userType="mayorsoffice"
        period={period}
      />

      <div className="mb-4 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Clock} tint="bg-amber-50 text-amber-600" label="Awaiting Your Approval" value={pending.length}
          hint={pending.length ? `Oldest submitted ${shortDay(pending[0].date_submitted)}` : "Nothing waiting"} to={PENDING_FILTER} />
        <KpiCard icon={AlertTriangle} tint="bg-red-50 text-red-600" label="Overdue" value={overdue}
          hint={`Waiting ${CITY_ADMIN_OVERDUE_DAYS} days or more`} to={OVERDUE_FILTER} />
        <KpiCard icon={Inbox} tint="bg-sky-50 text-sky-600" label="Requests Received" value={received.now}
          previous={received.before} change={received.change} comparedLabel="last month" to="/mayorsoffice/requests?range=thisMonth" />
        <KpiCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" label="Approved by You" value={approved.now}
          previous={approved.before} change={approved.change} comparedLabel="last month" to="/mayorsoffice/requests" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)]">
        {/* Waiting on the City Admin, oldest first */}
        <section className={`${DASHBOARD_CARD} flex flex-col overflow-hidden xl:min-h-0`}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#1b4de4]" />
              <h2 className="text-[15px] font-bold text-slate-900">Pending Approval</h2>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">{pending.length}</span>
            </div>
            <button onClick={() => navigate(PENDING_FILTER)} className="text-xs font-semibold text-[#1b4de4] hover:text-[#153eb8]">View all</button>
          </div>
          {pending.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nothing is waiting on your approval.</p>
          ) : (
            <ul className="max-h-[420px] min-h-0 flex-1 divide-y divide-slate-50 overflow-y-auto xl:max-h-none">
              {pending.map((r) => {
                const waited = daysWaiting(r.date_submitted);
                return (
                  <li key={r.request_id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/mayorsoffice/requests/${r.request_id}`)}
                      className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50/60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{r.request_id}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[r.barangay, r.requested_by_name, requestArea(r) !== r.barangay ? requestArea(r) : ""].filter(Boolean).join(" · ")}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {r.cleanup_type === "unsupported" ? "Non-TROID cleanup" : "TROID-supported"} · submitted {shortDay(r.date_submitted)}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${waited >= CITY_ADMIN_OVERDUE_DAYS ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                        {waited >= CITY_ADMIN_OVERDUE_DAYS ? "Overdue · " : ""}{waited === 0 ? "Today" : `${waited} day${waited === 1 ? "" : "s"}`}
                      </span>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#1b4de4]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Requests received by barangay, this month against last */}
        <Panel
          fill
          className="max-h-[420px] xl:max-h-none"
          title="Requests by Barangay"
          icon={MapPin}
          iconClassName="text-[#1b4de4]"
        >
          <p className="mb-3 text-[11px] text-slate-400">Received {period.label}; the thin bar is {period.previous.label}.</p>
          <PairedBars rows={received.barangays} unit="" empty="No requests received this month or the same days last month." />
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1 xl:min-h-0">
          {/* The City Admin's requests by where they stand for them */}
          <Panel fill className="max-h-[300px] xl:max-h-none xl:flex-1" title={`Where Requests Stand (${statusTotal})`} icon={ListChecks} iconClassName="text-slate-500">
            <ul className="flex flex-col gap-1">
              {statuses.map(([label, n]) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => navigate(statusFilter(label))}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50"
                  >
                    <span className={`truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${REQUEST_STATUS_STYLES[label] || "bg-slate-100 text-slate-600"}`}>{label}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{n.toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel fill className="max-h-[360px] xl:max-h-none xl:flex-1" title="Recent Decisions" icon={CheckCircle2} iconClassName="text-emerald-500" action={{ label: "View all", onClick: () => navigate("/mayorsoffice/requests") }}>
            {decisions.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">No decisions yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {decisions.map((step) => (
                  <li key={`${step.request.request_id}-${step.date}-${step.label}`}>
                    <button type="button" onClick={() => navigate(`/mayorsoffice/requests/${step.request.request_id}`)} className="flex w-full items-start gap-3 text-left">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${/approved/i.test(step.label) ? "bg-emerald-500" : /park/i.test(step.label) ? "bg-purple-500" : "bg-slate-400"}`} />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-slate-700">
                          {step.request.request_id} · <span className="font-semibold">{cityAdminWording(step.label)}</span>
                        </span>
                        <span className="block text-[11px] text-slate-400">{step.request.barangay} · {shortTime(step.date)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
