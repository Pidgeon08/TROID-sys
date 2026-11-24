// The trash report filed to finish a cleanup, after the International Coastal Cleanup data card.
// CENRO (Mark Session Completed) and barangays (Mark as Finished) use the same form. For a
// TROID-supported cleanup the items are filled in with what the robot counted, to check and correct.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Plus, X } from "lucide-react";
import api from "../services/api";
import { ANIMAL_CONDITIONS, SITE_TYPES, TRASH_ITEMS, siteTypeForWater } from "../constants/trashReport";

const INPUT = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20";
const LABEL = "mb-1.5 block text-xs font-semibold text-slate-500";

const blankItems = () => Object.fromEntries(TRASH_ITEMS.map((item) => [item, ""]));
const stripLeadingZero = (raw) => raw.replace(/^0+(?=\d)/, "");
const blankAnimal = () => ({ animal: "", condition: "alive", entangled_in: "" });

function Section({ title, hint, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function NumberField({ label, value, onChange, required = false, step = "1", min = "0", placeholder }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="number"
        min={min}
        step={step}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(stripLeadingZero(e.target.value))}
        className={INPUT}
      />
    </div>
  );
}

/**
 * `onFiled(report, response)` runs once the report is saved, with what was sent; the page
 * updates itself and writes its audit entry. `onClose` closes it without saving.
 */
export default function TrashReportForm({ request, onClose, onFiled }) {
  const [siteType, setSiteType] = useState(() => siteTypeForWater(request.collectionArea?.waterBodyType));
  const [people, setPeople] = useState("");
  const [hours, setHours] = useState("");
  const [distance, setDistance] = useState("");
  const [items, setItems] = useState(blankItems);
  const [bags, setBags] = useState("");
  const [weight, setWeight] = useState("");
  const [recyclable, setRecyclable] = useState("");
  const [nonUsable, setNonUsable] = useState("");
  const [animals, setAnimals] = useState([]);
  const [peculiar, setPeculiar] = useState("");
  const [notes, setNotes] = useState("");
  const [troidCount, setTroidCount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // What the robot counted, for a TROID-supported cleanup; items not yet typed in take its count.
  useEffect(() => {
    let cancelled = false;
    api.troidCount(request.id)
      .then((res) => {
        if (cancelled || !res.troid_assisted) return;
        setTroidCount(res.categories || {});
        setItems((prev) => Object.fromEntries(
          Object.entries(prev).map(([item, value]) => [item, value === "" ? String(res.categories?.[item] || 0) : value])
        ));
      })
      .catch((err) => console.error("Failed to load TROID counts:", err));
    return () => { cancelled = true; };
  }, [request.id]);

  const totalItems = Object.values(items).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const updateAnimal = (index, field, value) =>
    setAnimals((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));

  const submit = async (e) => {
    e.preventDefault();
    const report = {
      site_type: siteType,
      people_count: Number(people),
      hours_spent: Number(hours),
      distance_km: distance === "" ? null : Number(distance),
      trash_categories: Object.fromEntries(TRASH_ITEMS.map((item) => [item, Number(items[item]) || 0])),
      bags: Number(bags),
      weight_kg: Number(weight),
      recyclable_kg: Number(recyclable),
      non_usable_kg: Number(nonUsable),
      entangled_animals: animals
        .map((a) => ({ animal: a.animal.trim(), condition: a.condition, entangled_in: a.entangled_in.trim() }))
        .filter((a) => a.animal),
      peculiar_item: peculiar.trim(),
      notes: notes.trim(),
    };
    setSubmitting(true);
    setError("");
    try {
      const res = await api.submitTrashReport(request.id, report);
      onFiled(report, res);
    } catch (err) {
      console.error("Failed to submit trash report:", err);
      setError(err.message || "The report couldn't be filed. Please try again.");
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
      <form
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Trash Collection Report</h3>
            <p className="mt-1 text-xs text-slate-500">
              {request.id} · Based on the International Coastal Cleanup data card
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <Section title="Cleanup site">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL}>Type of cleanup site</label>
                <select required value={siteType} onChange={(e) => setSiteType(e.target.value)} className={`${INPUT} bg-white`}>
                  <option value="" disabled>Choose the type of site</option>
                  {SITE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <NumberField label="People who worked on it" value={people} onChange={setPeople} required min="1" />
              <NumberField label="Time spent (hours)" value={hours} onChange={setHours} required step="0.25" placeholder="e.g. 2.5" />
              <NumberField label="Distance cleaned (km, optional)" value={distance} onChange={setDistance} step="0.1" />
            </div>
          </Section>

          <Section
            title="Items collected"
            hint="Count every piece found. Leave an item blank, or 0, if none were found."
          >
            {troidCount && (
              <p className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <Bot size={14} className="mt-0.5 shrink-0" />
                Filled in with what TROID counted. Check each item and correct it before filing.
              </p>
            )}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {TRASH_ITEMS.map((item) => (
                <div key={item}>
                  <label className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">{item}</span>
                    {troidCount && <span className="font-semibold text-sky-700">TROID counted: {troidCount[item] || 0}</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={items[item]}
                    placeholder="0"
                    onChange={(e) => setItems((prev) => ({ ...prev, [item]: stripLeadingZero(e.target.value) }))}
                    className={INPUT}
                    aria-label={item}
                  />
                </div>
              ))}
            </div>
            <p className="text-right text-xs text-slate-500">
              Total: <span className="font-semibold text-slate-700">{totalItems.toLocaleString()} pieces</span>
            </p>
          </Section>

          <Section title="Totals">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Bags filled" value={bags} onChange={setBags} required />
              <NumberField label="Total weight (kg)" value={weight} onChange={setWeight} required step="0.1" />
              <NumberField label="Recyclable (kg)" value={recyclable} onChange={setRecyclable} required step="0.1" />
              <NumberField label="Non-usable (kg)" value={nonUsable} onChange={setNonUsable} required step="0.1" />
            </div>
          </Section>

          <Section
            title="Entangled animals (optional)"
            hint="Any animal found caught in trash, whether it was alive or dead, and what it was caught in."
          >
            {animals.map((a, index) => (
              <div key={index} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-[1.2fr_0.8fr_1.2fr_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <label className={LABEL}>Animal</label>
                  <input required value={a.animal} maxLength={100} placeholder="e.g. Sea turtle" onChange={(e) => updateAnimal(index, "animal", e.target.value)} className={`${INPUT} bg-white`} />
                </div>
                <div>
                  <label className={LABEL}>Found</label>
                  <select value={a.condition} onChange={(e) => updateAnimal(index, "condition", e.target.value)} className={`${INPUT} bg-white`}>
                    {ANIMAL_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={LABEL}>Caught in</label>
                  <input value={a.entangled_in} maxLength={100} placeholder="e.g. Fishing line, net, rope" onChange={(e) => updateAnimal(index, "entangled_in", e.target.value)} className={`${INPUT} bg-white`} />
                </div>
                <button
                  type="button"
                  onClick={() => setAnimals((prev) => prev.filter((_, i) => i !== index))}
                  className="col-start-2 row-start-1 mb-1 justify-self-end rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-red-600 sm:col-start-auto sm:row-start-auto"
                  aria-label="Remove this animal"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAnimals((prev) => [...prev, blankAnimal()])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50"
            >
              <Plus size={14} />
              Add an entangled animal
            </button>
          </Section>

          <Section title="Most peculiar item collected (optional)">
            <input value={peculiar} maxLength={200} onChange={(e) => setPeculiar(e.target.value)} placeholder="e.g. A bowling ball" className={INPUT} aria-label="Most peculiar item collected" />
          </Section>

          <Section title="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any other observations..." className={INPUT} aria-label="Notes" />
          </Section>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
