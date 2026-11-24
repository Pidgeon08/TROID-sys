import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PAGE_SIZE_OPTIONS, pageSlots } from '../../utils/pagination';

const ARROW = 'h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * "Showing 1–10 of 166 items", the page buttons, and, given `onPageSizeChange`, a choice of
 * how many items a page shows.
 */
export function Pagination({ page, totalPages, onPageChange, totalItems, pageSize = 5, onPageSizeChange, pageSizeOptions = PAGE_SIZE_OPTIONS }) {
  if (totalItems === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const sizes = pageSizeOptions.includes(pageSize) ? pageSizeOptions : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 border-t border-slate-100">
      <p className="text-xs text-slate-500">
        Showing {start}–{end} of {totalItems} items
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Show
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              aria-label="Items per page"
            >
              {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            per page
          </label>
        )}
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Pages">
          <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={ARROW} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          {pageSlots(page, totalPages).map((slot) => (typeof slot === 'number' ? (
            <button
              key={slot}
              onClick={() => onPageChange(slot)}
              aria-current={page === slot ? 'page' : undefined}
              aria-label={`Page ${slot}`}
              className={clsx(
                'h-7 min-w-7 px-1.5 flex items-center justify-center rounded-md text-xs font-medium border transition-colors tabular-nums',
                page === slot ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              )}
            >
              {slot}
            </button>
          ) : (
            <span key={slot} className="w-5 text-center text-xs text-slate-400 select-none" aria-hidden="true">…</span>
          )))}
          <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={ARROW} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </nav>
      </div>
    </div>
  );
}
