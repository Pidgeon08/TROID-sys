import { useMemo, useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, UserCog, Pencil, Archive, X, Users, Anchor, Ban } from "lucide-react";
import api from "../../services/api";
import { logAudit } from "../../services/auditLog";
import { useOperators } from "../../hooks/useOperators";
import { Card } from "../../components/ui/Card";
import { SearchBar } from "../../components/ui/SearchBar";
import { EmptyState } from "../../components/ui/EmptyState";

const AVAILABILITY_STYLES = {
  Assigned: "bg-green-50 text-green-800",
  Available: "bg-blue-50 text-blue-700",
  Unavailable: "bg-red-50 text-red-700",
};

const QUICK_ACTIONS = [
  { label: "Archive operator", action: "archiveOperator" },
];

const PAGE_SIZE = 5;

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getAssignedBotToday(operator, scheduledBotIds, bots) {
  if (operator.assignedBot && scheduledBotIds.has(operator.assignedBot)) {
    return bots.find((b) => b.id === operator.assignedBot) || { id: operator.assignedBot, name: `Bot #${operator.assignedBot}` };
  }
  return null;
}

export default function OperatorManagement() {
  const { currentUser } = useOutletContext() || {};
  const { operators, loading, selected, selectedId, setSelectedId, updateOperator, addOperator } = useOperators();
  const [bots, setBots] = useState([]);
  const [scheduledBotIds, setScheduledBotIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("All availability");
  const [showArchived, setShowArchived] = useState(false);
  const [editingOperator, setEditingOperator] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [editConfirm, setEditConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const [addOperatorError, setAddOperatorError] = useState('');

  useEffect(() => {
    api.boats().then((res) => setBots(Array.isArray(res) ? res : [])).catch(() => {});
    api.deploymentSchedules().then((res) => {
      const today = todayKey();
      const ids = new Set(
        (Array.isArray(res) ? res : [])
          .filter((s) => s.day === today && s.status === "scheduled")
          .map((s) => s.bot)
      );
      setScheduledBotIds(ids);
    }).catch(() => {});
  }, []);

  const operatorsWithAvailability = useMemo(
    () => operators.map((o) => {
      const assignedBotToday = getAssignedBotToday(o, scheduledBotIds, bots);
      return { ...o, assignedBotToday, dailyAvailability: assignedBotToday ? "Assigned" : "Available" };
    }),
    [operators, scheduledBotIds, bots]
  );

  const scopedOperators = useMemo(
    () => operatorsWithAvailability.filter((o) => (showArchived ? o.archived : !o.archived)),
    [operatorsWithAvailability, showArchived]
  );

  const filtered = useMemo(() => {
    return scopedOperators.filter((o) => {
      const matchesSearch =
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase());
      const matchesAvailability = availabilityFilter === "All availability" || o.dailyAvailability === availabilityFilter;
      return matchesSearch && matchesAvailability;
    });
  }, [scopedOperators, search, availabilityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goTo = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  const handleArchiveToggle = async (operator) => {
    const archived = !operator.archived;
    try {
      await api.updateOperator(operator.backendId, { name: operator.name, archived });
      updateOperator(operator.id, { archived });
      logAudit({
        currentUser,
        action: archived ? 'Operator archived' : 'Operator restored',
        module: 'Operator Management',
        details: `${operator.name} (${operator.id}) ${archived ? 'archived' : 'restored'}`,
      });
    } catch (err) {
      console.error('Failed to update operator archive state:', err);
      alert('Failed to update operator. Please try again.');
    }
  };

  const handleSaveEdit = async (updated) => {
    try {
      await api.updateOperator(updated.backendId, {
        name: updated.name,
      });
      updateOperator(updated.id, { name: updated.name });
      setEditingOperator(null);
      logAudit({
        currentUser,
        action: 'Operator updated',
        module: 'Operator Management',
        details: `Updated details for ${updated.name} (${updated.id})`,
      });
    } catch (err) {
      console.error('Failed to save operator:', err);
      alert('Failed to save operator. Please try again.');
    }
  };

  const handleAddOperator = async (form) => {
    setAddOperatorError('');
    try {
      const created = await api.createOperator({
        name: form.name,
        email: form.email,
        availability: 'available',
        assigned_bot: null,
      });
      const newOperator = {
        backendId: created.id,
        id: created.operator_id,
        name: created.name,
        availability: 'Available',
        assignedBot: null,
        archived: false,
        email: created.email || null,
        accountStatus: created.account_status || null,
        userId: created.user || null,
      };
      addOperator(newOperator);
      setShowAddModal(false);
      setSelectedId(newOperator.id);
      logAudit({
        currentUser,
        action: 'Operator added',
        module: 'Operator Management',
        details: created.email_sent === false
          ? `${newOperator.name} (${newOperator.id}) added — account created but the welcome email failed to send`
          : `${newOperator.name} (${newOperator.id}) added with a login account at ${newOperator.email}`,
      });
    } catch (err) {
      console.error('Failed to create operator:', err);
      setAddOperatorError(err.message || 'Failed to create operator. Please try again.');
    }
  };

  const handleResetOperatorPassword = async () => {
    if (!selected?.userId) return;
    try {
      await api.resetUserPassword(selected.userId);
      logAudit({
        currentUser,
        action: 'Operator password reset',
        module: 'Operator Management',
        details: `Temporary password reissued for ${selected.name} (${selected.id})`,
      });
      alert(`A new temporary password has been emailed to ${selected.email}.`);
    } catch (err) {
      console.error('Failed to reset operator password:', err);
      alert('Failed to reset password. Please try again.');
    }
  };

  const openModal = (action) => {
    if (selected) setActiveModal(action);
  };

  const closeModal = () => setActiveModal(null);

  const handleArchiveOperator = async () => {
    if (!selected) return;
    try {
      await api.updateOperator(selected.backendId, { name: selected.name, archived: true });
      updateOperator(selected.id, { archived: true });
      closeModal();
      logAudit({
        currentUser,
        action: 'Operator archived',
        module: 'Operator Management',
        details: `${selected.name} (${selected.id}) archived`,
      });
    } catch (err) {
      console.error('Failed to archive operator:', err);
      alert('Failed to archive operator. Please try again.');
    }
  };

  const archivedCount = operatorsWithAvailability.filter((o) => o.archived).length;
  const availableCount = operatorsWithAvailability.filter((o) => !o.archived && o.dailyAvailability === 'Available').length;
  const assignedCount = operatorsWithAvailability.filter((o) => !o.archived && o.dailyAvailability === 'Assigned').length;

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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Operator Management</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">Fleet operators and their assigned bot for the day</p>
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
            onClick={() => { setAddOperatorError(''); setShowAddModal(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#153eb8]"
          >
            <Plus className="h-4 w-4" />
            Add operator
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, label: "Total operators", value: operators.length, caption: "Registered operators" },
              { icon: UserCog, label: "Available today", value: availableCount, caption: "Free for scheduling" },
              { icon: Anchor, label: "Assigned today", value: assignedCount, caption: "On a schedule today" },
              { icon: Ban, label: "Archived", value: archivedCount, caption: "Inactive operators" },
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
                placeholder="Search by name or operator ID"
                className="flex-1 min-w-[200px]"
              />
              <select
                value={availabilityFilter}
                onChange={(e) => { setAvailabilityFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option>All availability</option>
                <option>Available</option>
                <option>Assigned</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Operator</th>
                    <th className="px-4 py-2.5 font-medium">Availability</th>
                    <th className="px-4 py-2.5 font-medium">Assigned bot (today)</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedId(o.id)}
                      className={`cursor-pointer border-t border-slate-100 transition-colors ${
                        selectedId === o.id ? "bg-blue-50/60" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{o.name}</p>
                        <p className="text-xs text-slate-400">{o.id}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${AVAILABILITY_STYLES[o.dailyAvailability] || 'bg-slate-100 text-slate-600'}`}>
                          {o.dailyAvailability}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {o.assignedBotToday ? o.assignedBotToday.name : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingOperator(o);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
                            aria-label={`Edit ${o.name}`}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setArchiveConfirm(o);
                            }}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                              o.archived
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            }`}
                            aria-label={o.archived ? `Restore ${o.name}` : `Archive ${o.name}`}
                            title={o.archived ? "Restore" : "Archive"}
                          >
                            <Archive size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState title={showArchived ? "No archived operators." : "No operators match your search."} />
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
                  {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} operators
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
          <Card title="Selected operator information">
            {selected ? (
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div className="space-y-2.5 text-sm">
                  <p className="text-slate-600">
                    <span className="text-slate-400">Name: </span>
                    <span className="font-medium text-slate-800">{selected.name}</span>
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400">Operator ID: </span>{selected.id}
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400">Account: </span>
                    {selected.email ? (
                      <span className="font-medium text-slate-800">{selected.email}</span>
                    ) : (
                      <span className="text-slate-400 italic">No login account</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3">
                  {(() => {
                    const assignedBotToday = getAssignedBotToday(selected, scheduledBotIds, bots);
                    return (
                      <>
                        <p className="text-sm text-slate-600">
                          <span className="text-slate-400">Availability: </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_STYLES[assignedBotToday ? 'Assigned' : 'Available']}`}>
                            {assignedBotToday ? 'Assigned' : 'Available'}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600">
                          <span className="text-slate-400">Assigned bot (today): </span>{assignedBotToday ? assignedBotToday.name : '—'}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Select an operator to see its details.</p>
            )}
          </Card>

          <Card title="Quick action">
            <div className="space-y-2">
              <button
                onClick={handleResetOperatorPassword}
                disabled={!selected?.userId}
                title={selected && !selected.userId ? "This operator has no login account yet" : undefined}
                className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset account password
              </button>
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

      {editingOperator && (
        <EditOperatorModal operator={editingOperator} onCancel={() => setEditingOperator(null)} onSave={(form) => setEditConfirm(form)} />
      )}

      {activeModal === 'archiveOperator' && selected && (
        <ArchiveOperatorConfirmModal operator={selected} onCancel={closeModal} onConfirm={handleArchiveOperator} />
      )}

      {showAddModal && (
        <AddOperatorModal
          onCancel={() => { setShowAddModal(false); setAddOperatorError(''); }}
          onSave={handleAddOperator}
          error={addOperatorError}
        />
      )}

      {editConfirm && (
        <EditOperatorConfirmModal
          form={editConfirm}
          onCancel={() => setEditConfirm(null)}
          onConfirm={() => { handleSaveEdit(editConfirm); setEditConfirm(null); }}
        />
      )}

      {archiveConfirm && (
        <ArchiveOperatorConfirmModal
          operator={archiveConfirm}
          onCancel={() => setArchiveConfirm(null)}
          onConfirm={() => { handleArchiveToggle(archiveConfirm); setArchiveConfirm(null); }}
        />
      )}
    </div>
  );
}

function EditOperatorModal({ operator, onCancel, onSave }) {
  const [form, setForm] = useState({ ...operator });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Edit operator</h3>
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AddOperatorModal({ onCancel, onSave, error }) {
  const [form, setForm] = useState({ name: '', email: '' });
  const isValidEmail = EMAIL_PATTERN.test(form.email.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Add operator</h3>
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
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="operator@example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
            <p className="mt-1 text-xs text-slate-400">
              A login account is created and a temporary password is emailed to this address.
            </p>
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            disabled={!form.name.trim() || !isValidEmail}
            onClick={() => onSave(form)}
            className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create operator
          </button>
        </div>
      </div>
    </div>
  );
}

function EditOperatorConfirmModal({ form, onCancel, onConfirm }) {
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

function ArchiveOperatorConfirmModal({ operator, onCancel, onConfirm }) {
  const isArchiving = !operator.archived;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{isArchiving ? 'Archive Operator' : 'Restore Operator'}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {isArchiving
            ? `Archive ${operator.name}? They will no longer appear as available for scheduling, and will be hidden from the active list.`
            : `Restore ${operator.name}? This will return the operator to the active list.`}
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
