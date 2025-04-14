import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import { DataRefreshContext, DataRefreshContextType } from './DataRefreshContext';
import { useHistoricalData } from './HistoricalDataContext';
import { useWaveAnalysis } from './WaveAnalysisContext';
import { marketIndexes } from '@/config/marketIndexes';
import { toast } from '@/lib/toast';
import { useAdminSettings } from './AdminSettingsContext';

// Define some commonly tracked symbols for analysis
const COMMON_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 
  'NVDA', 'AMD', 'INTC', 'JPM', 'BAC', 'GS',
  'V', 'MA', 'PG', 'KO', 'PEP', 'WMT'
];

// Get market indices from the config
const INDEX_SYMBOLS = marketIndexes.map(index => index.symbol);

// Combine all symbols we want to refresh
const SYMBOLS_TO_REFRESH = [...new Set([...INDEX_SYMBOLS, ...COMMON_SYMBOLS])];

// Constants for refresh timing
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const INITIAL_DELAY = 5 * 60 * 1000; // 5 minutes initial delay after app start
const STAGGER_DELAY = 15 * 1000; // 15 seconds between each symbol refresh to avoid API rate limits
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds heartbeat check

// Worker state management
let refreshWorker: Worker | null = null;
let workerReady = false;

// Provider component
export const DataRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [progress, setProgress] = useState<{
    total: number;
    current: number;
    currentSymbol: string | null;
  }>({
    total: 0,
    current: 0,
    currentSymbol: null
  });
  
  const { getHistoricalData } = useHistoricalData();
  const { getAnalysis } = useWaveAnalysis();
  const adminSettings = useAdminSettings();
  
  // Use refs to keep track of refresh state across renders
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshInProgressRef = useRef<boolean>(false);
  const requestIdCounterRef = useRef<number>(0);

  // Initialize the refresh worker
  const initRefreshWorker = useCallback(() => {
    try {
      // Only initialize in browsers that support service workers
      if (typeof Worker !== 'undefined') {
        console.log('Initializing refresh worker...');
        
        // Create a new worker
        refreshWorker = new Worker('/refresh-worker.js');
        
        // Set up message handling
        refreshWorker.addEventListener('message', (event) => {
          // Check if event.data exists before trying to destructure it
          if (!event.data) {
            console.error('Received message with no data from worker');
            return;
          }
          
          const { action } = event.data;
          const payload = event.data.payload || {};
          
          // Debug logging in development mode
          if (import.meta.env.DEV) {
            console.log(`[DataRefreshManager] Received worker message: ${action}`, event.data);
          }
          
          switch (action) {
            case 'INITIALIZED':
              workerReady = true;
              console.log('Refresh worker initialized:', payload);
              break;
              
            case 'REFRESH_RESULT':
              console.log('Received refresh result:', payload);
              setLastHeartbeat(Date.now());
              // Broadcast the worker message as a custom event
              dispatchWorkerEvent('REFRESH_RESULT', event.data);
              break;
              
            case 'REFRESH_ERROR':
              // Safely log error without assuming payload structure
              console.error('Refresh error:', event.data);
              
              // Handle payload being undefined or missing error property
              const errorMessage = event.data.error || 
                (payload && typeof payload === 'object' && payload.error) 
                  ? `Background refresh failed: ${event.data.error || payload.error}`
                  : 'Background refresh failed with an unknown error';
              
              toast.error(errorMessage);
              dispatchWorkerEvent('REFRESH_ERROR', event.data);
              break;
              
            case 'HEARTBEAT':
              setLastHeartbeat(Date.now());
              dispatchWorkerEvent('HEARTBEAT', event.data);
              break;
              
            // Handle operation status updates for full data refresh
            case 'OPERATION_STATUS':
              // Ensure we dispatch status updates immediately and completely
              dispatchWorkerEvent('OPERATION_STATUS', event.data);
              break;
              
            // Add handlers for full data refresh workflow
            case 'FULL_REFRESH_STARTED':
              setIsRefreshing(true);
              dispatchWorkerEvent('FULL_REFRESH_STARTED', event.data);
              break;
              
            case 'FULL_REFRESH_COMPLETED':
              setIsRefreshing(false);
              setLastRefreshTime(Date.now());
              localStorage.setItem('lastDataRefreshTime', Date.now().toString());
              dispatchWorkerEvent('FULL_REFRESH_COMPLETED', event.data);
              toast.success('Full data refresh completed successfully');
              break;
              
            case 'FULL_REFRESH_ERROR':
              setIsRefreshing(false);
              dispatchWorkerEvent('FULL_REFRESH_ERROR', event.data);
              toast.error(`Full data refresh failed: ${event.data?.error || 'Unknown error'}`);
              break;
              
            // Add handlers for other message types
            case 'REFRESH_STARTED':
            case 'REFRESH_STOPPED':
            case 'ALL_REFRESHES_STOPPED':
            case 'REFRESHES_PAUSED':
              dispatchWorkerEvent(action, event.data);
              break;
              
            default:
              console.log(`Unhandled worker message: ${action}`, event.data);
              // Still dispatch unhandled messages as they might be useful
              dispatchWorkerEvent(action, event.data);
          }
        });
        
        // Get API base URL from environment
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
        const authToken = localStorage.getItem('auth_token') || '';
        
        // Make sure apiBaseUrl doesn't end with /api to avoid duplication
        const normalizedApiBaseUrl = apiBaseUrl.endsWith('/api') 
          ? apiBaseUrl 
          : apiBaseUrl.endsWith('/') ? `${apiBaseUrl}api` : `${apiBaseUrl}/api`;
        
        console.log('[DataRefreshManager] Initializing worker with API endpoint:', normalizedApiBaseUrl);
        
        // Initialize the worker with configuration
        refreshWorker.postMessage({
          action: 'INIT',
          payload: {
            config: {
              apiEndpoint: normalizedApiBaseUrl,
              refreshToken: authToken
            }
          }
        });

        return refreshWorker;
      }
    } catch (error) {
      console.error('Failed to initialize refresh worker:', error);
    }
    
    return null;
  }, []);

  // Function to broadcast worker messages as custom events
  const dispatchWorkerEvent = (action: string, data: any) => {
    // Add timestamp if not present
    const timestamp = data.timestamp || Date.now();
    
    // Create a structured event object with all necessary data
    const eventData = {
      action,
      timestamp,
      ...data
    };
    
    // Debug log in development
    if (import.meta.env.DEV) {
      console.log(`[DataRefreshManager] Dispatching worker event: ${action}`, eventData);
    }
    
    const event = new CustomEvent('worker-message', {
      detail: eventData
    });
    
    window.dispatchEvent(event);
  };

  // Initialize the worker on mount
  useEffect(() => {
    // Only create the worker in browser environment
    if (typeof window !== 'undefined') {
      try {
        const newWorker = initRefreshWorker();
        if (newWorker) {
          setWorker(newWorker);
          console.log('Background refresh worker initialized');
        }
        
        // Set up heartbeat to keep worker alive
        heartbeatIntervalRef.current = setInterval(() => {
          if (refreshWorker) {
            refreshWorker.postMessage({ 
              action: 'PING', 
              id: requestIdCounterRef.current 
            });
          }
        }, HEARTBEAT_INTERVAL);
        
        // Clean up on unmount
        return () => {
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          if (refreshWorker) {
            refreshWorker.terminate();
            refreshWorker = null;
            workerReady = false;
          }
        };
      } catch (error) {
        console.error('Failed to initialize worker:', error);
        // Fall back to the traditional method if worker fails
      }
    }
  }, [initRefreshWorker]);
  
  // Function to start refreshing data with the worker
  const refreshData = async () => {
    if (refreshInProgressRef.current) {
      console.log('Data refresh already in progress, skipping');
      return;
    }
    
    try {
      // If we have a working service worker, use it
      if (worker) {
        const requestId = ++requestIdCounterRef.current;
        console.log('Starting background refresh via worker', requestId);
        
        worker.postMessage({
          type: 'START_REFRESH',
          id: requestId,
          payload: {
            symbols: SYMBOLS_TO_REFRESH
          }
        });
      } else {
        // Fall back to the traditional method
        await refreshDataTraditional();
      }
    } catch (err) {
      console.error('Error starting data refresh:', err);
      refreshInProgressRef.current = false;
      setIsRefreshing(false);
    }
  };
  
  // Start background refresh
  const startBackgroundRefresh = useCallback(() => {
    if (!refreshWorker || !workerReady) {
      console.warn('Refresh worker not ready, initializing...');
      refreshWorker = initRefreshWorker();
      if (!refreshWorker) {
        toast.error("Failed to initialize background worker");
        return null;
      }
    }
    
    console.log('Started background refresh worker');
    toast.success('Background worker initialized');
    
    return refreshWorker;
  }, [initRefreshWorker]);
  
  // Stop background refresh
  const stopBackgroundRefresh = useCallback(() => {
    if (refreshWorker) {
      refreshWorker.postMessage({ action: 'STOP_ALL' });
      console.log('Stopped all background refresh cycles');
      toast.success('Background refresh stopped');
    }
  }, []);
  
  // Traditional refresh method as fallback
  const refreshDataTraditional = async () => {
    try {
      refreshInProgressRef.current = true;
      setIsRefreshing(true);
      console.log('Starting traditional data refresh', new Date().toISOString());
      
      // Process symbols in sequence to avoid overwhelming the API
      setProgress({
        total: SYMBOLS_TO_REFRESH.length,
        current: 0,
        currentSymbol: null
      });
      
      // Process symbols in sequence to avoid overwhelming the API
      for (let i = 0; i < SYMBOLS_TO_REFRESH.length; i++) {
        const symbol = SYMBOLS_TO_REFRESH[i];
        try {
          setProgress(prev => ({
            ...prev,
            current: i + 1,
            currentSymbol: symbol
          }));
          
          console.log(`Refreshing historical data for ${symbol}`);
          
          // First, fetch fresh historical data
          const historicalData = await getHistoricalData(symbol, '1d', true); // Force refresh
          
          if (!historicalData || historicalData.length === 0) {
            console.warn(`Failed to get historical data for ${symbol}`);
            continue;
          }
          
          console.log(`Historical data refreshed for ${symbol}, now analyzing waves`);
          
          // Then trigger wave analysis with the fresh data
          // Using silent mode to avoid UI notifications
          await getAnalysis(symbol, historicalData, true, true);
          
          console.log(`Wave analysis completed for ${symbol}`);
          
          // Stagger requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
        } catch (error) {
          console.error(`Error refreshing data for ${symbol}:`, error);
          // Continue with next symbol even if one fails
        }
      }
      
      // Update the last refresh time
      const refreshTime = Date.now();
      setLastRefreshTime(refreshTime);
      localStorage.setItem('lastDataRefreshTime', refreshTime.toString());
      
      console.log('Traditional data refresh completed', new Date().toISOString());
      
      // Only show toast if the app is in the foreground
      if (document.visibilityState === 'visible') {
        toast.success('Stock data and analyses have been refreshed', {
          duration: 3000,
        });
      }
    } catch (err) {
      console.error('Error in traditional data refresh process:', err);
    } finally {
      setIsRefreshing(false);
      refreshInProgressRef.current = false;
      setProgress({
        total: 0,
        current: 0,
        currentSymbol: null
      });
      
      // Schedule next refresh
      scheduleNextRefresh();
    }
  };
  
  // Function to cancel an ongoing refresh
  const cancelRefresh = () => {
    if (worker && refreshInProgressRef.current) {
      console.log('Cancelling background refresh process');
      worker.postMessage({
        type: 'CANCEL_REFRESH',
        id: requestIdCounterRef.current
      });
    } else {
      console.log('No active refresh process to cancel');
    }
  };
  
  // Function to schedule the next refresh
  const scheduleNextRefresh = () => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    // Schedule next refresh in 24 hours
    refreshTimeoutRef.current = setTimeout(() => {
      refreshData();
    }, REFRESH_INTERVAL);
    
    console.log('Next refresh scheduled for', new Date(Date.now() + REFRESH_INTERVAL).toLocaleString());
  };
  
  // Check when the last refresh happened on mount
  useEffect(() => {
    // Get the last refresh time from localStorage
    const storedRefreshTime = localStorage.getItem('lastDataRefreshTime');
    const lastRefresh = storedRefreshTime ? parseInt(storedRefreshTime, 10) : null;
    
    if (lastRefresh) {
      setLastRefreshTime(lastRefresh);
      
      // Calculate time until next refresh
      const timeSinceLastRefresh = Date.now() - lastRefresh;
      const timeUntilNextRefresh = Math.max(0, REFRESH_INTERVAL - timeSinceLastRefresh);
      
      console.log('Last data refresh was', new Date(lastRefresh).toLocaleString());
      console.log('Next refresh in', Math.round(timeUntilNextRefresh / (60 * 1000)), 'minutes');
      
      // If it's been more than 24 hours, refresh immediately with a small delay
      // Otherwise schedule for the remaining time
      if (timeSinceLastRefresh >= REFRESH_INTERVAL) {
        refreshTimeoutRef.current = setTimeout(() => {
          refreshData();
        }, INITIAL_DELAY);
        
        console.log('Scheduling refresh after initial delay');
      } else {
        refreshTimeoutRef.current = setTimeout(() => {
          refreshData();
        }, timeUntilNextRefresh);
        
        console.log('Scheduling refresh at next interval');
      }
    } else {
      // No previous refresh, schedule initial refresh after a delay
      refreshTimeoutRef.current = setTimeout(() => {
        refreshData();
      }, INITIAL_DELAY);
      
      console.log('No previous refresh found, scheduling initial refresh');
    }
    
    // Cleanup function
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle visibility changes to optimize background refresh
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('App came to foreground, checking refresh status');
        
        // If it's been more than 24 hours since last refresh, trigger refresh
        if (lastRefreshTime && Date.now() - lastRefreshTime >= REFRESH_INTERVAL) {
          console.log('App returned to foreground and refresh interval passed, refreshing data');
          refreshData();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lastRefreshTime]);
  
  // Create the context value
  const contextValue: DataRefreshContextType = {
    lastRefreshTime,
    isRefreshing,
    refreshData,
    cancelRefresh,
    progress,
    startBackgroundRefresh,
    stopBackgroundRefresh
  };
  
  return (
    <DataRefreshContext.Provider value={contextValue}>
      {children}
    </DataRefreshContext.Provider>
  );
};