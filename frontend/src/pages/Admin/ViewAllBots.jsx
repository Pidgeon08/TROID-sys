import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Search,
    Battery,
    BatteryCharging,
    Plus,
    X,
} from 'lucide-react';

const defaultBots = [
    {
        id: 'TRD-001',
        status: 'Idle',
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
    { id: 'OP-001', name: 'Lorem Ipsum', status: 'online', assignedBot: 'TRD-001', availability: 'Assigned' },
    { id: 'OP-002', name: 'Lorem Ipsum', status: 'offline', assignedBot: null, availability: 'Available' },
    { id: 'OP-003', name: 'Lorem Ipsum', status: 'online', assignedBot: 'TRD-004', availability: 'Assigned' },
    { id: 'OP-004', name: 'Lorem Ipsum', status: 'onleave', assignedBot: 'TRD-067', availability: 'Unavailable' },
    { id: 'OP-005', name: 'Lorem Ipsum', status: 'online', assignedBot: null, availability: 'Available' }
];

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

export default function ViewAllBots() {
    const navigate = useNavigate();
    const [bots, setBots] = useState(defaultBots);
    const [operators, setOperators] = useState(defaultOperators);
    const [selectedBotId, setSelectedBotId] = useState('TRD-004');
    const [botSearch, setBotSearch] = useState('');
    const [botFilterStatus, setBotFilterStatus] = useState('All');
    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const [newBot, setNewBot] = useState({
        id: '',
        status: 'Idle',
        barangay: 'None',
        assignedOperator: 'None',
        scheduledCleanup: 'None',
        runtimeToday: '0h 0m',
        totalTrash: '0 bags'
    });

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

    const selectedBot = bots.find(b => b.id === selectedBotId) || filteredBots[0] || null;

    const handleAddBot = (e) => {
        e.preventDefault();
        if (!newBot.id.trim()) return;

        if (bots.some(b => b.id.toUpperCase() === newBot.id.toUpperCase())) {
            alert('Bot ID already exists!');
            return;
        }

        const botToAdd = {
            ...newBot,
            id: newBot.id.toUpperCase(),
            assignedLocation: newBot.barangay !== 'None' ? newBot.barangay : 'None',
            battery: 100,
            lastActive: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            archived: false
        };

        setBots([...bots, botToAdd]);

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

    return (
        <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
            <header className="mb-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/admin/manage-bots')}
                        className="text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">All Bots Directory</h1>
                        <p className="text-slate-500 text-sm mt-1.5 font-medium">Manage and search all registered cleaning bots</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsAddBotOpen(true)}
                    className="bg-[#1b4de4] hover:bg-[#153eb8] text-white text-xs font-semibold py-2 px-4 rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Bot</span>
                </button>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3">
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

                    <div className="overflow-y-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0">
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">BotID</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Status</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Battery</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Barangay</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Operator</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Scheduled cleanup</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 font-medium">Runtime today</th>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 font-sans text-center">Trash</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBots.map((bot) => (
                                    <tr
                                        key={bot.id}
                                        onClick={() => setSelectedBotId(bot.id)}
                                        className={`border-b border-slate-50 hover:bg-slate-50/40 text-xs cursor-pointer ${selectedBotId === bot.id ? 'bg-[#e0f2fe]/40' : ''}`}
                                    >
                                        <td className="px-5 py-3 font-bold text-slate-900">{bot.id}</td>
                                        <td className="px-5 py-3">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold inline-block ${getBotStatusBadgeClass(bot.status)}`}>
                                                {bot.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-slate-600 flex items-center gap-1 mt-1.5">
                                            {bot.status === 'Charging' ? (
                                                <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                                            ) : (
                                                <Battery className={`w-3.5 h-3.5 ${bot.battery <= 20 ? 'text-red-500' : 'text-slate-400'}`} />
                                            )}
                                            {bot.battery}%
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-slate-500">{bot.barangay}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-500">{bot.assignedOperator}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-400">{bot.scheduledCleanup}</td>
                                        <td className="px-5 py-3 font-medium text-slate-400">{bot.runtimeToday}</td>
                                        <td className="px-5 py-3 font-bold text-blue-600 text-center">{bot.totalTrash}</td>
                                    </tr>
                                ))}
                                {filteredBots.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="text-center py-8 text-slate-400 font-semibold">
                                            No bots found matching your search.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {selectedBot && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
                        <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">Selected Bot Information</span>
                        <h2 className="text-[34px] font-extrabold text-slate-950 mt-1 leading-none tracking-tight">{selectedBot.id}</h2>

                        <div className="grid grid-cols-1 gap-x-8 gap-y-4 mt-6">
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
                )}
            </div>

            {isAddBotOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                                    required
                                    placeholder="e.g. TRD-006"
                                    value={newBot.id}
                                    onChange={(e) => setNewBot({ ...newBot, id: e.target.value })}
                                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1b4de4] focus:ring-1 focus:ring-[#1b4de4]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                                <select
                                    value={newBot.status}
                                    onChange={(e) => setNewBot({ ...newBot, status: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                                >
                                    <option value="Idle">Idle</option>
                                    <option value="Active">Active</option>
                                    <option value="Charging">Charging</option>
                                    <option value="Offline">Offline</option>
                                </select>
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

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Assign Operator</label>
                                <select
                                    value={newBot.assignedOperator}
                                    onChange={(e) => setNewBot({ ...newBot, assignedOperator: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1b4de4]"
                                >
                                    <option value="None">None</option>
                                    {operators.map(op => (
                                        <option key={op.id} value={op.name}>{op.name} ({op.id})</option>
                                    ))}
                                </select>
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
                </div>
            )}
        </div>
    );
}