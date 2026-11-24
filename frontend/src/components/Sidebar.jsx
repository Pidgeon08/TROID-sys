import { useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from 'react-router-dom';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import { UnreadDot } from './ui/UnreadDot';
import seal from '../assets/seal.png';
import { Home, Map, FileText, LogOut, Shield, Users, Bot, InboxIcon, CalendarClock, MapPin, UserCog, Wrench, ChevronDown, LayoutGrid, ClipboardList } from 'lucide-react';

const ITEM_PADDING = 'py-[clamp(0.3rem,1.1vh,0.75rem)]';

const navItems = {
  admin: [
    { to: '/admin/dashboard', icon: Home, label: 'Dashboard' },
    {
      type: 'group',
      icon: LayoutGrid,
      label: 'Management',
      children: [
        { to: '/admin/manage-bots', icon: Bot, label: 'Bot Management' },
        { to: '/admin/users', icon: Users, label: 'User Management' },
        { to: '/admin/operators', icon: UserCog, label: 'Operator Management' },
      ],
    },
    { to: '/admin/requests', icon: InboxIcon, label: 'Requests', hasNotifications: true },
    { to: '/admin/task-status-updates', icon: ClipboardList, label: 'Task Status Updates' },
    { to: '/admin/collection-areas', icon: MapPin, label: 'Collection Areas' },
    { to: '/admin/deployment', icon: CalendarClock, label: 'Deployment Schedule' },
    { to: '/admin/heatmap', icon: Map, label: 'Heatmap' },
    { to: '/admin/reports', icon: FileText, label: 'Report Generation' },
    { to: '/admin/utilities', icon: Wrench, label: 'Utilities' },
  ],
  mayorsoffice: [
    { to: '/mayorsoffice/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/mayorsoffice/requests', icon: InboxIcon, label: 'Requests', hasNotifications: true },
    { to: '/mayorsoffice/utilities', icon: Wrench, label: 'Utilities' },
  ],
  barangay: [
    { to: '/barangay/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/barangay/areas', icon: MapPin, label: 'Collection Areas' },
    { to: '/barangay/requests', icon: InboxIcon, label: 'Requests', hasNotifications: true, activeFor: /^\/barangay\/requests?(\/|$)/ },
    { to: '/barangay/heatmap', icon: Map, label: 'Bot Tracking' },
    { to: '/barangay/utilities', icon: Wrench, label: 'Utilities' },
  ],
  ngo: [
    { to: '/barangay/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/barangay/areas', icon: MapPin, label: 'Collection Areas' },
    { to: '/barangay/requests', icon: InboxIcon, label: 'Requests', hasNotifications: true, activeFor: /^\/barangay\/requests?(\/|$)/ },
    { to: '/barangay/heatmap', icon: Map, label: 'Bot Tracking' },
    { to: '/barangay/utilities', icon: Wrench, label: 'Utilities' },
  ],
};

  const roleLabel = {
    admin: 'CENRO',
    mayorsoffice: 'City Admin',
    barangay: 'Barangay',
    ngo: 'NGO',
  };
  const roleInitial = {
    admin: 'CE',
    mayorsoffice: 'MO',
    barangay: 'BG',
    ngo: 'NG',
  };

  const Sidebar = ({ onLogout, userType = 'admin', currentUser = null }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
  const unreadCount = useUnreadNotifications(currentUser?.id).length;

  const items = navItems[userType] || [];
  const groupContainsActive = (item) =>
    item.type === 'group' && item.children.some((child) => location.pathname.startsWith(child.to));

  const [openGroup, setOpenGroup] = useState(() => {
    const active = items.find(groupContainsActive);
    return active ? active.label : null;
  });

  // Spacing follows the window's height, so the whole sidebar fits on short screens (a laptop at
  // 125-150% scaling) without scrolling. Below 700px high, Logout moves into the user card.
  const getNavLinkClass = (isActive) =>
    `flex items-center px-4 ${ITEM_PADDING} text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] group ${isActive ? 'bg-[#1b4de4] text-white shadow-[0_4px_12px_rgba(27,77,228,0.25)]' : ''
    }`;

  // An item can also be lit on other pages, e.g. the barangay's Requests on its Submit Request page.
  const isAlsoActive = (item) => Boolean(item.activeFor?.test(location.pathname));

  const getIconClass = (isActive) =>
    `w-5 h-5 mr-3.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
    }`;

  return (
    <>
    <aside className="w-[260px] h-full overflow-hidden bg-[#0c165a] text-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-10 shrink-0 print:hidden">
      {/* Brand Header */}
      <div className="px-5 py-[clamp(0.75rem,2.5vh,1.25rem)] flex items-center gap-3 border-b border-white/5 shrink-0">
        <img src={seal} alt="City of San Fernando seal" className="w-[clamp(2.75rem,7.5vh,4rem)] h-[clamp(2.75rem,7.5vh,4rem)] shrink-0 rounded-full drop-shadow-[0_0_8px_rgba(255,255,255,0.12)]" />
        <div className="flex flex-col">
          <span className="font-bold text-base leading-tight tracking-wide text-white whitespace-nowrap">CENRO TROID bot</span>
          <span className="text-xs text-blue-300 font-medium mt-0.5">for cleaner waters</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 py-[clamp(0.5rem,3vh,2rem)] px-4 flex flex-col gap-[clamp(0.125rem,0.6vh,0.5rem)]">
        {items.map((item) => {
          const anyGroupOpen = openGroup !== null;
          if (item.type === 'group') {
            const isOpen = openGroup === item.label;
            const isGroupActive = groupContainsActive(item);
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : item.label)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center px-4 ${ITEM_PADDING} text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] group ${isGroupActive && !isOpen ? 'bg-[#1b4de4] text-white shadow-[0_4px_12px_rgba(27,77,228,0.25)]' : ''
                  }`}
                >
                  <item.icon className={getIconClass(isGroupActive && !isOpen)} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-1 pt-1 pl-4">
                      {item.children.map((child) => (
                        <NavLink key={child.to} to={child.to} className={({ isActive }) => getNavLinkClass(isActive)}>
                          {({ isActive }) => (
                            <>
                              <child.icon className={getIconClass(isActive)} />
                              <span>{child.label}</span>
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div
              key={item.to}
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{ gridTemplateRows: anyGroupOpen ? '0fr' : '1fr' }}
            >
              <div className="overflow-hidden">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `${getNavLinkClass(isActive || isAlsoActive(item))} transition-opacity duration-200 ${anyGroupOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={getIconClass(isActive || isAlsoActive(item))} />
                      <span>{item.label}</span>
                      {item.hasNotifications && unreadCount > 0 && (
                        <UnreadDot className="ml-auto shadow-[0_0_8px_#ef4444]" />
                      )}
                    </>
                  )}
                </NavLink>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer Block */}
      <div className="p-[clamp(0.75rem,2vh,1rem)] border-t border-white/5 flex flex-col gap-[clamp(0.5rem,1.5vh,1rem)] shrink-0">
        {/* Logout button */}
        <button
          onClick={() => setShowLogoutModal(true)}
          className={`[@media(max-height:700px)]:hidden flex items-center px-4 ${ITEM_PADDING} text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] bg-transparent border-none w-full cursor-pointer text-left group`}
        >
          <LogOut className="w-5 h-5 mr-3.5 text-slate-400 group-hover:text-white" />
          <span>Logout</span>
        </button>

        {/* User Card */}
        <div className="bg-white/[0.06] border border-white/[0.03] rounded-xl p-[clamp(0.5rem,1.5vh,0.875rem)] flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-full bg-slate-500/30 flex items-center justify-center text-slate-300 font-semibold text-sm">
              {roleInitial[userType] || 'AD'}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-white truncate" title={currentUser?.name || undefined}>{currentUser?.name || 'John Admin'}</span>
              <span className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                <Shield className="w-3 h-3" /> {roleLabel[userType] || 'Admin'}
              </span>
            </div>
          </div>
          <div className={`[@media(max-height:700px)]:hidden w-2.5 h-2.5 shrink-0 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]`}></div>
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            aria-label="Logout"
            title="Logout"
            className={`hidden [@media(max-height:700px)]:flex shrink-0 items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors`}
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
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