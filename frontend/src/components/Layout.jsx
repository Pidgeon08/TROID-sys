import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import Sidebar from './Sidebar';

export const useUserContext = () => {
  const ctx = useOutletContext();
  return ctx ?? { user: null };
};

const Layout = ({ isAuthenticated, onLogout, user = null }) => {
  const handleLogout = async () => {
    if (user?.user_id) {
      try {
        await fetch('http://localhost:8000/api/logout/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.user_id }),
        });
      } catch { /* ignore */ }
    }
    onLogout();
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar onLogout={handleLogout} user={user} />
      <main className="flex-1 p-8 overflow-y-auto relative bg-[#f8fafc]">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
};

export default Layout;
