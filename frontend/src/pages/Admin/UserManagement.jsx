import { useMemo, useState, useEffect } from "react";
import { Search, Plus, User, Pencil, Archive, X, Users, UserCheck, Clock, Ban } from "lucide-react";
import api from "../../services/api";
import { logAudit } from "../../services/auditLog";
import { useUsers } from "../../hooks/useUsers";
import { Card } from "../../components/ui/Card";
import { SearchBar } from "../../components/ui/SearchBar";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";

const ROLE_STYLES = {
  Admin: "bg-blue-50 text-blue-700",
  Mayor: "bg-amber-50 text-amber-800",
  Barangay: "bg-emerald-50 text-emerald-700",
};

const STATUS_STYLES = {
  Active: "bg-green-50 text-green-800",
  Pending: "bg-amber-50 text-amber-800",
  Offline: "bg-red-50 text-red-800",
  Archived: "bg-slate-100 text-slate-600",
};

const QUICK_ACTIONS = [
  { label: "Reset password", action: "resetPassword" },
  { label: "Change role", action: "changeRole" },
  { label: "Reassign barangay", action: "reassignArea" },
  { label: "Suspend account", action: "suspendAccount" },
];

const PAGE_SIZE = 5;

export default function UserManagement({ currentUser }) {
  const { users, loading, selected, selectedId, setSelectedId, updateUser, addUser } = useUsers();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [showArchived, setShowArchived] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [editConfirm, setEditConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const [pendingApproval, setPendingApproval] = useState(0);

  useEffect(() => {
    api.pendingUserCount().then(res => setPendingApproval(res.pending_count || 0)).catch(() => {});
  }, []);

  const scopedUsers = useMemo(
    () => users.filter((u) => (showArchived ? u.status === 'Archived' : u.status !== 'Archived')),
    [users, showArchived]
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

  const goTo = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  const handleArchiveToggle = async (user) => {
    if (currentUser && String(user.id) === String(currentUser.id)) {
      return;
    }
    const newStatus = user.status === 'Archived' ? 'active' : 'archived';
    try {
      await api.updateUser(user.id, { status: newStatus });
      updateUser(user.id, { status: newStatus === 'active' ? 'Active' : 'Archived' });
      logAudit({
        currentUser,
        action: newStatus === 'archived' ? 'User removed' : 'User restored',
        module: 'User Management',
        details: `${user.name} (${user.email}) ${newStatus === 'archived' ? 'archived' : 'restored'}`,
      });
    } catch (err) {
      console.error('Failed to update user status:', err);
      alert('Failed to update user status. Please try again.');
    }
  };

  const handleSaveEdit = async (updated) => {
    try {
      const payload = {
        name: updated.name,
        email: updated.email,
        role: updated.role === 'Admin' ? 'admin' : updated.role === 'Mayor' ? 'mayorsoffice' : updated.role === 'Barangay' ? 'barangay' : updated.role,
        status: updated.status === 'Active' ? 'active' : updated.status === 'Pending' ? 'pending' : updated.status === 'Offline' ? 'offline' : updated.status === 'Archived' ? 'archived' : updated.status,
        location: updated.location,
      };
      await api.updateUser(updated.id, payload);
      updateUser(updated.id, updated);
      setEditingUser(null);
      logAudit({
        currentUser,
        action: 'User updated',
        module: 'User Management',
        details: `Updated details for ${updated.name} (${updated.email})`,
      });
    } catch (err) {
      console.error('Failed to save user:', err);
      alert('Failed to save user. Please try again.');
    }
  };

  const handleAddUser = async (form) => {
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role === 'Admin' ? 'admin' : form.role === 'Mayor' ? 'mayorsoffice' : form.role === 'Barangay' ? 'barangay' : form.role,
        status: form.status === 'Active' ? 'active' : form.status === 'Pending' ? 'pending' : form.status === 'Offline' ? 'offline' : 'active',
        location: form.location || '',
      };
      const created = await api.createUser(payload);
      const newUser = {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role.replace('mayorsoffice', "Mayor").replace('barangay', 'Barangay').replace('admin', 'Admin'),
        status: created.status === 'active' ? 'Active' : created.status === 'pending' ? 'Pending' : created.status === 'offline' ? 'Offline' : created.status === 'archived' ? 'Archived' : created.status,
        location: created.location || '—',
        date: new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
      };
      addUser(newUser);
      setShowAddModal(false);
      setSelectedId(newUser.id);
      logAudit({
        currentUser,
        action: 'User added',
        module: 'User Management',
        details: `${newUser.role} account created for ${newUser.name} (${newUser.email})`,
      });
      alert(
        created.email_sent
          ? `Account created for ${newUser.name}. A temporary password has been emailed to ${newUser.email}.`
          : `Account created for ${newUser.name}, but the temporary password email could NOT be sent (email isn't configured yet). Check backend/.env and share the password with them manually via the Reset password action once email is set up.`
      );
    } catch (err) {
      console.error('Failed to create user:', err);
      alert(`Failed to create user: ${err.message}`);
    }
  };

  const openModal = (action) => {
    if (selected) setActiveModal(action);
  };

  const closeModal = () => setActiveModal(null);

  const handleResetPassword = async () => {
    if (!selected) return;
    try {
      const res = await api.resetUserPassword(selected.id);
      alert(
        res.email_sent
          ? `A new temporary password has been emailed to ${selected.email}. They will be asked to set a new password on next sign-in.`
          : `Password was reset, but the email could NOT be sent to ${selected.email} (email isn't configured yet). Check backend/.env before relying on this.`
      );
      closeModal();
      logAudit({
        currentUser,
        action: 'Password reset',
        module: 'User Management',
        details: `Password reset for ${selected.name} (${selected.email})`,
      });
    } catch (err) {
      console.error('Failed to reset password:', err);
      alert('Failed to reset password. Please try again.');
    }
  };

  const handleRoleChange = async (newRole) => {
    if (!selected) return;
    try {
      const roleValue = newRole === 'Admin' ? 'admin' : newRole === 'Mayor' ? 'mayorsoffice' : 'barangay';
      await api.updateUser(selected.id, { role: roleValue });
      updateUser(selected.id, { role: newRole });
      closeModal();
      logAudit({
        currentUser,
        action: 'Role changed',
        module: 'User Management',
        details: `${selected.name} role changed to ${newRole}`,
      });
    } catch (err) {
      console.error('Failed to update role:', err);
      alert('Failed to update role. Please try again.');
    }
  };

  const handleReassignArea = async (newLocation) => {
    if (!selected) return;
    try {
      await api.updateUser(selected.id, { location: newLocation });
      updateUser(selected.id, { location: newLocation });
      closeModal();
      logAudit({
        currentUser,
        action: 'Area reassigned',
        module: 'User Management',
        details: `${selected.name} reassigned to ${newLocation || '—'}`,
      });
    } catch (err) {
      console.error('Failed to reassign area:', err);
      alert('Failed to reassign area. Please try again.');
    }
  };

  const handleSuspendAccount = async () => {
    if (!selected) return;
    try {
      await api.updateUser(selected.id, { status: 'archived' });
      updateUser(selected.id, { status: 'Archived' });
      closeModal();
      logAudit({
        currentUser,
        action: 'User removed',
        module: 'User Management',
        details: `${selected.name} (${selected.email}) suspended`,
      });
    } catch (err) {
      console.error('Failed to suspend account:', err);
      alert('Failed to suspend account. Please try again.');
    }
  };

  const archivedCount = users.filter((u) => u.status === 'Archived').length;
  const activeNow = users.filter((u) => u.status === "Active" && u.status !== 'Archived').length;

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto animate-fade-in pb-12 flex items-center justify-center min-h-[400px]">
        <p className="text-lg font-semibold text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
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
            Archived ({archivedCount})
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#153eb8]"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, label: "Total accounts", value: users.length, caption: "Registered accounts" },
              { icon: UserCheck, label: "Active now", value: activeNow, caption: "Signed in today" },
              { icon: Clock, label: "Pending approval", value: pendingApproval, caption: "Awaiting review" },
              { icon: Ban, label: "Suspended", value: archivedCount, caption: "Archived accounts" },
            ].map(({ icon: Icon, label, value, caption }) => (
              <Card key={label} className="flex flex-col justify-between min-h-[140px]">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-600">{label}</h3>
                    <p className="text-2xl font-semibold text-slate-800 mt-1.5">{value}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-4">{caption}</p>
              </Card>
            ))}
          </div>

          <Card>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <SearchBar
                value={search}
                onChange={(val) => { setSearch(val); setPage(1); }}
                placeholder="Search by name or email"
                className="flex-1 min-w-[200px]"
              />
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option>All roles</option>
                <option>Admin</option>
                <option>Mayor</option>
                <option>Barangay</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option>All status</option>
                <option>Active</option>
                <option>Pending</option>
                <option>Offline</option>
                <option>Archived</option>
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
                    <th className="px-4 py-2.5 font-medium">Barangay</th>
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
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_STYLES[u.role] || 'bg-slate-100 text-slate-600'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[u.status] || 'bg-slate-100 text-slate-600'}`}>
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
                              setArchiveConfirm(u);
                            }}
                            disabled={currentUser && String(u.id) === String(currentUser.id)}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                              currentUser && String(u.id) === String(currentUser.id)
                                ? "border-slate-200 text-slate-300 cursor-not-allowed"
                                : u.status === 'Archived'
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            }`}
                            aria-label={currentUser && String(u.id) === String(currentUser.id) ? "Cannot archive your own account" : u.status === 'Archived' ? `Restore ${u.name}` : `Archive ${u.name}`}
                            title={currentUser && String(u.id) === String(currentUser.id) ? "Cannot archive your own account" : u.status === 'Archived' ? "Restore" : "Archive"}
                          >
                            <Archive size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState title={showArchived ? "No archived accounts." : "No accounts match your search."} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {paged.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} accounts
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => goTo(page - 1)}
                    disabled={page === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => goTo(n)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                        page === n ? "bg-[#1b4de4] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => goTo(page + 1)}
                    disabled={page === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-8">
          <Card title="Selected account information">
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[selected.status] || 'bg-slate-100 text-slate-600'}`}>
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
                    <span className="text-slate-400">Barangay: </span>{selected.location}
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
          </Card>

          <Card title="Quick action">
            <div className="space-y-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.action}
                  onClick={() => openModal(action.action)}
                  disabled={!selected}
                  className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {editingUser && (
        <EditUserModal user={editingUser} onCancel={() => setEditingUser(null)} onSave={(form) => setEditConfirm(form)} />
      )}

      {activeModal === 'resetPassword' && selected && (
        <ResetPasswordModal user={selected} onCancel={closeModal} onConfirm={handleResetPassword} />
      )}

      {activeModal === 'changeRole' && selected && (
        <ChangeRoleModal user={selected} onCancel={closeModal} onSave={handleRoleChange} />
      )}

      {activeModal === 'reassignArea' && selected && (
        <ReassignAreaModal user={selected} onCancel={closeModal} onSave={handleReassignArea} />
      )}

      {activeModal === 'suspendAccount' && selected && (
        <SuspendAccountModal user={selected} onCancel={closeModal} onConfirm={handleSuspendAccount} />
      )}

      {showAddModal && (
        <AddUserModal onCancel={() => setShowAddModal(false)} onSave={handleAddUser} />
      )}

      {editConfirm && (
        <EditUserConfirmModal
          form={editConfirm}
          onCancel={() => setEditConfirm(null)}
          onConfirm={() => { handleSaveEdit(editConfirm); setEditConfirm(null); }}
        />
      )}

      {archiveConfirm && (
        <ArchiveUserConfirmModal
          user={archiveConfirm}
          onCancel={() => setArchiveConfirm(null)}
          onConfirm={() => { handleArchiveToggle(archiveConfirm); setArchiveConfirm(null); }}
        />
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
              onChange={(e) => {
                const role = e.target.value;
                setForm({ ...form, role, location: role === 'Barangay' ? form.location : '' });
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            >
              <option>Admin</option>
              <option>Mayor</option>
              <option>Barangay</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Barangay</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Carlatan"
              disabled={form.role !== 'Barangay'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
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

function AddUserModal({ onCancel, onSave }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'Barangay',
    status: 'Active',
    location: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSave(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Add user</h3>
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
              onChange={(e) => {
                const role = e.target.value;
                setForm({ ...form, role, location: role === 'Barangay' ? form.location : '' });
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            >
              <option>Admin</option>
              <option>Mayor</option>
              <option>Barangay</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Barangay</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Carlatan"
              disabled={form.role !== 'Barangay'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.name.trim() || !form.email.trim()}
            className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Reset Password</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Reset password for <strong>{user.name}</strong>? A new temporary password will be sent to {user.email}.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]">
            Reset Password
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeRoleModal({ user, onCancel, onSave }) {
  const [selectedRole, setSelectedRole] = useState(user.role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Change Role</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Change role for <strong>{user.name}</strong>
        </p>
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-500">New Role</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          >
            <option>Admin</option>
            <option>Mayor</option>
            <option>Barangay</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={() => onSave(selectedRole)} className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ReassignAreaModal({ user, onCancel, onSave }) {
  const [location, setLocation] = useState(user.location || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Reassign Barangay</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Reassign barangay for <strong>{user.name}</strong>
        </p>
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-500">Barangay</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Enter barangay"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={() => onSave(location)} className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SuspendAccountModal({ user, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Suspend Account</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Suspend account for <strong>{user.name}</strong>? This will archive the account and prevent login.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Suspend Account
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserConfirmModal({ form, onCancel, onConfirm }) {
  const roleLabel = form.role === 'admin' ? 'Admin' : form.role === 'mayorsoffice' ? 'Mayor' : form.role === 'barangay' ? 'Barangay' : form.role;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Confirm Changes</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Save the following changes for <strong>{form.name}</strong>?
        </p>
        <div className="mb-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-slate-600"><span className="text-slate-400">Name: </span><span className="font-medium text-slate-800">{form.name}</span></p>
          <p className="text-slate-600"><span className="text-slate-400">Email: </span><span className="font-medium text-slate-800">{form.email}</span></p>
          <p className="text-slate-600"><span className="text-slate-400">Role: </span><span className="font-medium text-slate-800">{roleLabel}</span></p>
          <p className="text-slate-600"><span className="text-slate-400">Barangay: </span><span className="font-medium text-slate-800">{form.location || '—'}</span></p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchiveUserConfirmModal({ user, onCancel, onConfirm }) {
  const isArchiving = user.status !== 'Archived';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{isArchiving ? 'Archive Account' : 'Restore Account'}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {isArchiving
            ? `Archive ${user.name}? This will prevent the account from logging in.`
            : `Restore ${user.name}? This will reactivate the account.`}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${isArchiving ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {isArchiving ? 'Archive' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}
