import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

// Define props interfaces for the components
interface AuthFormProps {
  onSuccess?: () => void;
  onToggleMode?: () => void;
}

interface AuthModalProps {
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  mode?: 'login' | 'signup';
  onAuth?: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onOpenChange, 
  onClose,
  mode = 'login',
  onAuth
}) => {
  const [currentMode, setCurrentMode] = useState<'login' | 'signup'>(mode);

  const handleToggleMode = () => {
    setCurrentMode(prev => prev === 'login' ? 'signup' : 'login');
  };

  const handleSuccess = () => {
    if (onAuth) onAuth();
    if (onOpenChange) onOpenChange(false);
    if (onClose) onClose();
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (onOpenChange) onOpenChange(open);
        if (!open && onClose) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {currentMode === 'login' ? 'Sign In' : 'Create Account'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {currentMode === 'login' 
              ? 'Enter your credentials to access your account' 
              : 'Create a new account to get started'
            }
          </DialogDescription>
        </DialogHeader>
        
        {currentMode === 'login' ? (
          <LoginForm 
            onSuccess={handleSuccess} 
            onToggleMode={handleToggleMode} 
          />
        ) : (
          <SignupForm 
            onSuccess={handleSuccess} 
            onToggleMode={handleToggleMode} 
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;