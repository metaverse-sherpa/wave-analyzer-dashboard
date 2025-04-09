import React, { useState, useEffect } from 'react';
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
import { UserCircle, LogOut, Settings, Shield, LogIn, User } from "lucide-react";
import AuthModal from './auth/AuthModal';
import { toast } from '@/lib/toast';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';

const UserMenu: React.FC = () => {
  const { user, isLoading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Fetch the user's profile to get the custom avatar URL
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }

        // Use the custom avatar from the profile if available
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        } 
        // Fall back to auth metadata avatar if profile avatar is not available
        else if (user.user_metadata?.avatar_url) {
          setAvatarUrl(user.user_metadata.avatar_url);
        }
      } catch (error) {
        console.error('Error fetching avatar:', error);
      }
    };

    fetchUserProfile();
  }, [user]);

  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      
      if (error) {
        toast.error(`Sign out failed: ${error.message}`);
        return;
      }
      
      navigate('/');
    } catch (err) {
      console.error('Error signing out:', err);
      toast.error('Failed to sign out');
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

  // Get user's initials for the avatar fallback
  const getUserInitials = () => {
    if (user.user_metadata?.full_name) {
      return user.user_metadata.full_name
        .split(' ')
        .map(name => name[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    return user.email?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="relative rounded-full p-0 h-8 w-8">
            <Avatar className="h-8 w-8">
              {avatarUrl ? (
                <AvatarImage 
                  src={avatarUrl} 
                  alt="Profile" 
                />
              ) : (
                <AvatarFallback>
                  {getUserInitials()}
                </AvatarFallback>
              )}
              {isAdmin && (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary"></span>
              )}
            </Avatar>
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
          
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          
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