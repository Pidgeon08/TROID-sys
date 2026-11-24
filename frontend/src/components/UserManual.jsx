import { useMemo, useState } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { ArrowRight, BookOpen, Images, MapPin, ZoomIn } from 'lucide-react';
import { SearchBar } from './ui/SearchBar';
import { EmptyState } from './ui/EmptyState';
import ManualStepViewer from './ManualStepViewer';
import { USER_MANUALS, stepShot, stepText } from '../data/userManual';

// Screenshots made by `npm run manual:screenshots`, keyed "<role>/<topic id>/<shot>".
// Only their URLs are bundled; a step whose picture is missing just shows its text.
const SHOT_FILES = import.meta.glob('../assets/manual/**/*.jpg', { eager: true, query: '?url', import: 'default' });
const SHOTS = Object.fromEntries(
  Object.entries(SHOT_FILES).map(([path, url]) => [path.replace('../assets/manual/', '').replace(/\.jpg$/, ''), url])
);

// NGO accounts share the barangay manual, and so its pictures.
const shotRole = (role) => (role === 'ngo' ? 'barangay' : role);

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
  const [viewer, setViewer] = useState(null); // { topicId, index }

  const role = currentUser?.role;
  const topics = useMemo(
    () => (USER_MANUALS[role] || []).map((topic) => ({
      ...topic,
      steps: topic.steps.map((step) => {
        const shot = stepShot(step);
        return { text: stepText(step), image: shot ? SHOTS[`${shotRole(role)}/${topic.id}/${shot}`] || null : null };
      }),
    })),
    [role]
  );
  const viewerTopic = viewer && topics.find((t) => t.id === viewer.topicId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.steps.some((s) => s.text.toLowerCase().includes(q)) ||
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
              : `How to use every feature available to your ${currentUser?.role === 'mayorsoffice' ? "City Admin" : currentUser?.role || ''} account.`}
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
            const firstPictured = topic.steps.findIndex((s) => s.image);
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
                  <div className="shrink-0 flex flex-wrap justify-end gap-2">
                  {firstPictured >= 0 && (
                    <button
                      type="button"
                      onClick={() => setViewer({ topicId: topic.id, index: firstPictured })}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Images size={13} />
                      View step-by-step
                    </button>
                  )}
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
                </div>
                <ol className="mt-3 space-y-2.5">
                  {topic.steps.map((step, i) => (
                    <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 text-xs text-slate-600">
                      <div className="flex flex-1 items-start gap-2 min-w-0">
                        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed"><Highlighted text={step.text} query={search} /></span>
                      </div>
                      {step.image && (
                        <button
                          type="button"
                          onClick={() => setViewer({ topicId: topic.id, index: i })}
                          className="group relative ml-6 sm:ml-0 w-44 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:border-[#1b4de4] transition-colors"
                          aria-label={`View the picture for step ${i + 1}`}
                        >
                          <img src={step.image} alt="" loading="lazy" className="block w-full aspect-16/10 object-cover object-top" />
                          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 group-hover:bg-slate-900/30 group-hover:opacity-100 transition">
                            <ZoomIn size={18} />
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}

      {viewerTopic && (
        <ManualStepViewer
          topic={viewerTopic}
          steps={viewerTopic.steps}
          index={viewer.index}
          onIndexChange={(index) => setViewer((v) => ({ ...v, index }))}
          onClose={() => setViewer(null)}
          renderText={(text) => <Highlighted text={text} query={search} />}
        />
      )}
    </div>
  );
}
