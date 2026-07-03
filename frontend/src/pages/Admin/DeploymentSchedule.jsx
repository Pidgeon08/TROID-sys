import { useState, useMemo, useEffect } from "react";
import {
  Bot,
  CalendarCheck,
  UserRound,
  Plus,
  Info,
  MapPin,
  ChevronDown,
  Clock,
  Truck,
} from "lucide-react";
import { api } from '../../services/api';

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const STATUS_STYLES = {
  scheduled: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  available: "bg-sky-50 text-sky-700 border border-sky-100",
  maintenance: "bg-amber-50 text-amber-700 border border-amber-100",
  none: "bg-slate-50 text-slate-400 border border-slate-100",
};

function SummaryCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function LegendDot({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function Cell({ entry }) {
  if (!entry) {
    return <div className="rounded-xl border border-dashed border-slate-200 px-2 py-2.5" />;
  }
  const styles = STATUS_STYLES[entry.status];
  return (
    <button
      type="button"
      className={`w-full rounded-xl px-2 py-2 text-left text-xs transition-colors hover:brightness-95 ${styles}`}
    >
      <p className="font-semibold leading-tight">{entry.label}</p>
      {entry.zone && <p className="mt-0.5 truncate leading-tight opacity-80 flex items-center gap-1"><MapPin className="w-3 h-3" />{entry.zone}</p>}
    </button>
  );
}

function DeploymentModal({ bots, onClose, onSave, prefillBot, prefillZone }) {
  const [selectedBot, setSelectedBot] = useState(prefillBot || "");
  const [selectedDay, setSelectedDay] = useState("mon");
  const [timeSlot, setTimeSlot] = useState("06:00 - 10:00");
  const [zone, setZone] = useState(prefillZone || "");

  const handleSave = () => {
    if (!selectedBot || !zone) return;
    onSave(selectedBot, selectedDay, timeSlot, zone);
    setSelectedBot("");
    setZone("");
    setTimeSlot("06:00 - 10:00");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Schedule Deployment</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Assign a bot to a specific barangay area and schedule.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Select TROID Bot</label>
            <div className="relative">
              <select
                value={selectedBot}
                onChange={(e) => setSelectedBot(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                <option value="">-- Select Bot --</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>{b.id} - {b.operator} ({b.status})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Day</label>
              <div className="relative">
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
                >
                  {DAYS.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Time Slot</label>
              <div className="relative">
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
                >
                  <option>06:00 - 10:00</option>
                  <option>08:00 - 12:00</option>
                  <option>14:00 - 18:00</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Barangay Zone / Area</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="e.g., Carlatan Creek"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedBot || !zone}
              className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeploymentSchedule() {
  const [view, setView] = useState("Week");
  const [botFilter, setBotFilter] = useState("All Bots");
  const [showModal, setShowModal] = useState(false);
  const [prefillBot, setPrefillBot] = useState("");
  const [prefillZone, setPrefillZone] = useState("");
  const [bots, setBots] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.boats(), api.operators(), api.deploymentSchedules(), api.pendingRequestCount()]).then(([boatsData, operatorsData, schedulesData, pendingData]) => {
      if (cancelled) return;

      const opByBot = {};
      operatorsData.forEach((op) => {
        if (op.assigned_bot) {
          opByBot[String(op.assigned_bot)] = op;
        }
      });

      const boatMap = {};
      boatsData.forEach((b) => {
        const displayId = b.name || `Boat-${b.id}`;
        boatMap[String(b.id)] = displayId;
      });

      const mappedBots = boatsData.map((b) => {
        const op = opByBot[String(b.id)];
        return {
          id: boatMap[String(b.id)] || `Boat-${b.id}`,
          dbId: b.id,
          status: b.is_active ? 'Active' : 'Inactive',
          battery: Math.round(b.battery_level || 0),
          operator: op ? op.name : '-',
          barangay: op ? (op.location || '-') : '-',
        };
      });

      const scheduleMap = {};
      schedulesData.forEach((s) => {
        const boat = boatsData.find((bb) => String(bb.id) === String(s.bot));
        const name = boat ? boat.name : String(s.bot);
        scheduleMap[name] = scheduleMap[name] || {};
        scheduleMap[name][s.day] = {
          status: s.status || 'none',
          label: s.label || 'Available',
          zone: s.zone || '',
        };
      });

      setBots(mappedBots);
      setSchedule(scheduleMap);
      setPendingRequests(pendingData.pending_count || 0);
      setLoading(false);
    }).catch(() => setLoading(false));

    return () => { cancelled = true; };
  }, []);

  const filteredBots = useMemo(() => {
    return bots.filter((b) => {
      return botFilter === "All Bots" || b.id === botFilter;
    });
  }, [botFilter, bots]);

  const todayKey = DAYS[new Date().getDay()].key;
  const scheduledToday = Object.values(schedule).filter((s) => s?.[todayKey]?.status === "scheduled").length;

  const handleSaveSchedule = (botDisplayId, day, timeSlot, zone) => {
    const bot = bots.find((b) => b.id === botDisplayId);
    if (!bot) return;

    api.createDeploymentSchedule({
      bot: bot.dbId,
      day,
      status: "scheduled",
      label: timeSlot,
      zone,
    }).then(() => {
      setSchedule((prev) => ({
        ...prev,
        [botDisplayId]: {
          ...prev[botDisplayId],
          [day]: { status: "scheduled", label: timeSlot, zone },
        },
      }));
    }).catch(console.error);

    setShowModal(false);
    setPrefillBot("");
    setPrefillZone("");
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">Loading schedule...</span>
        </div>
      )}
      {!loading && (
      <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Deployment Schedule</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">
            Schedule TROID bot deployments and assign operators to barangay areas. Approved requests appear below.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 sm:flex">
            <LegendDot className="bg-emerald-500" label="Scheduled" />
            <LegendDot className="bg-sky-500" label="Available" />
            <LegendDot className="bg-amber-500" label="In Maintenance" />
            <LegendDot className="bg-slate-300" label="Offline / Charging" />
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#153eb8]"
          >
            <Plus className="h-4 w-4" />
            New Deployment
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30 pr-8 appearance-none"
            >
              <option>All Bots</option>
                {bots.map((b) => (
                  <option key={b.id}>{b.id}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {["Day", "Week", "Month"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${
                  view === v ? "bg-[#1b4de4] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Updated today, 07:30 AM
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Bot}
          label="Total Bots"
          value={bots.length}
          sub={`Active: ${bots.filter((b) => b.status === "Active").length}`}
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Scheduled Today"
          value={scheduledToday}
          sub="Active deployments"
        />
        <SummaryCard
          icon={UserRound}
          label="Operators Assigned"
          value={bots.filter((b) => b.operator && b.operator !== '-').length}
          sub={`Unassigned: ${bots.filter((b) => !b.operator || b.operator === '-').length}`}
        />
        <SummaryCard
          icon={Truck}
          label="Pending Requests"
          value={pendingRequests}
          sub="Awaiting deployment"
        />
      </div>

      {/* Weekly grid */}
      <div className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
        <div className="mb-5 flex items-center gap-1.5">
          <h2 className="text-[17px] font-bold text-slate-900">Weekly Deployment Grid</h2>
          <Info className="h-3.5 w-3.5 text-slate-300" />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Column headers */}
            <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-2 border-b border-slate-100 pb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bot / Operator</div>
              {DAYS.map((d) => (
                <div key={d.key} className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {d.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100">
              {filteredBots.map((bot) => (
                <div
                  key={bot.id}
                  className="grid grid-cols-[200px_repeat(7,1fr)] items-center gap-2 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{bot.id}</p>
                      <p className="truncate text-xs text-slate-400">{bot.operator}</p>
                      <p className="truncate text-[11px] text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{bot.barangay}</p>
                    </div>
                  </div>
                  {DAYS.map((d) => (
                    <Cell key={d.key} entry={schedule[bot.id]?.[d.key]} />
                  ))}
                </div>
              ))}
              {filteredBots.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  No bots match the selected filter.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <LegendDot className="bg-emerald-500" label="Scheduled" />
          <LegendDot className="bg-sky-500" label="Available" />
          <LegendDot className="bg-amber-500" label="Maintenance" />
          <LegendDot className="bg-slate-300" label="No Schedule" />
        </div>
      </div>

      {/* Operator Assignment Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
        <h2 className="text-[17px] font-bold text-slate-900 mb-4 flex items-center gap-2">
          <UserRound className="w-5 h-5 text-slate-500" />
          Operator & Bot Assignment
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Bot ID</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Operator</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Barangay Zone</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Battery</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((bot) => (
                <tr key={bot.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold text-slate-800">{bot.id}</td>
                  <td className="px-4 py-3 text-slate-600">{bot.operator}</td>
                  <td className="px-4 py-3 text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{bot.barangay}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                      bot.status === "Active" ? "bg-emerald-50 text-emerald-700" :
                      bot.status === "Idle" ? "bg-sky-50 text-sky-700" :
                      bot.status === "Charging" ? "bg-amber-50 text-amber-700" :
                      "bg-slate-50 text-slate-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        bot.status === "Active" ? "bg-emerald-500" :
                        bot.status === "Idle" ? "bg-sky-500" :
                        bot.status === "Charging" ? "bg-amber-500" :
                        "bg-slate-300"
                      }`} />
                      {bot.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${bot.battery > 70 ? 'bg-emerald-500' : bot.battery > 30 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${bot.battery}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{bot.battery}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setPrefillBot(bot.id); setPrefillZone(bot.barangay); setShowModal(true); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <Clock className="w-3 h-3" />
                      Schedule
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <DeploymentModal
          bots={bots}
          onClose={() => { setShowModal(false); setPrefillBot(""); setPrefillZone(""); }}
          onSave={handleSaveSchedule}
          prefillBot={prefillBot}
          prefillZone={prefillZone}
        />
      )}
      </>
      )}
    </div>
  );
}
