import React, { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { apiUrl } from '@/utils/apiConfig';

const ApiStatusCheck = () => {
  const [status, setStatus] = useState<'loading' | 'online' | 'offline' | 'error'>('loading');
  const [details, setDetails] = useState<string>('Checking API status...');
  const [lastChecked, setLastChecked] = useState<string>('');

  // Function to check API health
  const checkApiStatus = async () => {
    try {
      setStatus('loading');
      setDetails('Checking API status...');
      
      // Use the apiUrl utility instead of hardcoded URL
      const response = await fetch(apiUrl('health'), { 
        headers: { 'Accept': 'application/json' },
      });
      
      // Check if it's a JSON response
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Get a preview of what we received
        const text = await response.text();
        const preview = text.substring(0, 100);
        throw new Error(`API returned non-JSON response: ${preview}...`);
      }
      
      const data = await response.json();
      
      if (data.status === 'ok') {
        setStatus('online');
        setDetails(`API version: ${data.version || 'unknown'}`);
      } else {
        setStatus('error');
        setDetails(data.message || 'API reported an error');
      }
    } catch (error) {
      setStatus('offline');
      setDetails(error instanceof Error ? error.message : 'Failed to connect to API');
      console.error('API connection error:', error);
    } finally {
      setLastChecked(`Last checked: ${new Date().toLocaleTimeString()}`);
    }
  };

  // Check status on component mount
  useEffect(() => {
    checkApiStatus();
    
    // Set up periodic checks every minute
    const interval = setInterval(checkApiStatus, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {status === 'online' && (
            <CheckCircle className="h-5 w-5 text-green-500" />
          )}
          {status === 'offline' && (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          {(status === 'loading' || status === 'error') && (
            <AlertCircle className={`h-5 w-5 ${status === 'loading' ? 'text-yellow-500' : 'text-red-500'}`} />
          )}
          <span>API Status:</span>
        </div>
        
        <Badge
          variant={
            status === 'online' ? 'default' :
            status === 'offline' ? 'destructive' :
            status === 'error' ? 'outline' : 'secondary'
          }
          className={status === 'loading' ? 'animate-pulse' : ''}
        >
          {status === 'online' ? 'Online' :
           status === 'offline' ? 'Offline' :
           status === 'error' ? 'Error' : 'Checking...'}
        </Badge>
      </div>
      
      <div className="text-sm text-muted-foreground space-y-1">
        <p>{details}</p>
        <p className="text-xs">{lastChecked}</p>
      </div>
      
      {status !== 'online' && (
        <div className="mt-2 text-sm">
          <button 
            onClick={checkApiStatus}
            className="text-blue-500 hover:underline flex items-center"
          >
            Retry connection
          </button>
        </div>
      )}
    </div>
  );
};

export default ApiStatusCheck;