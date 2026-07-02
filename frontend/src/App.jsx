import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Admin/Dashboard';
import HeatmapView from './pages/Admin/HeatmapView';
import Reports from './pages/Admin/Reports';
import Settings from './pages/Admin/Settings';
import ManageBots from './pages/Admin/Manage-bots';
import ViewAllBots from './pages/Admin/ViewAllBots';
import UserManagement from './pages/Admin/UserManagement';
import Requests from './pages/Admin/Requests';
import CollectionSchedule from './pages/Admin/CollectionSchedule';
import AuditLogs from './pages/Admin/AuditLogs';
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  const role = user?.role === 'officemayor' ? 'mayorsoffice' : user?.role || 'admin';

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        {/* Main Layout wrapper */}
        <Route element={<Layout isAuthenticated={isAuthenticated} onLogout={() => { setIsAuthenticated(false); setUser(null); }} user={user} />}>

          {/* Root redirect: Send user to their specific dashboard on login */}
          <Route path="/" element={<Navigate to={`/${role === 'admin' ? 'admin/dashboard' : role === 'spearhead' ? 'spearhead/requests' : 'mayorsoffice/requests'}`} replace />} />

          {/* ADMIN ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={role} allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/manage-bots" element={<ManageBots />} />
            <Route path="/admin/managebots/allbots" element={<ViewAllBots />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/requests" element={<Requests />} />
            <Route path="/admin/collection" element={<CollectionSchedule />} />
            <Route path="/admin/heatmap" element={<HeatmapView />} />
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/audit" element={<AuditLogs />} />
            <Route path="/admin/settings" element={<Settings />} />
          </Route>

          {/* MAYOR'S OFFICE ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={role} allowedRoles={['mayorsoffice']} />}>
            <Route path="/mayorsoffice/requests" element={<Requests />} />
          </Route>

          {/* SPEARHEAD ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={role} allowedRoles={['spearhead']} />}>
            <Route path="/spearhead/requests" element={<Requests />} />
            <Route path="/spearhead/heatmap" element={<HeatmapView />} />
            <Route path="/spearhead/reports" element={<Reports />} />
          </Route>

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
