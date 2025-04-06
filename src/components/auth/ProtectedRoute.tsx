import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean; // Add this optional prop
}

const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { user, isLoading, isAdmin } = useAuth();
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Check for admin role when requireAdmin is true
  if (requireAdmin && !isAdmin) {
    // User is logged in but not an admin
    return (
      <div className="flex flex-col justify-center items-center min-h-screen p-4">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p className="mb-6 text-center">
          You don't have permission to access this page. 
          This area is restricted to administrators only.
        </p>
        <button 
          onClick={() => window.history.back()} 
          className="px-4 py-2 bg-primary text-primary-foreground rounded"
        >
          Go Back
        </button>
      </div>
    );
  }
  
  // Show the route's children if authenticated (and is admin if required)
  return <>{children}</>;
};

export default ProtectedRoute;