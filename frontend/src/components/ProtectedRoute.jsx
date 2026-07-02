import { Navigate, Outlet, useOutletContext } from 'react-router-dom';

export const ProtectedRoute = ({ isAuthenticated, userRole, allowedRoles }) => {
    const parentContext = useOutletContext();
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    if (allowedRoles && !allowedRoles.includes(userRole)) {
        return <Navigate to="/" replace />;
    }
    return <Outlet context={parentContext} />;
};