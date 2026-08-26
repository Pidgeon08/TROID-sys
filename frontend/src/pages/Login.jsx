import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { logAudit } from '../services/auditLog';
import ForceChangePasswordModal from '../components/ForceChangePasswordModal';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import LoadingModal from '../components/LoadingModal';

const ROLE_LABELS = {
  admin: 'Admin',
  mayorsoffice: 'Mayor',
  barangay: 'Barangay',
  ngo: 'NGO',
};

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
        logAudit({ user: email, role: '-', action: 'Login failed', module: 'Authentication', details: data.error || 'Invalid credentials', status: 'failed' });
        setLoading(false);
        return;
      }
      const role = data.role || 'admin';
      logAudit({ user: data.name || email, role: ROLE_LABELS[role] || role, action: 'Login successful', module: 'Authentication', details: `Signed in as ${data.email || email}`, status: 'success' });

      if (data.must_change_password) {
        setPendingLogin({ ...data, role });
        setLoading(false);
        return;
      }

      await onLogin(role, data, rememberMe);
      navigate(`/${role === 'mayorsoffice' ? 'mayorsoffice/dashboard' : (role === 'barangay' || role === 'ngo') ? 'barangay/dashboard' : 'admin/requests'}`);
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      logAudit({ user: email, role: '-', action: 'Login failed', module: 'Authentication', details: 'Login request error', status: 'failed' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChanged = () => {
    setPendingLogin(null);
    setPassword('');
    setNotice('Password changed successfully. Please sign in again with your new password.');
  };

  return (
    <div className="flex justify-center items-center min-h-screen w-screen bg-gradient-to-br from-[#0c165a] to-[#080d3a] p-4">
      {/* Light-colored card matching the mockup */}
      <div className="w-full max-w-[460px] py-12 px-9 bg-[#f8fafc] text-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] text-center animate-fade-in border border-slate-100">
        
        {/* Seal Container */}
        <div className="mb-8">
          {/* CSS Mockup of San Fernando City Seal */}
          <div className="w-24 h-24 rounded-full border-4 border-[#b45309] bg-gradient-to-br from-blue-700 to-red-600 mx-auto mb-6 flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.15)] relative overflow-hidden">
            <div className="absolute inset-1 rounded-full border-2 border-white/50 flex flex-col items-center justify-center bg-blue-900 p-1">
              <span className="text-[10px] font-bold text-white leading-tight uppercase tracking-wider">SF</span>
              <span className="text-[7px] font-semibold text-blue-200 uppercase tracking-tighter">CENRO</span>
            </div>
          </div>
          <h2 className="text-[17px] font-bold text-slate-900 leading-snug px-2">
            City Environment and Natural Resources Office (CENRO) Aquatic Management System
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="text-left flex flex-col gap-5">
          {notice && (
            <div className="bg-emerald-500/10 text-emerald-700 p-3.5 rounded-xl text-xs font-semibold border border-emerald-500/20 text-center">
              {notice}
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 text-red-600 p-3.5 rounded-xl text-xs font-semibold border border-red-500/20 text-center">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-[13px] font-bold text-slate-700">Email</label>
            <input 
              type="text" 
              id="email" 
              className="py-3 px-4 border border-slate-300 rounded-xl text-[15px] font-medium transition-all duration-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0c165a] focus:ring-1 focus:ring-[#0c165a] shadow-sm"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-[13px] font-bold text-slate-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="w-full py-3 pl-4 pr-11 border border-slate-300 rounded-xl text-[15px] font-medium transition-all duration-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0c165a] focus:ring-1 focus:ring-[#0c165a] shadow-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between -mt-1">
            <label className="flex items-center gap-2 text-[13px] font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0c165a] focus:ring-[#0c165a] cursor-pointer"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-sm font-bold text-[#1b4de4] hover:underline transition-all"
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#0c165a] hover:bg-[#070d38] text-white border-none py-3 px-6 rounded-xl font-bold text-[15px] cursor-pointer transition-all duration-200 shadow-md hover:shadow-[0_4px_12px_rgba(12,22,90,0.2)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>

      {pendingLogin && (
        <ForceChangePasswordModal
          user={pendingLogin}
          currentPassword={password}
          onSuccess={handlePasswordChanged}
          onCancel={() => setPendingLogin(null)}
        />
      )}

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}

      {loading && <LoadingModal message="Signing you in..." />}
    </div>
  );
};

export default Login;
