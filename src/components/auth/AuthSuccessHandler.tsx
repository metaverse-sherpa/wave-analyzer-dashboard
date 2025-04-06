// src/components/auth/AuthSuccessHandler.tsx
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';

export const useAuthSuccessHandler = (user: any) => {
  useEffect(() => {
    if (user?.id) {
      const ensureProfile = async () => {
        try {
          // Try the local approach first
          const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();
            
          // If we find the profile or get a "not found" error, we're good
          if (data || error?.code === 'PGRST116') {
            // If not found, directly insert
            if (error?.code === 'PGRST116') {
              const { error: insertError } = await supabase
                .from('profiles')
                .insert({ id: user.id });
                
              if (insertError) {
                console.log('Direct insert failed, trying edge function', insertError);
                // If direct insert fails, try edge function as fallback
                const edgeFunctionUrl = 'https://fobbjcbpyvyxswrrngoh.supabase.co/functions/v1/handle-user-creation';
                
                const response = await fetch(edgeFunctionUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabase.auth.getSession()}`
                  },
                  body: JSON.stringify({ userId: user.id })
                });
                
                const result = await response.json();
                console.log('Edge function result:', result);
              } else {
                console.log('Profile created via direct insert');
              }
            }
          } else {
            console.log('Unexpected error checking profile', error);
          }
        } catch (err) {
          console.error('Error in ensureProfile:', err);
        }
      };
      
      ensureProfile();
    }
  }, [user?.id]);
  
  return null;
};