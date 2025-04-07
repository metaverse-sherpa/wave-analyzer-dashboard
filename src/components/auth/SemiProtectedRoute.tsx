import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePreview } from '@/context/PreviewContext';
import LoginModal from '@/components/auth/LoginModal';

interface SemiProtectedRouteProps {
  children: React.ReactNode;
}

const SemiProtectedRoute: React.FC<SemiProtectedRouteProps> = ({ children }) => {
  // Remove the loading property from useAuth destructuring if it's not defined in your AuthContext
  const { user } = useAuth();
  const { isPreviewMode, setIsPreviewMode, showLoginModal, setShowLoginModal, continueInPreview } = usePreview();
  const navigate = useNavigate();
  // Add a local loading state if necessary
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    // Check if user auth state is available
    if (user !== undefined) {
      setIsAuthChecking(false);
      
      // If not authenticated and not in preview mode, show modal
      if (!user && !isPreviewMode) {
        setShowLoginModal(true);
      } else {
        setShowLoginModal(false);
      }
    }
  }, [user, isPreviewMode, setShowLoginModal]);

  const handleClose = () => {
    setShowLoginModal(false);
    // Don't automatically set preview mode when closing - require explicit action
  };

  return (
    <>
      {children}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={handleClose} 
        onContinueInPreview={continueInPreview}
      />
    </>
  );
};

export default SemiProtectedRoute;