import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Admin/Dashboard';
import HeatmapView from './pages/Admin/HeatmapView';
import Reports from './pages/Admin/Reports';
import SendReport from './pages/Admin/SendReport';
import Settings from './pages/Admin/Settings';
import ManageBots from './pages/Admin/Manage-bots';
import UserManagement from './pages/Admin/UserManagement';
import OperatorManagement from './pages/Admin/OperatorManagement';
import Requests from './pages/Admin/Requests';
import ViewRequest from './pages/Admin/ViewRequest';
import SendRequest from './pages/Admin/request/SendRequest';
import CityHallDashboard from './pages/CityHall/Dashboard';
import CityHallRequests from './pages/CityHall/Requests';
import CityHallViewRequest from './pages/CityHall/ViewRequest';
import DeploymentSchedule from './pages/Admin/DeploymentSchedule';
import SegregationForm from './pages/Barangay/SegregationForm';
import LandfillTracking from './pages/Admin/LandfillTracking';
import RecyclingCenter from './pages/Admin/RecyclingCenter';
import AuditLogs from './pages/Admin/AuditLogs';
import BarangayDashboard from './pages/Barangay/Dashboard';
import BarangayRequestForm from './pages/Barangay/RequestForm';
import BarangayHeatmap from './pages/Barangay/Heatmap';
import BarangayRequests from './pages/Barangay/Requests';
import BarangayViewRequest from './pages/Barangay/ViewRequest';
import BarangayAreas from './pages/Barangay/Areas';
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';


const REMEMBER_ME_KEY = 'troid_remembered_session';

// Rehydrates a remembered session (if the user checked "Remember me") for the
// initial render. The single-active-session poll in App still validates it
// against the server, so a session restored here gets signed out if it was
// superseded elsewhere in the meantime.
function getStoredSession() {
  try {
    const saved = localStorage.getItem(REMEMBER_ME_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed?.currentUser && parsed?.userType) return parsed;
  } catch (err) {
    console.error('Failed to restore remembered session:', err);
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
  return null;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => getStoredSession() !== null);
  const [userType, setUserType] = useState(() => getStoredSession()?.userType || 'admin');
  const [currentUser, setCurrentUser] = useState(() => getStoredSession()?.currentUser || null);

  const handleLogin = async (type = 'admin', userData = null, rememberMe = false) => {
    try {
      const user = userData || await api.users().then(users => users.find(u => u.role === type) || users[0]);
      setCurrentUser(user);
      setUserType(type);
      setIsAuthenticated(true);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ currentUser: user, userType: type }));
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
    } catch (error) {
      console.error('Login error:', error);
      setUserType(type);
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem(REMEMBER_ME_KEY);
  };

  // Only one active session per account: if this device's session token no
  // longer matches the server's record (because the account signed in
  // elsewhere), sign this device out.
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !currentUser?.session_token) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.checkUserSession(currentUser.id, currentUser.session_token);
        if (!res.valid) {
          clearInterval(interval);
          handleLogout();
          alert('You have been signed out because your account was signed in from another location.');
        }
      } catch (err) {
        console.error('Session check failed:', err);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated, currentUser?.id, currentUser?.session_token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />

        {/* Main Layout wrapper */}
        <Route element={<Layout isAuthenticated={isAuthenticated} onLogout={handleLogout} userType={userType} currentUser={currentUser} />}>

          {/* Root redirect: Send user to their specific dashboard on login */}
          <Route path="/" element={<Navigate to={`/${userType === 'mayorsoffice' ? 'mayorsoffice/dashboard' : userType === 'barangay' ? 'barangay/dashboard' : 'admin/requests'}`} replace />} />

          {/* ADMIN (CENRO) ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/manage-bots" element={<ManageBots />} />
            <Route path="/admin/users" element={<UserManagement currentUser={currentUser} />} />
            <Route path="/admin/operators" element={<OperatorManagement />} />
            <Route path="/admin/reports/send-report" element={<SendReport />} />
            <Route path="/admin/requests" element={<Requests userRole="admin" />} />
            <Route path="/admin/requests/:id" element={<ViewRequest />} />
            <Route path="/admin/request/send-request" element={<SendRequest />} />
            <Route path="/admin/deployment" element={<DeploymentSchedule />} />
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
            <Route path="/mayorsoffice/requests/:id" element={<CityHallViewRequest />} />
            <Route path="/mayorsoffice/settings" element={<Settings />} />
          </Route>

          {/* BARANGAY ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['barangay']} />}>
            <Route path="/barangay/dashboard" element={<BarangayDashboard currentUser={currentUser} />} />
            <Route path="/barangay/request" element={<BarangayRequestForm currentUser={currentUser} />} />
            <Route path="/barangay/heatmap" element={<BarangayHeatmap />} />
            <Route path="/barangay/segregation" element={<SegregationForm />} />
            <Route path="/barangay/requests" element={<BarangayRequests currentUser={currentUser} />} />
            <Route path="/barangay/requests/:id" element={<BarangayViewRequest />} />
            <Route path="/barangay/areas" element={<BarangayAreas />} />
            <Route path="/barangay/settings" element={<Settings />} />
          </Route>

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;