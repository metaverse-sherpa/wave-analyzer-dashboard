import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      {/* Increase dialog width from default to a more accommodating size */}
      <DialogContent className="sm:max-w-[500px] w-[95vw]">
        <DialogHeader>
          <DialogTitle>Enhanced Features Available</DialogTitle>
          <DialogDescription className="break-normal">
            Sign in to access premium features including advanced AI analysis and detailed charts.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground break-normal whitespace-normal">
            You can continue in preview mode with limited functionality, 
            sign in for full access, or return to the dashboard.
          </p>
        </div>
        
        <DialogFooter className="flex flex-col sm:flex-row gap-3 sm:justify-between">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Back to Dashboard
          </Button>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" onClick={onContinueInPreview} className="w-full sm:w-auto">
              Continue in Preview
            </Button>
            
            <Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`} className="w-full sm:w-auto">
              <Button className="w-full">Sign In</Button>
            </Link>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;