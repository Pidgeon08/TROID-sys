import { Navigate, Outlet, useOutletContext } from 'react-router-dom';

export const ProtectedRoute = ({ isAuthenticated, userRole, allowedRoles }) => {
    const context = useOutletContext() || {};
    
    // 1. If the user isn't logged in at all, kick them to the login page
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // 2. If they are logged in, but their role isn't allowed on this route...
    if (allowedRoles && !allowedRoles.includes(userRole)) {
        // ...bounce them back to a safe route (like their dashboard or homepage)
        return <Navigate to="/" replace />;
    }

    // 3. If they pass both checks, let them pass through to the requested page
    return <Outlet context={context} />;
};