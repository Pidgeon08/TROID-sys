// The City Admin's dashboard: the requests waiting on their approval first, then the same picture
// of the city's cleanups as CENRO's dashboard (this month so far against the same dates last month,
// hotspots and priority areas), each chart opening the Reports page on the same figures.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FileText, Inbox, ShieldCheck, Trash2 } from "lucide-react";
import api from "../../services/api";
import HotspotsCard from "../../components/HotspotsCard";
import PriorityAreaList from "../../components/PriorityAreaList";
import { DASHBOARD_CARD, Panel } from "../../components/DashboardPanels";
import {
  BagsChartCard, CleanupsChartCard, DashboardHeader, KpiCard, PlacesChartCard, WasteChartCard,
} from "../../components/DashboardOverview";
import { dashboardSummary, historyStepsIn, latestSteps, reportsLink } from "../../utils/dashboardData";
import { cityAdminWording, requestArea } from "../../constants/requests";
import { LIVE, useLiveVersion } from "../../hooks/useLiveUpdates";

const REPORTS = "/mayorsoffice/reports";
const APPROVED_STEP = "Approved by City Admin";
// A request waiting this long can be resent by its requester (Request.RESEND_AFTER_DAYS).
const OVERDUE_DAYS = 7;
const PENDING_FILTER = `/mayorsoffice/requests?status=${encodeURIComponent("Pending City Admin Approval")}`;

const daysWaiting = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-");
const shortTime = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const isCityAdminStep = (step) => step.role === "City Admin" || /city admin/i.test(step.label || "");

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext() || {};
  const [requests, setRequests] = useState([]);
  const [priority, setPriority] = useState([]);
  const [loading, setLoading] = useState(true);

  // Loaded again when this data changes anywhere, so the page stays current without a reload.
  const live = useLiveVersion(LIVE.requests, LIVE.areas);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.requests(), api.priorityAreas()])
      .then(([requestsRes, priorityRes]) => {
        if (cancelled) return;
        if (requestsRes.status === "rejected") console.error("Failed to load the City Admin dashboard:", requestsRes.reason);
        setRequests(requestsRes.status === "fulfilled" && Array.isArray(requestsRes.value) ? requestsRes.value : []);
        setPriority(priorityRes.status === "fulfilled" && Array.isArray(priorityRes.value) ? priorityRes.value.filter((p) => p.is_priority) : []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [live]);

  const summary = useMemo(() => dashboardSummary(requests), [requests]);
  const link = (chart) => reportsLink(REPORTS, summary.period, chart);
  const { now, before, change, received, period } = summary;

  // Waiting on the City Admin, oldest first: those have waited longest.
  const pending = useMemo(
    () => requests
      .filter((r) => !r.archived && r.status === "pending_mayor_approval")
      .sort((a, b) => new Date(a.date_submitted) - new Date(b.date_submitted)),
    [requests]
  );
  const overdue = pending.filter((r) => daysWaiting(r.date_submitted) >= OVERDUE_DAYS).length;
  const approved = useMemo(() => ({
    now: historyStepsIn(requests, period, (s) => s.label === APPROVED_STEP),
    before: historyStepsIn(requests, period.previous, (s) => s.label === APPROVED_STEP),
  }), [requests, period]);
  const approvedChange = approved.before ? Math.round(((approved.now - approved.before) / approved.before) * 1000) / 10 : approved.now ? null : 0;
  const decisions = useMemo(() => latestSteps(requests, isCityAdminStep, 6), [requests]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <DashboardHeader
        title="City Admin Dashboard"
        subtitle={`Welcome back, ${currentUser?.name || "City Admin"}`}
        currentUser={currentUser}
        userType="mayorsoffice"
        reportsPath={REPORTS}
        period={period}
      />

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Clock} tint="bg-amber-50 text-amber-600" label="Awaiting Your Approval" value={pending.length}
          hint={overdue ? `${overdue} waiting ${OVERDUE_DAYS} days or more` : "None waiting long"} to={PENDING_FILTER} />
        <KpiCard icon={Inbox} tint="bg-sky-50 text-sky-600" label="Requests Received" value={received.now}
          previous={received.before} change={received.change} comparedLabel="last month" to="/mayorsoffice/requests?range=thisMonth" />
        <KpiCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" label="Approved by You" value={approved.now}
          previous={approved.before} change={approvedChange} comparedLabel="last month" to="/mayorsoffice/requests" />
        <KpiCard icon={Trash2} tint="bg-blue-50 text-blue-600" label="Bags Collected" value={now.bags} unit="bags"
          previous={before.bags} change={change.bags} comparedLabel="last month" to={link("bags")} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className={`${DASHBOARD_CARD} overflow-hidden lg:col-span-2`}>
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#1b4de4]" />
              <h2 className="text-[15px] font-bold text-slate-900">Pending Approval</h2>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">{pending.length}</span>
            </div>
            <button onClick={() => navigate(PENDING_FILTER)} className="text-xs font-semibold text-[#1b4de4] hover:text-[#153eb8]">View all</button>
          </div>
          {pending.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">Nothing is waiting on your approval.</p>
          ) : (
            <ul className="max-h-[360px] divide-y divide-slate-50 overflow-y-auto">
              {pending.slice(0, 8).map((r) => {
                const waited = daysWaiting(r.date_submitted);
                return (
                  <li key={r.request_id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/mayorsoffice/requests/${r.request_id}`)}
                      className="group flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-slate-50/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{r.request_id}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[r.barangay, r.requested_by_name, requestArea(r) !== r.barangay ? requestArea(r) : ""].filter(Boolean).join(" · ")}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {r.cleanup_type === "unsupported" ? "Non-TROID cleanup" : "TROID-supported"} · submitted {shortDay(r.date_submitted)}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${waited >= OVERDUE_DAYS ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                        {waited === 0 ? "Today" : `${waited} day${waited === 1 ? "" : "s"}`}
                      </span>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#1b4de4]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Panel title="Recent Decisions" icon={CheckCircle2} iconClassName="text-emerald-500" action={{ label: "View all", onClick: () => navigate("/mayorsoffice/requests") }}>
          {decisions.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">No decisions yet.</p>
          ) : (
            <ul className="flex flex-col gap-3.5">
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

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BagsChartCard summary={summary} reportTo={link("bags")} />
        <CleanupsChartCard summary={summary} reportTo={link("cleanups")} />
      </div>

      <div className="mb-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        <HotspotsCard title="Collective Hotspots" mapClassName="min-h-[380px]" />
        <Panel title={`Priority Areas (${priority.length})`} icon={AlertTriangle}>
          <PriorityAreaList areas={priority} emptyText="No collection area is bringing in more bags per cleanup than last month." />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WasteChartCard summary={summary} reportTo={link("waste")} />
        <PlacesChartCard summary={summary} title="Bags by Barangay" reportTo={link("places")} />
      </div>
    </div>
  );
}
