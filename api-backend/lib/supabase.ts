import { createClient } from '@supabase/supabase-js';

// In workers, env is passed as a parameter to the fetch handler
export const getSupabaseClient = (env: any) => {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        'X-Client-Info': 'wave-analyzer-api-worker'
      }
    }
  });
};