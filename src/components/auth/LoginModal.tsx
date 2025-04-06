import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueInPreview: () => void;
}

const LoginModal = ({ isOpen, onClose, onContinueInPreview }: LoginModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enhanced Features Available</DialogTitle>
          <DialogDescription>
            Sign in to access premium features including advanced AI analysis and detailed charts.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            You can continue in preview mode with limited functionality, 
            sign in for full access, or return to the dashboard.
          </p>
        </div>
        
        <DialogFooter className="flex flex-col sm:flex-row gap-3 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Back to Dashboard
          </Button>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" onClick={onContinueInPreview}>
              Continue in Preview
            </Button>
            
            <Link to="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;