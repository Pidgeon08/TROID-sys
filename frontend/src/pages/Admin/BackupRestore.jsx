import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileJson, Loader2, PauseCircle, RotateCcw, Upload, X,
} from "lucide-react";
import api from "../../services/api";
import { UNAUTHORIZED_EVENT } from "../../services/session";
import { formatFileSize } from "../../constants/requests";
import FeatureChecklist from "../../components/FeatureChecklist";
import { setPauseRunningHere } from "../../hooks/useSystemPause";
import { countsInFile, featuresInFile, withNeeds } from "../../utils/backupFeatures";

const CONFIRM_WORD = "RESTORE";
const HEARTBEAT_MS = 15000;
const CARD = "bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY = `${BUTTON} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`;

function formatDate(iso) {
  if (!iso) return "an unknown date";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fileStamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/** A full-screen modal; its backdrop also keeps the navigation out of reach. */
function Modal({ icon: Icon, tone = "blue", step, title, children, footer, onClose, wide = false }) {
  const tones = { blue: "bg-blue-50 text-blue-600", red: "bg-red-50 text-red-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600" };
  return createPortal(
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title">
      <div className={`flex max-h-[calc(100vh-2rem)] w-full ${wide ? "max-w-2xl" : "max-w-md"} flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              {step && <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{step}</p>}
              <h3 id="backup-modal-title" className="text-lg font-bold text-slate-900">{title}</h3>
            </div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-5 text-sm text-slate-600">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <p className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {message}
    </p>
  );
}

function Notice({ tone = "amber", children }) {
  const tones = { amber: "border-amber-200 bg-amber-50 text-amber-800", blue: "border-blue-200 bg-blue-50 text-blue-800", slate: "border-slate-200 bg-slate-50 text-slate-700" };
  return <div className={`flex gap-2.5 rounded-lg border px-3 py-2.5 ${tones[tone]}`}><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{children}</div></div>;
}

const partsText = (feature, counts = null) => feature.parts
  .map((p) => `${(counts ? counts[p.model] || 0 : p.count).toLocaleString()} ${p.name}`)
  .join(" · ");

export default function BackupRestore() {
  // flow: null, "backup" or "restore"; step: "confirm", "choose", "overview" or "done".
  const [flow, setFlow] = useState(null);
  const [step, setStep] = useState(null);
  const [holding, setHolding] = useState(false); // this tab has the system paused
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [features, setFeatures] = useState([]);
  const [notIncluded, setNotIncluded] = useState([]);
  const [explicit, setExplicit] = useState(new Set());
  const [made, setMade] = useState(null); // the backup just made: { data, url, fileName, size }
  const [file, setFile] = useState(null); // the backup file chosen to restore
  const [fileError, setFileError] = useState("");
  const [preview, setPreview] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [restored, setRestored] = useState(null);

  const chosen = useMemo(() => withNeeds([...explicit], features), [explicit, features]);
  const chosenFeatures = features.filter((f) => chosen.includes(f.key));
  const fileFeatures = useMemo(() => (file && features.length ? new Set(featuresInFile(file.backup, features)) : null), [file, features]);
  const fileCounts = useMemo(() => (file && features.length ? countsInFile(file.backup, features) : {}), [file, features]);

  // While this tab holds the pause: keep it alive, keep this tab clear of the "paused" screen,
  // warn before leaving, and resume the system if the page goes away mid-way.
  const holdingRef = useRef(false);
  useEffect(() => {
    holdingRef.current = holding;
    setPauseRunningHere(holding);
    if (!holding) return undefined;
    const beat = setInterval(() => {
      api.pauseHeartbeat().catch(() => {
        setHolding(false);
        setError("The pause ended because the server stopped hearing from this page. Start again.");
        setStep("confirm");
      });
    }, HEARTBEAT_MS);
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(beat);
      window.removeEventListener("beforeunload", warn);
    };
  }, [holding]);
  useEffect(() => () => {
    setPauseRunningHere(false);
    if (holdingRef.current) api.endPause().catch(() => {});
  }, []);

  useEffect(() => () => { if (made?.url) URL.revokeObjectURL(made.url); }, [made]);

  const close = () => {
    setFlow(null);
    setStep(null);
    setError("");
    setPreview(null);
    setConfirmText("");
  };

  const cancel = async () => {
    if (holding) {
      setBusy(true);
      try {
        await api.endPause();
      } catch (err) {
        console.error("Couldn't resume the system:", err);
      } finally {
        setBusy(false);
      }
      setHolding(false);
    }
    close();
  };

  const open = (kind) => {
    setFlow(kind);
    setStep("confirm");
    setError("");
  };

  // Step 1 → 2: pause the system, then list the features to choose from.
  const proceed = async () => {
    setBusy(true);
    setError("");
    try {
      await api.startPause(flow);
      setHolding(true);
      const list = await api.backupFeatures();
      setFeatures(list.features || []);
      setNotIncluded(list.not_included || []);
      const keys = (list.features || []).map((f) => f.key);
      const inFile = flow === "restore" ? new Set(featuresInFile(file.backup, list.features || [])) : null;
      setExplicit(new Set(inFile ? keys.filter((k) => inFile.has(k)) : keys));
      setStep("choose");
    } catch (err) {
      setError(err.message || "The system couldn't be paused. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Step 2 → 3: the overview (for a restore, what it would change).
  const review = async () => {
    setError("");
    if (flow === "restore") {
      setBusy(true);
      try {
        setPreview(await api.previewRestore(file.text, chosen));
        setConfirmText("");
        setStep("overview");
      } catch (err) {
        setError(err.message || "The backup couldn't be checked.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setStep("overview");
  };

  const createBackup = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await api.createBackup(chosen);
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      setHolding(false); // making the backup resumed the system
      setMade({ data, url: URL.createObjectURL(blob), size: blob.size, fileName: `troid-backup-${fileStamp(data.created_at)}.json` });
      setStep("done");
    } catch (err) {
      setError(err.message || "The backup couldn't be made. Try again or cancel.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (confirmText !== CONFIRM_WORD) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.restoreBackup(file.text, chosen);
      setHolding(false); // the restore resumed the system
      setRestored(result);
      setFile(null);
      setStep("done");
    } catch (err) {
      setError(err.message || "The backup couldn't be restored. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const finishRestore = () => {
    const signedOut = restored && !restored.still_signed_in;
    close();
    // Backups carry no sign-in sessions, and this account isn't the same admin in the backup.
    if (signedOut) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  };

  const handleFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    setFile(null);
    setFileError("");
    setRestored(null);
    if (!picked) return;
    try {
      const text = await picked.text();
      const parsed = JSON.parse(text);
      if (parsed?.format !== "troid-backup" || !Array.isArray(parsed.records)) throw new Error("not a backup");
      // Only the summary is kept parsed; the text is sent to the server as it is.
      const backup = { created_at: parsed.created_at, version: parsed.version, features: parsed.features, counts: parsed.counts || {}, records: parsed.records.length };
      setFile({ name: picked.name, size: picked.size, text, backup });
    } catch {
      setFileError("That file isn't a TROID backup. Choose a file made with Back up.");
    }
  };

  const restoreChanges = preview ? Object.values(preview.changes || {}) : [];
  const restoredTables = restoreChanges.filter((c) => c.restored);
  const alsoRemoved = restoreChanges.filter((c) => !c.restored && c.removed);
  const leftOut = features.filter((f) => !chosen.includes(f.key));
  const totalRecords = chosenFeatures.reduce((sum, f) => sum + f.records, 0);
  const restoring = flow === "restore";
  const word = restoring ? "restore" : "back up";

  return (
    <div className="max-w-350 mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <section className={CARD}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <DatabaseBackup className="w-5 h-5" />
          </div>
          <h2 className="text-[17px] font-bold text-slate-900">Back up</h2>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Saves the parts of the system you choose (accounts, robots and operators, collection areas, requests,
          schedules, detections, notifications, disposal records) as one file.
        </p>
        <ul className="text-xs text-slate-500 space-y-1 mb-5 list-disc pl-4">
          <li>The system is paused for everyone else until you finish or cancel.</li>
          <li>The audit log is never included; it keeps a record of every backup and restore.</li>
          <li>Keep the file private. Accounts hold password hashes, and robots their device keys.</li>
          <li>Task status updates from the Companion app are stored separately and aren't included.</li>
        </ul>
        <button type="button" onClick={() => open("backup")} className={`${BUTTON} bg-[#1b4de4] text-white hover:bg-[#153eb8]`}>
          <DatabaseBackup size={16} /> Back up
        </button>
        {made && !flow && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            Made a backup at {formatDate(made.data.created_at)} ({plural(made.data.records.length, "record")}).
            <a href={made.url} download={made.fileName} className="font-medium text-blue-600 hover:text-blue-700">Download it</a>
          </p>
        )}
      </section>

      <section className={CARD}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <h2 className="text-[17px] font-bold text-slate-900">Restore</h2>
        </div>
        <div className="mb-4">
          <Notice>
            Restoring puts the parts you choose back as they were in the backup: anything added to them since is removed.
            Other parts and the audit log are left as they are. Make a backup of the current data first.
          </Notice>
        </div>

        {!file ? (
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500/30">
              <Upload size={16} />
              Choose backup file
              <input type="file" accept=".json,application/json" onChange={handleFile} className="sr-only" />
            </label>
            {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex min-w-0 gap-2.5">
                <FileJson size={18} className="mt-0.5 shrink-0 text-blue-600" />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    Made {formatDate(file.backup.created_at)} &bull; {formatFileSize(file.size)} &bull; {plural(file.backup.records, "record")}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setFile(null)} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600" aria-label="Remove file">
                <X size={16} />
              </button>
            </div>
            <button type="button" onClick={() => open("restore")} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>
              <RotateCcw size={16} /> Restore from this backup
            </button>
          </div>
        )}

        {restored && !flow && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 size={16} />
            Restored {restored.features.length} part{restored.features.length === 1 ? "" : "s"} of the system. Other pages show the restored data when you open them.
          </p>
        )}
      </section>

      {/* Step 1: confirm, before the system is paused */}
      {flow && step === "confirm" && (
        <Modal
          icon={PauseCircle}
          tone={restoring ? "red" : "blue"}
          step="Step 1 of 3"
          title={restoring ? "Restore from this backup?" : "Back up the current data?"}
          onClose={busy ? undefined : cancel}
          footer={(
            <>
              <button type="button" onClick={cancel} disabled={busy} className={SECONDARY}>Cancel</button>
              <button type="button" onClick={proceed} disabled={busy} className={`${BUTTON} ${restoring ? "bg-red-600 hover:bg-red-700" : "bg-[#1b4de4] hover:bg-[#153eb8]"} text-white`}>
                {busy && <Loader2 size={16} className="animate-spin" />} Proceed
              </button>
            </>
          )}
        >
          <p>
            {restoring
              ? <>You are about to restore data from <strong className="text-slate-800">{file?.name}</strong>, made {formatDate(file?.backup.created_at)}.</>
              : "You are about to make a backup of the data in the system."}
          </p>
          <div className="mt-4">
            <Notice>
              When you proceed, <strong>the system is paused for everyone</strong>: nobody can make changes, sign in, or use the
              Companion app, and the robots' reports wait, until you finish or cancel. It is noted in the audit log.
            </Notice>
          </div>
          <p className="mt-3 text-xs text-slate-500">Next you choose which parts of the system to {word}.</p>
          <ErrorNote message={error} />
        </Modal>
      )}

      {/* Step 2: choose the features */}
      {flow && step === "choose" && (
        <Modal
          icon={restoring ? RotateCcw : DatabaseBackup}
          tone={restoring ? "red" : "blue"}
          step={`Step 2 of 3 · System paused`}
          title={restoring ? "Choose what to restore" : "Choose what to back up"}
          wide
          footer={(
            <>
              <button type="button" onClick={cancel} disabled={busy} className={SECONDARY}>Cancel {word}</button>
              <button type="button" onClick={review} disabled={busy || chosen.length === 0} className={`${BUTTON} bg-[#1b4de4] text-white hover:bg-[#153eb8]`}>
                {busy && <Loader2 size={16} className="animate-spin" />} Review
              </button>
            </>
          )}
        >
          <FeatureChecklist
            features={features}
            explicit={explicit}
            onChange={setExplicit}
            available={restoring ? fileFeatures : null}
            detail={(f) => (restoring
              ? `In the backup: ${plural(fileCounts[f.key] || 0, "record")} · now: ${plural(f.records, "record")}`
              : partsText(f))}
          />
          <p className="mt-3 text-xs text-slate-500">
            Never included: {notIncluded.join(", ").toLowerCase() || "audit log"}.
          </p>
          <ErrorNote message={error} />
        </Modal>
      )}

      {/* Step 3: overview to confirm */}
      {flow === "backup" && step === "overview" && (
        <Modal
          icon={DatabaseBackup}
          step="Step 3 of 3 · System paused"
          title="Confirm the backup"
          wide
          footer={(
            <>
              <button type="button" onClick={cancel} disabled={busy} className={SECONDARY}>Cancel backup</button>
              <button type="button" onClick={() => setStep("choose")} disabled={busy} className={SECONDARY}>Back</button>
              <button type="button" onClick={createBackup} disabled={busy} className={`${BUTTON} bg-[#1b4de4] text-white hover:bg-[#153eb8]`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />} Create backup
              </button>
            </>
          )}
        >
          <p className="mb-2 font-semibold text-slate-800">Backing up {plural(totalRecords, "record")}:</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {chosenFeatures.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="block font-medium text-slate-800">{f.label}</span>
                  <span className="block text-xs text-slate-500">{partsText(f)}</span>
                </span>
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <span className="font-semibold text-slate-800">Not included: </span>
            {[...notIncluded, ...leftOut.map((f) => f.label)].join(", ")}.
          </p>
          {(chosen.includes("accounts") || chosen.includes("fleet")) && (
            <div className="mt-3"><Notice>Keep the file private: it holds password hashes and the robots' device keys.</Notice></div>
          )}
          <p className="mt-3 text-xs text-slate-500">The backup is noted in the audit log, and the system resumes as soon as it is made.</p>
          <ErrorNote message={error} />
        </Modal>
      )}

      {flow === "restore" && step === "overview" && preview && (
        <Modal
          icon={RotateCcw}
          tone="red"
          step="Step 3 of 3 · System paused"
          title="Confirm the restore"
          wide
          footer={(
            <>
              <button type="button" onClick={cancel} disabled={busy} className={SECONDARY}>Cancel restore</button>
              <button type="button" onClick={() => setStep("choose")} disabled={busy} className={SECONDARY}>Back</button>
              <button type="button" onClick={restore} disabled={busy || confirmText !== CONFIRM_WORD} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Restore
              </button>
            </>
          )}
        >
          <p className="mb-2 font-semibold text-slate-800">Restoring {backupLabels(preview.features, features)}:</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Records</th>
                  <th className="px-3 py-2 text-right font-semibold">In backup</th>
                  <th className="px-3 py-2 text-right font-semibold">Put back</th>
                  <th className="px-3 py-2 text-right font-semibold">Added</th>
                  <th className="px-3 py-2 text-right font-semibold">Removed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {restoredTables.map((c) => (
                  <tr key={c.name}>
                    <td className="px-3 py-2 font-medium capitalize text-slate-700">{c.name}</td>
                    <td className="px-3 py-2 text-right">{c.in_backup.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{c.updated.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{c.added.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right ${c.removed ? "font-semibold text-red-600" : ""}`}>{c.removed.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2">
            {alsoRemoved.length > 0 && (
              <Notice>
                Also removed, because they belong to records the restore removes:{" "}
                {alsoRemoved.map((c) => `${c.removed.toLocaleString()} ${c.name}`).join(", ")}.
              </Notice>
            )}
            {preview.features.includes("accounts") && (
              <Notice>Everyone else is signed out, because backups hold no sign-in sessions.</Notice>
            )}
            <Notice tone="slate">
              Not restored, and left as they are: the audit log
              {leftOut.length ? `, ${leftOut.map((f) => f.label.toLowerCase()).join(", ")}` : ""}.
            </Notice>
          </div>
          <label htmlFor="restore-confirm" className="mt-4 mb-1 block text-xs font-medium text-slate-500">
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id="restore-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
          <p className="mt-3 text-xs text-slate-500">The restore is noted in the audit log, and the system resumes as soon as it is done.</p>
          <ErrorNote message={error} />
        </Modal>
      )}

      {/* Done */}
      {flow === "backup" && step === "done" && made && (
        <Modal
          icon={CheckCircle2}
          tone="green"
          title="Backup ready"
          onClose={close}
          footer={(
            <>
              <button type="button" onClick={close} className={SECONDARY}>Close</button>
              <a href={made.url} download={made.fileName} className={`${BUTTON} bg-[#1b4de4] text-white hover:bg-[#153eb8]`}>
                <Download size={16} /> Download backup
              </a>
            </>
          )}
        >
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <FileJson size={18} className="mt-0.5 shrink-0 text-blue-600" />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{made.fileName}</p>
              <p className="text-xs text-slate-500">{formatFileSize(made.size)} &bull; {plural(made.data.records.length, "record")}</p>
              <p className="text-xs text-slate-500">{backupLabels(made.data.features, features)}</p>
            </div>
          </div>
          <p className="mt-3">The system has resumed, and the backup is noted in the audit log. Download the file to keep it.</p>
        </Modal>
      )}

      {flow === "restore" && step === "done" && restored && (
        <Modal
          icon={CheckCircle2}
          tone="green"
          title="Restore complete"
          onClose={finishRestore}
          footer={<button type="button" onClick={finishRestore} className={`${BUTTON} bg-[#1b4de4] text-white hover:bg-[#153eb8]`}>Done</button>}
        >
          <p>Restored {backupLabels(restored.features, features)} ({plural(restored.records, "record")}).</p>
          <p className="mt-2">The system has resumed, and the restore is noted in the audit log, which was not changed.</p>
          {!restored.still_signed_in && (
            <div className="mt-3"><Notice>Your account isn't in the backup as the same admin, so you'll be signed out.</Notice></div>
          )}
        </Modal>
      )}
    </div>
  );
}

function backupLabels(keys, features) {
  const labels = new Map(features.map((f) => [f.key, f.label]));
  return (keys || []).map((key) => labels.get(key) || key).join(", ");
}
