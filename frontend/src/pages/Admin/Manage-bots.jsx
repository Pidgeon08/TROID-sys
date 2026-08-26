import { useEffect, useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import Modal from '../../components/Modal';
import api from '../../services/api';
import { logAudit } from '../../services/auditLog';
import { formatTime12h } from '../../constants/requests';
import {
    Plus,
    Wrench,
    Calendar,
    Archive,
    X,
    Search,
    Battery,
    BatteryCharging,
    AlertTriangle,
    Info,
} from 'lucide-react';

export default function ManageBots() {
    const { currentUser } = useOutletContext() || {};
    const navigate = useNavigate();
    // --- States ---
    const [bots, setBots] = useState([]);
    const [operators, setOperators] = useState([]);
    const [selectedBotId, setSelectedBotId] = useState('');
    const [loading, setLoading] = useState(true);

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
                        assignedLocation: latestSchedule?.zone || 'Not Assigned',
                        assignedOperator: op ? op.name : 'Not Assigned',
                        lastActive: b.last_seen
                            ? new Date(b.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—',
                        barangay: latestSchedule?.zone || 'Not Assigned',
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
                    status: o.status,
                    archived: o.archived,
                    assignedBot: o.assigned_bot ? `TRD-${String(o.assigned_bot).padStart(3, '0')}` : null,
                    availability: (o.availability || 'available').charAt(0).toUpperCase() + (o.availability || 'available').slice(1),
                })) : [];

                setBots(mappedBots);
                setOperators(mappedOperators);

                if (mappedBots.length > 0 && !mappedBots.find(b => b.id === selectedBotId)) {
                    setSelectedBotId(mappedBots[0].id);
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
    }, [selectedBotId]);

    // --- Modals State ---
    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
    const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
    const [isViewAllBotsOpen, setIsViewAllBotsOpen] = useState(false);
    const [maintenanceDetails, setMaintenanceDetails] = useState({ type: 'Routine Maintenance', date: '', notes: '' });

    // --- Filter/Search States for "View All" Modals ---
    const [botSearch, setBotSearch] = useState('');
    const [botFilterStatus, setBotFilterStatus] = useState('All');

    // --- Form States ---
    const [newBot, setNewBot] = useState({
        id: '',
        status: 'Idle',
        battery: 100,
        barangay: 'Not Assigned',
        assignedOperator: 'Not Assigned',
        scheduledCleanup: 'None',
        totalTrash: '0 bags'
    });

    const selectedBot = useMemo(() => {
        return bots.find(b => b.id === selectedBotId) || bots.find(b => !b.archived) || null;
    }, [bots, selectedBotId]);

    const handleAddBot = async (e) => {
        e.preventDefault();
        if (!newBot.id.trim()) return;

        const nextId = newBot.id.toUpperCase();

        // Check if ID already exists locally
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
                status: created.is_active ? 'Active' : 'Offline',
                battery: created.battery_level,
                assignedLocation: newBot.barangay !== 'Not Assigned' ? newBot.barangay : 'Not Assigned',
                assignedOperator: newBot.assignedOperator !== 'Not Assigned' ? newBot.assignedOperator : 'Not Assigned',
                lastActive: created.last_seen
                    ? new Date(created.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—',
                barangay: newBot.barangay !== 'Not Assigned' ? newBot.barangay : 'Not Assigned',
                scheduledCleanup: 'None',
                totalTrash: '0 bags',
                archived: false,
            };

            setBots([...bots, botToAdd]);

            // Update operator's status if an operator was chosen
            if (newBot.assignedOperator !== 'Not Assigned' && created.id) {
                const chosenOp = operators.find(o => o.name === newBot.assignedOperator);
                if (chosenOp) {
                    await api.updateOperator(chosenOp.backendId, {
                        assigned_bot: created.id,
                        availability: 'assigned',
                    });
                    setOperators(prev => prev.map(op => {
                        if (op.name === newBot.assignedOperator) {
                            return {
                                ...op,
                                assignedBot: botToAdd.id,
                                availability: 'Assigned'
                            };
                        }
                        return op;
                    }));
                }
            }

            // Reset Form & Close
            setNewBot({
                id: '',
                status: 'Idle',
                battery: 100,
                barangay: 'Not Assigned',
                assignedOperator: 'Not Assigned',
                scheduledCleanup: 'None',
                totalTrash: '0 bags'
            });
            setIsAddBotOpen(false);

            if (bots.length === 0) {
                setSelectedBotId(botToAdd.id);
            }

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
        }

        setBots(prev => prev.map(b => {
            if (b.id === selectedBot.id) {
                return { ...b, archived: true };
            }
            return b;
        }));

        if (selectedBot.assignedOperator !== 'Not Assigned') {
            setOperators(prev => prev.map(op => {
                if (op.name === selectedBot.assignedOperator) {
                    return { ...op, assignedBot: null, availability: 'Available' };
                }
                return op;
            }));
        }

        const remaining = bots.filter(b => b.id !== selectedBot.id && !b.archived);
        if (remaining.length > 0) {
            setSelectedBotId(remaining[0].id);
        } else {
            setSelectedBotId('');
        }

        setIsArchiveConfirmOpen(false);

        logAudit({
            currentUser,
            action: 'Bot archived',
            module: 'Bot Management',
            details: `Bot ${selectedBot.id} archived and removed from active fleet`,
        });
    };

    // --- Filtering Logic for View All Modals ---
    const filteredBots = useMemo(() => {
        return bots.filter(b => {
            if (b.archived) return false;
            const matchesSearch = b.id.toLowerCase().includes(botSearch.toLowerCase()) ||
                b.assignedLocation.toLowerCase().includes(botSearch.toLowerCase()) ||
                b.assignedOperator.toLowerCase().includes(botSearch.toLowerCase());
            const matchesStatus = botFilterStatus === 'All' || b.status === botFilterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [bots, botSearch, botFilterStatus]);

    // --- CSS Badge Helpers ---
    const getBotStatusBadgeClass = (status) => {
        switch (status) {
            case 'Active':
                return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
            case 'Idle':
                return 'bg-blue-100 text-blue-800 border border-blue-200';
            case 'Offline':
                return 'bg-red-100 text-red-800 border border-red-200';
            case 'Charging':
                return 'bg-amber-100 text-amber-800 border border-amber-200';
            default:
                return 'bg-slate-100 text-slate-800 border border-slate-200';
        }
    };

    const getOnlineBadgeClass = (online) => {
        return online === 'Online'
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            : 'bg-red-100 text-red-800 border border-red-200';
    };

    const getAvailabilityBadgeClass = (availability) => {
        switch (availability) {
            case 'Assigned':
                return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
            case 'Available':
                return 'bg-blue-100 text-blue-800 border border-blue-200';
            default:
                return 'bg-slate-100 text-slate-600 border border-slate-200';
        }
    };

    const activeOperators = operators.filter(o => !o.archived);

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center min-h-[400px]">
                <p className="text-lg font-semibold text-slate-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="w-full lg:h-full animate-fade-in flex flex-col">

            {/* ── HEADER ── */}
            <header className="mb-3 sm:mb-4 flex justify-between items-center flex-shrink-0">
                <div>
                    <h1 className="text-xl sm:text-[22px] lg:text-2xl font-bold text-slate-900 tracking-tight leading-none">Bot Management</h1>
                    <p className="text-slate-500 text-[11px] sm:text-xs mt-1 font-medium">Monitor and manage CENRO's robotic cleanup fleet</p>
                </div>
            </header>

            {/* ── MAIN WORKSPACE GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-6 lg:flex-1 lg:min-h-0">

                {/* ── LEFT COLUMN: BOTS & DETAIL ── */}
                <div className="flex flex-col gap-4 lg:gap-6 lg:min-h-0">

                    {/* AVAILABLE BOTS CARD */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col lg:min-h-0 max-h-[50vh]">
                        <div>
                            {/* Card Header */}
                            <div className="p-5 pb-3 flex justify-between items-center border-b border-slate-50">
                                <h2 className="text-sm sm:text-base font-bold text-slate-950">Available Bots</h2>
                                <button
                                    onClick={() => {
                                        const existingIds = bots
                                            .map(b => b.id)
                                            .filter(id => /^TRD-\d{3}$/i.test(id))
                                            .map(id => parseInt(id.split('-')[1], 10))
                                            .filter(n => !isNaN(n));
                                        const maxNum = existingIds.length > 0 ? Math.max(...existingIds) : 0;
                                        const nextId = `TRD-${String(maxNum + 1).padStart(3, '0')}`;
                                        setNewBot(prev => ({ ...prev, id: nextId, barangay: 'Not Assigned', assignedOperator: 'Not Assigned' }));
                                        setIsAddBotOpen(true);
                                    }}
                                    className="bg-[#1b4de4] hover:bg-[#153eb8] text-white text-[11px] sm:text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Bot</span>
                                </button>
                            </div>

                            {/* Table */}
                            <div className="flex-1 overflow-auto min-h-0">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <th className="px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">BotID</th>
                                            <th className="px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Connection</th>
                                            <th className="px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                            <th className="px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Battery</th>
                                            <th className="px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Location</th>
                                            <th className="px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Last Active</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bots.filter(b => !b.archived).slice(0, 5).map((bot) => (
                                            <tr
                                                key={bot.id}
                                                onClick={() => setSelectedBotId(bot.id)}
                                                className={`border-b border-slate-50 hover:bg-slate-50/40 transition-colors cursor-pointer text-xs sm:text-sm ${selectedBotId === bot.id ? 'bg-[#e0f2fe]/80 border-y border-[#bae6fd]' : ''
                                                    }`}
                                            >
                                                <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-bold text-slate-900">{bot.id}</td>
                                                <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                                                    <span className={`px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold inline-block ${getOnlineBadgeClass(bot.online)}`}>
                                                        {bot.online}
                                                    </span>
                                                </td>
                                                <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                                                    <span className={`px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold inline-block ${getBotStatusBadgeClass(bot.status)}`}>
                                                        {bot.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 flex items-center gap-1">
                                                    {bot.battery !== null && bot.battery !== undefined ? (
                                                        <>
                                                            {bot.status === 'Charging' ? (
                                                                <BatteryCharging className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500" />
                                                            ) : (
                                                                <Battery className={`w-3 h-3 sm:w-4 sm:h-4 ${bot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                                            )}
                                                            <span>{bot.battery}%</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-slate-400">Not Connected</span>
                                                    )}
                                                </td>
                                                <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-500">{bot.assignedLocation}</td>
                                                <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-medium text-slate-400">{bot.lastActive}</td>
                                            </tr>
                                        ))}
                                        {bots.filter(b => !b.archived).length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                                                    No bots registered yet. Click "Add Bot" to get started.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-50 flex justify-center">
                            <button
                                onClick={() => setIsViewAllBotsOpen(true)}
                                className="text-[#1b4de4] hover:text-[#153eb8] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                            >
                                View all Bots
                            </button>
                        </div>
                    </div>

                    {/* SELECTED BOT INFORMATION CARD */}
                    {selectedBot ? (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-4 lg:p-6 flex flex-col lg:flex-1 lg:min-h-0">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 lg:gap-6 lg:flex-1 lg:min-h-0">

                                {/* Bot Details Grid */}
                                <div className="flex flex-col lg:min-h-0 lg:overflow-y-auto">
                                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Selected Bot Information</span>
                                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-950 mt-1 leading-none tracking-tight">{selectedBot.id}</h2>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-3 lg:gap-y-4 mt-4 lg:mt-6">
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">Connection</span>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold ${getOnlineBadgeClass(selectedBot.online)}`}>
                                                {selectedBot.online}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">Status</span>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold ${getBotStatusBadgeClass(selectedBot.status)}`}>
                                                {selectedBot.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">Battery</span>
                                            <span className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1">
                                                {selectedBot.battery !== null && selectedBot.battery !== undefined ? (
                                                    <>
                                                        {selectedBot.status === 'Charging' ? (
                                                            <BatteryCharging className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 animate-pulse" />
                                                        ) : (
                                                            <Battery className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${selectedBot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                                        )}
                                                        {selectedBot.battery}%
                                                    </>
                                                ) : (
                                                    <span className="text-slate-400">Not Connected</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">Scheduled Cleanup</span>
                                            <span className="text-xs sm:text-sm font-bold text-slate-800 truncate max-w-[120px] sm:max-w-[150px]" title={selectedBot.scheduledCleanup}>
                                                {selectedBot.scheduledCleanup}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">Total Trash Collected</span>
                                            <span className="text-xs sm:text-sm font-bold text-[#1b4de4]">{selectedBot.totalTrash}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">Last Active</span>
                                            <span className="text-xs sm:text-sm font-bold text-slate-800">{selectedBot.lastActive}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Actions Stack */}
                                <div className="flex flex-col justify-start">
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-3 text-left md:text-right">Quick Actions</h3>
                                    <div className="flex flex-col gap-2.5">
                                        <button
                                            onClick={() => setIsMaintenanceOpen(true)}
                                            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-2.5 px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Wrench className="w-4 h-4 text-slate-400" />
                                            <span>Schedule Maintenance</span>
                                        </button>

                                        <button
                                            onClick={() => navigate('/admin/deployment')}
                                            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-2.5 px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Calendar className="w-4 h-4 text-slate-400" />
                                            <span>Manage Schedule</span>
                                        </button>

                                        <button
                                            onClick={() => setIsArchiveConfirmOpen(true)}
                                            className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 py-2.5 px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Archive className="w-4 h-4 text-red-500" />
                                            <span>Archive Bot</span>
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 sm:p-8 text-center text-slate-400">
                            <Info className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-slate-300 mb-2" />
                            <p className="text-xs sm:text-sm font-semibold">No active bots available. Add a new bot to get started.</p>
                        </div>
                    )}

                </div>

                {/* ── RIGHT COLUMN: OPERATORS ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col lg:min-h-0 max-h-[50vh] lg:max-h-none">
                    <div className="p-5 pb-3 flex justify-between items-center border-b border-slate-50 shrink-0">
                        <h2 className="text-sm sm:text-base font-bold text-slate-950">Operators</h2>
                        <span className="text-[11px] font-semibold text-slate-400">{activeOperators.length} total</span>
                    </div>

                    {activeOperators.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                            <Info className="w-7 h-7 text-slate-300 mb-2" />
                            <p className="text-xs font-semibold text-slate-400">No operators registered yet.</p>
                        </div>
                    ) : (
                        <div className="lg:flex-1 overflow-y-auto divide-y divide-slate-50">
                            {activeOperators.map((op) => (
                                <div key={op.id} className="p-4 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 truncate">{op.name}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                            {op.assignedBot ? `Assigned to ${op.assignedBot}` : 'No bot assigned'}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${getAvailabilityBadgeClass(op.availability)}`}>
                                        {op.availability}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="p-4 border-t border-slate-50 flex justify-center shrink-0">
                        <button
                            onClick={() => navigate('/admin/operators')}
                            className="text-[#1b4de4] hover:text-[#153eb8] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                        >
                            View all Operators
                        </button>
                    </div>
                </div>

            </div>

            {/* ── MODALS SECTION ── */}

            {/* 1. ADD BOT MODAL */}
            {isAddBotOpen && (
                <Modal className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-base font-bold text-slate-900">Add New Bot</h3>
                            <button onClick={() => setIsAddBotOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddBot} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bot ID</label>
                                <input
                                    type="text"
                                    readOnly
                                    required
                                    placeholder="e.g. TRD-006"
                                    value={newBot.id}
                                    onChange={(e) => setNewBot({ ...newBot, id: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4] focus:ring-1 focus:ring-[#1b4de4] bg-slate-50 text-slate-600"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Assigned Barangay</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Carlatan"
                                    value={newBot.barangay}
                                    onChange={(e) => setNewBot({ ...newBot, barangay: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                                />
                            </div>

                            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddBotOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer"
                                >
                                    Add Bot
                                </button>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}

            {/* 4. SCHEDULE MAINTENANCE MODAL */}
            {isMaintenanceOpen && selectedBot && (
                <Modal className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Schedule Maintenance</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Schedule cleanup maintenance for <strong className="text-slate-600">{selectedBot.id}</strong></p>
                            </div>
                            <button onClick={() => setIsMaintenanceOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleScheduleMaintenance} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Maintenance Type</label>
                                <select
                                    value={maintenanceDetails.type}
                                    onChange={(e) => setMaintenanceDetails({ ...maintenanceDetails, type: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                                >
                                    <option value="Routine Maintenance">Routine Maintenance</option>
                                    <option value="Sensors Cleaning">Sensors Cleaning</option>
                                    <option value="Battery Diagnostics">Battery Diagnostics</option>
                                    <option value="Propeller Repair">Propeller Repair</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Date</label>
                                <input
                                    type="date"
                                    required
                                    value={maintenanceDetails.date}
                                    onChange={(e) => setMaintenanceDetails({ ...maintenanceDetails, date: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                                <textarea
                                    placeholder="Describe maintenance issues or tasks..."
                                    value={maintenanceDetails.notes}
                                    onChange={(e) => setMaintenanceDetails({ ...maintenanceDetails, notes: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4] h-20 resize-none"
                                />
                            </div>

                            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsMaintenanceOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer"
                                >
                                    Schedule
                                </button>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}

            {/* 6. ARCHIVE CONFIRMATION MODAL */}
            {isArchiveConfirmOpen && selectedBot && (
                <Modal className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-5 pb-3 flex justify-start items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <h3 className="text-base font-bold text-slate-900">Archive Bot</h3>
                        </div>

                        <div className="px-5 pb-5">
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Are you sure you want to archive bot <strong className="text-slate-800">{selectedBot.id}</strong>?
                                This will remove the bot from the active fleet. Any assigned operator will be unassigned automatically.
                            </p>

                            <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsArchiveConfirmOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleArchiveBot}
                                    className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm cursor-pointer"
                                >
                                    Archive Bot
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* 7. VIEW ALL BOTS MODAL */}
            {isViewAllBotsOpen && (
                <Modal className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">All Bots Directory</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Manage and search all registered cleaning bots</p>
                            </div>
                            <button onClick={() => setIsViewAllBotsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Filters bar */}
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3 shrink-0">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search bots by ID, operator, location..."
                                    value={botSearch}
                                    onChange={(e) => setBotSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none bg-white"
                                />
                            </div>
                            <div className="flex gap-2">
                                <select
                                    value={botFilterStatus}
                                    onChange={(e) => setBotFilterStatus(e.target.value)}
                                    className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 outline-none"
                                >
                                    <option value="All">All Statuses</option>
                                    <option value="Active">Active</option>
                                    <option value="Idle">Idle</option>
                                    <option value="Charging">Charging</option>
                                    <option value="Offline">Offline</option>
                                </select>
                            </div>
                        </div>

                        {/* Content Table */}
                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0">
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">BotID</th>
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Status</th>
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Battery</th>
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Barangay</th>
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Scheduled cleanup</th>
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 font-sans text-center">Trash</th>
                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 text-center">Select</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredBots.map((bot) => (
                                        <tr
                                            key={bot.id}
                                            className={`border-b border-slate-50 hover:bg-slate-50/40 text-xs ${selectedBotId === bot.id ? 'bg-[#e0f2fe]/40' : ''
                                                }`}
                                        >
                                            <td className="px-5 py-3 font-bold text-slate-900">{bot.id}</td>
                                            <td className="px-5 py-3">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold inline-block ${getBotStatusBadgeClass(bot.status)}`}>
                                                    {bot.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 font-semibold text-slate-600 flex items-center gap-1 mt-1.5">
                                                {bot.battery !== null && bot.battery !== undefined ? (
                                                    <>
                                                        {bot.status === 'Charging' ? (
                                                            <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                                                        ) : (
                                                            <Battery className={`w-3.5 h-3.5 ${bot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                                        )}
                                                        {bot.battery}%
                                                    </>
                                                ) : (
                                                    <span className="text-slate-400">Not Connected</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 font-semibold text-slate-500">{bot.barangay}</td>
                                            <td className="px-5 py-3 font-semibold text-slate-400">{bot.scheduledCleanup}</td>
                                            <td className="px-5 py-3 font-bold text-blue-600 text-center">{bot.totalTrash}</td>
                                            <td className="px-5 py-3 text-center">
                                                <button
                                                    onClick={() => {
                                                        setSelectedBotId(bot.id);
                                                        setIsViewAllBotsOpen(false);
                                                    }}
                                                    className="px-2.5 py-1 text-[10px] font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-lg cursor-pointer"
                                                >
                                                    Select
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredBots.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="text-center py-8 text-slate-400 font-semibold">
                                                No bots found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
}
