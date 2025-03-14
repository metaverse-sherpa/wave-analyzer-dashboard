import { createClient } from '@supabase/supabase-js';

// For development, we'll use direct values
// In production, these should come from environment variables
const supabaseUrl = 'https://fobbjcbpyvyxswrrngoh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvYmJqY2JweXZ5eHN3cnJuZ29oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDQxODYyMiwiZXhwIjoyMDU1OTk0NjIyfQ.3HrHnqCBBqn_FTXvPPp5fg4cHslq0LGyprNGlQdlM68';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// For debugging
console.log('Supabase client initialized with URL:', supabaseUrl);