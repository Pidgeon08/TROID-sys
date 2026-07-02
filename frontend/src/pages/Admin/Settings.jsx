import { useState } from "react";
import { User, Lock, Camera } from "lucide-react";

// Available settings tabs with their labels and icons
const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
];

/**
 * Main Settings page component allowing users to manage
 * their profile information and security credentials.
 */
const Settings = () => {
  // Currently active tab in the settings panel
  const [activeTab, setActiveTab] = useState("profile");

  // Profile form data
  const [profile, setProfile] = useState({
    fullName: "John Admin",
    role: "Admin",
    email: "JohnAdminCenro@gmail.com",
    phone: "09547392164",
  });

  // Security form data for password updates
  const [security, setSecurity] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Helper to update a specific field in the profile state
  const updateProfile = (field) => (e) =>
    setProfile((prev) => ({ ...prev, [field]: e.target.value }));

  // Helper to update a specific field in the security state
  const updateSecurity = (field) => (e) =>
    setSecurity((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
          Settings
        </h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          Configure system preferences and account details.
        </p>
      </header>

      {/* Main settings card with sidebar and content area */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8 grid grid-cols-[180px_1fr] gap-10 min-h-[400px]">
        {/* Sidebar tab navigation */}
        <nav className="flex flex-col gap-1">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-left transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-[#1b4de4] text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 border border-transparent"
                }`}
              >
                <tab.icon size={16} className="stroke-[2.2]" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Main content area that switches based on active tab */}
        <div>
          {/* Profile settings tab */}
          {activeTab === "profile" && (
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-5">Profile</h2>

              {/* Profile picture and basic info display */}
              <div className="flex items-center gap-4 mb-7">
                <div className="relative w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <User size={26} className="text-slate-600" strokeWidth={1.75} />
                  <button
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:border-slate-300 transition-colors"
                    aria-label="Change photo"
                  >
                    <Camera size={12} className="text-slate-500" />
                  </button>
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">{profile.fullName}</p>
                  <p className="text-sm text-slate-500">{profile.email}</p>
                  <button className="mt-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-full px-3.5 py-1.5 hover:bg-slate-50 transition-colors">
                    Change Photo
                  </button>
                </div>
              </div>

              {/* Editable profile fields in a 2-column grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-5 max-w-2xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Full name</label>
                  <input
                    type="text"
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                    value={profile.fullName}
                    onChange={updateProfile("fullName")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Role</label>
                  <input
                    type="text"
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                    value={profile.role}
                    onChange={updateProfile("role")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email address</label>
                  <input
                    type="email"
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                    value={profile.email}
                    onChange={updateProfile("email")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone number</label>
                  <input
                    type="tel"
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                    value={profile.phone}
                    onChange={updateProfile("phone")}
                  />
                </div>
              </div>

              {/* Save profile changes button */}
              <button className="mt-7 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors shadow-sm">
                Save Changes
              </button>
            </section>
          )}

          {/* Security settings tab */}
          {activeTab === "security" && (
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-5">Security</h2>

              {/* Current password input */}
              <div className="max-w-md mb-5">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Current password</label>
                <input
                  type="password"
                  className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                  value={security.currentPassword}
                  onChange={updateSecurity("currentPassword")}
                  placeholder="Enter current password"
                />
              </div>

              {/* New password and confirmation in a 2-column grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-5 max-w-2xl mb-7">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">New password</label>
                  <input
                    type="password"
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                    value={security.newPassword}
                    onChange={updateSecurity("newPassword")}
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Confirm new password</label>
                  <input
                    type="password"
                    className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                    value={security.confirmPassword}
                    onChange={updateSecurity("confirmPassword")}
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              {/* Update security changes button */}
              <button className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors shadow-sm">
                Update Changes
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
