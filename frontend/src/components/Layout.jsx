import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = ({ isAuthenticated, onLogout, userType = 'admin', currentUser = null }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar onLogout={onLogout} userType={userType} currentUser={currentUser} />
      <main className="flex-1 p-8 overflow-y-auto relative bg-[#f8fafc]">
        <Outlet context={{ currentUser }} />
      </main>
    </div>
  );
};

export default Layout;
