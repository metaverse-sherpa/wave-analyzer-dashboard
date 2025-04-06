import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getRedirectUrl } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { useAuthSuccessHandler } from '../components/auth/AuthSuccessHandler';
import { toast } from '@/lib/toast'; // Add this import
import { adminCreateUser } from '@/lib/admin-api';

interface UserRole {
  user_id: string;
  role: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{error: any}>;
  signInWithGoogle: () => Promise<{error: any}>;
  signUp: (email: string, password: string) => Promise<{error: any}>;
  signOut: () => Promise<{error: any}>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useAuthSuccessHandler(user);

  useEffect(() => {
    const fetchUserRole = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
    
        if (error) {
          console.error('Error fetching user role:', error);
          
          // Check if the error is because the user doesn't exist
          if (error.code === 'PGRST116' && error.message.includes('Results contain 0 rows')) {
            // User profile not found
            console.warn('User profile not found when fetching role');
            
            // Try to create profile
            await ensureUserInDatabase(userId);
          } else if (error.code === '23503' || error.message.includes('violates foreign key constraint')) {
            // Foreign key violation - user doesn't exist in auth.users
            await forceSignOut('Your account no longer exists');
            return;
          }
          
          setIsAdmin(false);
          return;
        }
    
        // Check if the user has an admin role
        setIsAdmin(data?.role === 'admin');
      } catch (err) {
        console.error('Exception fetching user role:', err);
        setIsAdmin(false);
      }
    };

    // First, create a new function to handle force sign out
    const forceSignOut = async (reason: string) => {
      console.warn(`Force signing out user: ${reason}`);
      
      // Clear state first to prevent further API calls
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      
      // Then call Supabase sign out
      await supabase.auth.signOut();
      
      // Notify user
      toast.error(`You've been signed out: ${reason}`);
      
      // Optional: redirect to login page
      // window.location.href = '/login';
    };

    // Update your ensureUserInDatabase function
    const ensureUserInDatabase = async (userId: string, email?: string) => {
      try {
        // Check if user exists in profiles with username
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', userId)
          .single();
        
        if (error || !data) {
          console.log('Creating user profile manually');
          // Generate username from email
          const defaultUsername = email ? 
            email.split('@')[0] + '_' + Math.random().toString(36).substring(2, 8) : 
            'user_' + Math.random().toString(36).substring(2, 8);
          
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({ 
              id: userId,
              username: defaultUsername,
              updated_at: new Date().toISOString()
            });
          
          if (insertError) {
            console.error('Failed to create user profile:', insertError);
            
            // Check for foreign key violation error (user not in auth.users)
            if (insertError.code === '23503' && 
                insertError.message.includes('violates foreign key constraint')) {
              // User doesn't exist in auth.users, force sign out
              await forceSignOut('Your account no longer exists');
              return;
            }
          }
        } else if (!data.username) {
          // Profile exists but has no username
          const defaultUsername = email ? 
            email.split('@')[0] + '_' + Math.random().toString(36).substring(2, 8) : 
            'user_' + Math.random().toString(36).substring(2, 8);
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              username: defaultUsername,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);
          
          if (updateError) {
            console.error('Failed to update username:', updateError);
            
            // Also check for foreign key violation in updates
            if (updateError.code === '23503' && 
                updateError.message.includes('violates foreign key constraint')) {
              // User doesn't exist in auth.users, force sign out
              await forceSignOut('Your account no longer exists');
              return;
            }
          }
        }
      } catch (err) {
        console.error('Error checking/creating user profile:', err);
      }
    };

    // Get initial session and setup auth subscription
    const initializeAuth = async () => {
      setIsLoading(true);
      
      // Get current session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session:', error);
      }
      
      if (session) {
        setSession(session);
        setUser(session.user);
        
        // Fetch role if we have a user
        await fetchUserRole(session.user.id);
      }
      
      // Listen for auth changes
      const { data: { subscription } } = await supabase.auth.onAuthStateChange(
        async (event, currentSession) => {
          console.log('Auth state change:', event);
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          
          // In your auth state change handler
          if (currentSession?.user) {
            // Try to ensure user exists in database with username
            await ensureUserInDatabase(
              currentSession.user.id, 
              currentSession.user.email
            );
            
            // Then fetch role as before
            await fetchUserRole(currentSession.user.id);
          } else {
            setIsAdmin(false);
          }
        }
      );
      
      setIsLoading(false);
      
      // Cleanup subscription on unmount
      return () => {
        subscription.unsubscribe();
      };
    };

    initializeAuth();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    try {
      console.log('Starting Google sign in process');
      const redirectTo = getRedirectUrl();
      console.log('Using redirect URL:', redirectTo);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          }
        }
      });
      
      console.log('Google auth initiated:', { 
        error: error ? error.message : null,
        url: data?.url ? 'Generated' : 'None',
      });
      
      if (error) {
        console.error('Error during Google auth:', error);
      }
      
      return { error };
    } catch (err) {
      console.error('Exception during Google sign in:', err);
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl()
        }
      });
      
      if (error) {
        console.error('Error during signup:', error);
        return { error };
      }
      
      // Show appropriate message
      if (!data.session) {
        toast.info('Please check your email for a confirmation link');
      } else {
        toast.success('Account created successfully!');
      }
      
      return { error: null };
    } catch (err) {
      console.error('Exception during signup:', err);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      console.log('Signing out user...');
      
      // Call Supabase sign out
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Error during sign out:', error);
        toast.error('Error signing out. Please try again.');
        return { error };
      }
      
      // Clear local state (this might be redundant as onAuthStateChange will also trigger)
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      
      console.log('User signed out successfully');
      toast.success('Signed out successfully');
      
      // You could add a redirect here if needed
      // window.location.href = '/login';
      
      return { error: null };
    } catch (err) {
      console.error('Exception during sign out:', err);
      toast.error('An unexpected error occurred');
      return { error: err };
    }
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      isLoading,
      isAdmin,
      signInWithEmail,
      signInWithGoogle,
      signUp,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}