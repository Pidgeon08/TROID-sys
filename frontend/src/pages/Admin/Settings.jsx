import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { User, Camera } from "lucide-react";
import api from '../../services/api';

const ROLE_LABELS = {
  admin: "Admin",
  mayorsoffice: "Mayor",
  barangay: "Barangay",
  viewer: "Viewer",
};

/**
 * Main Settings page component allowing users to manage
 * their profile information.
 */
const Settings = () => {
   const context = useOutletContext() || {};
   const currentUser = context.currentUser;
   const [profile, setProfile] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
    } catch (err) {
      console.error('Failed to update profile:', err);
      setMessage("Failed to update profile");
    } finally {
      setSaving(false);
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

      {message && (
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
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-left transition-all duration-200 cursor-pointer bg-[#1b4de4] text-white shadow-sm"
          >
            <User size={16} className="stroke-[2.2]" />
            Profile
          </button>
        </nav>

        {/* Main content area */}
        <div>
          {/* Profile settings tab */}
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
                  readOnly
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
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default Settings;
