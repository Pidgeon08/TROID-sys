import { clsx } from 'clsx';

const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-700',
  Approved: 'bg-emerald-50 text-emerald-700',
  Declined: 'bg-red-50 text-red-700',
  Active: 'bg-green-50 text-green-800',
  Paused: 'bg-amber-50 text-amber-800',
  Offline: 'bg-red-50 text-red-800',
  Archived: 'bg-slate-100 text-slate-600',
};

export function Badge({ status, dot = false, className = '' }) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', style, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />}
      {status}
    </span>
  );
}
