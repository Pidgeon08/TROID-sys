import { useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileJson, RotateCcw, Upload, X } from "lucide-react";
import api from "../../services/api";
import { UNAUTHORIZED_EVENT } from "../../services/session";
import { formatFileSize } from "../../constants/requests";

const CONFIRM_WORD = "RESTORE";

const SUMMARY = [
  ["troid_api.request", "requests"],
  ["troid_api.user", "accounts"],
  ["troid_api.collectionarea", "collection areas"],
  ["troid_api.boat", "bots"],
];

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

function summarize(backup) {
  const counts = backup.counts || {};
  return SUMMARY.map(([model, label]) => `${counts[model] || 0} ${label}`).join(", ");
}

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6";

export default function BackupRestore() {
  const [downloading, setDownloading] = useState(false);
  const [lastDownload, setLastDownload] = useState(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoredCount, setRestoredCount] = useState(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const backup = await api.downloadBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `troid-backup-${fileStamp(backup.created_at)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setLastDownload(backup);
    } catch (err) {
      console.error("Backup failed:", err);
      alert(err.message || "The backup couldn't be made. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setFileError("");
    setConfirmText("");
  };

  const handleFile = async (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    clearFile();
    setRestoredCount(null);
    if (!chosen) return;
    try {
      const text = await chosen.text();
      const backup = JSON.parse(text);
      if (backup?.format !== "troid-backup" || !Array.isArray(backup.records)) throw new Error("not a backup");
      setFile({ name: chosen.name, size: chosen.size, text, backup });
    } catch {
      setFileError("That file isn't a TROID backup. Choose a file downloaded from Back up.");
    }
  };

  const handleRestore = async () => {
    if (!file || confirmText !== CONFIRM_WORD) return;
    setRestoring(true);
    try {
      const result = await api.restoreBackup(file.text);
      clearFile();
      if (!result.still_signed_in) {
        // Backups carry no sign-in sessions, and this account isn't the same admin in the backup.
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        return;
      }
      setRestoredCount(result.restored);
    } catch (err) {
      console.error("Restore failed:", err);
      alert(err.message || "The backup couldn't be restored. Nothing was changed.");
    } finally {
      setRestoring(false);
    }
  };

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
          Downloads everything in the system as one file: requests and their letters and photos, accounts, collection
          areas, bots, schedules, reports and the audit log.
        </p>
        <ul className="text-xs text-slate-500 space-y-1 mb-5 list-disc pl-4">
          <li>Keep the file private. It contains password hashes and the robots' device keys.</li>
          <li>Sign-in sessions aren't included.</li>
          <li>Task status updates from the Companion app are stored separately and aren't included.</li>
        </ul>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] disabled:opacity-60"
        >
          <Download size={16} />
          {downloading ? "Preparing backup..." : "Download backup"}
        </button>
        {lastDownload && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            Saved a backup from {formatDate(lastDownload.created_at)} ({lastDownload.records.length} records).
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
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Restoring replaces everything in the system with the backup. Anything added after the backup was made is lost,
            and everyone else is signed out. Download a backup of the current data first.
          </p>
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
                    Made {formatDate(file.backup.created_at)} &bull; {formatFileSize(file.size)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{summarize(file.backup)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label="Remove file"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label htmlFor="restore-confirm" className="mb-1 block text-xs font-medium text-slate-500">
                Type {CONFIRM_WORD} to confirm
              </label>
              <input
                id="restore-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <button
              type="button"
              onClick={handleRestore}
              disabled={confirmText !== CONFIRM_WORD || restoring}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <RotateCcw size={16} />
              {restoring ? "Restoring..." : "Restore this backup"}
            </button>
          </div>
        )}

        {restoredCount !== null && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 size={16} />
            Restored {restoredCount} records. Other pages show the restored data when you open them.
          </p>
        )}
      </section>
    </div>
  );
}
