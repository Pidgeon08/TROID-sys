import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { Badge, Card, EmptyState, Pagination, SearchBar } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

const PAGE_SIZE = 20;
const STATUS_LABELS = {
  completed: 'Completed',
  to_be_continued: 'To Be Continued',
  in_progress: 'In Progress',
};

function formatPhilippineDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export default function TaskStatusUpdates({ currentUser }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [updates, setUpdates] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);
  const debouncedSearch = useDebounce(search, 300);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const loadUpdates = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const response = await api.taskStatusUpdates({
        status: statusFilter,
        search: debouncedSearch,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }, currentUser);
      if (requestId === latestRequest.current) {
        setUpdates(response.results || []);
        setCount(response.count ?? 0);
      }
    } catch (err) {
      if (requestId === latestRequest.current) {
        setError(err.message || 'Unable to load task status updates.');
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [currentUser, debouncedSearch, page, statusFilter]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await loadUpdates();
    };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      latestRequest.current += 1;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [loadUpdates]);

  const updateStatusFilter = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const updateSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in pb-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-slate-900">Task Status Updates</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-500">Mobile operator updates, shown in Philippine time (PHT).</p>
      </header>

      <Card
        title="Updates"
        actions={(
          <button
            type="button"
            onClick={loadUpdates}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <SearchBar
            value={search}
            onChange={updateSearch}
            placeholder="Search notes or operator email..."
            className="flex-1"
          />
          <select
            value={statusFilter}
            onChange={(event) => updateStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm font-medium text-slate-500">
            Loading task status updates...
          </div>
        ) : updates.length === 0 ? (
          <EmptyState
            title={error ? 'Updates could not be loaded.' : 'No task status updates found.'}
            subtitle={error ? 'Check the connection and try refreshing.' : 'Try changing the status filter or search terms.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Notes</th>
                  <th className="px-3 py-3 font-semibold">Operator email</th>
                  <th className="px-3 py-3 font-semibold">Time sent (PHT)</th>
                  <th className="px-3 py-3 font-semibold">Time received (PHT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {updates.map((update) => (
                  <tr key={update.id} className="align-top text-sm text-slate-600">
                    <td className="px-3 py-4">
                      <Badge status={STATUS_LABELS[update.status] || update.status} />
                    </td>
                    <td className="max-w-[360px] whitespace-pre-wrap break-words px-3 py-4">{update.notes || '—'}</td>
                    <td className="px-3 py-4">{update.operator_email || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-4">{formatPhilippineDateTime(update.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-4">{formatPhilippineDateTime(update.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && count > 0 && (
          <div className="-mx-5 mt-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={count}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
