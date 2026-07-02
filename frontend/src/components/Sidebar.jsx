import { NavLink } from 'react-router-dom';
import { Home, Map, FileText, Settings as SettingsIcon, LogOut, Shield, ClipboardList, Users, Truck, Bot, InboxIcon } from 'lucide-react';

const navItems = {
  admin: [
    { to: '/admin/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/admin/manage-bots', icon: Bot, label: 'Bot Management' },
    { to: '/admin/users', icon: Users, label: 'User Management' },
    { to: '/admin/requests', icon: InboxIcon, label: 'Requests' },
    { to: '/admin/collection', icon: Truck, label: 'Collection Schedule' },
    { to: '/admin/heatmap', icon: Map, label: 'Heatmap' },
    { to: '/admin/reports', icon: FileText, label: 'Report Generation' },
    { to: '/admin/audit', icon: ClipboardList, label: 'Audit Logs' },
    { to: '/admin/settings', icon: SettingsIcon, label: 'Settings' },
  ],
  mayorsoffice: [
    { to: '/mayorsoffice/requests', icon: InboxIcon, label: 'Requests' },
  ],
  spearhead: [
    { to: '/spearhead/requests', icon: InboxIcon, label: 'Requests' },
    { to: '/spearhead/heatmap', icon: Map, label: 'Heatmap' },
    { to: '/spearhead/reports', icon: FileText, label: 'Report Generation' },
  ],
};

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const getRoleLabel = (role) => {
  const map = {
    admin: 'Admin',
    spearhead: 'Spearhead',
    mayorsoffice: 'Office Mayor',
  };
  return map[role] || role;
};

const Sidebar = ({ onLogout, user = null }) => {
  const userRole = user?.role || 'admin';
  const fullName = user?.full_name || 'John Admin';
  const username = user?.username || 'johndoe';

  const getNavLinkClass = (isActive) =>
    `flex items-center px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] group ${isActive ? 'bg-[#1b4de4] text-white shadow-[0_4px_12px_rgba(27,77,228,0.25)]' : ''
    }`;

  const getIconClass = (isActive) =>
    `w-5 h-5 mr-3.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
    }`;

  return (
    <aside className="w-[260px] bg-[#0c165a] text-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-20 shrink-0">
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
         {navItems[userRole]?.map((item) => {
           const isChild = item.isChild;
           const baseClass = isChild 
             ? 'flex items-center px-4 py-2 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[14px] group pl-12'
             : 'flex items-center px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] group';
           
           return (
             <NavLink key={item.to} to={item.to} className={({ isActive }) => 
               `${baseClass} ${isActive ? 'bg-[#1b4de4] text-white shadow-[0_4px_12px_rgba(27,77,228,0.25)]' : ''}`
             } style={!isChild ? { paddingLeft: '16px' } : {}}>
               {({ isActive }) => (
                 <>
                   <item.icon className={isChild 
                     ? `w-4 h-4 mr-2.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`
                     : `w-5 h-5 mr-3.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`
                   } />
                   <span>{item.label}</span>
                 </>
               )}
             </NavLink>
           );
         })}
       </nav>

      {/* Footer Block */}
      <div className="p-4 border-t border-white/5 flex flex-col gap-4">
        {/* Logout button */}
        <button
          onClick={onLogout}
          className="flex items-center px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 font-medium text-[15px] bg-transparent border-none w-full cursor-pointer text-left group"
        >
          <LogOut className="w-5 h-5 mr-3.5 text-slate-400 group-hover:text-white" />
          <span>Logout</span>
        </button>

        {/* User Card */}
        <div className="bg-white/[0.06] border border-white/[0.03] rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-500/30 flex items-center justify-center text-slate-300 font-semibold text-sm">
              {getInitials(fullName)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">{fullName}</span>
              <span className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                <Shield className="w-3 h-3" /> {getRoleLabel(userRole)}
              </span>
            </div>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]"></div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

