import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';

// Walks through one manual topic a step at a time: the step's screenshot, large, with its
// instruction underneath. ←/→ move between steps and Esc closes.
export default function ManualStepViewer({ topic, steps, index, onIndexChange, onClose, renderText }) {
  const step = steps[index];
  const hasPrev = index > 0;
  const hasNext = index < steps.length - 1;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndexChange, onClose]);

  // The page behind shouldn't scroll while the viewer is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  if (!step) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${topic.title}: step ${index + 1} of ${steps.length}`}
    >
      <div
        className="w-full max-w-6xl max-h-[95vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{topic.title}</p>
            <p className="text-xs text-slate-500">Step {index + 1} of {steps.length}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 flex items-center justify-center p-3">
          {step.image ? (
            <img
              key={step.image}
              src={step.image}
              alt={`Screenshot for step ${index + 1}`}
              className="max-w-full max-h-[62vh] rounded-lg border border-slate-200 shadow-sm object-contain bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <ImageOff size={28} />
              <p className="text-xs">No picture for this step</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-slate-700 leading-relaxed max-h-32 overflow-y-auto">
            <span className="font-semibold text-slate-900">{index + 1}. </span>
            {renderText(step.text)}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              disabled={!hasPrev}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              type="button"
              onClick={() => (hasNext ? onIndexChange(index + 1) : onClose())}
              className="flex items-center gap-1 rounded-lg bg-[#1b4de4] px-3 py-2 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
            >
              {hasNext ? 'Next' : 'Done'}
              {hasNext && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
