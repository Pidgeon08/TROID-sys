import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, FileText, MapPin, Volume2, VolumeX } from "lucide-react";
import api from "../services/api";
import { isAreaNotification, isRequestNotification, notifyNotificationsChanged, useUnreadNotifications } from "../hooks/useUnreadNotifications";
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from "../utils/notificationSound";

function routePrefix(userType) {
  if (userType === "mayorsoffice") return "mayorsoffice";
  if (userType === "barangay" || userType === "ngo") return "barangay";
  return "admin";
}

// Where a notification about a collection area opens; the City Admin has no Collection Areas page.
function areaPath(userType, areaId) {
  const id = encodeURIComponent(areaId);
  if (userType === "admin") return `/admin/collection-areas?area=${id}`;
  if (userType === "barangay" || userType === "ngo") return `/barangay/areas?area=${id}`;
  return "";
}

const TABS = [
  { key: "all", label: "All", matches: () => true },
  { key: "requests", label: "Requests", matches: isRequestNotification },
  { key: "areas", label: "Collection areas", matches: isAreaNotification },
];

function timeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * The bell: every notification the account gets, about requests and collection areas alike, each
 * opening what it is about. On the dashboards and the request lists of every side.
 */
const NotificationBell = ({ currentUser, userType, variant = "light" }) => {
  const unread = useUnreadNotifications(currentUser?.id);
  const unreadCount = unread.length;
  const [tab, setTab] = useState("all");
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The open list is fetched again whenever a notification arrives or is read, so it stays live.
  useEffect(() => {
    if (!open || !currentUser?.id) return undefined;
    let cancelled = false;
    api.notifications(currentUser.id)
      .then((list) => { if (!cancelled && Array.isArray(list)) setNotifications(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, unread, currentUser?.id]);

  const togglePanel = () => setOpen((wasOpen) => !wasOpen);

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
        notifyNotificationsChanged();
      } catch {
        // ignore
      }
    }
    setOpen(false);
    if (notif.request_id) {
      navigate(`/${routePrefix(userType)}/requests/${notif.request_id}`);
    } else if (notif.area_id && areaPath(userType, notif.area_id)) {
      navigate(areaPath(userType, notif.area_id));
    }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead(currentUser.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      notifyNotificationsChanged();
    } catch {
      // ignore
    }
  };

  // Tabs only when there is more than one kind to tell apart.
  const kinds = TABS.filter((t) => t.key !== "all" && notifications.some(t.matches));
  const activeTab = TABS.find((t) => t.key === tab && (t.key === "all" || kinds.includes(t))) || TABS[0];
  const shown = notifications.filter(activeTab.matches);

  if (!currentUser?.id) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={togglePanel}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          variant === "dark"
            ? "text-slate-300 hover:bg-white/10"
            : "text-slate-500 hover:bg-slate-100"
        }`}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute mt-2 w-[22rem] max-w-[calc(100vw-2rem)] max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg z-50 ${
          variant === "dark" ? "left-0" : "right-0"
        }`}>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <h3 className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-slate-800">
              Notifications{unreadCount > 0 && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">{unreadCount} new</span>}
            </h3>
            <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                title="Mark every notification as read"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={() => setSoundMuted(!muted)}
              aria-pressed={!muted}
              title={muted ? "Turn the notification sound on" : "Turn the notification sound off"}
              aria-label={muted ? "Sound off" : "Sound on"}
              className="inline-flex items-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            </div>
          </div>
          {kinds.length > 1 && (
            <div className="flex gap-1 border-b border-slate-100 px-3 py-2" role="tablist">
              {[TABS[0], ...kinds].map((t) => {
                const count = unread.filter(t.matches).length;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab.key === t.key}
                    onClick={() => setTab(t.key)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                      activeTab.key === t.key ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {t.label}{count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>
          )}
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">No notifications yet.</p>
          ) : (
            <ul>
              {shown.map((notif) => (
                <li key={notif.id}>
                  <button
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-2.5 ${
                      !notif.is_read ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        !notif.is_read ? "bg-blue-500" : "bg-transparent"
                      }`}
                    />
                    <span className="flex-1 min-w-0">
                      <p className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {isAreaNotification(notif) ? <MapPin size={10} /> : <FileText size={10} />}
                        {isAreaNotification(notif) ? `Collection area ${notif.area_id}` : `Request ${notif.request_id || ""}`}
                      </p>
                      <p className="text-sm font-medium text-slate-800">{notif.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{timeAgo(notif.created_at)}</p>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
