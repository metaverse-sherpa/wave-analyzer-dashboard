import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useHistoricalData } from './HistoricalDataContext';
import { useWaveAnalysis } from './WaveAnalysisContext';
import { marketIndexes } from '@/config/marketIndexes';
import { useAdminSettings } from './AdminSettingsContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { DataRefreshContext, type DataRefreshContextType } from './DataRefreshContext';

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

// Types and interfaces at the top
type RefreshStatus = 'idle' | 'in-progress' | 'error';

interface Progress {
  total: number;
  current: number;
  currentSymbol: string | null;
}

const BROADCAST_CHANNEL_NAME = 'wave-analyzer-refresh-status';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const INITIAL_DELAY = 5000; // 5 seconds
const STAGGER_DELAY = 1000; // 1 second between API calls

// Helper to safely post a message to the broadcast channel
const safePostMessage = (channel: BroadcastChannel | null, message: any) => {
  try {
    // Check if we need to recreate the channel
    if (!channel || !('postMessage' in channel)) {
      console.warn('BroadcastChannel unavailable, creating new instance');
      try {
        channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      } catch (err) {
        console.warn('Failed to create BroadcastChannel:', err);
        return;
      }
    }
    
    channel.postMessage(message);
  } catch (err) {
    console.warn('Failed to post message to broadcast channel:', err);
    // Don't rethrow - we want to handle this gracefully
  }
};

// Named export for the provider component
export function DataRefreshProvider({ children }: { children: React.ReactNode }) {
  // State variables
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'in-progress' | 'error'>('idle');
  const [worker, setWorker] = useState<Worker | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [workerReady, setWorkerReady] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    total: number;
    current: number;
    currentSymbol: string | null;
  }>({
    total: 0,
    current: 0,
    currentSymbol: null
  });

  // Refs
  const refreshWorkerRef = useRef<Worker | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshInProgressRef = useRef<boolean>(false);
  const requestIdCounterRef = useRef<number>(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const { getHistoricalData } = useHistoricalData();
  const { getAnalysis } = useWaveAnalysis();
  const adminSettings = useAdminSettings();
  const { toast } = useToast();

  // Initialize broadcast channel
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initChannel = () => {
      try {
        if (broadcastChannelRef.current) {
          try {
            broadcastChannelRef.current.close();
          } catch (e) {
            // Ignore close errors
          }
        }
        broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        
        // Set up message handler
        broadcastChannelRef.current.onmessage = (event) => {
          const { type, data } = event.data;
          switch (type) {
            case 'REFRESH_STATUS_UPDATE':
              setIsRefreshing(data.isRefreshing);
              setProgress(data.progress);
              if (data.lastRefreshTime) {
                setLastRefreshTime(data.lastRefreshTime);
              }
              break;
            case 'refreshStarted':
              setIsRefreshing(true);
              setLastRefreshTime(event.data.timestamp);
              break;
            case 'refreshCompleted':
              setIsRefreshing(false);
              setLastRefreshTime(event.data.timestamp);
              break;
            case 'refreshStatus':
              setRefreshStatus(data.status);
              setLastRefreshTime(data.lastRefreshTime);
              break;
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel initialization failed:', e);
      }
    };

    // Initialize channel
    initChannel();

    // Clean up function
    return () => {
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.close();
        } catch (e) {
          // Ignore close errors
        }
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  // Initialize worker
  const initRefreshWorker = useCallback(() => {
    if (typeof window === 'undefined') return null;

    if (!refreshWorkerRef.current) {
      refreshWorkerRef.current = new Worker('/refresh-worker.js');
      
      refreshWorkerRef.current.addEventListener('message', (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'READY':
            setWorkerReady(true);
            break;
          case 'PROGRESS':
            setProgress(data.progress);
            break;
          case 'COMPLETE':
            setRefreshStatus('idle');
            setIsRefreshing(false);
            setProgress({
              total: 0,
              current: 0,
              currentSymbol: null
            });
            break;
          case 'ERROR':
            setRefreshStatus('error');
            setIsRefreshing(false);
            toast({
              variant: 'destructive',
              description: data.error || 'An error occurred during refresh',
            });
            break;
        }
      });
    }
    
    return refreshWorkerRef.current;
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
    
    // Safely create and dispatch the custom event
    try {
      const event = new CustomEvent('worker-message', {
        detail: eventData
      });
      window.dispatchEvent(event);
    } catch (err) {
      console.warn('Failed to dispatch worker event:', err);
    }
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
          
          // Disable automatic Elliott Wave Analysis refreshes - it only needs to be loaded once
          if (refreshWorkerRef.current) {
            refreshWorkerRef.current.postMessage({ 
              action: 'DISABLE_ELLIOTT_WAVE_AUTO_REFRESH', 
              id: requestIdCounterRef.current++ 
            });
          }
        }
        
        // Set up heartbeat to keep worker alive
        heartbeatIntervalRef.current = setInterval(() => {
          if (refreshWorkerRef.current) {
            refreshWorkerRef.current.postMessage({ 
              action: 'PING', 
              id: requestIdCounterRef.current++ 
            });
          }
        }, HEARTBEAT_INTERVAL);
        
        // Clean up on unmount
        return () => {
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          if (refreshWorkerRef.current) {
            refreshWorkerRef.current.terminate();
            refreshWorkerRef.current = null;
            setWorkerReady(false);
          }
        };
      } catch (error) {
        console.error('Failed to initialize worker:', error);
        // Fall back to the traditional method if worker fails
      }
    }
  }, [initRefreshWorker]);

  // Handle data refresh
  const triggerWaveAnalysis = useCallback(async () => {
    if (!refreshWorkerRef.current || !workerReady) {
      const worker = initRefreshWorker();
      if (!worker) {
        throw new Error('Failed to initialize worker');
      }
    }

    const requestId = ++requestIdCounterRef.current;
    
    refreshWorkerRef.current?.postMessage({
      action: 'START_ANALYSIS',
      payload: {
        symbols: SYMBOLS_TO_REFRESH,
        staggerDelay: STAGGER_DELAY,
        requestId
      }
    });

    return refreshWorkerRef.current;
  }, [initRefreshWorker, workerReady]);

  // Get or initialize worker
  const getOrInitWorker = useCallback(() => {
    if (!refreshWorkerRef.current || !workerReady) {
      refreshWorkerRef.current = initRefreshWorker();
    }
    return refreshWorkerRef.current;
  }, [initRefreshWorker, workerReady]);

  const handleManualRefresh = useCallback(async () => {
    if (refreshStatus === 'in-progress') return;
    
    try {
      setRefreshStatus('in-progress');
      setIsRefreshing(true);
      
      await triggerWaveAnalysis();
      
      const newRefreshTime = Date.now();
      setLastRefreshTime(newRefreshTime);
      
      // Broadcast refresh status to other tabs
      broadcastChannelRef.current?.postMessage({
        type: 'REFRESH_COMPLETE',
        timestamp: newRefreshTime
      });
      
    } catch (error) {
      console.error('Refresh failed:', error);
      setRefreshStatus('error');
      toast({
        variant: 'destructive',
        description: error instanceof Error ? error.message : 'An error occurred during refresh',
      });
    }
  }, [refreshStatus, triggerWaveAnalysis]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (refreshWorkerRef.current) {
      refreshWorkerRef.current.terminate();
      refreshWorkerRef.current = null;
    }
    setWorkerReady(false);
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    broadcastChannelRef.current?.close();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Function to start refreshing data with the worker
  const refreshData = async () => {
    if (refreshInProgressRef.current) {
      console.log('Data refresh already in progress, skipping');
      return;
    }
    
    try {
      // If we have a working service worker, use it
      if (refreshWorkerRef.current) {
        const requestId = ++requestIdCounterRef.current;
        console.log('Starting background refresh via worker', requestId);
        
        refreshWorkerRef.current.postMessage({
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
      updateRefreshStatus(false);
    }
  };
  
  // Start background refresh
  const startBackgroundRefresh = useCallback(() => {
    if (!refreshWorkerRef.current || !workerReady) {
      console.warn('Refresh worker not ready, initializing...');
      refreshWorkerRef.current = initRefreshWorker();
      if (!refreshWorkerRef.current) {
        toast({
          variant: 'destructive',
          description: "Failed to initialize background worker"
        });
        return null;
      }
    }
    
    console.log('Started background refresh worker');
    toast({
      description: 'Background worker initialized'
    });
    
    return refreshWorkerRef.current;
  }, [initRefreshWorker]);
  
  // Stop background refresh
  const stopBackgroundRefresh = useCallback(() => {
    if (refreshWorkerRef.current) {
      refreshWorkerRef.current.postMessage({ action: 'STOP_ALL' });
      console.log('Stopped all background refresh cycles');
      toast({
        description: 'Background refresh stopped'
      });
    }
  }, []);
  
  // Traditional refresh method as fallback
  const refreshDataTraditional = async () => {
    try {
      refreshInProgressRef.current = true;
      updateRefreshStatus(true);
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
          await getAnalysis(symbol);
          
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
        toast({
          description: 'Stock data and analyses have been refreshed',
          duration: 3000,
        });
      }
    } catch (err) {
      console.error('Error in traditional data refresh process:', err);
    } finally {
      updateRefreshStatus(false);
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
  
  // NEW: Function to perform Elliott Wave analysis refresh for all stocks
  const refreshElliottWaveAnalysis = async (options: { isScheduled?: boolean } = {}) => {
    try {
      refreshInProgressRef.current = true;
      updateRefreshStatus(true);
      console.log('Starting Elliott Wave analysis refresh', new Date().toISOString());
      
      // Dispatch event that analysis has started
      dispatchWorkerEvent('ELLIOTT_WAVE_ANALYSIS_STARTED', {
        timestamp: Date.now(),
        isScheduled: options.isScheduled || false
      });
      
      // Get all stocks from Supabase cache table
      const { data: stockCache, error: stocksError } = await supabase
        .from('cache')
        .select('key')
        .like('key', 'stock_%');
        
      if (stocksError) {
        console.error('Error fetching stock cache:', stocksError);
        throw new Error(`Failed to fetch stocks: ${stocksError.message}`);
      }
      
      // Extract stock symbols from the cache keys
      const stockSymbols = stockCache
        .map(entry => entry.key.replace(/^stock_/, ''))
        .filter(Boolean);  // Remove any empty values
      
      console.log(`Found ${stockSymbols.length} stocks to analyze`);
      
      // Update progress tracking
      setProgress({
        total: stockSymbols.length,
        current: 0,
        currentSymbol: null
      });
      
      // Process stocks in sequence
      for (let i = 0; i < stockSymbols.length; i++) {
        const symbol = stockSymbols[i];
        try {
          setProgress(prev => ({
            ...prev,
            current: i + 1,
            currentSymbol: symbol
          }));
          
          // Status update
          dispatchWorkerEvent('OPERATION_STATUS', {
            step: 'elliott-wave-analysis',
            message: `Processing Elliott Wave analysis for ${symbol} (${i+1}/${stockSymbols.length})`,
            progress: Math.floor((i / stockSymbols.length) * 100),
            timestamp: Date.now()
          });
          
          
          
          // Fetch historical data directly from API (last 2 years)
          const url = `${import.meta.env.VITE_API_BASE_URL || ''}/stocks/${symbol}/history`;

          console.log(`Fetching new 2-year historical data for ${symbol} directly from API using ${url}`);

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            },
            cache: 'no-cache'
          });
          
          if (!response.ok) {
            console.error(`API returned status ${response.status} for ${symbol}`);
            continue;
          }
          
          const json = await response.json();
          
          // Basic validation
          if (!json || !json.data || !Array.isArray(json.data) || json.data.length < 50) {
            console.error(`Invalid or insufficient data for ${symbol}: ${json?.data?.length || 0} points`);
            continue;
          }
          
          // Format data consistently
          const historicalData = json.data.map(item => {
            // Handle various timestamp formats
            let timestamp = item.timestamp || item.date;
            
            // Convert string timestamps to numbers
            if (typeof timestamp === 'string') {
              timestamp = new Date(timestamp).getTime();
            } 
            
            // Convert seconds to milliseconds if needed
            if (typeof timestamp === 'number' && timestamp < 4000000000) {
              timestamp *= 1000;
            }
            
            return {
              timestamp,
              open: Number(item.open),
              high: Number(item.high),
              low: Number(item.low),
              close: Number(item.close),
              volume: Number(item.volume || 0)
            };
          });
          
          console.log(`Historical data retrieved for ${symbol}, performing Elliott Wave analysis`);
          
          // Perform Elliott Wave analysis with DeepSeek API with retry logic
          const MAX_RETRIES = 3;
          const RETRY_DELAY = 2000; // 2 seconds
          
          let attempt = 0;
          let analysisResult;
          
          while (attempt < MAX_RETRIES) {
            try {
              const deepseekUrl = `${import.meta.env.VITE_API_BASE_URL}/analyze-waves`;
              const analysisResponse = await fetch(deepseekUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                  symbol,
                  timeframe: '1d',
                  historicalData,
                  force: true,
                  storeInCache: true
                })
              });
              
              if (!analysisResponse.ok) {
                const errorText = await analysisResponse.text();
                console.error(`DeepSeek API error (attempt ${attempt + 1}/${MAX_RETRIES}):`, {
                  status: analysisResponse.status,
                  error: errorText
                });
                
                if (analysisResponse.status === 429) { // Rate limit
                  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
                  attempt++;
                  continue;
                }
                
                throw new Error(`DeepSeek API error: ${analysisResponse.status} - ${errorText}`);
              }
              
              analysisResult = await analysisResponse.json();
              
              // Validate the analysis result
              if (!analysisResult || typeof analysisResult !== 'object') {
                throw new Error('Invalid analysis result format');
              }
              
              // Success - break the retry loop
              break;
              
            } catch (error) {
              console.error(`Error in wave analysis attempt ${attempt + 1}/${MAX_RETRIES} for ${symbol}:`, error);
              
              if (attempt === MAX_RETRIES - 1) {
                throw error; // Rethrow on final attempt
              }
              
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
              attempt++;
            }
          }
          
          if (!analysisResult) {
            throw new Error(`Failed to get valid analysis result after ${MAX_RETRIES} attempts`);
          }
          
          // Store the analysis result in Supabase cache
          const { error: cacheError } = await supabase
            .from('cache')
            .upsert({
              key: `wave_analysis_${symbol}`,
              data: analysisResult,
              timestamp: Date.now(),
              duration: 24 * 60 * 60 * 1000, // 24 hour cache duration
              is_string: true
            }, { onConflict: 'key' });
            
          if (cacheError) {
            console.error(`Error storing analysis in cache for ${symbol}:`, cacheError);
          }
          
          console.log(`Wave analysis completed for ${symbol}`);
          
          // Stagger requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
        } catch (error) {
          console.error(`Error analyzing waves for ${symbol}:`, error);
          // Continue with next symbol even if one fails
        }
      }
      
      // Dispatch completed event
      dispatchWorkerEvent('ELLIOTT_WAVE_ANALYSIS_COMPLETED', {
        timestamp: Date.now(),
        stockCount: stockSymbols.length,
        isScheduled: options.isScheduled || false
      });
      
      console.log('Elliott Wave analysis refresh completed', new Date().toISOString());
      
      // Only show toast if the app is in the foreground and not triggered by schedule
      if (document.visibilityState === 'visible' && !options.isScheduled) {
        toast({
          description: 'Elliott Wave analysis has been refreshed for all stocks',
          duration: 3000,
        });
      }
      
      return true;
    } catch (err) {
      console.error('Error in Elliott Wave analysis refresh process:', err);
      
      // Dispatch error event
      dispatchWorkerEvent('ELLIOTT_WAVE_ANALYSIS_ERROR', {
        timestamp: Date.now(),
        error: err instanceof Error ? err.message : 'Unknown error',
        isScheduled: options.isScheduled || false
      });
      
      return false;
    } finally {
      updateRefreshStatus(false);
      refreshInProgressRef.current = false;
      setProgress({
        total: 0,
        current: 0,
        currentSymbol: null
      });
    }
  };
  
  // Function to cancel an ongoing refresh
  const cancelRefresh = () => {
    if (refreshWorkerRef.current && refreshInProgressRef.current) {
      console.log('Cancelling background refresh process');
      refreshWorkerRef.current.postMessage({
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
  
  // Modify setIsRefreshing calls to broadcast the status
  const updateRefreshStatus = (refreshing: boolean) => {
    setIsRefreshing(refreshing);
    if (broadcastChannelRef.current) {
      safePostMessage(broadcastChannelRef.current, {
        type: 'REFRESH_STATUS_UPDATE',
        data: {
          isRefreshing: refreshing,
          progress,
          lastRefreshTime
        }
      });
    }
  };

  // Create the context value
  const contextValue: DataRefreshContextType = {
    lastRefreshTime,
    refreshStatus,
    isRefreshing,
    progress,
    refreshData: handleManualRefresh,
    cancelRefresh,
    startBackgroundRefresh,
    stopBackgroundRefresh,
    refreshElliottWaveAnalysis
  };

  return (
    <DataRefreshContext.Provider value={contextValue}>
      {children}
    </DataRefreshContext.Provider>
  );
}

// Named export for the hook using function declaration instead of const assignment
export function useDataRefresh(): DataRefreshContextType {
  const context = useContext(DataRefreshContext);
  if (!context) {
    throw new Error('useDataRefresh must be used within a DataRefreshProvider');
  }
  return context;
}