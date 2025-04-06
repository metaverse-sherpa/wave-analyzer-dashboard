import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Let Supabase handle the callback automatically
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          toast.error('Authentication failed');
          setTimeout(() => navigate('/login'), 2000);
          return;
        }
        
        if (data?.session) {
          console.log('Authentication successful');
          toast.success('Signed in successfully');
          navigate('/');
        } else {
          console.warn('No session found after callback');
          toast.error('Authentication failed');
          setTimeout(() => navigate('/login'), 2000);
        }
      } catch (err) {
        console.error('Unexpected error in auth callback:', err);
        toast.error('An unexpected error occurred');
        setTimeout(() => navigate('/login'), 2000);
      }
    };
    
    handleCallback();
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