import { useState, useEffect } from 'react';
import { checkBackendHealth } from '../services/yahooFinanceService';
import { Button } from './ui/button';

export interface ApiStatusProps {
  onStatusChange?: (status: 'online' | 'offline' | 'checking' | 'degraded') => void;
}

const ApiStatus: React.FC<ApiStatusProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking' | 'degraded'>('checking');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  
  useEffect(() => {
    // Get the API URL from environment
    setApiUrl(import.meta.env.VITE_API_BASE_URL || '(Default API)');
  }, []);
  
  const checkStatus = async () => {
    setIsRefreshing(true);
    try {
      const healthResult = await checkBackendHealth();
      const newStatus = healthResult.status === 'ok' ? 'online' : 'offline';
      setStatus(newStatus);
      if (onStatusChange) onStatusChange(newStatus);
    } catch (err) {
      setStatus('offline');
      if (onStatusChange) onStatusChange('offline');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-medium mb-2">API Connection</h3>
      <div className="flex items-center space-x-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${
          status === 'checking' ? 'bg-gray-400' : 
          status === 'online' ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span>{
          status === 'checking' ? 'Checking...' :
          status === 'online' ? 'Connected' : 'Disconnected'
        }</span>
      </div>
      <div className="text-xs text-gray-500 mb-2">
        URL: {apiUrl}
      </div>
      <Button 
        size="sm" 
        variant="outline" 
        onClick={checkStatus}
        disabled={isRefreshing}
      >
        {isRefreshing ? 'Refreshing...' : 'Check Connection'}
      </Button>
    </div>
  );
}

export default ApiStatus;