import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface PreviewContextType {
  isPreviewMode: boolean;
  setIsPreviewMode: (value: boolean) => void;
  showLoginModal: boolean;
  setShowLoginModal: (show: boolean) => void;
  continueInPreview: () => void;
}

const PreviewContext = createContext<PreviewContextType | undefined>(undefined);

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  // Set preview mode based on authentication status
  useEffect(() => {
    // If user is not authenticated, they're in preview mode
    // Store preview mode preference in localStorage
    const storedPreviewMode = localStorage.getItem('previewMode') === 'true';
    
    // Default to preview mode if not authenticated and not explicitly set
    if (!user) {
      // Only set to true if not explicitly set to false in localStorage
      if (localStorage.getItem('previewMode') !== 'false') {
        setIsPreviewMode(true);
      } else {
        setIsPreviewMode(false);
      }
    } else {
      // If authenticated, always turn off preview mode
      setIsPreviewMode(false);
      localStorage.removeItem('previewMode');
    }
  }, [user]);

  // When preview mode changes, save it to localStorage
  useEffect(() => {
    if (!user) {
      localStorage.setItem('previewMode', isPreviewMode.toString());
    }
  }, [isPreviewMode, user]);

  const continueInPreview = () => {
    setIsPreviewMode(true);
    setShowLoginModal(false);
    localStorage.setItem('previewMode', 'true');
  };

  return (
    <PreviewContext.Provider value={{ 
      isPreviewMode, 
      setIsPreviewMode, 
      showLoginModal, 
      setShowLoginModal,
      continueInPreview 
    }}>
      {children}
    </PreviewContext.Provider>
  );
};

export const usePreview = (): PreviewContextType => {
  const context = useContext(PreviewContext);
  if (context === undefined) {
    throw new Error('usePreview must be used within a PreviewProvider');
  }
  return context;
};