import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { checkSupabaseLogs } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';

// Import environment variables directly
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const AuthDebugger = () => {
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  
  const runChecks = async () => {
    setLoading(true);
    const checks: Record<string, any> = {};
    
    try {
      // Use environment variables instead of protected properties
      checks.authConfig = {
        url: supabaseUrl,
        hasKey: !!supabaseAnonKey,
      };
      
      // Check if profiles table exists
      const { data: tableData, error: tableError } = await supabase
        .from('profiles')
        .select('count(*)')
        .limit(1);
        
      checks.profilesTable = {
        exists: !tableError,
        error: tableError ? tableError.message : null,
        data: tableData
      };
      
      // Check if the RPC function exists
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('handle_user_profile', { user_id: '00000000-0000-0000-0000-000000000000' });
        
      checks.rpcFunction = {
        exists: !rpcError || !rpcError.message.includes('does not exist'),
        error: rpcError ? rpcError.message : null
      };
      
      // Check auth status
      const { data: sessionData } = await supabase.auth.getSession();
      checks.authStatus = {
        hasSession: !!sessionData.session,
        user: sessionData.session?.user?.email || null
      };
      
      // Check logs (may not work without admin access)
      const { data: logData, error: logError } = await checkSupabaseLogs();
      checks.logs = {
        success: !logError,
        error: logError ? String(logError) : null,
        data: logData
      };
      
    } catch (e) {
      checks.exception = String(e);
    }
    
    setResults(checks);
    setLoading(false);
  };
  
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Supabase Auth Debugger</h2>
      
      <Button 
        onClick={runChecks} 
        disabled={loading}
        className="mb-6"
      >
        {loading ? 'Running Checks...' : 'Run Diagnostic Checks'}
      </Button>
      
      {Object.keys(results).length > 0 && (
        <div className="bg-muted p-4 rounded-md">
          <h3 className="text-lg font-medium mb-2">Results:</h3>
          <pre className="overflow-auto bg-card p-3 rounded text-sm max-h-96">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
      
      <div className="mt-6 space-y-4">
        <h3 className="text-lg font-medium">Manual Tests:</h3>
        
        <div>
          <h4 className="text-md font-medium">1. Try Direct SQL Insert:</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Run this SQL in the Supabase SQL Editor:
          </p>
          <pre className="bg-card p-3 rounded text-sm">
{`-- Run this SQL to see if you can insert a row directly
INSERT INTO public.profiles (id)
VALUES ('00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING
RETURNING *;`}
          </pre>
        </div>
        
        <div>
          <h4 className="text-md font-medium">2. Check Recent Auth Events:</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Run this SQL to see recent auth events (if you have access):
          </p>
          <pre className="bg-card p-3 rounded text-sm">
{`-- This requires admin access to pg_catalog
SELECT * FROM auth.audit_log_entries
ORDER BY created_at DESC
LIMIT 10;`}
          </pre>
        </div>
        
        <div>
          <h4 className="text-md font-medium">3. Check for Database Errors:</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Run this SQL to check for recent errors:
          </p>
          <pre className="bg-card p-3 rounded text-sm">
{`-- This requires admin access
SELECT * FROM pg_stat_activity
WHERE state = 'active'
AND query LIKE '%profiles%';`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default AuthDebugger;