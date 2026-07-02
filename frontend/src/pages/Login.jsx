import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('http://localhost:8000/api/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Login failed');
        return;
      }

      const data = await response.json();
      let role = data.role || data.user?.role;
      if (!role) {
        setError('Invalid response from server');
        return;
      }

      if (role === 'officemayor') {
        role = 'mayorsoffice';
      }

      onLogin({ ...data.user, role });
      const path = role === 'admin' ? '/admin/dashboard' : role === 'spearhead' ? '/spearhead/requests' : '/mayorsoffice/requests';
      navigate(path);
    } catch (err) {
      setError('Network error. Please try again.');
    }
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
          {error && (
            <div className="bg-red-500/10 text-red-600 p-3.5 rounded-xl text-xs font-semibold border border-red-500/20 text-center">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-[13px] font-bold text-slate-700">Username</label>
            <input 
              type="text" 
              id="username" 
              className="py-3 px-4 border border-slate-300 rounded-xl text-[15px] font-medium transition-all duration-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0c165a] focus:ring-1 focus:ring-[#0c165a] shadow-sm"
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="admin_trial"
              required 
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-[13px] font-bold text-slate-700">Password</label>
            <input 
              type="password" 
              id="password" 
              className="py-3 px-4 border border-slate-300 rounded-xl text-[15px] font-medium transition-all duration-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0c165a] focus:ring-1 focus:ring-[#0c165a] shadow-sm"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full mt-2 bg-[#0c165a] hover:bg-[#070d38] text-white border-none py-3 px-6 rounded-xl font-bold text-[15px] cursor-pointer transition-all duration-200 shadow-md hover:shadow-[0_4px_12px_rgba(12,22,90,0.2)] hover:-translate-y-0.5 active:translate-y-0"
          >
            Login
          </button>
          
          <div className="mt-4 text-center">
            <a href="#" className="text-sm font-bold text-[#1b4de4] hover:underline transition-all">
              Forgot password?
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
