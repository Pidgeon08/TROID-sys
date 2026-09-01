import { clsx } from 'clsx';
import { REQUEST_STATUS_STYLES } from '../../constants/requests';

const STATUS_STYLES = {
  ...REQUEST_STATUS_STYLES,
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
