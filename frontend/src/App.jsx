import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Admin/Dashboard';
import HeatmapView from './pages/Admin/HeatmapView';
import Reports from './pages/Admin/Reports';
import Settings from './pages/Admin/Settings';
import ManageBots from './pages/Admin/Manage-bots';
import UserManagement from './pages/Admin/UserManagement';
import Requests from './pages/Admin/Requests';
import CityHallDashboard from './pages/CityHall/Dashboard';
import CityHallRequests from './pages/CityHall/Requests';
import DeploymentSchedule from './pages/Admin/DeploymentSchedule';
import SegregationForm from './pages/Barangay/SegregationForm';
import LandfillTracking from './pages/Admin/LandfillTracking';
import RecyclingCenter from './pages/Admin/RecyclingCenter';
import AuditLogs from './pages/Admin/AuditLogs';
import BarangayDashboard from './pages/Barangay/Dashboard';
import BarangayRequestForm from './pages/Barangay/RequestForm';
import BarangayHeatmap from './pages/Barangay/Heatmap';
import BarangayRequests from './pages/Barangay/Requests';
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import CollectionSchedule from './pages/Admin/CollectionSchedule';


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState('admin');
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogin = async (type = 'admin') => {
    try {
      const users = await api.users();
      const user = users.find(u => u.role === type) || users[0];
      
      setCurrentUser(user);
      setUserType(type);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      setUserType(type);
      setIsAuthenticated(true);
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />

        {/* Main Layout wrapper */}
        <Route element={<Layout isAuthenticated={isAuthenticated} onLogout={() => setIsAuthenticated(false)} userType={userType} currentUser={currentUser} />}>

          {/* Root redirect: Send user to their specific dashboard on login */}
          <Route path="/" element={<Navigate to={`/${userType === 'mayorsoffice' ? 'mayorsoffice/dashboard' : userType === 'barangay' ? 'barangay/dashboard' : 'admin/requests'}`} replace />} />

          {/* ADMIN (CENRO) ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/manage-bots" element={<ManageBots />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/requests" element={<Requests userRole="admin" />} />
            <Route path="/admin/deployment" element={<DeploymentSchedule />} />
            <Route path="/admin/collection-schedule" element={<CollectionSchedule />} />
            <Route path="/admin/heatmap" element={<HeatmapView />} />
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/audit" element={<AuditLogs />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/admin/landfill" element={<LandfillTracking />} />
            <Route path="/admin/recycling" element={<RecyclingCenter />} />
          </Route>

          {/* MAYOR'S OFFICE ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['mayorsoffice']} />}>
            <Route path="/mayorsoffice/dashboard" element={<CityHallDashboard />} />
            <Route path="/mayorsoffice/requests" element={<CityHallRequests />} />
          </Route>

          {/* SPEARHEAD ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['spearhead']} />}>
            <Route path="/spearhead/requests" element={<Requests userRole="spearhead" />} />
            <Route path="/spearhead/heatmap" element={<HeatmapView />} />
            <Route path="/spearhead/reports" element={<Reports />} />
          </Route>

          {/* BARANGAY ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['barangay']} />}>
            <Route path="/barangay/dashboard" element={<BarangayDashboard />} />
            <Route path="/barangay/request" element={<BarangayRequestForm />} />
            <Route path="/barangay/heatmap" element={<BarangayHeatmap />} />
            <Route path="/barangay/segregation" element={<SegregationForm />} />
            <Route path="/barangay/requests" element={<BarangayRequests />} />
          </Route>

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;