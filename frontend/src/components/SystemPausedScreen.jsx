import { useState } from "react";
import { DatabaseBackup, Loader2, RotateCcw } from "lucide-react";
import api from "../services/api";

function since(iso) {
  return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}

/**
 * Covers the whole app (navigation included) while the system is paused for a backup or
 * restore. It lifts by itself once the pause ends.
 */
export default function SystemPausedScreen({ pause, isMine, onResumed }) {
  const [resuming, setResuming] = useState(false);
  // The admin who started it can end it from here, e.g. after reloading the page mid-way.
  const resume = () => {
    setResuming(true);
    api.endPause().catch(() => {}).finally(() => { setResuming(false); onResumed?.(); });
  };
  const restoring = pause.kind === "restore";
  const Icon = restoring ? RotateCcw : DatabaseBackup;
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="system-paused-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-2xl">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${restoring ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h2 id="system-paused-title" className="text-lg font-bold text-slate-900">
          System paused for a {restoring ? "restore" : "backup"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {isMine
            ? `You started ${restoring ? "a restore" : "a backup"} that isn't finished, in another tab or before reloading this page.`
            : `${pause.started_by || "An admin"} is ${restoring ? "restoring" : "backing up"} the data${pause.started_at ? ` (since ${since(pause.started_at)})` : ""}. Nothing can be changed until it is finished.`}
        </p>
        {isMine && (
          <button
            type="button"
            onClick={resume}
            disabled={resuming}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] disabled:opacity-60"
          >
            {resuming && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancel it and resume the system
          </button>
        )}
        <p className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          This page continues by itself when it is done.
        </p>
      </div>
    </div>
  );
}
