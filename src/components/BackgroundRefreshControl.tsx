import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle, StopCircle, Activity } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useAdminSettings } from '@/context/AdminSettingsContext';

// Create a custom event to notify other components when refresh is complete
export const REFRESH_COMPLETED_EVENT = 'background-refresh-completed';

function BackgroundRefreshControl() {
  const { startBackgroundRefresh, stopBackgroundRefresh } = useDataRefresh();
  const { settings } = useAdminSettings();
  const [isRunning, setIsRunning] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [operationActive, setOperationActive] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [currentSymbol, setCurrentSymbol] = useState<string | null>(null);
  const [totalStocks, setTotalStocks] = useState<number>(0);
  const [processedStocks, setProcessedStocks] = useState<number>(0);
  const [debugLogEnabled, setDebugLogEnabled] = useState<boolean>(false);

  // Listen for worker messages
  useEffect(() => {
    // Function to handle worker messages that are broadcast as CustomEvents
    const handleWorkerMessage = (event: CustomEvent) => {
      const { action, timestamp, activeTaskCount, step, message, progress: progressValue } = event.detail;

      // Debug logging to help diagnose issues
      if (debugLogEnabled) {
        console.log(`Worker message received: ${action}`, event.detail);
      }
      
      if (action === 'HEARTBEAT') {
        setLastHeartbeat(new Date(timestamp));
        setTaskCount(activeTaskCount || 0);
        setIsRunning(activeTaskCount > 0 || activeTaskCount?.activeOperationsCount > 0);
      } else if (action === 'REFRESHES_PAUSED' || action === 'ALL_REFRESHES_STOPPED') {
        setIsRunning(false);
        setOperationActive(false);
        setProgress(0);
        setStatusMessage('');
        setCurrentSymbol(null);
      } else if (action === 'REFRESH_STARTED' || action === 'FULL_REFRESH_STARTED') {
        setIsRunning(true);
        setOperationActive(true);
        setProgress(0);
        setStatusMessage('Starting data refresh...');
      } else if (action === 'FULL_REFRESH_COMPLETED') {
        setStatusMessage('Data refresh completed!');
        setProgress(100);
        setCurrentSymbol(null);

        // Dispatch a custom event to notify other components that refresh is complete
        const refreshCompletedEvent = new CustomEvent(REFRESH_COMPLETED_EVENT, {
          detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(refreshCompletedEvent);
        
        // Reset progress after a delay
        setTimeout(() => {
          setProgress(0);
          setStatusMessage('');
          setOperationActive(false);
        }, 5000);
      } else if (action === 'FULL_REFRESH_ERROR') {
        setStatusMessage(`Error: ${event.detail.error || 'Unknown error'}`);
        setOperationActive(false);
        setProgress(0);
        setCurrentSymbol(null);
      } else if (action === 'OPERATION_STATUS') {
        // Make sure operation is marked as active
        setOperationActive(true);
        
        // Extract detailed message information
        if (message) {
          setStatusMessage(message);
          
          // Try to parse stock symbol and progress from message
          const stockMatch = message.match(/for ([A-Z]+) \((\d+)\/(\d+)\)/);
          if (stockMatch) {
            const symbol = stockMatch[1];
            const current = parseInt(stockMatch[2], 10);
            const total = parseInt(stockMatch[3], 10);
            
            setCurrentSymbol(symbol);
            setProcessedStocks(current);
            setTotalStocks(total);
          }
        }
        
        // Update step if provided
        if (step) {
          setCurrentStep(step);
        }
        
        // Update progress if provided
        if (typeof progressValue === 'number') {
          // Ensure progress is between 0-100
          const normalizedProgress = Math.min(100, Math.max(0, progressValue));
          setProgress(normalizedProgress);
        }
      }
    };

    // Add event listener for custom events broadcast by our DataRefreshManager
    window.addEventListener('worker-message', handleWorkerMessage as EventListener);
    
    // Enable debug logging in development
    if (import.meta.env.DEV) {
      setDebugLogEnabled(true);
    }
    
    // Clean up
    return () => {
      window.removeEventListener('worker-message', handleWorkerMessage as EventListener);
    };
  }, []);

  const handleStart = () => {
    // Get settings for stockCount and cacheExpiryDays
    const stockCount = settings?.stockCount || 100;
    const cacheExpiryDays = settings?.cacheExpiryDays || 7;
    
    // Show initial status
    setStatusMessage('Initializing data refresh...');
    setOperationActive(true);
    setProgress(0);
    setCurrentSymbol(null);
    setTotalStocks(0);
    setProcessedStocks(0);
    
    // Start the full data refresh process
    const worker = startBackgroundRefresh();
    
    if (worker) {
      console.log('Starting full refresh process with settings:', { stockCount, cacheExpiryDays });
      
      // Track worker initialization
      setIsRunning(true);
      
      // Send FULL_DATA_REFRESH message to worker
      worker.postMessage({
        action: 'FULL_DATA_REFRESH',
        payload: {
          options: {
            stockCount,
            cacheExpiryDays
          }
        }
      });
    } else {
      // If worker couldn't be started, show error and reset state
      setStatusMessage('Failed to start background worker');
      setTimeout(() => {
        setOperationActive(false);
        setStatusMessage('');
      }, 3000);
    }
  };

  const handleStop = () => {
    stopBackgroundRefresh();
    setStatusMessage('Operations stopped');
    setOperationActive(false);
    setProgress(0);
    setCurrentSymbol(null);
    setIsRunning(false);
  };

  const getHeartbeatText = () => {
    if (!lastHeartbeat) return 'No heartbeat';
    
    const seconds = Math.round((Date.now() - lastHeartbeat.getTime()) / 1000);
    return seconds <= 60 
      ? `Heartbeat ${seconds}s ago` 
      : `Last heartbeat ${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">Background Data Refresh</CardTitle>
          <Badge variant={isRunning ? "default" : "secondary"}>
            {isRunning ? "Active" : "Idle"}
          </Badge>
        </div>
        <CardDescription>Manage background data refreshing</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-2">
          <div className="flex items-center text-sm">
            <Activity className="h-4 w-4 mr-2" />
            <span>{getHeartbeatText()}</span>
          </div>
          
          {taskCount > 0 && (
            <div className="text-sm">
              Active refresh tasks: {taskCount}
            </div>
          )}
          
          {operationActive && (
            <div className="space-y-2 mt-2">
              <div className="text-sm font-medium">{statusMessage}</div>
              
              {currentSymbol && (
                <div className="text-sm text-muted-foreground">
                  Processing: <span className="font-medium text-primary">{currentSymbol}</span>
                  {totalStocks > 0 && processedStocks > 0 && (
                    <span className="ml-2">({processedStocks}/{totalStocks})</span>
                  )}
                </div>
              )}
              
              <Progress value={progress} className="h-2" />
              <div className="text-xs text-right">{Math.round(progress)}% complete</div>
            </div>
          )}
          
          <div className="flex space-x-2 mt-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStart}
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Start
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStop} 
              disabled={!isRunning}
            >
              <StopCircle className="h-4 w-4 mr-2" />
              Stop
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BackgroundRefreshControl;