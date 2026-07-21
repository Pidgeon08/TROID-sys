import { useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from 'react-router-dom';
import { Home, Map, FileText, Settings as SettingsIcon, LogOut, Shield, ClipboardList, Users, Bot, InboxIcon, Send, CalendarClock, Recycle, MapPin, UserCog } from 'lucide-react';

const navItems = {
  admin: [
    { to: '/admin/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/admin/manage-bots', icon: Bot, label: 'Bot Management' },
    { to: '/admin/users', icon: Users, label: 'User Management' },
    { to: '/admin/operators', icon: UserCog, label: 'Operator Management' },
    { to: '/admin/requests', icon: InboxIcon, label: 'Requests' },
    { to: '/admin/deployment', icon: CalendarClock, label: 'Deployment Schedule' },
    { to: '/admin/heatmap', icon: Map, label: 'Heatmap' },
    { to: '/admin/reports', icon: FileText, label: 'Report Generation' },
    { to: '/admin/audit', icon: ClipboardList, label: 'Audit Logs' },
    { to: '/admin/settings', icon: SettingsIcon, label: 'Settings' },
  ],
  mayorsoffice: [
    { to: '/mayorsoffice/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/mayorsoffice/requests', icon: InboxIcon, label: 'Requests' },
    { to: '/mayorsoffice/settings', icon: SettingsIcon, label: 'Settings' },
  ],
  barangay: [
    { to: '/barangay/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/barangay/areas', icon: MapPin, label: 'Collection Areas' },
    { to: '/barangay/requests', icon: InboxIcon, label: 'My Requests' },
    { to: '/barangay/request', icon: Send, label: 'Submit Request' },
    { to: '/barangay/heatmap', icon: Map, label: 'Bot Tracking' },
    { to: '/barangay/settings', icon: SettingsIcon, label: 'Settings' },
  ],
};

  const roleLabel = {
    admin: 'CENRO',
    mayorsoffice: 'Mayor\'s Office',
    barangay: 'Barangay',
  };
  const roleInitial = {
    admin: 'CE',
    mayorsoffice: 'MO',
    barangay: 'BG',
  };

  const Sidebar = ({ onLogout, userType = 'admin', currentUser = null }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const getNavLinkClass = (isActive) =>
    `flex items-center px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] group ${isActive ? 'bg-[#1b4de4] text-white shadow-[0_4px_12px_rgba(27,77,228,0.25)]' : ''
    }`;

  const getIconClass = (isActive) =>
    `w-5 h-5 mr-3.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
    }`;

  return (
    <>
    <aside className="w-[260px] bg-[#0c165a] text-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-10 shrink-0">
      {/* Brand Header */}
      <div className="p-6 flex items-center gap-3.5 border-b border-white/5">
        {/* CSS Mockup of San Fernando City Seal */}
        <div className="w-12 h-12 rounded-full border-2 border-[#b45309] bg-gradient-to-br from-blue-700 to-red-600 flex items-center justify-center shadow-[0_0_12px_rgba(255,255,255,0.1)] relative shrink-0 overflow-hidden">
          <div className="absolute inset-0.5 rounded-full border border-white/40 flex items-center justify-center bg-blue-900">
            <span className="text-[7px] font-bold text-white text-center leading-[9px] tracking-tighter">CENRO</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base leading-tight tracking-wide text-white">CENRO TROID bot</span>
          <span className="text-xs text-blue-300 font-medium mt-0.5">for cleaner waters</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-8 px-4 flex flex-col gap-2">
        {navItems[userType]?.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => getNavLinkClass(isActive)}>
            {({ isActive }) => (
              <>
                <item.icon className={getIconClass(isActive)} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Block */}
      <div className="p-4 border-t border-white/5 flex flex-col gap-4">
        {/* Logout button */}
        <button
          onClick={() => setShowLogoutModal(true)}
          className="flex items-center px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] bg-transparent border-none w-full cursor-pointer text-left group"
        >
          <LogOut className="w-5 h-5 mr-3.5 text-slate-400 group-hover:text-white" />
          <span>Logout</span>
        </button>

        {/* User Card */}
        <div className="bg-white/[0.06] border border-white/[0.03] rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-500/30 flex items-center justify-center text-slate-300 font-semibold text-sm">
              {roleInitial[userType] || 'AD'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">{currentUser?.name || 'John Admin'}</span>
              <span className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                <Shield className="w-3 h-3" /> {roleLabel[userType] || 'Admin'}
              </span>
            </div>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]"></div>
        </div>
      </div>
    </aside>
    {showLogoutModal && createPortal(
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={() => setShowLogoutModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Confirm Logout</h3>
            <p className="text-xs text-slate-500 mt-1">Are you sure you want to log out of your account?</p>
          </div>
          <div className="p-6 flex gap-3">
            <button
              onClick={() => setShowLogoutModal(false)}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowLogoutModal(false); onLogout(); }}
              className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default Sidebar;