import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import api from './services/api';
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Admin/Dashboard'));
const HeatmapView = lazy(() => import('./pages/Admin/HeatmapView'));
const Reports = lazy(() => import('./pages/Admin/Reports'));
const SendReport = lazy(() => import('./pages/Admin/SendReport'));
const Settings = lazy(() => import('./pages/Admin/Settings'));
const ManageBots = lazy(() => import('./pages/Admin/Manage-bots'));
const UserManagement = lazy(() => import('./pages/Admin/UserManagement'));
const OperatorManagement = lazy(() => import('./pages/Admin/OperatorManagement'));
const Requests = lazy(() => import('./pages/Admin/Requests'));
const ViewRequest = lazy(() => import('./pages/Admin/ViewRequest'));
const SendRequest = lazy(() => import('./pages/Admin/request/SendRequest'));
const CityHallDashboard = lazy(() => import('./pages/CityHall/Dashboard'));
const CityHallRequests = lazy(() => import('./pages/CityHall/Requests'));
const CityHallViewRequest = lazy(() => import('./pages/CityHall/ViewRequest'));
const DeploymentSchedule = lazy(() => import('./pages/Admin/DeploymentSchedule'));
const CollectionAreas = lazy(() => import('./pages/Admin/CollectionAreas'));
const SegregationForm = lazy(() => import('./pages/Barangay/SegregationForm'));
const LandfillTracking = lazy(() => import('./pages/Admin/LandfillTracking'));
const RecyclingCenter = lazy(() => import('./pages/Admin/RecyclingCenter'));
const AuditLogs = lazy(() => import('./pages/Admin/AuditLogs'));
const Utilities = lazy(() => import('./pages/Admin/Utilities'));
const BarangayDashboard = lazy(() => import('./pages/Barangay/Dashboard'));
const BarangayRequestForm = lazy(() => import('./pages/Barangay/RequestForm'));
const BarangayHeatmap = lazy(() => import('./pages/Barangay/Heatmap'));
const BarangayRequests = lazy(() => import('./pages/Barangay/Requests'));
const BarangayViewRequest = lazy(() => import('./pages/Barangay/ViewRequest'));
const BarangayAreas = lazy(() => import('./pages/Barangay/Areas'));

function RouteLoading() {
  return (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center">
      <span className="text-sm font-medium text-slate-500">Loading...</span>
    </div>
  );
}


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
      <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />

        {/* Main Layout wrapper */}
        <Route element={<Layout isAuthenticated={isAuthenticated} onLogout={handleLogout} userType={userType} currentUser={currentUser} />}>

          {/* Root redirect: Send user to their specific dashboard on login */}
          <Route path="/" element={<Navigate to={`/${userType === 'mayorsoffice' ? 'mayorsoffice/dashboard' : (userType === 'barangay' || userType === 'ngo') ? 'barangay/dashboard' : 'admin/requests'}`} replace />} />

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
            <Route path="/admin/collection-areas" element={<CollectionAreas />} />
            <Route path="/admin/heatmap" element={<HeatmapView />} />
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/audit" element={<AuditLogs />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/admin/utilities" element={<Utilities />} />
            <Route path="/admin/landfill" element={<LandfillTracking />} />
            <Route path="/admin/recycling" element={<RecyclingCenter />} />
          </Route>

          {/* MAYOR'S OFFICE ROUTES */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['mayorsoffice']} />}>
            <Route path="/mayorsoffice/dashboard" element={<CityHallDashboard />} />
            <Route path="/mayorsoffice/requests" element={<CityHallRequests />} />
            <Route path="/mayorsoffice/requests/:id" element={<CityHallViewRequest />} />
            <Route path="/mayorsoffice/settings" element={<Settings />} />
            <Route path="/mayorsoffice/utilities" element={<Utilities />} />
          </Route>

          {/* BARANGAY ROUTES (also used by NGO — same feature set) */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} userRole={userType} allowedRoles={['barangay', 'ngo']} />}>
            <Route path="/barangay/dashboard" element={<BarangayDashboard currentUser={currentUser} />} />
            <Route path="/barangay/request" element={<BarangayRequestForm currentUser={currentUser} />} />
            <Route path="/barangay/heatmap" element={<BarangayHeatmap currentUser={currentUser} />} />
            <Route path="/barangay/segregation" element={<SegregationForm />} />
            <Route path="/barangay/requests" element={<BarangayRequests currentUser={currentUser} />} />
            <Route path="/barangay/requests/:id" element={<BarangayViewRequest />} />
            <Route path="/barangay/areas" element={<BarangayAreas />} />
            <Route path="/barangay/settings" element={<Settings />} />
            <Route path="/barangay/utilities" element={<Utilities />} />
          </Route>

        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;