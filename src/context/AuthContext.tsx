import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { type Session, type User, type AuthError } from '@supabase/supabase-js';
import { toast } from '@/lib/toast';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null, data: any }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  handleAuthCallback: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;
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
          .from('users')
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
    await supabase.auth.signOut();
    toast.success("You've been logged out");
  };

  const signInWithGoogle = async () => {
    // Use the redirect method to avoid popup blockers
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) {
        console.error("Google sign in error:", error);
        toast.error(`Google login failed: ${error.message}`);
      }
    } catch (err) {
      console.error("Unexpected error during Google sign in:", err);
      toast.error('Unable to login with Google');
    }
  };

  const handleAuthCallback = async () => {
    try {
      // Get auth parameters from URL
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("Auth callback error:", error);
        return { error: error.message };
      }
      
      if (!data.session) {
        console.error("No session found in callback");
        return { error: "Authentication failed. No session returned." };
      }
      
      return { error: null };
    } catch (err) {
      console.error("Error in auth callback:", err);
      return { error: err instanceof Error ? err.message : 'Authentication callback failed' };
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};