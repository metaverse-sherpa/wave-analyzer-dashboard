import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { type Session, type User, type AuthError } from '@supabase/supabase-js';
import { toast } from '@/lib/toast';
import { useTelegram } from './TelegramContext';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null, data: any }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  handleAuthCallback: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create a wrapper component to avoid useContext in component body error
const AuthProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isTelegram, telegramUser } = useTelegram();
  
  return (
    <AuthProviderInner isTelegram={isTelegram} telegramUser={telegramUser}>
      {children}
    </AuthProviderInner>
  );
};

interface AuthProviderInnerProps {
  children: React.ReactNode;
  isTelegram: boolean;
  telegramUser: any;
}

const AuthProviderInner: React.FC<AuthProviderInnerProps> = ({ 
  children, 
  isTelegram, 
  telegramUser 
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserRole(session.user.id);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed:", _event);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserRole(session.user.id);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkUserRole = async (userId: string) => {
    try {
      // Fixed: Check for admin role in the profiles table
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      // User is admin if role field equals 'admin'
      setIsAdmin(data?.role === 'admin');
    } catch (error) {
      console.error('Error checking user role:', error);
      setIsAdmin(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log("Attempting sign in with:", email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      console.log("Sign in result:", data ? "Success" : "Failed", error);
      
      if (error) {
        console.error("Sign in error:", error.message);
        toast.error(`Login failed: ${error.message}`);
        return { error };
      }
      
      toast.success("Successfully logged in!");
      return { error: null };
    } catch (err) {
      console.error("Unexpected error during sign in:", err);
      const error = { message: 'An unexpected error occurred', name: 'AuthError' } as AuthError;
      toast.error(`Login error: ${error.message}`);
      return { error };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      if (error) {
        toast.error(`Signup failed: ${error.message}`);
        return { error, data: null };
      }
      
      if (data?.user) {
        // Create user profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email,
            created_at: new Date()
          });
        
        if (profileError) {
          console.error("Error creating user profile:", profileError);
        }
        
        toast.success("Account created successfully!");
      }
      
      return { error: null, data };
    } catch (err) {
      console.error("Unexpected error during sign up:", err);
      const error = { message: 'An unexpected error occurred', name: 'AuthError' } as AuthError;
      return { error, data: null };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
        toast.error(`Logout failed: ${error.message}`);
      } else {
        toast.success("You've been logged out");
      }
      return { error };
    } catch (err) {
      console.error("Unexpected error during sign out:", err);
      const error = { message: 'An unexpected error occurred', name: 'AuthError' } as AuthError;
      return { error };
    }
  };

  const signInWithGoogle = async () => {
    // In Telegram mini app, don't use Google auth
    if (isTelegram) {
      console.log("Google auth not supported in Telegram Mini App");
      toast.error('Google authentication is not supported in Telegram Mini Apps');
      return { 
        error: { 
          message: "Google authentication is not supported in Telegram Mini Apps", 
          name: 'AuthError'
        } as AuthError 
      };
    }
    
    // Use the redirect method to avoid popup blockers
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) {
        console.error("Google sign in error:", error);
        toast.error(`Google login failed: ${error.message}`);
      }
      
      return { error: error || null };
    } catch (err) {
      console.error("Unexpected error during Google sign in:", err);
      toast.error('Unable to login with Google');
      const error = { message: 'An unexpected error occurred', name: 'AuthError' } as AuthError;
      return { error };
    }
  };

  const handleAuthCallback = async () => {
    try {
      const { error } = await supabase.auth.getSession();
      if (error) {
        console.error("Error getting session:", error);
        return { error: error.message };
      }
      return { error: null };
    } catch (err) {
      console.error("Error handling auth callback:", err);
      return { error: 'Failed to process authentication' };
    }
  };

  const value = {
    user,
    session,
    isLoading,
    isAdmin,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    handleAuthCallback
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <AuthProviderWrapper>{children}</AuthProviderWrapper>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};