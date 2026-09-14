import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ClipboardList, Settings as SettingsIcon, BookOpen } from "lucide-react";
import AuditLogs from "./AuditLogs";
import Settings from "./Settings";
import UserManual from "../../components/UserManual";

export default function Utilities() {
  const { currentUser } = useOutletContext() || {};
  const isAdmin = currentUser?.role === "admin";

  const TABS = [
    { key: "settings", label: "Settings", icon: SettingsIcon },
    { key: "manual", label: "User Manual", icon: BookOpen },
    ...(isAdmin ? [{ key: "audit", label: "Audit Logs", icon: ClipboardList }] : []),
  ];

  const [activeTab, setActiveTab] = useState("settings");

  return (
    <div className="animate-fade-in">
      <div className="max-w-350 mx-auto flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit mb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 ${
              activeTab === tab.key ? "bg-[#1b4de4] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <tab.icon className="w-4 h-4" />
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
    </div>
  );
}
