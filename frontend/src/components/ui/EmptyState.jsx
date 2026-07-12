import { FileSearch } from 'lucide-react';

export function EmptyState({ title = 'No records found.', subtitle = 'Try adjusting your filters or add a new item.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
        <FileSearch size={24} />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}
