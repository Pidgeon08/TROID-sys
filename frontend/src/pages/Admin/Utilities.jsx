import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ClipboardList, Settings as SettingsIcon, BookOpen, DatabaseBackup } from "lucide-react";
import AuditLogs from "./AuditLogs";
import Settings from "./Settings";
import BackupRestore from "./BackupRestore";
import UserManual from "../../components/UserManual";

export default function Utilities() {
  const { currentUser } = useOutletContext() || {};
  const isAdmin = currentUser?.role === "admin";

  const TABS = [
    { key: "settings", label: "Settings", icon: SettingsIcon },
    { key: "manual", label: "User Manual", icon: BookOpen },
    ...(isAdmin ? [
      { key: "audit", label: "Audit Logs", icon: ClipboardList },
      { key: "backup", label: "Backup & Restore", icon: DatabaseBackup },
    ] : []),
  ];

  const [activeTab, setActiveTab] = useState("settings");

  return (
    <div className="animate-fade-in">
      {/* The tabs wrap onto another row when the page is narrow, rather than squeezing their labels. */}
      <div className="mx-auto mb-4 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-xl bg-slate-100 p-1" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 ${
              activeTab === tab.key ? "bg-[#1b4de4] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <tab.icon className="w-4 h-4 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "settings" && <Settings />}
      {activeTab === "manual" && (
        <div className="max-w-350 mx-auto bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <UserManual />
        </div>
      )}
      {activeTab === "audit" && isAdmin && <AuditLogs />}
      {activeTab === "backup" && isAdmin && <BackupRestore />}
    </div>
  );
}
