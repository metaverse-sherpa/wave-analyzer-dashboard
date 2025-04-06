import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Process the OAuth callback
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Get the stored redirect URL
        const redirectTo = localStorage.getItem('authRedirect') || '/';
        
        // Clear it from storage
        localStorage.removeItem('authRedirect');
        
        // Redirect the user
        navigate(redirectTo);
      }
    });

    return () => {
      // Clean up the listener
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
        <p>Completing your sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;