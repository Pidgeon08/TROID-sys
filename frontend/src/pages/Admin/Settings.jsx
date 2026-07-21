import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { User, Camera, Lock, Eye, EyeOff } from "lucide-react";
import api from '../../services/api';
import { logAudit } from '../../services/auditLog';
import PasswordRulesChecklist from '../../components/PasswordRulesChecklist';
import { passwordRuleResults } from '../../utils/passwordRules';

const ROLE_LABELS = {
  admin: "Admin",
  mayorsoffice: "Mayor",
  barangay: "Barangay",
  viewer: "Viewer",
};

/**
 * Main Settings page component allowing users to manage
 * their profile information and password. Shared across all roles.
 */
const Settings = () => {
   const context = useOutletContext() || {};
   const currentUser = context.currentUser;
   const [profile, setProfile] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("profile");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  useEffect(() => {
    // Use currentUser from context if available, otherwise fetch
    const initProfile = async () => {
      try {
        if (currentUser) {
          setProfileId(currentUser.id);
          setProfile({
            fullName: currentUser.name || "Admin User",
            role: ROLE_LABELS[currentUser.role] || currentUser.role,
            email: currentUser.email || "",
          });
        } else {
          // Fallback: fetch users if no context
          const res = await api.users();
          const users = Array.isArray(res) ? res : [];
          const current = users.find((u) => u.role === 'admin') || users[0];
          if (current) {
            setProfileId(current.id);
            setProfile({
              fullName: current.name || "Admin User",
              role: ROLE_LABELS[current.role] || current.role,
              email: current.email || "",
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    };
    initProfile();
  }, [currentUser]);

  const updateProfile = (field) => (e) =>
    setProfile((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSaveProfile = async () => {
    if (!profileId) return;
    setSaving(true);
    setMessage("");
    try {
      await api.updateUser(profileId, {
        name: profile.fullName,
        email: profile.email,
      });
      setMessage("Profile updated successfully");
      logAudit({
        currentUser,
        action: 'Settings updated',
        module: 'Settings',
        details: `Profile updated for ${profile.fullName}`,
      });
    } catch (err) {
      console.error('Failed to update profile:', err);
      setMessage("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const newPasswordValid = passwordRuleResults(newPassword).every((r) => r.met);
  const canChangePassword = oldPassword.length > 0 && newPasswordValid && passwordsMatch && !changingPassword;

  const handleChangePassword = async () => {
    if (!profileId || !canChangePassword) return;
    setChangingPassword(true);
    setPasswordMessage("");
    setPasswordError(false);
    try {
      await api.changeUserPassword(profileId, { old_password: oldPassword, password: newPassword });
      setPasswordMessage("Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      logAudit({
        currentUser,
        action: 'Settings updated',
        module: 'Settings',
        details: `Password changed for ${profile.fullName}`,
      });
    } catch (err) {
      console.error('Failed to change password:', err);
      setPasswordError(true);
      setPasswordMessage(err.message || "Failed to change password.");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">Loading settings...</span>
        </div>
      )}
      {!loading && !profile && (
        <div className="flex items-center justify-center h-[400px]">
          <span className="text-sm font-medium text-slate-500">No profile data found.</span>
        </div>
      )}
      {!loading && profile && (
      <>
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">
          Settings
        </h1>
        <p className="text-slate-500 text-sm mt-1.5 font-medium">
          Configure system preferences and account details.
        </p>
      </header>

      {activeTab === "profile" && message && (
        <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm font-medium ${
          message.includes("success")
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {message}
        </div>
      )}

      {/* Main settings card with sidebar and content area */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-8 grid grid-cols-[180px_1fr] gap-10 min-h-[400px]">
        {/* Sidebar tab navigation */}
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-left transition-all duration-200 cursor-pointer ${
              activeTab === "profile" ? "bg-[#1b4de4] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <User size={16} className="stroke-[2.2]" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-left transition-all duration-200 cursor-pointer ${
              activeTab === "security" ? "bg-[#1b4de4] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Lock size={16} className="stroke-[2.2]" />
            Security
          </button>
        </nav>

        {/* Main content area */}
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
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email address</label>
                <input
                  type="email"
                  className="w-full flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
                  value={profile.email}
                  onChange={updateProfile("email")}
                />
              </div>
            </div>

             <button
               onClick={handleSaveProfile}
               disabled={saving}
               className="mt-7 flex items-center justify-center gap-2 bg-[#1b4de4] hover:bg-[#153eb8] text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {saving ? "Saving..." : "Save Changes"}
             </button>
          </section>
          )}

          {/* Security / change password tab */}
          {activeTab === "security" && (
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-5">Change password</h2>
            <p className="text-sm text-slate-500 mb-5 max-w-md">
              Enter your current password, then choose a new one that meets all of the requirements below.
            </p>

            {passwordMessage && (
              <div className={`mb-5 max-w-md rounded-xl border px-4 py-2.5 text-sm font-medium ${
                passwordError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}>
                {passwordMessage}
              </div>
            )}

            <div className="max-w-md space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Current password</label>
                <div className="relative">
                  <input
                    type={showPasswords ? "text" : "password"}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                  >
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">New password</label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Confirm new password</label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 ${
                    confirmPassword.length > 0 && !passwordsMatch
                      ? "border-red-300 focus:border-red-400 focus:ring-red-500/20"
                      : "border-slate-200 focus:border-blue-400 focus:ring-blue-500/30"
                  }`}
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>

              <PasswordRulesChecklist value={newPassword} />

              <button
                onClick={handleChangePassword}
                disabled={!canChangePassword}
                className="flex items-center justify-center gap-2 bg-[#1b4de4] hover:bg-[#153eb8] text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changingPassword ? "Saving..." : "Change password"}
              </button>
            </div>
          </section>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default Settings;
