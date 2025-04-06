import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePreview } from '@/context/PreviewContext';
import LoginModal from '@/components/auth/LoginModal';

interface SemiProtectedRouteProps {
  children: React.ReactNode;
}

const SemiProtectedRoute: React.FC<SemiProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const { setPreviewMode } = usePreview();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  useEffect(() => {
    // If user is authenticated, make sure we're not in preview mode
    if (user) {
      setPreviewMode(false);
    }
    
    // Show login modal for unauthenticated users after loading completes
    if (!isLoading && !user) {
      setShowLoginModal(true);
    }
  }, [isLoading, user, setPreviewMode]);
  
  // Handle modal close
  const handleModalClose = () => {
    setShowLoginModal(false);
    navigate('/'); // Redirect to dashboard when canceled
  };
  
  // Handle "Continue in Preview Mode" option
  const handleContinueInPreview = () => {
    setShowLoginModal(false);
    setPreviewMode(true); // Enable preview mode
  };
  
  return (
    <>
      {children}
      
      {/* Show login modal for unauthenticated users */}
      {showLoginModal && !user && (
        <LoginModal 
          isOpen={showLoginModal}
          onClose={handleModalClose}
          onContinueInPreview={handleContinueInPreview}
        />
      )}
    </>
  );
};

export default SemiProtectedRoute;