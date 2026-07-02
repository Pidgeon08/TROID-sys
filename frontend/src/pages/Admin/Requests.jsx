import { useEffect, useRef, useState } from 'react';
import {
  Film, MapPin, MessageSquarePlus, Search, Send, ShieldCheck,
  ShieldX, Clock, Image as ImageIcon, X,
  Bell, BellOff
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserContext } from '../../components/Layout';

const API_BASE = 'http://localhost:8000/api';

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusBadge = (status) => {
  const map = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  return map[status] || 'bg-slate-100 text-slate-700 border-slate-200';
};

const Requests = () => {
  const { user } = useUserContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState(user?.role || 'admin');
  const [userId, setUserId] = useState(user?.user_id || '');
  const [requests, setRequests] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [polling, setPolling] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newReq, setNewReq] = useState({ barangay_id: '', description: '', media_type: 'image' });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Detail modal
  const [selectedReq, setSelectedReq] = useState(null);

  // Admin note
  const [adminNote, setAdminNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  // Reject reason
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setRole(user.role === 'officemayor' ? 'mayorsoffice' : user.role);
      setUserId(user.user_id);
    }
  }, [user]);

  const fetchRequests = async () => {
    const params = new URLSearchParams();
    if (role === 'spearhead' || role === 'mayorsoffice') {
      params.set('role', role);
      params.set('user_id', userId);
    }
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`${API_BASE}/requests/?${params}`);
    const data = await res.json();
    setRequests(data);
  };

  const fetchBarangays = async () => {
    const res = await fetch(`${API_BASE}/barangays/`);
    const data = await res.json();
    setBarangays(data);
  };

  useEffect(() => {
    setLoading(true);
    fetchRequests();
    fetchBarangays();
    setLoading(false);
  }, [role, userId, statusFilter]);

  // Polling for notifications (new pending requests for admin)
  useEffect(() => {
    if (!polling || role !== 'admin') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/requests/?role=admin&status=pending`);
        const data = await res.json();
        const pending = data.filter(r => !notifications.find(n => n.request_id === r.request_id && n.read));
        if (pending.length > 0) {
          setNotifications(prev => [...pending.map(r => ({ ...r, read: false })), ...prev]);
        }
      } catch { /* ignore */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [polling, role]);

  // Check for request_id in URL (redirect from accept)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rid = params.get('request_id');
    if (rid) {
      setSelectedReq({ request_id: parseInt(rid) });
    }
  }, [location]);

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newReq.barangay_id || !newReq.description) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('spearhead_id', userId);
    formData.append('barangay_id', newReq.barangay_id);
    formData.append('description', newReq.description);
    formData.append('media_type', newReq.media_type);
    if (mediaFile) formData.append('media', mediaFile);

    const res = await fetch(`${API_BASE}/requests/`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      setNewReq({ barangay_id: '', description: '', media_type: 'image' });
      setMediaFile(null);
      setMediaPreview(null);
      setShowForm(false);
      fetchRequests();
    }
    setSubmitting(false);
  };

  const handleAccept = async (req) => {
    setAdminNote('');
    setNoteOpen(true);
    setSelectedReq(req);
  };

  const confirmAccept = async () => {
    await fetch(`${API_BASE}/requests/${selectedReq.request_id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted', admin_note: adminNote }),
    });
    setNoteOpen(false);
    setSelectedReq(null);
    fetchRequests();
    // Redirect to scheduling page with request_id
    navigate(`/admin/collection?request_id=${selectedReq.request_id}`);
  };

  const confirmReject = async () => {
    await fetch(`${API_BASE}/requests/${selectedReq.request_id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', admin_note: rejectReason }),
    });
    setRejectOpen(false);
    setSelectedReq(null);
    setRejectReason('');
    fetchRequests();
  };

  const filtered = requests.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (r.barangay_name && r.barangay_name.toLowerCase().includes(s)) ||
      (r.spearhead_username && r.spearhead_username.toLowerCase().includes(s)) ||
      (r.description && r.description.toLowerCase().includes(s))
    );
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'accepted': return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
      case 'rejected': return <ShieldX className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-amber-600" />;
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {/* HEADER */}
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Requests</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            {role === 'spearhead' || role === 'mayorsoffice'
              ? 'Submit and track cleanup requests'
              : 'Review and manage incoming cleanup requests'}
          </p>
        </div>
        <div className="flex gap-3">
          {role === 'admin' && (
            <button
              onClick={() => setPolling(!polling)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${polling ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
            >
              {polling ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              {polling ? 'Live' : 'Paused'}
            </button>
          )}
          {(role === 'spearhead' || role === 'mayorsoffice') && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-[#1b4de4] hover:bg-[#153eb8] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              New Request
            </button>
          )}
        </div>
      </header>

      {/* NEW REQUEST FORM */}
      {showForm && (role === 'spearhead' || role === 'mayorsoffice') && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Submit Cleanup Request</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Location (Barangay)</label>
              <select
                required
                value={newReq.barangay_id}
                onChange={(e) => setNewReq({ ...newReq, barangay_id: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
              >
                <option value="">Select barangay...</option>
                {barangays.filter(b => role === 'spearhead' ? b.spearhead_id === user?.user_id || b.spearhead === userId : true).map(b => (
                  <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea
                required
                value={newReq.description}
                onChange={(e) => setNewReq({ ...newReq, description: e.target.value })}
                placeholder="Describe the cleanup needed..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4] h-24 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Media Type</label>
                <select
                  value={newReq.media_type}
                  onChange={(e) => setNewReq({ ...newReq, media_type: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Upload File</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    {newReq.media_type === 'image' ? <ImageIcon className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                    Choose File
                  </button>
                  <span className="text-xs text-slate-500 truncate">
                    {mediaFile ? mediaFile.name : 'No file selected'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={newReq.media_type === 'image' ? 'image/*' : 'video/*'}
                    onChange={handleMediaChange}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {mediaPreview && (
              <div className="relative w-fit">
                {newReq.media_type === 'image' ? (
                  <img src={mediaPreview} alt="Preview" className="h-32 rounded-xl border border-slate-200 object-cover" />
                ) : (
                  <video src={mediaPreview} controls className="h-32 rounded-xl border border-slate-200" />
                )}
                <button
                  type="button"
                  onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FILTERS */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by barangay, user, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4] bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 outline-none focus:border-[#1b4de4]"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="scheduled">Scheduled</option>
        </select>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {['pending', 'accepted', 'rejected', 'scheduled'].map((s) => (
          <div key={s} className="bg-white rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(s)}
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s}</span>
            </div>
            <span className="text-2xl font-bold text-slate-900">
              {requests.filter(r => r.status === s).length}
            </span>
          </div>
        ))}
      </div>

      {/* NOTIFICATIONS */}
      {(role === 'admin') && notifications.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">New Requests ({notifications.length})</span>
          </div>
          {notifications.slice(0, 5).map(n => (
            <div key={n.request_id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
              <div>
                <span className="text-sm font-semibold text-slate-800">#{n.request_id} — {n.barangay_name}</span>
                <p className="text-xs text-slate-500 truncate max-w-md">{n.description}</p>
              </div>
              <button
                onClick={() => { setSelectedReq(n); setNotifications(prev => prev.filter(x => x.request_id !== n.request_id)); }}
                className="text-xs font-bold text-[#1b4de4] hover:underline whitespace-nowrap ml-3"
              >
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* LOADING */}
      {loading && <div className="text-center py-12 text-slate-400 font-semibold">Loading...</div>}

      {/* REQUEST LIST */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-12 text-center">
          <MessageSquarePlus className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No requests found.</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {filtered.map((r) => (
          <div
            key={r.request_id}
            onClick={() => setSelectedReq(r)}
            className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all cursor-pointer"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                  {r.media_type === 'image' ? (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  ) : (
                    <Film className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-900">#{r.request_id}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge(r.status)}`}>
                      {r.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {r.barangay_name || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {fmtDate(r.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{r.description}</p>
                </div>
              </div>

              {role === 'admin' && r.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAccept(r); }}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Accept
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedReq(r); setRejectOpen(true); }}
                    className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ShieldX className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              )}

              {role === 'admin' && r.status === 'accepted' && (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/admin/collection?request_id=${r.request_id}`); }}
                  className="bg-[#1b4de4] hover:bg-[#153eb8] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Schedule
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* DETAIL MODAL */}
      {selectedReq && !noteOpen && !rejectOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-100 overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Request #{selectedReq.request_id}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Submitted {fmtDate(selectedReq.created_at)}</p>
              </div>
              <button onClick={() => { setSelectedReq(null); setNoteOpen(false); setRejectOpen(false); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Status</span>
                  <p className={`mt-1 inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge(selectedReq.status)}`}>
                    {selectedReq.status.toUpperCase()}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Barangay</span>
                  <p className="mt-1 text-sm font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {selectedReq.barangay_name || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Submitted By</span>
                  <p className="mt-1 text-sm font-bold text-slate-800">{selectedReq.spearhead_full_name || selectedReq.spearhead_username || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Accepted At</span>
                  <p className="mt-1 text-sm font-bold text-slate-800">{selectedReq.accepted_at ? fmtDate(selectedReq.accepted_at) : '—'}</p>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase">Description</span>
                <p className="mt-1 text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedReq.description}</p>
              </div>

              {selectedReq.admin_note && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">Admin Note</span>
                  <p className="mt-1 text-sm text-slate-700 bg-blue-50 p-3 rounded-xl border border-blue-100">{selectedReq.admin_note}</p>
                </div>
              )}

              {selectedReq.media_url && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Media</span>
                  <div className="mt-2">
                    {selectedReq.media_type === 'image' ? (
                      <img src={selectedReq.media_url} alt="Request" className="max-h-64 rounded-xl border border-slate-200 object-cover" />
                    ) : (
                      <video src={selectedReq.media_url} controls className="max-h-64 rounded-xl border border-slate-200 w-full" />
                    )}
                  </div>
                </div>
              )}
            </div>

            {role === 'admin' && selectedReq.status === 'pending' && (
              <div className="p-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => { setSelectedReq(selectedReq); setRejectOpen(true); }}
                  className="px-4 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer"
                >
                  Reject
                </button>
                <button
                  onClick={() => { setSelectedReq(selectedReq); setNoteOpen(true); }}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm cursor-pointer"
                >
                  Accept
                </button>
              </div>
            )}

            {role === 'admin' && selectedReq.status === 'accepted' && (
              <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
                <button
                  onClick={() => navigate(`/admin/collection?request_id=${selectedReq.request_id}`)}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> Schedule Cleanup
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACCEPT MODAL */}
      {noteOpen && selectedReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">Accept Request #{selectedReq.request_id}</h3>
              <button onClick={() => setNoteOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); confirmAccept(); }} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Note to Spearhead (optional)</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add a note..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4] h-20 resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setNoteOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm cursor-pointer">
                  Confirm Accept
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectOpen && selectedReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-red-50">
              <h3 className="text-base font-bold text-red-900">Reject Request #{selectedReq.request_id}</h3>
              <button onClick={() => setRejectOpen(false)} className="text-red-400 hover:text-red-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); confirmReject(); }} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reason (optional)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-red-400 h-20 resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setRejectOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm cursor-pointer">
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Requests;
