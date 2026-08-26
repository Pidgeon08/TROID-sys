import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Bot,
  CalendarCheck,
  UserRound,
  CheckCircle2,
  Plus,
  Filter,
  Info,
  MapPin,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Eye,
  X,
  Search,
} from "lucide-react";
import { api } from '../../services/api';
import { logAudit } from '../../services/auditLog';
import ViewRequest from './ViewRequest';

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const TIME_SLOTS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
];

const STATUS_STYLES = {
  scheduled: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  available: "bg-sky-50 text-sky-700 border border-sky-100",
  none: "bg-slate-50 text-slate-400 border border-slate-100",
};

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateKey(date) {
  return toDateInput(date);
}

function formatTime12h(time) {
  if (!time) return time;
  const [hourStr, minuteStr = "00"] = time.split(":");
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

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

function Cell({ entry, onClick, dateObj }) {
  if (!entry) {
    return <div className="rounded-xl border border-dashed border-slate-200 px-2 py-2.5" />;
  }
  const styles = STATUS_STYLES[entry.status];
  return (
    <button
      type="button"
      onClick={() => onClick && entry.status === 'scheduled' && onClick(entry, dateObj)}
      className={`w-full rounded-xl px-2 py-2 text-left text-xs transition-colors ${
        entry.status === 'scheduled' ? 'cursor-pointer hover:brightness-95' : ''
      } ${styles}`}
    >
      <p className="font-semibold leading-tight">{formatTime12h(entry.label)}</p>
      {entry.zone && <p className="mt-0.5 truncate leading-tight opacity-80 flex items-center gap-1"><MapPin className="w-3 h-3" />{entry.zone}</p>}
    </button>
  );
}

function ScheduleModal({ bots, operators, approvedRequests, scheduledRequestIds = new Set(), onClose, onSave, onReschedule, onViewRequest, prefillBot, prefillZone, schedule, editingSchedule }) {
  const isEditing = !!editingSchedule;

  const [selectedBots, setSelectedBots] = useState(
    isEditing ? [editingSchedule.botId] : (prefillBot ? [prefillBot] : [])
  );
  const [selectedOperators, setSelectedOperators] = useState(() => {
    if (!isEditing) return [];
    const currentOp = operators.find((o) => o.assigned_bot === editingSchedule.botId);
    return currentOp ? [currentOp.id] : [];
  });
  const [selectedDate, setSelectedDate] = useState(isEditing ? editingSchedule.day : toDateInput(new Date()));
  const [selectedTime, setSelectedTime] = useState(isEditing ? editingSchedule.entry.label : "");
  const [selectedRequestId, setSelectedRequestId] = useState(isEditing ? (editingSchedule.entry.requestId || "") : "");
  const [zone, setZone] = useState(isEditing ? (editingSchedule.entry.zone || "") : (prefillZone || ""));
  const [landmark, setLandmark] = useState(isEditing ? (editingSchedule.entry.landmark || "") : "");
  const [cleanupType, setCleanupType] = useState(isEditing ? (editingSchedule.entry.cleanupType || "troid_supported") : "troid_supported");
  const [confirmData, setConfirmData] = useState(null);
  const [showBotModal, setShowBotModal] = useState(false);
  const [showOperatorModal, setShowOperatorModal] = useState(false);

  const isSelfSlot = (botId, date) => isEditing && String(botId) === String(editingSchedule.botId) && date === editingSchedule.day;

  const handleRequestChange = (e) => {
    const id = e.target.value;
    setSelectedRequestId(id);
    const req = approvedRequests.find((r) => r.id === id);
    setZone(req ? req.location?.barangay || req.requestedBy?.barangay || '' : '');
    if (req?.preferredDate) {
      handleDateChange({ target: { value: req.preferredDate } });
    }
    if (req?.preferredTime && TIME_SLOTS.includes(req.preferredTime)) {
      setSelectedTime(req.preferredTime);
    }
  };

  const isUnsupported = cleanupType === 'unsupported';

  const operatorsMatchBots = selectedBots.length > 0 && selectedOperators.length === selectedBots.length;

  // Each bot can only hold one schedule per day, so if any selected bot is already
  // booked on the chosen date, no time slot on that date is actually usable for it.
  // (A bot's own current slot doesn't count as a conflict against itself while rescheduling.)
  const busyBotsOnDate = selectedBots
    .map((id) => bots.find((b) => b.id === id))
    .filter((b) => b && schedule?.[b.id]?.[selectedDate]?.status === 'scheduled' && !isSelfSlot(b.id, selectedDate));
  const dateHasConflict = busyBotsOnDate.length > 0;

  const openConfirm = () => {
    if (!selectedBots.length || !selectedRequestId || !selectedDate || !selectedTime || !operatorsMatchBots || dateHasConflict) return;
    setConfirmData({ botIds: selectedBots, operatorIds: selectedOperators, date: selectedDate, time: selectedTime, zone, landmark, requestId: selectedRequestId, cleanupType });
  };

  const doSave = () => {
    if (!confirmData) return;
    if (isEditing) {
      onReschedule(
        editingSchedule.entry.id,
        editingSchedule.botId,
        editingSchedule.day,
        confirmData.botIds[0],
        confirmData.date,
        confirmData.time,
        confirmData.zone,
        confirmData.landmark,
        confirmData.requestId,
        confirmData.operatorIds[0] || null,
        confirmData.cleanupType
      );
    } else {
      confirmData.botIds.forEach((botId, idx) => {
        onSave(botId, confirmData.date, confirmData.time, confirmData.zone, confirmData.landmark, confirmData.requestId, confirmData.operatorIds[idx], confirmData.cleanupType);
      });
    }
    setConfirmData(null);
    setSelectedBots([]);
    setSelectedOperators([]);
    setSelectedRequestId("");
    setZone("");
    setLandmark("");
    setCleanupType("troid_supported");
    setSelectedDate(toDateInput(new Date()));
    setSelectedTime("");
  };

  const confirmRequest = approvedRequests.find((r) => r.id === confirmData?.requestId);
  const confirmPairs = confirmData?.botIds.map((botId, idx) => ({
    bot: bots.find((b) => b.id === botId),
    operator: operators.find((o) => o.id === confirmData.operatorIds[idx]),
  })) || [];

  const hasTimeSlot = !!selectedTime;

  // A bot can only hold one schedule per date, so "available" just means not already scheduled that day
  // (except the bot's own current slot when rescheduling it).
  const availableBots = bots.filter((b) => schedule?.[b.id]?.[selectedDate]?.status !== 'scheduled' || isSelfSlot(b.id, selectedDate));
  // An operator is unavailable if the bot they're assigned to already has a deployment that day.
  const availableOperators = operators.filter(
    (o) => !o.archived && !(o.assigned_bot && schedule?.[o.assigned_bot]?.[selectedDate]?.status === 'scheduled' && !isSelfSlot(o.assigned_bot, selectedDate))
  );

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    const stillAvailableIds = new Set(
      bots.filter((b) => schedule?.[b.id]?.[newDate]?.status !== 'scheduled' || isSelfSlot(b.id, newDate)).map((b) => b.id)
    );
    setSelectedBots((prev) => prev.filter((id) => stillAvailableIds.has(id)));
  };

  const toggleBot = (botId) => {
    if (isEditing) {
      setSelectedBots([botId]);
      setSelectedOperators([]);
      return;
    }
    setSelectedBots((prev) => (prev.includes(botId) ? prev.filter((id) => id !== botId) : [...prev, botId]));
  };

  const toggleOperator = (opId) => {
    if (isEditing) {
      setSelectedOperators([opId]);
      return;
    }
    setSelectedOperators((prev) => {
      if (prev.includes(opId)) return prev.filter((id) => id !== opId);
      if (prev.length >= selectedBots.length) return prev;
      return [...prev, opId];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg h-[85vh] max-h-195 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        <div className="p-7 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">{isEditing ? 'Reschedule Deployment' : 'Schedule Deployment'}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isEditing ? 'Update the bot, operator, date, or time for this deployment.' : 'Assign a bot to an approved request location.'}
          </p>
        </div>
        <div className="p-7 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Approved Request / Zone</label>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm text-slate-600">
                  {selectedRequestId || '—'}
                </div>
                <button
                  type="button"
                  onClick={() => selectedRequestId && onViewRequest(selectedRequestId)}
                  disabled={!selectedRequestId}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye size={16} />
                  View
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedRequestId}
                    onChange={handleRequestChange}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
                  >
                    <option value="">-- Select Approved Request --</option>
                    {approvedRequests.map((r) => {
                      const isScheduled = scheduledRequestIds.has(r.id);
                      return (
                        <option
                          key={r.id}
                          value={r.id}
                          disabled={isScheduled}
                          className={isScheduled ? "text-slate-400" : ""}
                        >
                          {r.id} - {r.location?.barangay || r.requestedBy?.barangay || 'Unknown zone'}{isScheduled ? " (Scheduled)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => selectedRequestId && onViewRequest(selectedRequestId)}
                  disabled={!selectedRequestId}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye size={16} />
                  View
                </button>
              </div>
            )}
          </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Barangay</label>
                <input
                  type="text"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="Auto-filled from selected request"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Landmark</label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Near the plaza"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
               </div>
               </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Time Slot</label>
              <div className="relative">
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  disabled={dateHasConflict}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- Select a time slot --</option>
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{formatTime12h(slot)} — Available</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {dateHasConflict && (
              <p className="col-span-2 -mt-2 text-xs text-amber-600">
                No time slots are available on this date for {busyBotsOnDate.map((b) => b.name).join(", ")} — already scheduled that day. Choose another date.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Cleanup Type</label>
            <div className="relative">
              <select
                value={cleanupType}
                onChange={(e) => setCleanupType(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                <option value="troid_supported">TROID Supported</option>
                <option value="unsupported">Unsupported</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className={isUnsupported || !hasTimeSlot ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Bots</label>
              <button
                type="button"
                onClick={() => setShowBotModal(true)}
                disabled={isUnsupported || !hasTimeSlot}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-left outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 hover:bg-slate-50 transition-colors"
              >
                <span className={selectedBots.length ? "text-slate-700 font-medium" : "text-slate-400"}>
                  {selectedBots.length
                    ? `${selectedBots.length} bot${selectedBots.length === 1 ? "" : "s"} selected`
                    : "Select bots"}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
              {!isUnsupported && hasTimeSlot && availableBots.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">No bots are available on this date.</p>
              )}
            </div>
            <div className={isUnsupported || !hasTimeSlot ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Operators</label>
              <button
                type="button"
                onClick={() => selectedBots.length && setShowOperatorModal(true)}
                disabled={isUnsupported || !hasTimeSlot || !selectedBots.length}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-left outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className={selectedOperators.length ? "text-slate-700 font-medium" : "text-slate-400"}>
                  {!selectedBots.length
                    ? "Select bots first"
                    : `${selectedOperators.length} / ${selectedBots.length} operator${selectedBots.length === 1 ? "" : "s"} selected`}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
              {!isUnsupported && selectedBots.length > 0 && !operatorsMatchBots && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Select {selectedBots.length} operator{selectedBots.length === 1 ? "" : "s"} to match the {selectedBots.length} bot{selectedBots.length === 1 ? "" : "s"} chosen.
                </p>
              )}
            </div>
          </div>
          {isUnsupported ? (
            <p className="-mt-3 text-xs text-slate-400">Bots and operators aren't required for unsupported cleanups.</p>
          ) : !hasTimeSlot ? (
            <p className="-mt-3 text-xs text-slate-400">Select a date and time slot to see available bots and operators.</p>
          ) : null}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={openConfirm}
            disabled={!selectedBots.length || !selectedRequestId || !selectedTime || !operatorsMatchBots || dateHasConflict}
            className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditing ? 'Save Changes' : 'Save Schedule'}
          </button>
        </div>
      </div>

      {showBotModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-7 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Select Bots</h3>
              <p className="text-xs text-slate-500 mt-1">Choose one or more bots available on {selectedDate}.</p>
            </div>
            <div className="p-7 space-y-4">
              <div className="max-h-[45vh] overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-2">
                {availableBots.map((b) => {
                  const isSelected = selectedBots.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                        isSelected ? "border-[#1b4de4] bg-blue-50 text-[#1b4de4] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleBot(b.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1b4de4] focus:ring-blue-500/30"
                      />
                      <span className="flex-1">{b.name} ({b.id})</span>
                    </label>
                  );
                })}
                {availableBots.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">No bots available on this date.</p>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 text-right">{selectedBots.length} selected</p>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowBotModal(false)}
                className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showOperatorModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-7 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Select Operators</h3>
              <p className="text-xs text-slate-500 mt-1">
                Choose exactly {selectedBots.length} operator{selectedBots.length === 1 ? "" : "s"} to match the {selectedBots.length} bot{selectedBots.length === 1 ? "" : "s"} selected.
              </p>
            </div>
            <div className="p-7 space-y-4">
              <div className="max-h-[45vh] overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-2">
                {availableOperators.map((o) => {
                  const isSelected = selectedOperators.includes(o.id);
                  const disabled = !isSelected && selectedOperators.length >= selectedBots.length;
                  return (
                    <label
                      key={o.id}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        isSelected
                          ? "border-[#1b4de4] bg-blue-50 text-[#1b4de4] font-medium cursor-pointer"
                          : disabled
                            ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={() => toggleOperator(o.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1b4de4] focus:ring-blue-500/30 disabled:opacity-50"
                      />
                      <span className="flex-1">{o.name}</span>
                    </label>
                  );
                })}
                {availableOperators.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">No operators available.</p>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 text-right">
                {selectedOperators.length} / {selectedBots.length} selected
              </p>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowOperatorModal(false)}
                className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-7 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{isEditing ? 'Confirm Reschedule' : 'Confirm Schedule'}</h3>
              <p className="text-xs text-slate-500 mt-1">Please review the schedule details before saving.</p>
            </div>
            <div className="p-7 space-y-3 text-sm">
              <div>
                <span className="text-slate-500">Bots &amp; Operators</span>
                <div className="mt-1.5 space-y-1">
                  {confirmPairs.map(({ bot, operator }) => (
                    <div key={bot?.id} className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-1.5">
                      <span className="font-semibold text-slate-900">{bot ? `${bot.name} (${bot.id})` : '—'}</span>
                      <span className="text-slate-600">{operator?.name || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Request</span>
                <span className="font-semibold text-slate-900 text-right">{confirmRequest ? `${confirmRequest.id} - ${confirmRequest.location?.barangay || confirmRequest.requestedBy?.barangay || 'Unknown zone'}` : confirmData.requestId}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Date</span>
                <span className="font-semibold text-slate-900">{confirmData.date}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Time</span>
                <span className="font-semibold text-slate-900">{formatTime12h(confirmData.time)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Cleanup Type</span>
                <span className="font-semibold text-slate-900">{confirmData.cleanupType === 'troid_supported' ? 'TROID Supported' : 'Unsupported'}</span>
              </div>
              {confirmData.landmark && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Landmark</span>
                  <span className="font-semibold text-slate-900 text-right">{confirmData.landmark}</span>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setConfirmData(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={doSave}
                className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DeploymentSchedule() {
  const { currentUser } = useOutletContext() || {};
  const [view, setView] = useState("Week");
  const [showModal, setShowModal] = useState(false);
  const [prefillBot, setPrefillBot] = useState("");
  const [prefillZone, setPrefillZone] = useState("");
  const [bots, setBots] = useState([]);
  const [operators, setOperators] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [overviewId, setOverviewId] = useState(null);
  const [reschedulingEntry, setReschedulingEntry] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.boats(), api.operators(), api.deploymentSchedules(), api.requests()]).then(([boatsData, operatorsData, schedulesData, requestsData]) => {
      if (cancelled) return;

      const mappedBots = boatsData.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.is_active ? 'Active' : 'Inactive',
        battery: Math.round(b.battery_level || 0),
        latitude: b.last_latitude,
        longitude: b.last_longitude,
      }));

      const approved = (requestsData || []).filter(r => r.status === 'approved' || r.status === 'Approved').map(r => ({
        id: r.request_id,
        location: { barangay: r.barangay || r.location_name || '' },
        requestedBy: {
          barangay: r.barangay || r.requested_by_barangay || '',
        },
        preferredDate: r.preferred_date || '',
        preferredTime: r.preferred_time || '',
      }));

      const scheduleMap = {};
      schedulesData.forEach((s) => {
        const botId = String(s.bot);
        scheduleMap[botId] = scheduleMap[botId] || {};
        scheduleMap[botId][s.day] = {
          id: s.id,
          status: s.status || 'none',
          label: s.label || 'Available',
          zone: s.zone || '',
          requestId: s.request_id || null,
          cleanupType: s.cleanup_type || 'troid_supported',
        };
      });

      setBots(mappedBots);
      setOperators(operatorsData);
      setSchedule(scheduleMap);
      setApprovedRequests(approved);
      setLoading(false);
    }).catch(() => setLoading(false));

    return () => { cancelled = true; };
  }, []);

  const filteredBots = bots.filter((bot) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(bot.id).toLowerCase().includes(q) ||
      bot.name?.toLowerCase().includes(q)
    );
  });

  const selectedDayKey = dateKey(selectedDate);
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
  const completedDeployments = Object.values(schedule).reduce(
    (acc, botSched) => acc + Object.values(botSched).filter((d) => d.status === "scheduled").length,
    0
  );

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

  const scheduledRequestIds = new Set();
  Object.values(schedule).forEach((botSched) => {
    Object.values(botSched).forEach((d) => {
      if (d.requestId) scheduledRequestIds.add(d.requestId);
    });
  });

  const handleSaveSchedule = (botId, day, timeSlot, zone, landmark, requestId, operatorId, cleanupType) => {
    const bot = bots.find(b => String(b.id) === String(botId));
    if (!bot) return;

    api.createDeploymentSchedule({
      bot: botId,
      day,
      status: "scheduled",
      label: timeSlot,
      zone,
      landmark,
      request_id: requestId,
      cleanup_type: cleanupType,
    }).then((created) => {
      setSchedule((prev) => ({
        ...prev,
        [String(botId)]: {
          ...prev[String(botId)],
          [day]: { id: created?.id, status: "scheduled", label: timeSlot, zone, landmark, requestId, cleanupType },
        },
      }));
    }).catch(console.error);

    if (operatorId) {
      const operator = operators.find((o) => o.id === operatorId);
      if (operator) {
        api.updateOperator(operator.id, {
          name: operator.name,
          assigned_bot: botId,
          availability: 'assigned',
        }).then(() => {
          setOperators((prev) => prev.map((o) => (o.id === operatorId ? { ...o, assigned_bot: botId, availability: 'assigned' } : o)));
        }).catch(console.error);
      }
    }

    setShowModal(false);
    setPrefillBot("");
    setPrefillZone("");

    const operatorName = operatorId ? operators.find((o) => o.id === operatorId)?.name : null;
    logAudit({
      currentUser,
      action: 'Schedule edited',
      module: 'Collection Schedule',
      details: `${bot.name} scheduled for ${zone || 'unspecified zone'} on ${day} at ${timeSlot}${operatorName ? ` with ${operatorName}` : ''}`,
    });
  };

  const handleRescheduleSchedule = (scheduleId, oldBotId, oldDay, botId, day, timeSlot, zone, landmark, requestId, operatorId, cleanupType) => {
    const bot = bots.find((b) => String(b.id) === String(botId));
    if (!bot) return;

    api.updateDeploymentSchedule(scheduleId, {
      bot: botId,
      day,
      status: "scheduled",
      label: timeSlot,
      zone,
      request_id: requestId,
      cleanup_type: cleanupType,
    }).then(() => {
      setSchedule((prev) => {
        const next = { ...prev };
        if (next[String(oldBotId)]) {
          const remainingDays = { ...next[String(oldBotId)] };
          delete remainingDays[oldDay];
          next[String(oldBotId)] = remainingDays;
        }
        next[String(botId)] = {
          ...next[String(botId)],
          [day]: { id: scheduleId, status: "scheduled", label: timeSlot, zone, landmark, requestId, cleanupType },
        };
        return next;
      });
    }).catch(console.error);

    const prevOperator = operators.find((o) => o.assigned_bot === oldBotId);
    const newOperator = operatorId ? operators.find((o) => o.id === operatorId) : null;

    if (prevOperator && prevOperator.id !== newOperator?.id) {
      api.updateOperator(prevOperator.id, {
        name: prevOperator.name,
        assigned_bot: null,
        availability: 'available',
      }).then(() => {
        setOperators((prev) => prev.map((o) => (o.id === prevOperator.id ? { ...o, assigned_bot: null, availability: 'available' } : o)));
      }).catch(console.error);
    }
    if (newOperator && newOperator.id !== prevOperator?.id) {
      api.updateOperator(newOperator.id, {
        name: newOperator.name,
        assigned_bot: botId,
        availability: 'assigned',
      }).then(() => {
        setOperators((prev) => prev.map((o) => (o.id === newOperator.id ? { ...o, assigned_bot: botId, availability: 'assigned' } : o)));
      }).catch(console.error);
    }

    setShowModal(false);
    setReschedulingEntry(null);

    logAudit({
      currentUser,
      action: 'Schedule rescheduled',
      module: 'Collection Schedule',
      details: `${bot.name} rescheduled to ${zone || 'unspecified zone'} on ${day} at ${timeSlot}${newOperator ? ` with ${newOperator.name}` : ''}`,
    });
  };

  const handleCellClick = (entry, botId, day) => {
    if (!entry || entry.status !== 'scheduled') return;
    setReschedulingEntry({ botId, day, entry });
    setShowModal(true);
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
                  <Cell key={d.key} entry={schedule[bot.id]?.[dateKey(d.dateObj)]} onClick={(entry) => handleCellClick(entry, bot.id, dateKey(d.dateObj))} dateObj={d.dateObj} />
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
      <div className="overflow-auto">
        <div className="min-w-[760px]">
          <div
            className="grid gap-1.5 p-2 border-b border-slate-100 bg-slate-50 sticky top-0 z-20"
            style={{ gridTemplateColumns: `160px repeat(${TIME_SLOTS.length}, minmax(64px, 1fr))` }}
          >
            <div className="bg-slate-50 sticky left-0 z-20 border-r border-slate-200">
              <span className="block px-1 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {selectedDayLabel} · {selectedDate.getDate()} {selectedDate.toLocaleDateString('en-US', { month: 'short' })}
              </span>
            </div>
            {TIME_SLOTS.map((slot) => (
              <div key={slot} className="flex justify-center bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400 py-1">
                {formatTime12h(slot)}
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-50">
            {filteredBots.map((bot) => {
              const dayEntry = schedule[bot.id]?.[dateKey(selectedDate)];
              const scheduledSlot = dayEntry?.status === "scheduled" ? dayEntry.label : null;
              return (
                <div
                  key={bot.id}
                  className="grid gap-1.5 p-2 items-center"
                  style={{ gridTemplateColumns: `160px repeat(${TIME_SLOTS.length}, minmax(64px, 1fr))` }}
                >
                  <div className="bg-white sticky left-0 z-10 border-r border-slate-200">
                    <div className="flex items-center gap-2 px-1 py-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{bot.id}</p>
                        <p className="truncate text-xs text-slate-400">{bot.battery > 0 ? `${bot.battery}% battery` : 'No data'}</p>
                      </div>
                    </div>
                  </div>
                  {TIME_SLOTS.map((slot) =>
                    scheduledSlot === slot ? (
                      <Cell key={slot} entry={dayEntry} onClick={(entry) => handleCellClick(entry, bot.id, dateKey(selectedDate))} dateObj={selectedDate} />
                    ) : (
                      <div key={slot} className="rounded-xl border border-dashed border-slate-200 px-2 py-2.5" />
                    )
                  )}
                </div>
              );
            })}
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
                  const dayKey = dateKey(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const hasSchedule = filteredBots.some(bot => schedule[bot.id]?.[dayKey]?.status === 'scheduled');
                  let statusClass = "border border-dashed border-slate-200";
                  if (hasSchedule) statusClass = "bg-emerald-50 border border-emerald-100";

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

  const handlePrev = () => {
    const newDate = new Date(selectedDate);
    if (view === "Day") newDate.setDate(newDate.getDate() - 1);
    else if (view === "Week") newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
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
            <LegendDot className="bg-slate-300" label="Offline" />
          </div>
          <button
            type="button"
            onClick={() => { setReschedulingEntry(null); setShowModal(true); }}
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
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
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
          </div>
          <button
            onClick={handleToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search robots..."
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
            />
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Filter className="h-4 w-4" />
            Filter
          </button>
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
          icon={CheckCircle2}
          label="Deployment Complete"
          value={completedDeployments}
          sub="Completed deployments"
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
          <LegendDot className="bg-slate-300" label="No Schedule" />
        </div>
      </div>

      {showModal && createPortal(
        <ScheduleModal
          bots={bots}
          operators={operators}
          approvedRequests={approvedRequests}
          scheduledRequestIds={scheduledRequestIds}
          onClose={() => { setShowModal(false); setPrefillBot(""); setPrefillZone(""); setReschedulingEntry(null); }}
          onSave={handleSaveSchedule}
          onReschedule={handleRescheduleSchedule}
          onViewRequest={setOverviewId}
          prefillBot={prefillBot}
          prefillZone={prefillZone}
          schedule={schedule}
          editingSchedule={reschedulingEntry}
        />,
        document.body
      )}

      {overviewId && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setOverviewId(null)}>
          <div
            className="rsp-overview-modal relative w-full max-w-[1600px] max-h-[95vh] bg-white rounded-2xl border border-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOverviewId(null)}
              aria-label="Close"
              className="absolute top-4 right-4 z-20 flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <X size={18} />
            </button>
            <style>{`.rsp-overview-modal [data-hide-in-schedule-overview] { display: none; }`}</style>
            <div className="max-h-[95vh] overflow-y-auto p-8">
              <ViewRequest id={overviewId} onClose={() => setOverviewId(null)} />
            </div>
          </div>
        </div>,
        document.body
      )}
      </>
      )}
    </div>
  );
}