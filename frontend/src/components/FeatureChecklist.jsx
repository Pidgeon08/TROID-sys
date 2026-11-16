import { Check } from "lucide-react";
import { requiredBy, withNeeds } from "../utils/backupFeatures";

/**
 * The parts of the system to back up or restore, as checkboxes. `explicit` is the Set the
 * admin ticked; the features those need are ticked too and can't be unticked on their own.
 * `available` (a Set, optional) limits the choice to what a backup file holds. `detail(f)`
 * is the line shown under each feature (its counts).
 */
export default function FeatureChecklist({ features, explicit, onChange, available = null, detail }) {
  const included = new Set(withNeeds([...explicit], features));
  const needed = requiredBy(explicit, features);
  const selectable = features.filter((f) => !available || available.has(f.key));

  const toggle = (key) => {
    const next = new Set(explicit);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-500">{included.size} of {selectable.length} selected</span>
        <span className="flex gap-3">
          <button type="button" onClick={() => onChange(new Set(selectable.map((f) => f.key)))} className="font-medium text-blue-600 hover:text-blue-700">
            Select all
          </button>
          <button type="button" onClick={() => onChange(new Set())} className="font-medium text-slate-500 hover:text-slate-700">
            Clear
          </button>
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {features.map((f) => {
          const missing = available && !available.has(f.key);
          const locked = Boolean(needed[f.key]);
          const checked = included.has(f.key);
          return (
            <li key={f.key}>
              <label className={`flex gap-3 px-4 py-3 ${missing || locked ? "cursor-default" : "cursor-pointer hover:bg-slate-50"} ${missing ? "opacity-50" : ""}`}>
                <span className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={missing || locked}
                    onChange={() => toggle(f.key)}
                    className="sr-only peer"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-4.5 w-4.5 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40 ${
                      checked ? (locked ? "border-blue-300 bg-blue-300 text-white" : "border-blue-600 bg-blue-600 text-white") : "border-slate-300 bg-white"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{f.label}</span>
                  <span className="block text-xs text-slate-500">{f.description}</span>
                  {detail && <span className="mt-0.5 block text-[11px] text-slate-400">{detail(f)}</span>}
                  {missing && <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Not in this backup</span>}
                  {locked && <span className="mt-0.5 block text-[11px] font-medium text-blue-600">Included because {needed[f.key]} needs it</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
