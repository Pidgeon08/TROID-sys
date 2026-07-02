import { useEffect, useState } from 'react';
import {
  Calendar, MapPin, CheckCircle2, X, Bot, Wrench,
  Plus, Search, Clock
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const API_BASE = 'http://localhost:8000/api';

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const opDotClass = (status) => {
  switch (status) {
    case 'online': return 'bg-emerald-500 shadow-[0_0_6px_#10b981]';
    case 'offline': return 'bg-slate-400';
    case 'onleave': return 'bg-amber-500 shadow-[0_0_6px_#f59e0b]';
    default: return 'bg-slate-400';
  }
};

const getOpStatusBadge = (status) => {
  switch (status) {
    case 'online': return 'border-emerald-500 text-emerald-600 bg-emerald-50';
    case 'offline': return 'border-slate-300 text-slate-500 bg-slate-50';
    case 'onleave': return 'border-amber-500 text-amber-600 bg-amber-50';
    default: return 'border-slate-300 text-slate-500 bg-slate-50';
  }
};

const CollectionSchedule = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [schedules, setSchedules] = useState([]);
  const [boats, setBoats] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Inline scheduling (from request accept)
  const [schedulingFor, setSchedulingFor] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(null);

  // Add schedule modal
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalBarangay, setModalBarangay] = useState('');
  const [modalBotIds, setModalBotIds] = useState([]);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalFilter, setModalFilter] = useState('available'); // 'available' | 'bots' | 'all'
  const [modalSearch, setModalSearch] = useState('');
  const [modalSuccess, setModalSuccess] = useState(null);

  // Calendar view state
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rid = params.get('request_id');
    if (rid) {
      setSchedulingFor(parseInt(rid));
    }
  }, [location]);

  const fetchSchedules = async () => {
    const res = await fetch(`${API_BASE}/schedule/list/`);
    const data = await res.json();
    setSchedules(data);
  };

  const fetchBoats = async () => {
    const res = await fetch(`${API_BASE}/boats/`);
    const data = await res.json();
    setBoats(data);
  };

  const fetchBarangays = async () => {
    const res = await fetch(`${API_BASE}/barangays/`);
    const data = await res.json();
    setBarangays(data);
  };

  const fetchRequests = async () => {
    const res = await fetch(`${API_BASE}/requests/?role=admin&status=accepted`);
    const data = await res.json();
    setRequests(data);
  };

  useEffect(() => {
    fetchSchedules();
    fetchBoats();
    fetchBarangays();
    fetchRequests();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!schedulingFor) return;
    const req = requests.find(r => r.request_id === schedulingFor);
    if (req) {
      setSchedulingFor(req);
      setSelectedBarangay(req.barangay);
    } else {
      fetch(`${API_BASE}/requests/${schedulingFor}/`).then(r => r.json()).then(r => {
        setSchedulingFor(r);
        setSelectedBarangay(r.barangay);
        fetchRequests();
      });
    }
  }, [schedulingFor, requests]);

  const availableBots = boats.filter(b => b.is_active);

  const getFilteredBots = () => {
    let filtered = [...availableBots];
    const s = modalSearch.toLowerCase();

    if (s) {
      filtered = filtered.filter(b =>
        b.name.toLowerCase().includes(s) ||
        (b.operator?.name && b.operator.name.toLowerCase().includes(s))
      );
    }

    switch (modalFilter) {
      case 'available':
        filtered = filtered.filter(b => b.operator && b.operator.status === 'online');
        break;
      case 'bots':
        filtered = filtered.filter(b => b.operator && b.operator.status !== 'onleave');
        break;
      case 'all':
        break;
      default:
        break;
    }

    return filtered;
  };

  const toggleModalBot = (botId) => {
    setModalBotIds(prev =>
      prev.includes(botId) ? prev.filter(id => id !== botId) : [...prev, botId]
    );
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!modalDate || !modalBotIds.length) return;
    setModalSaving(true);
    const res = await fetch(`${API_BASE}/schedule/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: null,
        scheduled_date: modalDate,
        barangay_id: modalBarangay || null,
        bot_ids: modalBotIds,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setModalSuccess(data);
      setModalSaving(false);
      fetchSchedules();
      setShowModal(false);
      setModalDate('');
      setModalBarangay('');
      setModalBotIds([]);
      setModalFilter('available');
      setModalSearch('');
      setModalSuccess(null);
    }
    setModalSaving(false);
  };

  const toggleBot = (botId) => {
    setSelectedBotIds(prev =>
      prev.includes(botId) ? prev.filter(id => id !== botId) : [...prev, botId]
    );
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedBotIds.length || !schedulingFor) return;
    setSaving(true);
    const res = await fetch(`${API_BASE}/schedule/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: schedulingFor.request_id,
        scheduled_date: selectedDate,
        barangay_id: selectedBarangay,
        bot_ids: selectedBotIds,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setScheduleSuccess(data);
      setSaving(false);
      fetchSchedules();
      fetchRequests();
      navigate('/admin/collection', { replace: true });
    }
    setSaving(false);
  };

  const filteredModalBots = getFilteredBots();

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Collection Schedule</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">Schedule bot cleanup missions for accepted requests</p>
        </div>
        <div className="flex items-center gap-3">
          {!schedulingFor && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#1b4de4] hover:bg-[#153eb8] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Schedule
            </button>
          )}
          {schedulingFor && (
            <button
              onClick={() => { setSchedulingFor(null); navigate('/admin/collection', { replace: true }); }}
              className="text-xs font-bold text-[#1b4de4] hover:underline flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Cancel Scheduling
            </button>
          )}
        </div>
      </header>

      {schedulingFor && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.06)] p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-[#1b4de4]" />
            Schedule Cleanup for Request #{schedulingFor.request_id}
          </h2>

          {scheduleSuccess ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Cleanup scheduled successfully!</p>
                <p className="text-xs text-emerald-600">Bots have been assigned for {fmtDate(scheduleSuccess.scheduled_date)}</p>
              </div>
              <button
                onClick={() => { setScheduleSuccess(null); setSchedulingFor(null); navigate('/admin/collection', { replace: true }); }}
                className="ml-auto px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSchedule} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Scheduled Date</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Location (Barangay)</label>
                  <select
                    required
                    value={selectedBarangay}
                    onChange={(e) => setSelectedBarangay(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                  >
                    <option value="">Select barangay...</option>
                    {barangays.filter(b => b.spearhead_id === schedulingFor?.spearhead).map(b => (
                      <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Select Bots ({selectedBotIds.length} selected)
                </label>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase w-12">Select</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase">Bot</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase">Operator</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase">Operator Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableBots.map((bot) => (
                        <tr
                          key={bot.id}
                          onClick={() => toggleBot(bot.id)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors text-sm ${selectedBotIds.includes(bot.id) ? 'bg-blue-50/60' : 'hover:bg-slate-50/40'}`}
                        >
                          <td className="px-4 py-3">
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedBotIds.includes(bot.id) ? 'bg-[#1b4de4] border-[#1b4de4]' : 'border-slate-300 bg-white'}`}>
                              {selectedBotIds.includes(bot.id) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Bot className="w-4 h-4 text-slate-400" />
                              <span className="font-bold text-slate-900">{bot.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-600">
                            {bot.operator?.name || <span className="text-slate-400">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3">
                            {bot.operator ? (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getOpStatusBadge(bot.operator.status)}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${opDotClass(bot.operator.status)}`}></span>
                                {bot.operator.status}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {availableBots.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-4 py-6 text-center text-slate-400 text-sm font-semibold">
                            No active bots available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setSchedulingFor(null); navigate('/admin/collection', { replace: true }); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !selectedDate || !selectedBotIds.length}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : `Schedule ${selectedBotIds.length} Bot${selectedBotIds.length > 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CALENDAR / LIST VIEW */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-5 pb-3 flex justify-between items-center border-b border-slate-50">
          <h2 className="text-[17px] font-bold text-slate-950">Cleanup Schedule</h2>
          <div className="flex items-center gap-2">
            {viewMode === 'calendar' ? (
              <button onClick={() => setViewMode('list')} className="text-xs font-bold text-[#1b4de4] hover:underline">List View</button>
            ) : (
              <button onClick={() => setViewMode('calendar')} className="text-xs font-bold text-[#1b4de4] hover:underline">Calendar View</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 font-semibold">Loading...</div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No scheduled cleanups yet.</p>
            <p className="text-xs text-slate-400 mt-1">Accept a request or add a schedule to get started.</p>
          </div>
        ) : viewMode === 'calendar' ? (
          <div className="p-5">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  const d = new Date(calendarYear, calendarMonth - 1, 1);
                  setCalendarMonth(d.getMonth());
                  setCalendarYear(d.getFullYear());
                  setSelectedDay(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                ← Previous
              </button>
              <span className="text-sm font-bold text-slate-900">
                {new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => {
                  const d = new Date(calendarYear, calendarMonth + 1, 1);
                  setCalendarMonth(d.getMonth());
                  setCalendarYear(d.getFullYear());
                  setSelectedDay(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                Next →
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-[11px] font-bold text-slate-400 uppercase py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
                const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];

                const scheduleMap = {};
                schedules.forEach((s) => {
                  if (!scheduleMap[s.scheduled_date]) scheduleMap[s.scheduled_date] = [];
                  scheduleMap[s.scheduled_date].push(s);
                });

                const cells = [];

                // Empty cells for days before the first day of month
                for (let i = 0; i < firstDay; i++) {
                  cells.push(<div key={`empty-${i}`} className="min-h-[80px] bg-slate-50/30 rounded-lg" />);
                }

                // Day cells
                for (let day = 1; day <= daysInMonth; day++) {
                  const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const daySchedules = scheduleMap[dateStr] || [];
                  const isToday = dateStr === todayStr;
                  const isSelected = selectedDay === dateStr;
                  const hasSchedules = daySchedules.length > 0;

                  cells.push(
                    <div
                      key={day}
                      onClick={() => hasSchedules && setSelectedDay(isSelected ? null : dateStr)}
                      className={`min-h-[80px] p-2 rounded-lg border cursor-pointer transition-all relative ${
                        isSelected
                          ? 'border-[#1b4de4] bg-blue-50'
                          : hasSchedules
                          ? 'border-slate-200 bg-white hover:border-[#1b4de4] hover:shadow-sm'
                          : 'border-transparent bg-slate-50/50'
                      }`}
                    >
                      <div className={`text-sm font-bold mb-1 ${isToday ? 'text-[#1b4de4]' : 'text-slate-700'}`}>
                        {day}
                        {isToday && <span className="ml-1 text-[10px] font-bold text-[#1b4de4] uppercase">Today</span>}
                      </div>
                      {hasSchedules && (
                        <div className="flex flex-col gap-1">
                          {daySchedules.slice(0, 2).map((s, i) => (
                            <div key={i} className="text-[10px] font-bold text-slate-600 bg-blue-100 px-1.5 py-0.5 rounded truncate">
                              #{s.schedule_id} · {s.scheduled_bots?.length || 0} bot{s.scheduled_bots?.length > 1 ? 's' : ''}
                            </div>
                          ))}
                          {daySchedules.length > 2 && (
                            <div className="text-[10px] font-bold text-slate-500">+{daySchedules.length - 2} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                return cells;
              })()}
            </div>

            {/* Selected day detail */}
            {selectedDay && (() => {
              const daySchedules = schedules.filter(s => s.scheduled_date === selectedDay);
              if (daySchedules.length === 0) return null;
              return (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                    </h3>
                    <button onClick={() => setSelectedDay(null)} className="text-xs font-bold text-[#1b4de4] hover:underline">Close</button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {daySchedules.map((s) => (
                      <div key={s.schedule_id} className="bg-white border border-slate-100 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[#1b4de4]">Mission #{s.schedule_id}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{s.request?.barangay_name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-600">{s.request?.barangay_name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-600">{s.request?.spearhead_full_name || s.request?.spearhead_username || '—'}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {s.scheduled_bots?.length > 0 ? s.scheduled_bots.map((b, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                              <Bot className="w-3 h-3" />
                              {b.bot_name}
                            </span>
                          )) : <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Schedule ID</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Barangay</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Requested By</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Bots</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.schedule_id} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors text-sm">
                    <td className="px-5 py-3.5 font-bold text-slate-900">#{s.schedule_id}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-600">{fmtDate(s.scheduled_date)}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-500">{s.request?.barangay_name || '—'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-500">{s.request?.spearhead_full_name || s.request?.spearhead_username || '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {s.scheduled_bots?.length > 0 ? s.scheduled_bots.map((b, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                            <Bot className="w-3 h-3" />
                            {b.bot_name}
                          </span>
                        )) : <span className="text-slate-400 text-xs">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD SCHEDULE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-100 overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add New Schedule</h3>
                <p className="text-xs text-slate-400 mt-0.5">Create a new cleanup mission</p>
              </div>
              <button onClick={() => { setShowModal(false); setModalSuccess(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalSuccess ? (
              <div className="p-6 flex flex-col items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-3" />
                <p className="text-sm font-bold text-slate-900">Schedule created successfully!</p>
                <p className="text-xs text-slate-500 mt-1">New mission added for {fmtDate(modalSuccess.scheduled_date)}</p>
                <button
                  onClick={() => { setShowModal(false); setModalSuccess(null); fetchSchedules(); }}
                  className="mt-4 px-5 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleModalSubmit} className="flex flex-col overflow-hidden">
                <div className="p-5 overflow-y-auto flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Schedule Date</label>
                      <input
                        type="date"
                        required
                        min={new Date().toISOString().split('T')[0]}
                        value={modalDate}
                        onChange={(e) => setModalDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Location (Barangay)</label>
                      <select
                        value={modalBarangay}
                        onChange={(e) => setModalBarangay(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                      >
                        <option value="">Select barangay...</option>
                        {barangays.map(b => (
                          <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Select Bots ({modalBotIds.length} selected)
                      </label>
                      <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search bots or operators..."
                          value={modalSearch}
                          onChange={(e) => setModalSearch(e.target.value)}
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#1b4de4] w-40"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setModalFilter('available')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${modalFilter === 'available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        Available
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalFilter('bots')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${modalFilter === 'bots' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        Bots
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${modalFilter === 'all' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        Show All
                      </button>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[280px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr className="border-b border-slate-100">
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase w-12">Select</th>
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase">Bot</th>
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase">Operator</th>
                            <th className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModalBots.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="px-4 py-6 text-center text-slate-400 text-sm font-semibold">
                                No bots match the current filter
                              </td>
                            </tr>
                          ) : (
                            filteredModalBots.map((bot) => (
                              <tr
                                key={bot.id}
                                onClick={() => toggleModalBot(bot.id)}
                                className={`border-b border-slate-50 cursor-pointer transition-colors text-sm ${modalBotIds.includes(bot.id) ? 'bg-blue-50/60' : 'hover:bg-slate-50/40'}`}
                              >
                                <td className="px-4 py-3">
                                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${modalBotIds.includes(bot.id) ? 'bg-[#1b4de4] border-[#1b4de4]' : 'border-slate-300 bg-white'}`}>
                                    {modalBotIds.includes(bot.id) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <Bot className="w-4 h-4 text-slate-400" />
                                    <div className="flex flex-col">
                                      <span className="font-bold text-slate-900">{bot.name}</span>
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        {bot.battery_level != null ? `${bot.battery_level}%` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-semibold text-slate-600">
                                  {bot.operator?.name || <span className="text-slate-400">Unassigned</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {bot.operator ? (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getOpStatusBadge(bot.operator.status)}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${opDotClass(bot.operator.status)}`}></span>
                                      {bot.operator.status}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setModalSuccess(null); setModalBotIds([]); }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSaving || !modalDate || !modalBotIds.length}
                    className="px-5 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {modalSaving ? 'Saving...' : `Create Schedule`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionSchedule;
