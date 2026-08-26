import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import api from "../services/api";

const POLL_INTERVAL = 30000;

function routePrefix(userType) {
  if (userType === "mayorsoffice") return "mayorsoffice";
  if (userType === "barangay" || userType === "ngo") return "barangay";
  return "admin";
}

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

const NotificationBell = ({ currentUser, userType, variant = "light" }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchUnread = () => {
      api.unreadNotificationCount(currentUser.id)
        .then((res) => setUnreadCount(res.unread_count || 0))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const togglePanel = () => {
    const next = !open;
    setOpen(next);
    if (next && currentUser?.id) {
      api.notifications(currentUser.id).then(setNotifications).catch(() => {});
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // ignore
      }
    }
    setOpen(false);
    if (notif.request_id) {
      navigate(`/${routePrefix(userType)}/requests/${notif.request_id}`);
    }
  };

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
        <div className={`absolute mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg z-50 ${
          variant === "dark" ? "left-0" : "right-0"
        }`}>
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">No notifications yet.</p>
          ) : (
            <ul>
              {notifications.map((notif) => (
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
