import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import pb from '../lib/pocketbase';

const ProtectedRoute = ({ children, adminOnly = false }) => {
    const location = useLocation();
    
    // Check if the auth token is present and not expired
    const isLoggedIn = pb.authStore.isValid;
    const user = pb.authStore.model;

    if (!isLoggedIn) {
        // Redirect to login, but save the current location so we can go back after login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (adminOnly && user?.role !== 'admin') {
        // If they are logged in but not an admin, send them to home
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;