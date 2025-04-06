import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';

interface SemiProtectedRouteProps {
  children: React.ReactNode;
}

// This component shows the content but prompts for login if needed
const SemiProtectedRoute: React.FC<SemiProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  useEffect(() => {
    // If not loading and no user, show auth modal
    if (!isLoading && !user) {
      setShowAuthModal(true);
    }
  }, [isLoading, user]);
  
  // Always show the underlying content
  return (
    <>
      {children}
      
      {/* Show auth modal if not logged in */}
      <AuthModal 
        isOpen={showAuthModal} 
        onOpenChange={setShowAuthModal} 
        mode="login"
      />
    </>
  );
};

export default SemiProtectedRoute;