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

  // Add a secure Telegram authentication flow
  useEffect(() => {
    // Only run this effect when we have Telegram user data but no Supabase session
    if (isTelegram && telegramUser && !user) {
      const authenticateTelegramUser = async () => {
        try {
          console.log("Authenticating Telegram user:", telegramUser.id);
          
          // Look up the Telegram user ID in your profiles table to find associated account
          const { data: profileData, error: profileError } = await supabase
            .from('telegram_users')
            .select('user_id, is_verified')
            .eq('telegram_id', telegramUser.id)
            .single();
            
          if (profileError || !profileData) {
            console.log("Telegram user not linked to any account");
            // User needs to authenticate - don't set user state
            return;
          }
          
          // Verify this is a properly authenticated user
          if (!profileData.is_verified) {
            console.log("Telegram user not verified");
            return;
          }
          
          // Get user data from the associated account
          const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', profileData.user_id)
            .single();
            
          if (userError || !userData) {
            console.log("Could not find associated user profile");
            return;
          }
          
          // Create a custom user object that marks this as a Telegram auth
          // This should NOT have admin privileges by default
          const telegramAuthUser = {
            id: userData.id,
            email: userData.email,
            aud: 'authenticated',
            created_at: new Date().toISOString(),
            role: userData.role,
            app_metadata: {
              provider: 'telegram',
              telegram_id: telegramUser.id
            },
            user_metadata: {
              full_name: telegramUser.firstName + (telegramUser.lastName ? ' ' + telegramUser.lastName : ''),
              telegram_username: telegramUser.username
            }
          } as unknown as User; // Cast to unknown first, then to User
          
          // Set user data - but not session (Telegram users don't have a Supabase session)
          setUser(telegramAuthUser);
          
          // Check if this user has admin privileges (must verify through the regular database check)
          checkUserRole(userData.id);
          
        } catch (error) {
          console.error("Error authenticating Telegram user:", error);
        } finally {
          setIsLoading(false);
        }
      };
      
      authenticateTelegramUser();
    }
  }, [isTelegram, telegramUser, user]);

  const checkUserRole = async (userId: string) => {
    try {
      // Always require a proper database lookup for admin role - never assume
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
      console.log("Sign out requested. Telegram environment:", isTelegram);
      
      // Special handling for Telegram environment - more thorough check
      const inTelegramApp = isTelegram || window.Telegram?.WebApp || 
        window.location.pathname.includes('/telegram') || 
        window.location.href.includes('telegram');
        
      if (inTelegramApp) {
        console.log("Telegram environment detected - performing custom sign out");
        
        // Just clear the local state without making Supabase API call
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        
        // Enhanced logout - clear all possible auth tokens
        try {
          // Clear Supabase auth storage items from all storage locations
          localStorage.removeItem('supabase.auth.token');
          localStorage.removeItem('supabase.auth.refreshToken');
          sessionStorage.removeItem('supabase.auth.token');
          sessionStorage.removeItem('supabase.auth.refreshToken');
          
          // Also clear anything with 'auth' in the key for good measure
          Object.keys(localStorage).forEach(key => {
            if (key.toLowerCase().includes('auth')) {
              localStorage.removeItem(key);
            }
          });
          
          Object.keys(sessionStorage).forEach(key => {
            if (key.toLowerCase().includes('auth')) {
              sessionStorage.removeItem(key);
            }
          });
          
          // Force Supabase client to reset its internal state
          try {
            await supabase.auth.signOut({ scope: 'global' });
          } catch (supabaseResetError) {
            console.log("Error during Supabase forced reset:", supabaseResetError);
            // Continue anyway
          }
          
          // Attempt to clear cookies too
          document.cookie.split(';').forEach(cookie => {
            const [name] = cookie.split('=');
            if (name.trim().toLowerCase().includes('auth') || name.trim().toLowerCase().includes('supabase')) {
              document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            }
          });
          
          console.log("Auth storage items cleared");
        } catch (storageErr) {
          console.log("Error clearing storage:", storageErr);
          // Continue anyway
        }
        
        toast.success("You've been logged out");
        return { error: null };
      }
      
      console.log("Using standard sign out flow");
      // Normal sign out flow for non-Telegram environments
      try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          console.error("Sign out error:", error);
          toast.error(`Logout failed: ${error.message}`);
        } else {
          toast.success("You've been logged out");
        }
        return { error };
      } catch (supabaseError) {
        // If supabase.auth.signOut() throws an exception, handle it gracefully
        console.error("Supabase sign out exception:", supabaseError);
        
        // Fallback to manual cleanup
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        toast.success("You've been logged out");
        
        return { error: null };
      }
    } catch (err) {
      console.error("Unexpected error during sign out:", err);
      
      // Ensure user is signed out even if there's an error
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      
      const error = { message: 'An unexpected error occurred', name: 'AuthError' } as AuthError;
      return { error };
    }
  };

  // Make sure signInWithGoogle properly blocks Telegram environments
  const signInWithGoogle = async () => {
    // In Telegram mini app, don't use Google auth - it doesn't work in Telegram's WebView
    if (isTelegram) {
      console.log("Google auth not supported in Telegram Mini App");
      showTelegramAuthOnly();
      return { 
        error: { 
          message: "Google authentication is not supported in Telegram Mini Apps", 
          name: 'AuthError'
        } as AuthError 
      };
    }

    // Check for potential embedded browsers that Google blocks
    const userAgent = navigator.userAgent.toLowerCase();
    const isTelegramBrowser = userAgent.includes('telegram') || 
                              window.location.href.includes('telegram') ||
                              !!window.Telegram?.WebApp;
    const isEmbeddedWebView = userAgent.includes('wv') || 
                              userAgent.includes('tgweb') ||
                              userAgent.includes('fb_iab') || 
                              (userAgent.includes('mobile') && !userAgent.includes('chrome') && !userAgent.includes('safari'));
    
    if (isTelegramBrowser || isEmbeddedWebView) {
      console.log("Google auth not supported in this browser environment");
      showTelegramAuthOnly();
      return { 
        error: { 
          message: "Google authentication is not supported in embedded browsers", 
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

  // Helper function to show a message about using Telegram auth
  const showTelegramAuthOnly = () => {
    toast.error(
      'Google authentication is not supported in Telegram Mini Apps due to browser restrictions. Please use email/password or link your Telegram account.',
      { duration: 8000 }
    );
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