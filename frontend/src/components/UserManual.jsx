import { useMemo, useState } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { ArrowRight, BookOpen, MapPin } from 'lucide-react';
import { SearchBar } from './ui/SearchBar';
import { EmptyState } from './ui/EmptyState';
import { USER_MANUALS } from '../data/userManual';

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Renders text with every case-insensitive occurrence of `query` wrapped in a highlight —
// this is what makes each card's header/body dynamically track what's being searched for.
function Highlighted({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-amber-200 text-slate-900 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// Shows only the manual topics for the signed-in user's own role — never another role's pages.
export default function UserManual() {
  const { currentUser } = useOutletContext() || {};
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');

  const topics = useMemo(() => USER_MANUALS[currentUser?.role] || [], [currentUser?.role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.steps.some((s) => s.toLowerCase().includes(q)) ||
      (t.keywords || []).some((k) => k.toLowerCase().includes(q))
    );
  }, [topics, search]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-50 flex items-center justify-center text-[#1b4de4]">
          <BookOpen size={18} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {search.trim() ? `Results for "${search.trim()}"` : 'User Manual'}
          </h2>
          <p className="text-xs text-slate-500">
            {search.trim()
              ? `${filtered.length} matching topic${filtered.length === 1 ? '' : 's'}`
              : `How to use every feature available to your ${currentUser?.role === 'mayorsoffice' ? "Mayor's Office" : currentUser?.role || ''} account.`}
          </p>
        </div>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder='Search the manual (e.g. "approve request")'
        className="max-w-md"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching topics"
          subtitle={topics.length === 0 ? "No manual is available for your account type yet." : "Try a different search term."}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((topic) => {
            const isCurrentPage = topic.path === location.pathname;
            return (
              <div key={topic.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">
                      <Highlighted text={topic.title} query={search} />
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <Highlighted text={topic.description} query={search} />
                    </p>
                  </div>
                  {isCurrentPage ? (
                    <span className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-400">
                      <MapPin size={13} />
                      You're here
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(topic.path)}
                      className="shrink-0 flex items-center gap-1 rounded-lg bg-[#1b4de4] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#153eb8] transition-colors"
                    >
                      Go to page
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {topic.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                      <span><Highlighted text={step} query={search} /></span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
