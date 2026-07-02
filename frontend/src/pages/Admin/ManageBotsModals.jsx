import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

export function AddBotModal({ isOpen, onClose, onSubmit, newBot, setNewBot, bots, operators }) {
    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newBot.id.trim()) return;
        if (bots.some(b => b.id.toUpperCase() === newBot.id.toUpperCase())) {
            alert('Bot ID already exists!');
            return;
        }
        onSubmit(e);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-fade-in">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-base font-bold text-slate-900">Add New Bot</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
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
                            onClick={onClose}
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
    );
}

export function ArchiveConfirmModal({ isOpen, onClose, onConfirm, selectedBot }) {
    if (!isOpen || !selectedBot) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm cursor-pointer"
                        >
                            Archive Bot
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}