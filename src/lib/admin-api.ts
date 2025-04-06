import { supabase, ensureUserProfile } from './supabase';

// Import environment variables directly
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Use this function to create a user with detailed error logging
export const adminCreateUser = async (email: string, password: string) => {
  try {
    console.log('Attempting to create user with email:', email);
    
    // Use environment variables instead of protected properties
    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'X-Client-Info': 'supabase-js/2.x'
      },
      body: JSON.stringify({
        email,
        password,
        data: {
          // Optional user metadata
          source: 'direct-api'
        }
      })
    });
    
    // Get full response
    const rawText = await response.text();
    let data;
    
    try {
      // Try to parse as JSON
      data = JSON.parse(rawText);
    } catch (e) {
      console.log('Response is not JSON:', rawText);
      data = { raw: rawText };
    }
    
    // Log detailed information
    console.log('Signup API response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries([...response.headers.entries()]),
      data
    });
    
    if (!response.ok) {
      return { error: data };
    }
    
    // If we got a user, create a profile manually
    if (data?.user?.id) {
      try {
        console.log('Creating profile for new user:', data.user.id);
        
        // First attempt - use our helper
        await ensureUserProfile(data.user.id);
        
        // Second attempt - direct table insert
        await supabase.from('profiles').insert({
          id: data.user.id,
          role: 'user'
        });
        
        console.log('Profile created successfully');
      } catch (profileError) {
        console.error('Failed to create profile:', profileError);
      }
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Exception in adminCreateUser:', err);
    return { error: err };
  }
};

// Add this to check Supabase logs
export const checkSupabaseLogs = async () => {
  try {
    // This requires admin privileges
    const { data, error } = await supabase.rpc('get_auth_logs');
    
    if (error) {
      console.error('Error fetching logs:', error);
      return { error };
    }
    
    console.log('Supabase logs:', data);
    return { data, error: null };
  } catch (err) {
    console.error('Exception fetching logs:', err);
    return { error: err };
  }
};

// Add this SQL function to your Supabase project:
/*
-- Create a function to retrieve recent auth logs (if you have access)
CREATE OR REPLACE FUNCTION get_auth_logs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- This will only work if you have permissions to access pg_catalog
  SELECT jsonb_agg(log)
  INTO result
  FROM (
    SELECT 
      now() as timestamp,
      'Auth logs cannot be accessed directly' as message
  ) as log;
  
  RETURN result;
END;
$$;
*/