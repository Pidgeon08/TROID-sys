import { clsx } from 'clsx';

export function Card({ title, children, className = '', actions }) {
  return (
    <div className={clsx('bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
