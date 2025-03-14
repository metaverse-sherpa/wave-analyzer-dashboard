import { createClient } from '@supabase/supabase-js';

// Use environment variables for production
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fobbjcbpyvyxswrrngoh.supabase.co';

// Use anon key instead of service role key
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create client with anon key
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// For debugging in non-production environments
if (import.meta.env.NODE_ENV !== 'production') {
  console.log('Supabase client initialized with URL:', supabaseUrl);
}