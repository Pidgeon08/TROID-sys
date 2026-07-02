import { useState, useEffect } from "react";
import {
  Bot,
  CalendarCheck,
  UserRound,
  Wrench,
  Plus,
  Filter,
  Info,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  maintenance: "bg-amber-50 text-amber-700 border border-amber-100",
  available: "bg-sky-50 text-sky-700 border border-sky-100",
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

function ScheduleModal({ bots, onClose, onSave, prefillBot, prefillZone }) {
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
            <h3 className="text-lg font-bold text-slate-900">Schedule Collection</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Assign a bot to a barangay collection schedule.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Select Bot</label>
            <div className="relative">
              <select
                value={selectedBot}
                onChange={(e) => setSelectedBot(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                <option value="">-- Select Bot --</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.status})</option>
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
                placeholder="e.g., River Zone A"
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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CollectionSchedule() {
  const [view, setView] = useState("Week");
  const [showModal, setShowModal] = useState(false);
  const [prefillBot, setPrefillBot] = useState("");
  const [prefillZone, setPrefillZone] = useState("");
  const [bots, setBots] = useState([]);
  const [operators, setOperators] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 4, 16));

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.boats(), api.operators(), api.deploymentSchedules()]).then(([boatsData, operatorsData, schedulesData]) => {
      if (cancelled) return;

      const mappedBots = boatsData.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.is_active ? 'Active' : 'Inactive',
        battery: Math.round(b.battery_level || 0),
        latitude: b.last_latitude,
        longitude: b.last_longitude,
      }));

      const scheduleMap = {};
      schedulesData.forEach((s) => {
        const botId = String(s.bot);
        scheduleMap[botId] = scheduleMap[botId] || {};
        scheduleMap[botId][s.day] = {
          status: s.status || 'none',
          label: s.label || 'Available',
          zone: s.zone || '',
        };
      });

      setBots(mappedBots);
      setOperators(operatorsData);
      setSchedule(scheduleMap);
      setLoading(false);
    }).catch(() => setLoading(false));

    return () => { cancelled = true; };
  }, []);

  const filteredBots = bots;

  const selectedDayKey = DAYS[selectedDate.getDay()].key;
  const selectedDayLabel = DAY_LABELS[selectedDate.getDay()];

  const getWeekDays = () => {
    const day = selectedDate.getDay();
    const start = new Date(selectedDate);
    start.setDate(selectedDate.getDate() - day);
    return DAYS.map((d, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { ...d, dateObj: date };
    });
  };

  const getMonthDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    const startPad = firstDay.getDay();
    for (let i = 0; i < startPad; i++) {
      days.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const scheduledToday = Object.values(schedule).filter((s) => s?.[selectedDayKey]?.status === "scheduled").length;
  const inMaintenance = Object.values(schedule).filter((s) =>
    Object.values(s).some((d) => d.status === "maintenance")
  ).length;

  const handlePrev = () => {
    const newDate = new Date(selectedDate);
    if (view === "Day") newDate.setDate(newDate.getDate() - 1);
    else if (view === "Week") newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(selectedDate);
    if (view === "Day") newDate.setDate(newDate.getDate() + 1);
    else if (view === "Week") newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const handleSaveSchedule = (botId, day, timeSlot, zone) => {
    const bot = bots.find(b => String(b.id) === String(botId));
    if (!bot) return;

    api.createDeploymentSchedule({
      bot: botId,
      day,
      status: "scheduled",
      label: timeSlot,
      zone,
    }).then(() => {
      setSchedule((prev) => ({
        ...prev,
        [String(botId)]: {
          ...prev[String(botId)],
          [day]: { status: "scheduled", label: timeSlot, zone },
        },
      }));
    }).catch(console.error);

    setShowModal(false);
    setPrefillBot("");
    setPrefillZone("");
  };

  const robotsOnDuty = operators.filter(op => op.availability === 'assigned' || op.assigned_bot).length;

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[160px_repeat(7,1fr)] gap-2 border-b border-slate-100 pb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Robot / Operator</div>
            {weekDays.map((d) => (
              <div key={d.key} className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                <div>{d.label}</div>
                <div
                  className={`mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    d.dateObj.toDateString() === selectedDate.toDateString() ? "bg-[#1b4de4] font-medium text-white" : "text-slate-400"
                  }`}
                >
                  {d.dateObj.getDate()}
                </div>
                <div className="text-[10px] mt-0.5 text-slate-400">{d.dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {filteredBots.map((bot) => (
              <div
                key={bot.id}
                className="grid grid-cols-[160px_repeat(7,1fr)] items-center gap-2 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{bot.id}</p>
                    <p className="truncate text-xs text-slate-400">{bot.battery > 0 ? `${bot.battery}% battery` : 'No data'}</p>
                  </div>
                </div>
                {weekDays.map((d) => (
                  <Cell key={d.key} entry={schedule[bot.id]?.[d.key]} />
                ))}
              </div>
            ))}
            {filteredBots.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                No robots match the selected filters.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-slate-100 pb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Robot / Operator</div>
            <div className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
              <div>{selectedDayLabel}</div>
              <div className="mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] bg-[#1b4de4] font-medium text-white">
                {selectedDate.getDate()}
              </div>
              <div className="text-[10px] mt-0.5 text-slate-400">{selectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredBots.map((bot) => (
              <div
                key={bot.id}
                className="grid grid-cols-[160px_1fr] items-center gap-2 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{bot.id}</p>
                    <p className="truncate text-xs text-slate-400">{bot.battery > 0 ? `${bot.battery}% battery` : 'No data'}</p>
                  </div>
                </div>
                <Cell key={selectedDayKey} entry={schedule[bot.id]?.[selectedDayKey]} />
              </div>
            ))}
            {filteredBots.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                No robots match the selected filters.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const monthDays = getMonthDays();
    const weeks = [];
    for (let i = 0; i < monthDays.length; i += 7) {
      weeks.push(monthDays.slice(i, i + 7));
    }

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-7 gap-2 border-b border-slate-100 pb-2">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">{d}</div>
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-2 py-2">
                {week.map((date, di) => {
                  if (!date) return <div key={di} className="px-2 py-2" />;
                  const dayKey = DAYS[date.getDay()].key;
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const hasSchedule = filteredBots.some(bot => schedule[bot.id]?.[dayKey]?.status === 'scheduled');
                  const hasMaintenance = filteredBots.some(bot => schedule[bot.id]?.[dayKey]?.status === 'maintenance');
                  let statusClass = "border border-dashed border-slate-200";
                  if (hasSchedule) statusClass = "bg-emerald-50 border border-emerald-100";
                  else if (hasMaintenance) statusClass = "bg-amber-50 border border-amber-100";

                  return (
                    <div
                      key={di}
                      className={`rounded-lg px-2 py-2 text-center cursor-pointer transition-colors hover:brightness-95 ${statusClass}`}
                      onClick={() => { setSelectedDate(date); setView("Day"); }}
                    >
                      <div className="flex items-center justify-center">
                        <span className={`text-xs font-semibold ${isToday ? "bg-[#1b4de4] text-white rounded-full w-5 h-5 flex items-center justify-center" : isSelected ? "text-[#1b4de4]" : "text-slate-700"}`}>
                          {date.getDate()}
                        </span>
                      </div>
                      {hasSchedule && <div className="mt-1 h-1 w-1 rounded-full bg-emerald-500 mx-auto" />}
                      {hasMaintenance && <div className="mt-1 h-1 w-1 rounded-full bg-amber-500 mx-auto" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Collection Schedule</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">
            Plan and track collection deployments across all Aquabot units.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 sm:flex">
            <LegendDot className="bg-sky-500" label="Scheduled" />
            <LegendDot className="bg-emerald-500" label="Active" />
            <LegendDot className="bg-amber-500" label="In Maintenance" />
            <LegendDot className="bg-slate-300" label="Offline" />
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#153eb8]"
          >
            <Plus className="h-4 w-4" />
            Create Schedule
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
{view !== 'Day' && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Filter className="h-4 w-4" />
              Filter
            </button>
          )}
          <button
            onClick={handleToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </button>
          <button
            onClick={handleNext}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={handleToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3">
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
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Bot}
          label="Total Robots"
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
          label="Operators On Duty"
          value={robotsOnDuty}
          sub={`Available: ${operators.length - robotsOnDuty}`}
        />
        <SummaryCard
          icon={Wrench}
          label="Maintenance"
          value={inMaintenance}
          sub="Units"
        />
      </div>

      {/* Schedule grid based on view */}
      <div className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
        <div className="mb-5 flex items-center gap-1.5">
          <h2 className="text-[17px] font-bold text-slate-900">
            {view === 'Day' ? 'Daily Schedule' : view === 'Week' ? 'Weekly Schedule' : 'Monthly Overview'}
          </h2>
          <Info className="h-3.5 w-3.5 text-slate-300" />
        </div>

        {view === 'Day' && renderDayView()}
        {view === 'Week' && renderWeekView()}
        {view === 'Month' && renderMonthView()}

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <LegendDot className="bg-emerald-500" label="Scheduled" />
          <LegendDot className="bg-sky-500" label="Available" />
          <LegendDot className="bg-amber-500" label="Maintenance" />
          <LegendDot className="bg-slate-300" label="No Schedule" />
        </div>
      </div>

      {showModal && (
        <ScheduleModal
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
