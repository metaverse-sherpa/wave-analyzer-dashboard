import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CircleCheck, CircleX, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkBackendHealth } from '@/services/yahooFinanceService';
import { toast } from '@/lib/toast';

const ApiStatusCheck = () => {
  // Define API status state
  const [status, setStatus] = useState<'checking' | 'online' | 'offline' | 'degraded'>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [details, setDetails] = useState<{ message: string; version?: string }>({ message: 'Checking API...' });

  // Function to check API status
  const checkApiStatus = async () => {
    setIsRefreshing(true);
    setStatus('checking');
    
    try {
      // Use relative URL path with Vite's proxy
      const health = await checkBackendHealth();
      
      if (health.status === 'ok') {
        setStatus('online');
        setDetails({
          message: health.message || 'API is online',
          version: health.version
        });
      } else {
        setStatus('degraded');
        setDetails({
          message: health.message || 'Limited API functionality'
        });
        console.warn('API health check returned non-OK status:', health);
      }
    } catch (error) {
      console.error('API connection error:', error);
      setStatus('offline');
      setDetails({
        message: error instanceof Error ? error.message : 'Connection failed'
      });
    } finally {
      setIsRefreshing(false);
      setLastChecked(new Date());
    }
  };

  // Check API on component mount
  useEffect(() => {
    checkApiStatus();
  }, []);

  // Define rendering elements
  const statusIndicator = {
    checking: <RefreshCw className="h-4 w-4 animate-spin text-yellow-500" />,
    online: <CircleCheck className="h-4 w-4 text-green-600" />,
    offline: <CircleX className="h-4 w-4 text-red-600" />,
    degraded: <AlertTriangle className="h-4 w-4 text-amber-500" />
  };

  const statusText = {
    checking: 'Checking...',
    online: 'Online',
    offline: 'Offline',
    degraded: 'Degraded'
  };

  const statusBadgeClasses = {
    checking: 'bg-yellow-50 text-yellow-700',
    online: 'bg-green-50 text-green-700',
    offline: 'bg-red-50 text-red-700',
    degraded: 'bg-amber-50 text-amber-700'
  };

  // Manual refresh handler
  const handleRefresh = () => {
    toast.info('Checking API status...');
    checkApiStatus();
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {statusIndicator[status]}
          <span className="font-medium">Backend API Status:</span>
          
          <Badge className={statusBadgeClasses[status]}>
            {statusText[status]}
          </Badge>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      <div className="text-sm text-muted-foreground">
        <p>{details.message}</p>
        {details.version && (
          <p className="text-xs mt-1">Version: {details.version}</p>
        )}
      </div>
      
      {lastChecked && (
        <p className="text-xs text-muted-foreground">
          Last checked: {lastChecked.toLocaleTimeString()}
        </p>
      )}
      
      {/* Health endpoints - Debug info */}
      {status === 'offline' && (
        <div className="text-xs text-muted-foreground mt-2 p-2 bg-gray-50 rounded-md">
          <p>Try accessing these endpoints directly:</p>
          <ul className="list-disc pl-5 mt-1">
            <li>
              <a 
                href="/api/health" 
                target="_blank" 
                className="text-blue-600 hover:underline"
              >
                /api/health
              </a> (via proxy)
            </li>
            <li>
              <a 
                href="http://localhost:3001/api/health" 
                target="_blank" 
                className="text-blue-600 hover:underline"
              >
                http://localhost:3001/api/health
              </a> (direct)
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default ApiStatusCheck;