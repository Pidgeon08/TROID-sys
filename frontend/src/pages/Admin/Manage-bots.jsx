import { useCallback, useEffect, useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { logAudit } from '../../services/auditLog';
import { useRealtime } from '../../hooks/useRealtime';
import { formatTime12h } from '../../constants/requests';
import { Plus, Ship, Zap, WifiOff, Ban, Battery, BatteryCharging, X } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SearchBar } from '../../components/ui/SearchBar';
import { EmptyState } from '../../components/ui/EmptyState';

const STATUS_STYLES = {
    Active: 'bg-green-50 text-green-800',
    Idle: 'bg-blue-50 text-blue-700',
    Charging: 'bg-amber-50 text-amber-800',
    Offline: 'bg-red-50 text-red-800',
};

const CONNECTION_STYLES = {
    Online: 'bg-green-50 text-green-800',
    Offline: 'bg-red-50 text-red-800',
};

const PAGE_SIZE = 5;

export default function ManageBots() {
    const { currentUser } = useOutletContext() || {};
    const navigate = useNavigate();

    const [bots, setBots] = useState([]);
    const [operators, setOperators] = useState([]);
    const [selectedBotId, setSelectedBotId] = useState('');
    const [loading, setLoading] = useState(true);
    const [realtimeNonce, setRealtimeNonce] = useState(0);

    // Live boat updates from the Cloudflare Worker relay short-circuit the
    // 5s poll below; the poll stays as a fallback for when the Worker isn't
    // running/reachable.
    useRealtime(
        useCallback((message) => {
            if (message?.type?.startsWith('boat.')) setRealtimeNonce((n) => n + 1);
        }, [])
    );

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [boatsRes, operatorsRes, schedulesRes, requestsRes] = await Promise.all([
                    api.boats(),
                    api.operators(),
                    api.deploymentSchedules(),
                    api.requests(),
                ]);

                const schedules = Array.isArray(schedulesRes) ? schedulesRes : [];
                const requests = Array.isArray(requestsRes) ? requestsRes : [];

                const mappedBots = Array.isArray(boatsRes) ? boatsRes.map((b) => {
                    const op = operatorsRes.find(o => o.assigned_bot === b.id);

                    // Most recently created schedule entry for this bot stands in as its current assignment.
                    const latestSchedule = schedules
                        .filter(s => s.bot === b.id)
                        .sort((a, z) => z.id - a.id)[0] || null;

                    const totalTrashBags = requests
                        .filter(r => r.bot_id === b.id)
                        .reduce((sum, r) => sum + (Number(r.bags) || 0), 0);

                    return {
                        backendId: b.id,
                        id: `TRD-${String(b.id).padStart(3, '0')}`,
                        status: b.is_active ? 'Active' : 'Offline',
                        online: b.is_online ? 'Online' : 'Offline',
                        battery: b.battery_level,
                        assignedLocation: latestSchedule?.zone || 'Not assigned',
                        assignedOperator: op ? op.name : 'Not Assigned',
                        lastActive: b.last_seen
                            ? new Date(b.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—',
                        scheduledCleanup: latestSchedule
                            ? `${latestSchedule.day} @ ${formatTime12h(latestSchedule.label)}`
                            : 'None',
                        totalTrash: `${totalTrashBags} bags`,
                        archived: b.archived,
                    };
                }) : [];

                const mappedOperators = Array.isArray(operatorsRes) ? operatorsRes.map((o) => ({
                    backendId: o.id,
                    id: o.operator_id,
                    name: o.name,
                    archived: o.archived,
                    assignedBot: o.assigned_bot ? `TRD-${String(o.assigned_bot).padStart(3, '0')}` : null,
                    availability: (o.availability || 'available').charAt(0).toUpperCase() + (o.availability || 'available').slice(1),
                })) : [];

                setBots(mappedBots);
                setOperators(mappedOperators);

                if (mappedBots.length > 0 && !mappedBots.find(b => b.id === selectedBotId)) {
                    setSelectedBotId(mappedBots.find(b => !b.archived)?.id || '');
                }
            } catch (err) {
                console.error('Failed to fetch bot/operator data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [selectedBotId, realtimeNonce]);

    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
    const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
    const [maintenanceDetails, setMaintenanceDetails] = useState({ type: 'Routine Maintenance', date: '', notes: '' });

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All statuses');
    const [page, setPage] = useState(1);

    const [newBot, setNewBot] = useState({ id: '', barangay: 'Not Assigned', assignedOperator: 'Not Assigned' });

    const selectedBot = useMemo(() => {
        return bots.find(b => b.id === selectedBotId) || bots.find(b => !b.archived) || null;
    }, [bots, selectedBotId]);

    const activeBots = useMemo(() => bots.filter(b => !b.archived), [bots]);

    const filtered = useMemo(() => {
        return activeBots.filter((b) => {
            const matchesSearch =
                b.id.toLowerCase().includes(search.toLowerCase()) ||
                b.assignedLocation.toLowerCase().includes(search.toLowerCase()) ||
                b.assignedOperator.toLowerCase().includes(search.toLowerCase());
            const matchesStatus = statusFilter === 'All statuses' || b.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [activeBots, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const goTo = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

    const handleAddBot = async (e) => {
        e.preventDefault();
        if (!newBot.id.trim()) return;

        const nextId = newBot.id.toUpperCase();

        if (bots.some(b => b.id === nextId)) {
            alert('Bot ID already exists!');
            return;
        }

        try {
            const created = await api.createBoat({
                name: nextId,
                is_active: false,
                battery_level: null,
                last_latitude: null,
                last_longitude: null,
            });

            const botToAdd = {
                id: created.name || nextId,
                backendId: created.id,
                status: created.is_active ? 'Active' : 'Offline',
                online: 'Offline',
                battery: created.battery_level,
                assignedLocation: newBot.barangay !== 'Not Assigned' ? newBot.barangay : 'Not Assigned',
                assignedOperator: newBot.assignedOperator !== 'Not Assigned' ? newBot.assignedOperator : 'Not Assigned',
                lastActive: created.last_seen
                    ? new Date(created.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—',
                scheduledCleanup: 'None',
                totalTrash: '0 bags',
                archived: false,
            };

            setBots(prev => [...prev, botToAdd]);

            if (newBot.assignedOperator !== 'Not Assigned' && created.id) {
                const chosenOp = operators.find(o => o.name === newBot.assignedOperator);
                if (chosenOp) {
                    await api.updateOperator(chosenOp.backendId, {
                        assigned_bot: created.id,
                        availability: 'assigned',
                    });
                    setOperators(prev => prev.map(op => (
                        op.name === newBot.assignedOperator
                            ? { ...op, assignedBot: botToAdd.id, availability: 'Assigned' }
                            : op
                    )));
                }
            }

            setNewBot({ id: '', barangay: 'Not Assigned', assignedOperator: 'Not Assigned' });
            setIsAddBotOpen(false);
            setSelectedBotId(botToAdd.id);

            logAudit({
                currentUser,
                action: 'Bot deployed',
                module: 'Bot Management',
                details: `Bot ${botToAdd.id} added to fleet`,
            });
        } catch (err) {
            console.error('Failed to add bot:', err);
            alert('Failed to add bot. Please try again.');
        }
    };

    const handleScheduleMaintenance = async (e) => {
        e.preventDefault();
        if (!selectedBot) return;

        try {
            await api.updateBoat(selectedBot.backendId, {
                is_active: false,
            });

            setBots(prev => prev.map(b => (
                b.id === selectedBot.id ? { ...b, status: 'Offline' } : b
            )));

            setIsMaintenanceOpen(false);
            setMaintenanceDetails({ type: 'Routine Maintenance', date: '', notes: '' });

            logAudit({
                currentUser,
                action: 'Maintenance scheduled',
                module: 'Bot Management',
                details: `${selectedBot.id}: ${maintenanceDetails.type} scheduled for ${maintenanceDetails.date}`,
            });
        } catch (err) {
            console.error('Failed to update bot status:', err);
            alert('Failed to schedule maintenance. Please try again.');
        }
    };

    const handleArchiveBot = async () => {
        if (!selectedBot) return;

        try {
            await api.updateBoat(selectedBot.backendId, {
                is_active: false,
                archived: true,
            });

            if (selectedBot.assignedOperator !== 'Not Assigned') {
                const op = operators.find(o => o.name === selectedBot.assignedOperator);
                if (op) {
                    await api.updateOperator(op.backendId, {
                        assigned_bot: null,
                        availability: 'available',
                    });
                }
            }
        } catch (err) {
            console.error('Failed to archive bot:', err);
            alert('Failed to archive bot. Please try again.');
            return;
        }

        setBots(prev => prev.map(b => (
            b.id === selectedBot.id ? { ...b, archived: true } : b
        )));

        if (selectedBot.assignedOperator !== 'Not Assigned') {
            setOperators(prev => prev.map(op => (
                op.name === selectedBot.assignedOperator
                    ? { ...op, assignedBot: null, availability: 'Available' }
                    : op
            )));
        }

        const remaining = bots.filter(b => b.id !== selectedBot.id && !b.archived);
        setSelectedBotId(remaining.length > 0 ? remaining[0].id : '');

        setIsArchiveConfirmOpen(false);

        logAudit({
            currentUser,
            action: 'Bot archived',
            module: 'Bot Management',
            details: `Bot ${selectedBot.id} archived and removed from active fleet`,
        });
    };

    const archivedCount = bots.filter(b => b.archived).length;
    const activeCount = activeBots.filter(b => b.status === 'Active').length;
    const offlineCount = activeBots.filter(b => b.status === 'Offline').length;

    const openAddBotModal = () => {
        const existingIds = bots
            .map(b => b.id)
            .filter(id => /^TRD-\d{3}$/i.test(id))
            .map(id => parseInt(id.split('-')[1], 10))
            .filter(n => !isNaN(n));
        const maxNum = existingIds.length > 0 ? Math.max(...existingIds) : 0;
        const nextId = `TRD-${String(maxNum + 1).padStart(3, '0')}`;
        setNewBot({ id: nextId, barangay: 'Not Assigned', assignedOperator: 'Not Assigned' });
        setIsAddBotOpen(true);
    };

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
                    <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Bot Management</h1>
                    <p className="text-slate-500 mt-1.5 text-sm font-medium">Monitor and manage CENRO's robotic cleanup fleet</p>
                </div>
                <button
                    type="button"
                    onClick={openAddBotModal}
                    className="flex items-center gap-1.5 rounded-lg bg-[#1b4de4] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#153eb8]"
                >
                    <Plus className="h-4 w-4" />
                    Add bot
                </button>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">
                <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Ship, label: 'Total bots', value: activeBots.length, caption: 'Registered fleet' },
                            { icon: Zap, label: 'Active', value: activeCount, caption: 'Currently running' },
                            { icon: WifiOff, label: 'Offline', value: offlineCount, caption: 'Not currently running' },
                            { icon: Ban, label: 'Archived', value: archivedCount, caption: 'Removed from fleet' },
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
                                placeholder="Search by bot ID, operator, or location"
                                className="flex-1 min-w-[200px]"
                            />
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30"
                            >
                                <option>All statuses</option>
                                <option>Active</option>
                                <option>Idle</option>
                                <option>Charging</option>
                                <option>Offline</option>
                            </select>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500">
                                        <th className="px-4 py-2.5 font-medium">Bot</th>
                                        <th className="px-4 py-2.5 font-medium">Connection</th>
                                        <th className="px-4 py-2.5 font-medium">Status</th>
                                        <th className="px-4 py-2.5 font-medium">Battery</th>
                                        <th className="px-4 py-2.5 font-medium">Assigned location</th>
                                        <th className="px-4 py-2.5 font-medium">Last active</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((bot) => (
                                        <tr
                                            key={bot.id}
                                            onClick={() => setSelectedBotId(bot.id)}
                                            className={`cursor-pointer border-t border-slate-100 transition-colors ${
                                                selectedBotId === bot.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <td className="px-4 py-2.5 font-medium text-slate-800">{bot.id}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${CONNECTION_STYLES[bot.online] || 'bg-slate-100 text-slate-600'}`}>
                                                    {bot.online}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[bot.status] || 'bg-slate-100 text-slate-600'}`}>
                                                    {bot.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500">
                                                {bot.battery !== null && bot.battery !== undefined ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        {bot.status === 'Charging' ? (
                                                            <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                                                        ) : (
                                                            <Battery className={`w-3.5 h-3.5 ${bot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                                        )}
                                                        {bot.battery}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">Not connected</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500">{bot.assignedLocation}</td>
                                            <td className="px-4 py-2.5 text-slate-500">{bot.lastActive}</td>
                                        </tr>
                                    ))}
                                    {paged.length === 0 && (
                                        <tr>
                                            <td colSpan={6}>
                                                <EmptyState title="No bots match your search." subtitle="Try adjusting your filters or add a new bot." />
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
                                    {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} bots
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
                                                page === n ? 'bg-[#1b4de4] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                    <Card title="Selected bot information">
                        {selectedBot ? (
                            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                                <div className="space-y-2.5 text-sm">
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Bot ID: </span>
                                        <span className="font-medium text-slate-800">{selectedBot.id}</span>
                                    </p>
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Connection: </span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONNECTION_STYLES[selectedBot.online] || 'bg-slate-100 text-slate-600'}`}>
                                            {selectedBot.online}
                                        </span>
                                    </p>
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Status: </span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[selectedBot.status] || 'bg-slate-100 text-slate-600'}`}>
                                            {selectedBot.status}
                                        </span>
                                    </p>
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Battery: </span>
                                        {selectedBot.battery !== null && selectedBot.battery !== undefined ? `${selectedBot.battery}%` : 'Not connected'}
                                    </p>
                                </div>
                                <div className="space-y-2.5 text-sm">
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Assigned location: </span>{selectedBot.assignedLocation}
                                    </p>
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Scheduled cleanup: </span>{selectedBot.scheduledCleanup}
                                    </p>
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Total trash collected: </span>{selectedBot.totalTrash}
                                    </p>
                                    <p className="text-slate-600">
                                        <span className="text-slate-400">Last active: </span>{selectedBot.lastActive}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400">Select a bot to see its details.</p>
                        )}
                    </Card>

                    <Card title="Quick action">
                        <div className="space-y-2">
                            <button
                                onClick={() => setIsMaintenanceOpen(true)}
                                disabled={!selectedBot}
                                className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Schedule maintenance
                            </button>
                            <button
                                onClick={() => navigate('/admin/deployment')}
                                disabled={!selectedBot}
                                className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Manage schedule
                            </button>
                            <button
                                onClick={() => setIsArchiveConfirmOpen(true)}
                                disabled={!selectedBot}
                                className="w-full rounded-lg border border-red-200 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Archive bot
                            </button>
                        </div>
                    </Card>
                </div>
            </div>

            {isAddBotOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-800">Add bot</h3>
                            <button onClick={() => setIsAddBotOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleAddBot} className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">Bot ID</label>
                                <input
                                    readOnly
                                    required
                                    value={newBot.id}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">Assigned barangay</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Carlatan"
                                    value={newBot.barangay === 'Not Assigned' ? '' : newBot.barangay}
                                    onChange={(e) => setNewBot({ ...newBot, barangay: e.target.value || 'Not Assigned' })}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                                />
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddBotOpen(false)}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]"
                                >
                                    Add bot
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isMaintenanceOpen && selectedBot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-800">Schedule maintenance</h3>
                            <button onClick={() => setIsMaintenanceOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            Schedule cleanup maintenance for <strong>{selectedBot.id}</strong>.
                        </p>

                        <form onSubmit={handleScheduleMaintenance} className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">Maintenance type</label>
                                <select
                                    value={maintenanceDetails.type}
                                    onChange={(e) => setMaintenanceDetails({ ...maintenanceDetails, type: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                                >
                                    <option value="Routine Maintenance">Routine Maintenance</option>
                                    <option value="Sensors Cleaning">Sensors Cleaning</option>
                                    <option value="Battery Diagnostics">Battery Diagnostics</option>
                                    <option value="Propeller Repair">Propeller Repair</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">Target date</label>
                                <input
                                    type="date"
                                    required
                                    value={maintenanceDetails.date}
                                    onChange={(e) => setMaintenanceDetails({ ...maintenanceDetails, date: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
                                <textarea
                                    placeholder="Describe maintenance issues or tasks..."
                                    value={maintenanceDetails.notes}
                                    onChange={(e) => setMaintenanceDetails({ ...maintenanceDetails, notes: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 h-20 resize-none"
                                />
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsMaintenanceOpen(false)}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-[#1b4de4] px-4 py-2 text-sm font-medium text-white hover:bg-[#153eb8]"
                                >
                                    Schedule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isArchiveConfirmOpen && selectedBot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 border border-slate-200">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-800">Archive bot</h3>
                            <button onClick={() => setIsArchiveConfirmOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            Archive <strong>{selectedBot.id}</strong>? This will remove the bot from the active fleet. Any assigned operator will be unassigned automatically.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setIsArchiveConfirmOpen(false)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleArchiveBot}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                            >
                                Archive
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
