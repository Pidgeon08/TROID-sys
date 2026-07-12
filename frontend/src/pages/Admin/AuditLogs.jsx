import { useMemo, useState, useEffect } from "react";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Bot,
  FileText,
  Settings,
  Users,
} from "lucide-react";
import api from '../../services/api';

const MODULES = [
  "All modules",
  "Bot Management",
  "User Management",
  "Settings",
  "Collection Schedule",
  "Report Generation",
  "Requests",
];

const ACTIONS = [
  "All actions",
  "Bot deployed",
  "Report generated",
  "Login failed",
  "Settings updated",
  "Schedule edited",
  "Bot alert",
  "User removed",
  "Request approved",
];

const STATUS_STYLES = {
  success: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
};

const MODULE_ICONS = {
  "Bot Management": Bot,
  "User Management": Users,
  Settings: Settings,
  "Report Generation": FileText,
};

const PAGE_SIZE = 8;

const AuditLogs = () => {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("All actions");
  const [module, setModule] = useState("All modules");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auditLogs().then((data) => {
      const mapped = Array.isArray(data) ? data.map((l) => ({
        id: l.id,
        time: l.time || new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        user: l.user || 'System',
        role: l.role || '-',
        action: l.action || '-',
        details: l.details || '',
        module: l.module || '-',
        ip: l.ip || '-',
        status: l.status || 'success',
      })) : [];
      setLogs(mapped);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const matchesQuery =
        query.trim() === "" ||
        [log.user, log.action, log.details, log.module]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchesAction = action === "All actions" || log.action === action;
      const matchesModule = module === "All modules" || log.module === module;
      return matchesQuery && matchesAction && matchesModule;
    });
  }, [logs, query, action, module]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(
    () => ({
      total: logs.length,
      failed: logs.filter((l) => l.status === "failed").length,
      configChanges: logs.filter((l) => l.action === "Settings updated").length,
      activeAdmins: new Set(
        logs.filter((l) => l.role === "Admin").map((l) => l.user)
      ).size,
    }),
    [logs]
  );

  const updateFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">Loading audit logs...</span>
        </div>
      )}
      {!loading && (
      <>
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Audit Logs</h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">View system audit logs here.</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <StatCard label="Total events today" value={stats.total} />
        <StatCard label="Failed logins" value={stats.failed} tone="danger" />
        <StatCard label="Config changes" value={stats.configChanges} />
        <StatCard label="Active admins" value={stats.activeAdmins} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => updateFilter(setQuery)(e.target.value)}
            placeholder="Search by user, action, or module"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>

        <select
          value={action}
          onChange={(e) => updateFilter(setAction)(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 bg-white text-slate-700 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {ACTIONS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>

        <select
          value={module}
          onChange={(e) => updateFilter(setModule)(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 bg-white text-slate-700 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {MODULES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>

        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg py-2 px-3 bg-white hover:bg-slate-50 transition-colors"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <Th>Timestamp</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Details</Th>
                <Th>Module</Th>
                <Th>IP Address</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((log) => {
                const Icon = MODULE_ICONS[log.module];
                return (
                  <tr
                    key={log.id}
                    className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    <Td className="text-slate-700 whitespace-nowrap">
                      {log.time}
                    </Td>
                    <Td className="text-slate-700">
                      <div className="font-medium">{log.user}</div>
                      <div className="text-xs text-slate-400">{log.role}</div>
                    </Td>
                    <Td className="text-slate-700">{log.action}</Td>
                    <Td className="text-slate-500 max-w-[240px] truncate">
                      {log.details}
                    </Td>
                    <Td className="text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        {Icon ? <Icon size={13} className="text-slate-400" /> : null}
                        {log.module}
                      </span>
                    </Td>
                    <Td className="text-slate-500 whitespace-nowrap">{log.ip}</Td>
                    <Td>
                      <span
                        className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[log.status]}`}
                      >
                        {log.status}
                      </span>
                    </Td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-slate-400 text-sm py-10"
                  >
                    No audit log entries match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
        <span>
          Showing {pageRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
          {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                n === page
                  ? "bg-[#1b4de4] text-white border-[#1b4de4]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, tone }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3.5">
    <div className="text-xs text-slate-400">{label}</div>
    <div
      className={`text-xl font-semibold mt-0.5 ${
        tone === "danger" ? "text-red-700" : "text-slate-800"
      }`}
    >
      {value}
    </div>
  </div>
);

const Th = ({ children }) => (
  <th className="px-4 py-2.5 font-medium whitespace-nowrap">{children}</th>
);

const Td = ({ children, className = "" }) => (
  <td className={`px-4 py-2.5 ${className}`}>{children}</td>
);

export default AuditLogs;
