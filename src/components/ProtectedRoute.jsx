import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, hasCompletedProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Not logged in - redirect to login page
    return <Navigate to="/login" replace />;
  }

  if (!hasCompletedProfile) {
    // Logged in but profile not complete - redirect to profile setup
    return <Navigate to="/profile-setup" replace />;
  }

  // Authenticated and profile complete - allow access
  return children;
};
