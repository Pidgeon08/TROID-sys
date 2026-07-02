import { useState, useMemo, useEffect } from "react";
import { Search, Plus, User, Pencil, Archive, X, Users, UserCheck, Clock, Ban } from "lucide-react";
import api from '../../services/api';

const ROLE_STYLES = {
  Admin: "bg-blue-50 text-blue-700",
  Mayor: "bg-amber-50 text-amber-800",
  Viewer: "bg-slate-100 text-slate-600",
};

const STATUS_STYLES = {
  Active: "bg-green-50 text-green-800",
  Pending: "bg-amber-50 text-amber-800",
  Offline: "bg-red-50 text-red-800",
};

const QUICK_ACTIONS = ["Reset password", "Change role", "Reassign area", "Suspend account"];

const PAGE_SIZE = 5;

export default function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [selectedId, setSelectedId] = useState(null);
  const [users, setUsers] = useState([]);
  const [archivedIds, setArchivedIds] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(0);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.users();
        const mapped = Array.isArray(res) ? res.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role
            .replace('mayorsoffice', "Mayor")
            .replace('spearhead', 'Spearhead')
            .replace('barangay', 'Barangay')
            .replace('admin', 'Admin'),
          status: u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Pending' : u.status === 'offline' ? 'Offline' : u.status,
          location: u.location || '—',
          date: u.date_created
            ? new Date(u.date_created).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
            : u.date_created,
        })) : [];
        setUsers(mapped);
        if (mapped.length > 0 && selectedId === null) {
          setSelectedId(mapped[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [selectedId]);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const res = await api.pendingUserCount();
        setPendingApproval(res.pending_count || 0);
      } catch (err) {
        console.error('Failed to fetch pending count:', err);
      }
    };
    fetchPendingCount();
  }, []);

  const scopedUsers = useMemo(
    () => users.filter((u) => (showArchived ? archivedIds.includes(u.id) : !archivedIds.includes(u.id))),
    [users, archivedIds, showArchived]
  );

  const filtered = useMemo(() => {
    return scopedUsers.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "All roles" || u.role === roleFilter;
      const matchesStatus = statusFilter === "All status" || u.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [scopedUsers, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = users.find((u) => u.id === selectedId) || null;

  const handleArchiveToggle = (id) => {
    setArchivedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveEdit = (updated) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setEditingUser(null);
  };

  const activeNow = users.filter((u) => u.status === "Active" && !archivedIds.includes(u.id)).length;

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {/* Page header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Manage accounts</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">User accounts, roles, status</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowArchived((v) => !v);
              setPage(1);
            }}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              showArchived
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Archived ({archivedIds.length})
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#153eb8]"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        </div>
      </header>

      {/* Two-column layout: main content (left) + details panels (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-8">

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, label: "Total accounts", value: users.length, caption: "Registered accounts" },
              { icon: UserCheck, label: "Active now", value: activeNow, caption: "Signed in today" },
              { icon: Clock, label: "Pending approval", value: pendingApproval, caption: "Awaiting review" },
              { icon: Ban, label: "Suspended", value: archivedIds.length, caption: "Archived accounts" },
            ].map(({ icon: Icon, label, value, caption }) => (
              <div
                key={label}
                className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between min-h-[140px]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-600">{label}</h3>
                    <p className="text-2xl font-semibold text-slate-800 mt-1.5">{value}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-4">{caption}</p>
              </div>
            ))}
          </div>

          {/* Table card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name or email"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option>All roles</option>
                <option>Admin</option>
                <option>Mayor</option>
                <option>Viewer</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option>All status</option>
                <option>Active</option>
                <option>Pending</option>
                <option>Offline</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Date created</th>
                    <th className="px-4 py-2.5 font-medium">Assigned location</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className={`cursor-pointer border-t border-slate-100 transition-colors ${
                        selectedId === u.id ? "bg-blue-50/60" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_STYLES[u.role]}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[u.status]}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{u.date}</td>
                      <td className="px-4 py-2.5 text-slate-500">{u.location}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingUser(u);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
                            aria-label={`Edit ${u.name}`}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchiveToggle(u.id);
                            }}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                              archivedIds.includes(u.id)
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-700"
                            }`}
                            aria-label={archivedIds.includes(u.id) ? `Restore ${u.name}` : `Archive ${u.name}`}
                            title={archivedIds.includes(u.id) ? "Restore" : "Archive"}
                          >
                            <Archive size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                        {showArchived ? "No archived accounts." : "No accounts match your search."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {paged.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} accounts
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      page === n ? "bg-[#1b4de4] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── RIGHT COLUMN (Sidebar panels) ── */}
        <div className="flex flex-col gap-8">

          {/* Panel 1: Selected account information */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-5">Selected account information</h2>
            {selected ? (
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div className="space-y-2.5 text-sm">
                  <p className="text-slate-600">
                    <span className="text-slate-400">Name: </span>
                    <span className="font-medium text-slate-800">{selected.name}</span>
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400">Email: </span>{selected.email}
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400">Status: </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[selected.status]}`}>
                      {selected.status}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400">Role: </span>{selected.role}
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400">Date created: </span>{selected.date}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-slate-600">
                    <span className="text-slate-400">Assigned location: </span>{selected.location}
                  </p>
                  <div>
                    <p className="mb-2 text-xs text-slate-400">Profile</p>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                      <User size={24} className="text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Select an account to see its details.</p>
            )}
          </div>

          {/* Panel 2: Quick actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-5">Quick action</h2>
            <div className="space-y-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  disabled={!selected}
                  className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {editingUser && (
        <EditUserModal user={editingUser} onCancel={() => setEditingUser(null)} onSave={handleSaveEdit} />
      )}
    </div>
  );
}

function EditUserModal({ user, onCancel, onSave }) {
  const [form, setForm] = useState({ ...user });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Edit user</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            >
              <option>Admin</option>
              <option>Mayor</option>
              <option>Viewer</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              >
                <option>Pending</option>
                <option>Active</option>
                <option>Offline</option>
              </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
<button
             onClick={() => onSave(form)}
             className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]"
           >
             Save changes
           </button>
        </div>
      </div>
    </div>
  );
}
