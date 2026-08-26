import { useState } from "react";
import { ClipboardList, Settings as SettingsIcon } from "lucide-react";
import AuditLogs from "./AuditLogs";
import Settings from "./Settings";

const TABS = [
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "audit", label: "Audit Logs", icon: ClipboardList },
];

export default function Utilities() {
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

      {activeTab === "settings" ? <Settings /> : <AuditLogs />}
    </div>
  );
}
