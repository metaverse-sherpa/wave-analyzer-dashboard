import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a minimal client without unnecessary configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    // Add fetch options here instead of in cookies property
    headers: {
      'X-Client-Info': 'wave-analyzer-dashboard'
    }
  }
});

// Get the redirect URL
export const getRedirectUrl = () => {
  const isProd = import.meta.env.PROD;
  return isProd 
    ? 'https://elliottwaves.ai/auth/callback'
    : `${window.location.origin}/auth/callback`;
};

// Helper function to create a profile for a user
export const ensureUserProfile = async (userId: string) => {
  if (!userId) return false;
  
  try {
    // Call our custom function
    const { error } = await supabase.rpc('handle_user_profile', {
      user_id: userId
    });
    
    if (error) {
      console.error('Error ensuring user profile:', error);
      
      // Fallback: Try direct insert if RPC fails
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId })
        .select();
        
      if (insertError) {
        console.error('Fallback profile creation failed:', insertError);
        return false;
      }
    }
    
    return true;
  } catch (e) {
    console.error('Exception in ensureUserProfile:', e);
    return false;
  }
};

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('Supabase client initialized with URL:', supabaseUrl);
  console.log('Auth redirect URL:', getRedirectUrl());
}