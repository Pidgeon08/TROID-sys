import { Loader2 } from 'lucide-react';

export default function LoadingModal({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-10 py-8 border border-slate-100 shadow-2xl">
        <Loader2 className="w-9 h-9 text-[#0c165a] animate-spin" />
        <p className="text-sm font-semibold text-slate-700">{message}</p>
      </div>
    </div>
  );
}
