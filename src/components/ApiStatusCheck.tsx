import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';

const ApiStatusCheck: React.FC = () => {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState('Checking API endpoint...');
  
  const checkApi = async () => {
    setApiStatus('checking');
    setMessage('Checking API endpoint...');
    
    try {
      // Check health endpoint
      const healthResponse = await fetch('/api/health');
      if (!healthResponse.ok) {
        setApiStatus('error');
        setMessage('API health check failed. Server may be down.');
        return;
      }
      
      // Check historical data endpoint with a simple request
      const historicalResponse = await fetch('/api/historical?symbol=AAPL&timeframe=1d');
      if (!historicalResponse.ok) {
        setApiStatus('error');
        setMessage('Historical data API endpoint is not responding correctly.');
        return;
      }
      
      const data = await historicalResponse.json();
      if (!Array.isArray(data) || data.length === 0) {
        setApiStatus('error');
        setMessage('Historical data API returned empty or invalid response.');
        return;
      }
      
      setApiStatus('ok');
      setMessage(`API is working properly. Retrieved ${data.length} data points.`);
    } catch (error) {
      setApiStatus('error');
      setMessage(`API connection error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  useEffect(() => {
    checkApi();
  }, []);
  
  return (
    <div className="p-4 bg-background border rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">API Status</h3>
        <div className={`w-3 h-3 rounded-full ${
          apiStatus === 'checking' ? 'bg-yellow-500' :
          apiStatus === 'ok' ? 'bg-green-500' : 'bg-red-500'
        }`}></div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button 
        size="sm" 
        variant="outline" 
        onClick={checkApi}
        disabled={apiStatus === 'checking'}
      >
        {apiStatus === 'checking' ? 'Checking...' : 'Check Again'}
      </Button>
    </div>
  );
};

export default ApiStatusCheck;