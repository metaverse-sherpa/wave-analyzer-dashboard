import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { user, isLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    // Only check after loading is complete
    if (!isLoading) {
      if (!user) {
        // If not logged in, show auth modal
        setIsAuthModalOpen(true);
      } else if (requireAdmin && !isAdmin) {
        // If admin access required but user is not admin
        navigate('/', { replace: true });
      }
    }
  }, [user, isLoading, isAdmin, requireAdmin, navigate]);

  // While loading auth state, show a loading indicator
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if ((requireAdmin && !isAdmin) || (!user && !isAuthModalOpen)) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      {children}
      
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onOpenChange={(open) => {
          setIsAuthModalOpen(open);
          if (!open && !user) {
            // If modal is closed but user is not logged in, redirect home
            navigate('/', { replace: true });
          }
        }} 
      />
    </>
  );
};

export default ProtectedRoute;