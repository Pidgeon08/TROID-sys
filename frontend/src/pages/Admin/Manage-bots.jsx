import React, { useState, useMemo } from 'react';
import {
    Plus,
    Wrench,
    Calendar,
    Archive,
    Search,
    Battery,
    BatteryCharging,
    User,
    UserPlus,
    MapPin,
    Clock,
    Check,
    Trash2,
    AlertTriangle,
    Info,
    Sliders,
    Shield,
    X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AddBotModal, ArchiveConfirmModal } from './ManageBotsModals';

// --- Default Mock Data ---

const defaultBots = [
    {
        id: 'TRD-001',
        status: 'Idle', // Idle, Active, Offline, Charging
        battery: 70,
        assignedLocation: 'None',
        assignedOperator: 'Lorem Ipsum',
        lastActive: '9:10 AM',
        barangay: 'None',
        scheduledCleanup: 'None',
        runtimeToday: '2h 15m',
        totalTrash: '4 bags',
        archived: false,
    },
    {
        id: 'TRD-002',
        status: 'Active',
        battery: 100,
        assignedLocation: 'Lorem Ipsum',
        assignedOperator: 'Lorem Ipsum',
        lastActive: '7:10 AM',
        barangay: 'Lorem Ipsum',
        scheduledCleanup: '2:30 PM',
        runtimeToday: '4h 45m',
        totalTrash: '18 bags',
        archived: false,
    },
    {
        id: 'TRD-003',
        status: 'Idle',
        battery: 40,
        assignedLocation: 'Lorem Ipsum',
        assignedOperator: 'Lorem Ipsum',
        lastActive: '8:54 AM',
        barangay: 'Lorem Ipsum',
        scheduledCleanup: 'None',
        runtimeToday: '1h 30m',
        totalTrash: '3 bags',
        archived: false,
    },
    {
        id: 'TRD-004',
        status: 'Offline',
        battery: 0,
        assignedLocation: 'N/A',
        assignedOperator: 'Lorem Ipsum',
        lastActive: '11:43 AM',
        barangay: 'Lorem Ipsum',
        scheduledCleanup: 'N/A',
        runtimeToday: '5h 2m',
        totalTrash: '13 bags',
        archived: false,
    },
    {
        id: 'TRD-005',
        status: 'Charging',
        battery: 60,
        assignedLocation: 'None',
        assignedOperator: 'Lorem Ipsum',
        lastActive: '4:23 PM',
        barangay: 'None',
        scheduledCleanup: 'None',
        runtimeToday: '0h 0m',
        totalTrash: '0 bags',
        archived: false,
    }
];

const defaultOperators = [
    {
        id: 'OP-001',
        name: 'Lorem Ipsum',
        status: 'online', // online, offline, onleave
        assignedBot: 'TRD-001',
        availability: 'Assigned', // Assigned, Available, Unavailable
    },
    {
        id: 'OP-002',
        name: 'Lorem Ipsum',
        status: 'offline',
        assignedBot: null,
        availability: 'Available',
    },
    {
        id: 'OP-003',
        name: 'Lorem Ipsum',
        status: 'online',
        assignedBot: 'TRD-004',
        availability: 'Assigned',
    },
    {
        id: 'OP-004',
        name: 'Lorem Ipsum',
        status: 'onleave',
        assignedBot: 'TRD-067',
        availability: 'Unavailable',
    },
    {
        id: 'OP-005',
        name: 'Lorem Ipsum',
        status: 'online',
        assignedBot: null,
        availability: 'Available',
    }
];

export default function ManageBots() {
    // --- States ---
    const [bots, setBots] = useState(defaultBots);
    const [operators, setOperators] = useState(defaultOperators);
    const [selectedBotId, setSelectedBotId] = useState('TRD-004');
    const navigate = useNavigate();

    // --- Modals State ---
    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const [isAddOpOpen, setIsAddOpOpen] = useState(false);
    const [isAssignOpOpen, setIsAssignOpOpen] = useState(false);
    const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
    const [isManageScheduleOpen, setIsManageScheduleOpen] = useState(false);
    const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
    const [isViewAllOpsOpen, setIsViewAllOpsOpen] = useState(false);

    // --- Form States ---
    const [newBot, setNewBot] = useState({
        id: '',
        status: 'Idle',
        barangay: 'None',
        assignedOperator: 'None',
        scheduledCleanup: 'None',
        runtimeToday: '0h 0m',
        totalTrash: '0 bags'
    });

    const [newOp, setNewOp] = useState({
        name: '',
        status: 'online',
        assignedBot: ''
    });

    const [assignOpId, setAssignOpId] = useState('');
    const [maintenanceDetails, setMaintenanceDetails] = useState({
        type: 'Routine Maintenance',
        date: '',
        notes: ''
    });

    const [scheduleDetails, setScheduleDetails] = useState({
        barangay: '',
        time: '',
        date: ''
    });

    // --- Filter/Search States for "View All Operators" Modal ---
    const [opSearch, setOpSearch] = useState('');
    const [opFilterAvail, setOpFilterAvail] = useState('All');

    // --- Selected Bot Object ---
    const selectedBot = useMemo(() => {
        return bots.find(b => b.id === selectedBotId) || bots.find(b => !b.archived) || null;
    }, [bots, selectedBotId]);

    // --- Action Handlers ---

    const handleAddBot = (e) => {
        e.preventDefault();
        if (!newBot.id.trim()) return;

        const botToAdd = {
            ...newBot,
            id: newBot.id.toUpperCase(),
            assignedLocation: newBot.barangay !== 'None' ? newBot.barangay : 'None',
            battery: 100,
            lastActive: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            archived: false
        };

        setBots([...bots, botToAdd]);

        // Update operator's status if an operator was chosen
        if (newBot.assignedOperator !== 'None') {
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

        // Reset Form & Close
        setNewBot({
            id: '',
            status: 'Idle',
            barangay: 'None',
            assignedOperator: 'None',
            scheduledCleanup: 'None',
            runtimeToday: '0h 0m',
            totalTrash: '0 bags'
        });
        setIsAddBotOpen(false);
    };

    const handleAddOp = (e) => {
        e.preventDefault();
        if (!newOp.name.trim()) return;

        const opId = `OP-0${operators.length + 1}`;
        const opToAdd = {
            id: opId,
            name: newOp.name,
            status: newOp.status,
            assignedBot: newOp.assignedBot || null,
            availability: newOp.assignedBot ? 'Assigned' : (newOp.status === 'onleave' ? 'Unavailable' : 'Available')
        };

        setOperators([...operators, opToAdd]);

        // Update bot if assigned
        if (newOp.assignedBot) {
            setBots(prev => prev.map(bot => {
                if (bot.id === newOp.assignedBot) {
                    return {
                        ...bot,
                        assignedOperator: newOp.name
                    };
                }
                return bot;
            }));
        }

        setNewOp({
            name: '',
            status: 'online',
            assignedBot: ''
        });
        setIsAddOpOpen(false);
    };

    const handleAssignOperator = (e) => {
        e.preventDefault();
        if (!selectedBot) return;

        const chosenOp = operators.find(o => o.id === assignOpId);

        // 1. Remove previous operator assignment if there was one
        let prevOpName = selectedBot.assignedOperator;

        setOperators(prev => prev.map(op => {
            // Free the old operator
            if (prevOpName !== 'None' && op.name === prevOpName) {
                return { ...op, assignedBot: null, availability: 'Available' };
            }
            // Assign the new operator
            if (chosenOp && op.id === chosenOp.id) {
                return { ...op, assignedBot: selectedBot.id, availability: 'Assigned' };
            }
            return op;
        }));

        // 2. Update Bot Details
        setBots(prev => prev.map(b => {
            if (b.id === selectedBot.id) {
                return {
                    ...b,
                    assignedOperator: chosenOp ? chosenOp.name : 'None',
                };
            }
            return b;
        }));

        setIsAssignOpOpen(false);
        setAssignOpId('');
    };

    const handleScheduleMaintenance = (e) => {
        e.preventDefault();
        if (!selectedBot) return;

        setBots(prev => prev.map(b => {
            if (b.id === selectedBot.id) {
                return {
                    ...b,
                    status: 'Offline', // Maintenance puts it offline
                    scheduledCleanup: `Maintenance: ${maintenanceDetails.type} (${maintenanceDetails.date})`
                };
            }
            return b;
        }));

        setIsMaintenanceOpen(false);
        setMaintenanceDetails({ type: 'Routine Maintenance', date: '', notes: '' });
    };

    const handleManageSchedule = (e) => {
        e.preventDefault();
        if (!selectedBot) return;

        const formattedSchedule = `${scheduleDetails.date} @ ${scheduleDetails.time}`;

        setBots(prev => prev.map(b => {
            if (b.id === selectedBot.id) {
                return {
                    ...b,
                    barangay: scheduleDetails.barangay || b.barangay,
                    assignedLocation: scheduleDetails.barangay || b.assignedLocation,
                    scheduledCleanup: formattedSchedule
                };
            }
            return b;
        }));

        setIsManageScheduleOpen(false);
        setScheduleDetails({ barangay: '', time: '', date: '' });
    };

    const handleArchiveBot = () => {
        if (!selectedBot) return;

        // Archive bot
        setBots(prev => prev.map(b => {
            if (b.id === selectedBot.id) {
                return { ...b, archived: true };
            }
            return b;
        }));

        // Free the operator who was assigned to this bot
        if (selectedBot.assignedOperator !== 'None') {
            setOperators(prev => prev.map(op => {
                if (op.name === selectedBot.assignedOperator) {
                    return { ...op, assignedBot: null, availability: 'Available' };
                }
                return op;
            }));
        }

        // Select another non-archived bot
        const remaining = bots.filter(b => b.id !== selectedBot.id && !b.archived);
        if (remaining.length > 0) {
            setSelectedBotId(remaining[0].id);
        } else {
            setSelectedBotId('');
        }

        setIsArchiveConfirmOpen(false);
    };

    // --- Filtering Logic for View All Modals ---
    const filteredOperators = useMemo(() => {
        return operators.filter(op => {
            const matchesSearch = op.name.toLowerCase().includes(opSearch.toLowerCase()) ||
                op.id.toLowerCase().includes(opSearch.toLowerCase()) ||
                (op.assignedBot && op.assignedBot.toLowerCase().includes(opSearch.toLowerCase()));
            const matchesAvail = opFilterAvail === 'All' || op.availability === opFilterAvail;
            return matchesSearch && matchesAvail;
        });
    }, [operators, opSearch, opFilterAvail]);

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

    const getOpStatusBadgeClass = (availability) => {
        switch (availability) {
            case 'Assigned':
                return 'border-emerald-500 text-emerald-600 bg-emerald-50';
            case 'Available':
                return 'border-blue-500 text-blue-600 bg-blue-50';
            case 'Unavailable':
            default:
                return 'border-slate-300 text-slate-500 bg-slate-50';
        }
    };

    const getOpDotClass = (status) => {
        switch (status) {
            case 'online':
                return 'bg-emerald-500 shadow-[0_0_6px_#10b981]';
            case 'offline':
                return 'bg-slate-400';
            case 'onleave':
                return 'bg-amber-500 shadow-[0_0_6px_#f59e0b]';
            default:
                return 'bg-slate-400';
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">

            {/* ── HEADER ── */}
            <header className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Bot Management</h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">Monitor and manage CENRO's robotic cleanup fleet</p>
                </div>
            </header>

            {/* ── MAIN WORKSPACE GRID ── */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

                {/* ── LEFT COLUMN: BOTS & DETAIL ── */}
                <div className="flex flex-col gap-6">

                    {/* AVAILABLE BOTS CARD */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col justify-between min-h-[420px]">
                        <div>
                            {/* Card Header */}
                            <div className="p-5 pb-3 flex justify-between items-center border-b border-slate-50">
                                <h2 className="text-[17px] font-bold text-slate-950">Available Bots</h2>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">BotID</th>
                                            <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                            <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Battery</th>
                                            <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Location</th>
                                            <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Operator</th>
                                            <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Last Active</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bots.filter(b => !b.archived).slice(0, 5).map((bot) => (
                                            <tr
                                                key={bot.id}
                                                onClick={() => setSelectedBotId(bot.id)}
                                                className={`border-b border-slate-50 hover:bg-slate-50/40 transition-colors cursor-pointer text-sm ${selectedBotId === bot.id ? 'bg-[#e0f2fe]/80 border-y border-[#bae6fd]' : ''
                                                    }`}
                                            >
                                                <td className="px-5 py-3.5 font-bold text-slate-900">{bot.id}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-block ${getBotStatusBadgeClass(bot.status)}`}>
                                                        {bot.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 font-semibold text-slate-600 flex items-center gap-1.5">
                                                    {bot.status === 'Charging' ? (
                                                        <BatteryCharging className="w-4 h-4 text-amber-500" />
                                                    ) : (
                                                        <Battery className={`w-4 h-4 ${bot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                                    )}
                                                    <span>{bot.battery}%</span>
                                                </td>
                                                <td className="px-5 py-3.5 font-semibold text-slate-500">{bot.assignedLocation}</td>
                                                <td className="px-5 py-3.5 font-semibold text-slate-500">{bot.assignedOperator}</td>
                                                <td className="px-5 py-3.5 font-medium text-slate-400">{bot.lastActive}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-50 flex justify-center">
                            <button
                                onClick={() => navigate('/admin/managebots/allbots')}
                                className="text-[#1b4de4] hover:text-[#153eb8] text-xs font-semibold transition-colors cursor-pointer"
                            >
                                View all Bots
                            </button>
                        </div>
                    </div>

                    {/* SELECTED BOT INFORMATION CARD */}
                    {selectedBot ? (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-6">

                                {/* Bot Details Grid */}
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">Selected Bot Information</span>
                                    <h2 className="text-[34px] font-extrabold text-slate-950 mt-1 leading-none tracking-tight">{selectedBot.id}</h2>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-6">
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Status</span>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getBotStatusBadgeClass(selectedBot.status)}`}>
                                                {selectedBot.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Battery</span>
                                            <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
                                                {selectedBot.status === 'Charging' ? (
                                                    <BatteryCharging className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                                ) : (
                                                    <Battery className={`w-3.5 h-3.5 ${selectedBot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                                )}
                                                {selectedBot.battery}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Assigned Barangay</span>
                                            <span className="text-sm font-bold text-slate-800 truncate max-w-[150px]" title={selectedBot.barangay}>
                                                {selectedBot.barangay}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Scheduled Cleanup</span>
                                            <span className="text-sm font-bold text-slate-800 truncate max-w-[150px]" title={selectedBot.scheduledCleanup}>
                                                {selectedBot.scheduledCleanup}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Assigned Operator</span>
                                            <span className="text-sm font-bold text-slate-800 truncate max-w-[150px]">
                                                {selectedBot.assignedOperator}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Runtime Today</span>
                                            <span className="text-sm font-bold text-slate-800">{selectedBot.runtimeToday}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Total Trash Collected</span>
                                            <span className="text-sm font-bold text-[#1b4de4]">{selectedBot.totalTrash}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs font-semibold text-slate-400">Last Active</span>
                                            <span className="text-sm font-bold text-slate-800">{selectedBot.lastActive}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Actions Stack */}
                                <div className="flex flex-col justify-end">
                                    <h3 className="text-sm font-bold text-slate-900 mb-3 text-left md:text-right">Quick Actions</h3>
                                    <div className="flex flex-col gap-2.5">
                                        <button
                                            onClick={() => {
                                                setAssignOpId(operators.find(o => o.name === selectedBot.assignedOperator)?.id || '');
                                                setIsAssignOpOpen(true);
                                            }}
                                            className="w-full bg-[#1b4de4] hover:bg-[#153eb8] text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                                        >
                                            <User className="w-4 h-4" />
                                            <span>Assign Operator</span>
                                        </button>

                                        <button
                                            onClick={() => setIsMaintenanceOpen(true)}
                                            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Wrench className="w-4 h-4 text-slate-400" />
                                            <span>Schedule Maintenance</span>
                                        </button>

                                        <button
                                            onClick={() => setIsManageScheduleOpen(true)}
                                            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Calendar className="w-4 h-4 text-slate-400" />
                                            <span>Manage Schedule</span>
                                        </button>

                                        <button
                                            onClick={() => setIsArchiveConfirmOpen(true)}
                                            className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Archive className="w-4 h-4 text-red-500" />
                                            <span>Archive Bot</span>
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8 text-center text-slate-400">
                            <Info className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                            <p className="text-sm font-semibold">No active bots available. Add a new bot to get started.</p>
                        </div>
                    )}

                </div>

                {/* ── RIGHT COLUMN: AVAILABLE OPERATORS ── */}
                <div className="flex flex-col gap-6">

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col justify-between min-h-[580px]">
                        <div>
                            {/* Card Header */}
                            <div className="p-5 pb-3 flex justify-between items-center border-b border-slate-50">
                                <h2 className="text-[17px] font-bold text-slate-950">Available Operators</h2>
                                <button
                                    onClick={() => setIsAddOpOpen(true)}
                                    className="bg-[#1b4de4] hover:bg-[#153eb8] text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add OP</span>
                                </button>
                            </div>

                            {/* Operators List */}
                            <div className="p-4 flex flex-col gap-3.5">
                                {operators.slice(0, 5).map((op) => (
                                    <div
                                        key={op.id}
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-50 hover:bg-slate-50/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            {/* Avatar with absolute status indicator */}
                                            <div className="relative shrink-0">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
                                                    {op.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                </div>
                                                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${getOpDotClass(op.status)}`}></div>
                                            </div>

                                            {/* Details */}
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-slate-900 truncate leading-tight">{op.name}</span>
                                                <span className="text-[10px] font-semibold text-slate-400 mt-0.5 flex items-center gap-1 capitalize">
                                                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${op.status === 'online' ? 'bg-emerald-500' : op.status === 'onleave' ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                                                    {op.status}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-500 mt-1">
                                                    {op.assignedBot ? `Assigned to: ${op.assignedBot}` : 'No assigned bot'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Status Pill Badge */}
                                        <span className={`border text-[11px] font-bold px-3 py-1 rounded-full shrink-0 ${getOpStatusBadgeClass(op.availability)}`}>
                                            {op.availability}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-50 flex justify-center">
                            <button
                                onClick={() => setIsViewAllOpsOpen(true)}
                                className="text-[#1b4de4] hover:text-[#153eb8] text-xs font-semibold transition-colors cursor-pointer"
                            >
                                View all Operators
                            </button>
                        </div>
                    </div>

                </div>

            </div>

            {/* ── MODALS SECTION ── */}

            <AddBotModal
                isOpen={isAddBotOpen}
                onClose={() => setIsAddBotOpen(false)}
                onSubmit={handleAddBot}
                newBot={newBot}
                setNewBot={setNewBot}
                bots={bots}
                operators={operators}
            />

            <ArchiveConfirmModal
                isOpen={isArchiveConfirmOpen}
                onClose={() => setIsArchiveConfirmOpen(false)}
                onConfirm={handleArchiveBot}
                selectedBot={selectedBot}
            />

            {/* 2. ADD OPERATOR MODAL */}
            {isAddOpOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-base font-bold text-slate-900">Add Operator</h3>
                            <button onClick={() => setIsAddOpOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddOp} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Operator Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Juan Dela Cruz"
                                    value={newOp.name}
                                    onChange={(e) => setNewOp({ ...newOp, name: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                                <select
                                    value={newOp.status}
                                    onChange={(e) => setNewOp({ ...newOp, status: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                                >
                                    <option value="online">Online</option>
                                    <option value="offline">Offline</option>
                                    <option value="onleave">On Leave</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Initial Bot Assignment</label>
                                <select
                                    value={newOp.assignedBot}
                                    onChange={(e) => setNewOp({ ...newOp, assignedBot: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                                >
                                    <option value="">No Assignment</option>
                                    {bots.filter(b => !b.archived).map(b => (
                                        <option key={b.id} value={b.id}>{b.id}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddOpOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer"
                                >
                                    Add Operator
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. ASSIGN OPERATOR MODAL */}
            {isAssignOpOpen && selectedBot && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Assign Operator</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Assign an operator to bot <strong className="text-slate-600">{selectedBot.id}</strong></p>
                            </div>
                            <button onClick={() => setIsAssignOpOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAssignOperator} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Choose Operator</label>
                                <select
                                    required
                                    value={assignOpId}
                                    onChange={(e) => setAssignOpId(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                                >
                                    <option value="">-- Select Operator --</option>
                                    <option value="None">None (Unassign Operator)</option>
                                    {operators.map(op => (
                                        <option key={op.id} value={op.id}>
                                            {op.name} ({op.availability} - {op.status})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAssignOpOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer"
                                >
                                    Apply Assignment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 4. SCHEDULE MAINTENANCE MODAL */}
            {isMaintenanceOpen && selectedBot && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                </div>
            )}

            {/* 5. MANAGE SCHEDULE MODAL */}
            {isManageScheduleOpen && selectedBot && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Manage Cleanup Schedule</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Schedule cleanup missions for <strong className="text-slate-600">{selectedBot.id}</strong></p>
                            </div>
                            <button onClick={() => setIsManageScheduleOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleManageSchedule} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Destination Barangay</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Biday, Carlatan, Poro"
                                    value={scheduleDetails.barangay}
                                    onChange={(e) => setScheduleDetails({ ...scheduleDetails, barangay: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={scheduleDetails.date}
                                        onChange={(e) => setScheduleDetails({ ...scheduleDetails, date: e.target.value })}
                                        className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Time</label>
                                    <input
                                        type="time"
                                        required
                                        value={scheduleDetails.time}
                                        onChange={(e) => setScheduleDetails({ ...scheduleDetails, time: e.target.value })}
                                        className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4]"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsManageScheduleOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-xs font-bold text-white bg-[#1b4de4] hover:bg-[#153eb8] rounded-xl shadow-sm cursor-pointer"
                                >
                                    Save Schedule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 7. VIEW ALL OPERATORS MODAL */}
            {isViewAllOpsOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">All Operators Directory</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Search and edit all CENRO field operators</p>
                            </div>
                            <button onClick={() => setIsViewAllOpsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Filters bar */}
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3 shrink-0">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search operators by name, ID or bot..."
                                    value={opSearch}
                                    onChange={(e) => setOpSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none bg-white"
                                />
                            </div>
                            <div className="flex gap-2">
                                <select
                                    value={opFilterAvail}
                                    onChange={(e) => setOpFilterAvail(e.target.value)}
                                    className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 outline-none"
                                >
                                    <option value="All">All Availabilities</option>
                                    <option value="Available">Available</option>
                                    <option value="Assigned">Assigned</option>
                                    <option value="Unavailable">Unavailable</option>
                                </select>
                            </div>
                        </div>

                        {/* List */}
                        <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-3">
                            {filteredOperators.map((op) => (
                                <div
                                    key={op.id}
                                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/40 transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
                                                {op.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </div>
                                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${getOpDotClass(op.status)}`}></div>
                                        </div>

                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-slate-900 truncate leading-none">{op.name}</span>
                                                <span className="text-[10px] text-slate-400 font-bold">({op.id})</span>
                                            </div>
                                            <span className="text-[10px] font-semibold text-slate-400 mt-1 flex items-center gap-1 capitalize">
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${op.status === 'online' ? 'bg-emerald-500' : op.status === 'onleave' ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                                                {op.status}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-500 mt-1.5 bg-slate-100 px-2 py-0.5 rounded w-max">
                                                {op.assignedBot ? `Assigned Bot: ${op.assignedBot}` : 'No bot assigned'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={`border text-xs font-bold px-3 py-1 rounded-full ${getOpStatusBadgeClass(op.availability)}`}>
                                            {op.availability}
                                        </span>
                                        {/* Trash/delete operator option */}
                                        <button
                                            onClick={() => {
                                                if (confirm(`Remove operator ${op.name}?`)) {
                                                    setOperators(prev => prev.filter(o => o.id !== op.id));
                                                    // Update assigned bot
                                                    if (op.assignedBot) {
                                                        setBots(prev => prev.map(b => {
                                                            if (b.id === op.assignedBot) {
                                                                return { ...b, assignedOperator: 'None' };
                                                            }
                                                            return b;
                                                        }));
                                                    }
                                                }
                                            }}
                                            className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                                            title="Delete operator"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredOperators.length === 0 && (
                                <div className="text-center py-8 text-slate-400 font-semibold">
                                    No operators found matching your search.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}