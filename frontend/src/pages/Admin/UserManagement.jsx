import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Calendar, Check, ChevronLeft, ChevronRight,
  Edit2, Eye, EyeOff, Lock, Mail, MapPin, Search, Shield, Trash2, User, UserCheck, UserPlus, UserX, X,
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

// ─── Role config ─────────────────────────────────────────────────────────────
const ROLES = {
  admin:       { label: 'Admin',        bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200'    },
  spearhead:   { label: 'Spearhead',    bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  officemayor: { label: 'Office Mayor', bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200'  },
};

const PAGE_SIZE = 5;

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—';


// ─── Shared small components ──────────────────────────────────────────────────

const StatCard = ({ label, value, color = 'text-slate-800' }) => (
  <div className="bg-white rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-1.5 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)]">
    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
    <span className={`text-3xl font-bold tracking-tight ${color}`}>{value}</span>
  </div>
);

const RoleBadge = ({ role }) => {
  const cfg = ROLES[role] ?? { label: role, bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

const StatusDot = ({ signed_in }) => (
  <span className="flex items-center gap-1.5">
    <span className={`w-2 h-2 rounded-full shrink-0 ${signed_in ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-red-400'}`} />
    <span className={`text-sm font-medium ${signed_in ? 'text-emerald-600' : 'text-red-500'}`}>
      {signed_in ? 'Active' : 'Inactive'}
    </span>
  </span>
);

const Avatar = ({ name, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-xl' };
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0`}>
      {name?.charAt(0)?.toUpperCase() ?? '?'}
    </div>
  );
};


// ─── Modal primitives ─────────────────────────────────────────────────────────

const ModalOverlay = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Field = ({ label, error, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
  </div>
);

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-[#1b4de4]/20 focus:border-[#1b4de4] transition-all ' +
  'placeholder:text-slate-400';

const BtnPrimary = ({ onClick, disabled, loading, label, loadingLabel }) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    className="flex-1 px-4 py-2.5 rounded-xl bg-[#1b4de4] text-white text-sm font-semibold
      hover:bg-[#1540c0] transition-all shadow-[0_4px_12px_rgba(27,77,228,0.2)]
      hover:shadow-[0_6px_16px_rgba(27,77,228,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading ? loadingLabel : label}
  </button>
);

const BtnSecondary = ({ onClick, label }) => (
  <button
    onClick={onClick}
    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
  >
    {label}
  </button>
);


// ─── Add User Modal ───────────────────────────────────────────────────────────

const AddUserModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    full_name: '', username: '', email: '', role: 'spearhead', password: '', confirm_password: '',
  });
  const [errors, setErrors] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.full_name.trim())  e.full_name       = 'Full name is required.';
    if (!form.username.trim())   e.username         = 'Username is required.';
    if (!form.email.trim())      e.email            = 'Email is required.';
    if (!form.role)              e.role             = 'Role is required.';
    if (!form.password)          e.password         = 'Password is required.';
    else if (form.password.length < 6) e.password   = 'Minimum 6 characters.';
    if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErrors(data); return; }
      onSaved();
    } catch {
      setErrors({ non_field_errors: 'Server error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title="Add New User" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Full Name" error={errors.full_name}>
          <input className={inputCls} value={form.full_name} onChange={set('full_name')} placeholder="e.g. Juan dela Cruz" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" error={errors.username}>
            <input className={inputCls} value={form.username} onChange={set('username')} placeholder="juandc" />
          </Field>
          <Field label="Role" error={errors.role}>
            <select className={inputCls} value={form.role} onChange={set('role')}>
              <option value="admin">Admin</option>
              <option value="spearhead">Spearhead</option>
              <option value="officemayor">Office Mayor</option>
            </select>
          </Field>
        </div>
        <Field label="Email" error={errors.email}>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="juan@cenro.gov.ph" />
        </Field>
        <Field label="Password" error={errors.password}>
          <div className="relative">
            <input
              className={`${inputCls} pr-10`}
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              placeholder="Min. 6 characters"
            />
            <button
              type="button"
              onClick={() => setShowPass((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm Password" error={errors.confirm_password}>
          <input
            className={inputCls}
            type={showPass ? 'text' : 'password'}
            value={form.confirm_password}
            onChange={set('confirm_password')}
            placeholder="Repeat password"
          />
        </Field>
        {errors.non_field_errors && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{errors.non_field_errors}</p>
        )}
        <div className="flex gap-3 pt-1">
          <BtnSecondary onClick={onClose} label="Cancel" />
          <BtnPrimary onClick={submit} loading={loading} label="Create User" loadingLabel="Creating…" />
        </div>
      </div>
    </ModalOverlay>
  );
};


// ─── Edit User Modal ──────────────────────────────────────────────────────────

const EditUserModal = ({ user, onClose, onSaved }) => {
  const [form, setForm] = useState({ role: user.role, is_active: user.is_active });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user.user_id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title={`Edit — ${user.full_name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <Avatar name={user.full_name} size="sm" />
          <div>
            <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
        <Field label="Role">
          <select className={inputCls} value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
            <option value="admin">Admin</option>
            <option value="spearhead">Spearhead</option>
            <option value="officemayor">Office Mayor</option>
          </select>
        </Field>
        <Field label="Archive Status">
          <select
            className={inputCls}
            value={form.is_active ? 'active' : 'inactive'}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === 'active' }))}
          >
            <option value="active">Active (Not Archived)</option>
            <option value="inactive">Archived</option>
          </select>
        </Field>
        <div className="flex gap-3 pt-1">
          <BtnSecondary onClick={onClose} label="Cancel" />
          <BtnPrimary onClick={submit} loading={loading} label="Save Changes" loadingLabel="Saving…" />
        </div>
      </div>
    </ModalOverlay>
  );
};


// ─── Delete Modal ─────────────────────────────────────────────────────────────

const DeleteModal = ({ user, onClose, onDeleted }) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/users/${user.user_id}/`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title="Delete Account" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 leading-relaxed">
            Are you sure you want to permanently delete{' '}
            <strong className="font-bold">{user.full_name}</strong>?
            This action <span className="underline">cannot be undone</span>.
          </p>
        </div>
        <div className="flex gap-3">
          <BtnSecondary onClick={onClose} label="Cancel" />
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};


// ─── Reset Password Modal ─────────────────────────────────────────────────────

const ResetPasswordModal = ({ user, onClose }) => {
  const [newPass, setNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!newPass || newPass.length < 6) { setError('Minimum 6 characters.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user.user_id}/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPass }),
      });
      if (!res.ok) { setError('Failed to reset password. Try again.'); return; }
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title={`Reset Password`} onClose={onClose}>
      {success ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <p className="text-slate-700 font-semibold text-center">
            Password for <strong>{user.full_name}</strong> has been reset!
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-[#1b4de4] text-white text-sm font-semibold hover:bg-[#1540c0] transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <Avatar name={user.full_name} size="sm" />
            <div>
              <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <Field label="New Password" error={error}>
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                type={showPass ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => { setNewPass(e.target.value); setError(''); }}
                placeholder="Min. 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          <div className="flex gap-3 pt-1">
            <BtnSecondary onClick={onClose} label="Cancel" />
            <BtnPrimary onClick={submit} loading={loading} label="Reset Password" loadingLabel="Resetting…" />
          </div>
        </div>
      )}
    </ModalOverlay>
  );
};


// ─── Change Role Modal ────────────────────────────────────────────────────────

const ChangeRoleModal = ({ user, onClose, onSaved }) => {
  const [role, setRole] = useState(user.role);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user.user_id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title="Change Role" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <Avatar name={user.full_name} size="sm" />
          <div>
            <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
            <p className="text-xs text-slate-400">Current: <RoleBadge role={user.role} /></p>
          </div>
        </div>
        <Field label="New Role">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="spearhead">Spearhead</option>
            <option value="officemayor">Office Mayor</option>
          </select>
        </Field>
        <div className="flex gap-3 pt-1">
          <BtnSecondary onClick={onClose} label="Cancel" />
          <BtnPrimary
            onClick={submit}
            loading={loading}
            disabled={role === user.role}
            label="Change Role"
            loadingLabel="Saving…"
          />
        </div>
      </div>
    </ModalOverlay>
  );
};


// ─── Reassign Area Modal ──────────────────────────────────────────────────────

const ReassignAreaModal = ({ user, barangays, onClose, onSaved }) => {
  const [barangayId, setBarangayId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!barangayId) { setError('Please select a barangay.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/barangays/${barangayId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spearhead_id: user.user_id }),
      });
      if (!res.ok) { setError('Failed to reassign. Try again.'); return; }
      onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay title="Reassign Area" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <Avatar name={user.full_name} size="sm" />
          <div>
            <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
            <p className="text-xs text-slate-400">Spearhead</p>
          </div>
        </div>
        <Field label="Assign to Barangay" error={error}>
          <select
            className={inputCls}
            value={barangayId}
            onChange={(e) => { setBarangayId(e.target.value); setError(''); }}
          >
            <option value="">Select barangay…</option>
            {barangays.map((b) => (
              <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3 pt-1">
          <BtnSecondary onClick={onClose} label="Cancel" />
          <BtnPrimary onClick={submit} loading={loading} label="Reassign" loadingLabel="Saving…" />
        </div>
      </div>
    </ModalOverlay>
  );
};


// ─── Main Page ────────────────────────────────────────────────────────────────

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, signed_in: 0, admins: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(1);

  // Selection & modals
  const [selectedUser, setSelectedUser] = useState(null);
  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'delete' | 'reset' | 'changeRole' | 'reassign'

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (roleFilter)   params.set('role',   roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (search)       params.set('search', search);

    // ── Users (required) ──────────────────────────────────────────────────────
    try {
      const res = await fetch(`${API_BASE}/users/?${params}`);
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      setUsers(data);
      setPage(1);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not connect to the server.');
      setLoading(false);
      return; // Stop here — no point fetching the rest
    }

    // ── Stats (optional — compute from users as fallback) ─────────────────────
    try {
      const res = await fetch(`${API_BASE}/users/stats/`);
      if (res.ok) setStats(await res.json());
    } catch { /* silently ignore */ }

    // ── Barangays (optional — assigned location info) ─────────────────────────
    try {
      const res = await fetch(`${API_BASE}/barangays/`);
      if (res.ok) setBarangays(await res.json());
    } catch { /* silently ignore */ }

    setLoading(false);
  }, [roleFilter, statusFilter, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getUserBarangay = (userId) => {
    const b = barangays.find((b) => String(b.spearhead_id) === String(userId));
    return b?.barangay_name ?? '—';
  };

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const paged = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const closeModal = () => setModal(null);

  const handleModalSaved = () => {
    closeModal();
    fetchAll();
    setSelectedUser(null);
  };

  // Toggle suspend / activate without a modal
  const handleToggleActive = async () => {
    if (!selectedUser) return;
    await fetch(`${API_BASE}/users/${selectedUser.user_id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !selectedUser.is_active }),
    });
    fetchAll();
    setSelectedUser(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
            Manage Accounts
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">
            User Accounts, Roles, Status
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1b4de4] text-white text-sm font-semibold
            hover:bg-[#1540c0] shadow-[0_4px_12px_rgba(27,77,228,0.25)] hover:shadow-[0_6px_20px_rgba(27,77,228,0.35)]
            transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          <UserPlus className="w-4 h-4" />
          + Add User
        </button>
      </header>

{/* ── Stats ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Accounts"  value={stats.total}    color="text-slate-800"   />
          <StatCard label="Signed In Now"   value={stats.signed_in} color="text-emerald-600" />
          <StatCard label="Archived"        value={stats.inactive}  color="text-red-500"     />
          <StatCard label="Admins"          value={stats.admins}    color="text-[#1b4de4]"   />
        </div>

      {/* ── Table Card ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] mb-4 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-50">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-[#1b4de4]/20 focus:border-[#1b4de4]
                transition-all placeholder:text-slate-400"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600
                focus:outline-none focus:ring-2 focus:ring-[#1b4de4]/20 focus:border-[#1b4de4] transition-all bg-white"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="spearhead">Spearhead</option>
              <option value="officemayor">Office Mayor</option>
            </select>
<select
               className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600
                 focus:outline-none focus:ring-2 focus:ring-[#1b4de4]/20 focus:border-[#1b4de4] transition-all bg-white"
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value)}
             >
               <option value="">All Status</option>
               <option value="active">Active (Not Archived)</option>
               <option value="inactive">Archived</option>
             </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50/50">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">User</th>
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date Created</th>
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Location</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-[#1b4de4] border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-slate-400">Loading users…</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="text-center py-14">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle className="w-8 h-8 text-red-300" />
                      <p className="text-sm text-red-500 font-medium">{error}</p>
                      <button onClick={fetchAll} className="text-xs text-[#1b4de4] hover:underline mt-1">Retry</button>
                    </div>
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14">
                    <div className="flex flex-col items-center gap-2">
                      <User className="w-8 h-8 text-slate-200" />
                      <p className="text-sm text-slate-400">No users found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map((u) => {
                  const isSelected = selectedUser?.user_id === u.user_id;
                  return (
                    <tr
                      key={u.user_id}
                      onClick={() => setSelectedUser(u)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors
                        ${isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/60'}`}
                    >
                      {/* User */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name} size="sm" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 leading-tight">{u.full_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <RoleBadge role={u.role} />
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusDot signed_in={u.is_signed_in} />
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-sm text-slate-500">{fmt(u.created_at)}</td>

                      {/* Location */}
                      <td className="py-3.5 px-4 text-sm text-slate-500">
                        {u.role === 'spearhead' ? getUserBarangay(u.user_id) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`edit-btn-${u.user_id}`}
                            onClick={(e) => { e.stopPropagation(); setSelectedUser(u); setModal('edit'); }}
                            className="p-2 rounded-lg hover:bg-blue-50 text-slate-300 hover:text-blue-500 transition-colors"
                            title="Edit user"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            id={`delete-btn-${u.user_id}`}
                            onClick={(e) => { e.stopPropagation(); setSelectedUser(u); setModal('delete'); }}
                            className="p-2 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && users.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-50">
            <span className="text-xs text-slate-400">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, users.length)}–{Math.min(page * PAGE_SIZE, users.length)} of {users.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors
                    ${page === n ? 'bg-[#1b4de4] text-white shadow-[0_2px_8px_rgba(27,77,228,0.25)]' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Panels ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_220px] gap-4">

        {/* Selected Account Info */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Selected Account Information</h3>
          {selectedUser ? (
            <div className="grid grid-cols-2 gap-x-10 gap-y-5">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  <User className="w-3 h-3" /> Name
                </p>
                <p className="text-sm font-semibold text-slate-800">{selectedUser.full_name}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  <MapPin className="w-3 h-3" /> Assigned Location
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {selectedUser.role === 'spearhead' ? getUserBarangay(selectedUser.user_id) : '—'}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  <Mail className="w-3 h-3" /> Email
                </p>
                <p className="text-sm font-semibold text-slate-800">{selectedUser.email}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Profile</p>
                <Avatar name={selectedUser.full_name} size="lg" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                <StatusDot signed_in={selectedUser.is_signed_in} />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  <Calendar className="w-3 h-3" /> Date Created
                </p>
                <p className="text-sm font-semibold text-slate-800">{fmt(selectedUser.created_at)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Role</p>
                <RoleBadge role={selectedUser.role} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-400 text-sm">Select a row to view account details.</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Quick Action</h3>
          <div className="flex flex-col gap-2">

            {/* Reset Password */}
            <button
              id="quick-reset-password"
              onClick={() => selectedUser && setModal('reset')}
              disabled={!selectedUser}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200
                text-sm text-slate-600 font-medium hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200
                transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              <Lock className="w-4 h-4 shrink-0" /> Reset Password
            </button>

            {/* Change Role */}
            <button
              id="quick-change-role"
              onClick={() => selectedUser && setModal('changeRole')}
              disabled={!selectedUser}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200
                text-sm text-slate-600 font-medium hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200
                transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              <Shield className="w-4 h-4 shrink-0" /> Change Role
            </button>

            {/* Reassign Area (spearhead only) */}
            <button
              id="quick-reassign-area"
              onClick={() => selectedUser?.role === 'spearhead' && setModal('reassign')}
              disabled={!selectedUser || selectedUser?.role !== 'spearhead'}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200
                text-sm text-slate-600 font-medium hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200
                transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              <MapPin className="w-4 h-4 shrink-0" /> Reassign Area
            </button>

            {/* Suspend / Activate */}
            <button
              id="quick-suspend-account"
              onClick={() => selectedUser && handleToggleActive()}
              disabled={!selectedUser}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm
                font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left
                ${selectedUser?.is_active
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
            >
              {selectedUser?.is_active
                ? <><UserX className="w-4 h-4 shrink-0" /> Archive Account</>
                : <><UserCheck className="w-4 h-4 shrink-0" /> Unarchive Account</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {modal === 'add'        && <AddUserModal    onClose={closeModal} onSaved={handleModalSaved} />}
      {modal === 'edit'       && selectedUser && <EditUserModal       user={selectedUser} onClose={closeModal} onSaved={handleModalSaved} />}
      {modal === 'delete'     && selectedUser && <DeleteModal         user={selectedUser} onClose={closeModal} onDeleted={handleModalSaved} />}
      {modal === 'reset'      && selectedUser && <ResetPasswordModal  user={selectedUser} onClose={closeModal} />}
      {modal === 'changeRole' && selectedUser && <ChangeRoleModal     user={selectedUser} onClose={closeModal} onSaved={handleModalSaved} />}
      {modal === 'reassign'   && selectedUser && <ReassignAreaModal   user={selectedUser} barangays={barangays} onClose={closeModal} onSaved={handleModalSaved} />}
    </div>
  );
};

export default UserManagement;
