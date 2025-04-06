import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { UserCircle, LogOut, Settings, Shield, LogIn } from "lucide-react";
import AuthModal from './auth/AuthModal';
import { toast } from '@/lib/toast';

const UserMenu: React.FC = () => {
  const { user, isLoading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error('Failed to sign out');
    } else {
      toast.success('Signed out successfully');
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <Button disabled variant="ghost" size="sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
      </Button>
    );
  }

  if (!user) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setIsAuthModalOpen(true)}>
          <LogIn className="h-4 w-4 mr-2" />
          Sign In
        </Button>
        
        <AuthModal 
          isOpen={isAuthModalOpen} 
          onOpenChange={setIsAuthModalOpen} 
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="relative rounded-full">
            <UserCircle className="h-5 w-5" />
            {isAdmin && (
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary"></span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex flex-col space-y-1 p-2">
            <p className="text-sm font-medium">{user.email}</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">Administrator</p>
            )}
          </div>
          <DropdownMenuSeparator />
          
          {isAdmin && (
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Shield className="mr-2 h-4 w-4" />
              <span>Admin Dashboard</span>
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default UserMenu;