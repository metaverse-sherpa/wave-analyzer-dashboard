import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePreview } from '@/context/PreviewContext';
import LoginModal from '@/components/auth/LoginModal';

interface SemiProtectedRouteProps {
  children: React.ReactNode;
}

const SemiProtectedRoute: React.FC<SemiProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { isPreviewMode, setIsPreviewMode, showLoginModal, setShowLoginModal, continueInPreview } = usePreview();
  const navigate = useNavigate();

  useEffect(() => {
    // If not loading, not authenticated, and not in preview mode, show modal
    if (!loading && !user && !isPreviewMode) {
      setShowLoginModal(true);
    } else {
      setShowLoginModal(false);
    }
  }, [user, loading, isPreviewMode, setShowLoginModal]);

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