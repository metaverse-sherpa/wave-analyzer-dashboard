import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { getApiBaseUrl, buildApiUrl } from '../config/apiConfig';

export function ApiDebug() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState<string>('');
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  
  useEffect(() => {
    // Get API URL
    const url = getApiBaseUrl();
    setApiUrl(url);
    
    // Collect available environment variables
    const vars: Record<string, string> = {};
    Object.keys(import.meta.env).forEach(key => {
      if (key.startsWith('VITE_')) {
        vars[key] = import.meta.env[key];
      }
    });
    setEnvVars(vars);
  }, []);
  
  const testApi = async (endpoint: string) => {
    setLoading(true);
    setResult('Testing connection...');
    const url = buildApiUrl(endpoint);
    
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : await response.text();
      
      setResult(`Status: ${response.status}\nURL: ${url}\nResponse: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\nURL: ${url}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="fixed bottom-2 left-2 p-4 bg-background/90 border rounded-md shadow-md max-w-md z-50">
      <h3 className="text-sm font-medium mb-2">API Connection Debug</h3>
      <div className="text-xs mb-2">API Base URL: {apiUrl}</div>
      <div className="text-xs mb-2">
        <strong>Environment Variables:</strong>
        <pre className="p-1 bg-muted rounded overflow-x-auto text-[10px]">
          {JSON.stringify(envVars, null, 2)}
        </pre>
      </div>
      <div className="flex gap-2 mb-2">
        <Button size="sm" onClick={() => testApi('health')} disabled={loading}>
          Test Health
        </Button>
        <Button size="sm" onClick={() => testApi('stocks/top?limit=5')} disabled={loading}>
          Test Stocks
        </Button>
      </div>
      {result && (
        <pre className="text-xs p-2 bg-muted rounded-md overflow-auto max-h-40">
          {result}
        </pre>
      )}
    </div>
  );
}