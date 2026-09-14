import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = ({ isAuthenticated, onLogout, userType = 'admin', currentUser = null }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden print:block print:h-auto print:w-auto print:overflow-visible">
      <Sidebar onLogout={onLogout} userType={userType} currentUser={currentUser} />
      <main className="flex-1 p-8 overflow-y-auto relative z-30 bg-[#f8fafc] print:overflow-visible print:h-auto print:p-0 print:bg-white">
        <Outlet context={{ currentUser }} />
      </main>
    </div>
  );
};

export default Layout;
