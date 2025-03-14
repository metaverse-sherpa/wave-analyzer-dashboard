import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { analyzeElliottWaves } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired } from '@/services/databaseService';
import type { WaveAnalysisResult, StockHistoricalData } from '@/types/shared';
import { supabase } from '@/lib/supabase';
import { saveToCache } from '@/services/cacheService';

// Define a type for analysis events
export type AnalysisEvent = {
  symbol: string;
  status: 'started' | 'completed' | 'error' | 'progress';
  timestamp: number;
  message?: string;
};

// 1. Define a clear interface for the context value
interface WaveAnalysisContextValue {
  analyses: Record<string, WaveAnalysisResult>;
  getAnalysis: (symbol: string, historicalData: StockHistoricalData[], force?: boolean, silent?: boolean) => Promise<WaveAnalysisResult | null>;
  preloadAnalyses: (symbols: string[]) => Promise<void>;
  clearAnalysis: (symbol?: string) => void;
  clearCache: () => void;
  cancelAnalysis: (symbol: string) => void;
  cancelAllAnalyses: () => void;
  analysisEvents: AnalysisEvent[];
}

// 2. Create the context with a proper default value
// DON'T export this directly - only export the hook
const WaveAnalysisContext = createContext<WaveAnalysisContextValue>({
  analyses: {},
  getAnalysis: async () => null,
  preloadAnalyses: async () => {},
  clearAnalysis: () => {},
  clearCache: () => {},
  cancelAnalysis: () => {},
  cancelAllAnalyses: () => {},
  analysisEvents: []
});

// 3. Export the provider component
export const WaveAnalysisProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [analysisEvents, setAnalysisEvents] = useState<AnalysisEvent[]>([]);
  const [cancelRequests, setCancelRequests] = useState<Record<string, boolean>>({});
  
  // Track active analyses
  const activeAnalysesRef = React.useRef<Record<string, boolean>>({});
  
  // Function to add an event
  const addEvent = useCallback((event: AnalysisEvent) => {
    setAnalysisEvents(prev => [event, ...prev].slice(0, 100)); // Keep last 100 events
  }, []);
  
  // Function to get or create analysis
  const getAnalysis = useCallback(async (
    symbol: string,
    historicalData: StockHistoricalData[],
    force: boolean = false,
    silent: boolean = false // Added silent parameter
  ): Promise<WaveAnalysisResult | null> => {
    // Validate we have enough data points for analysis
    const MIN_DATA_POINTS_REQUIRED = 50;
    if (historicalData && historicalData.length < MIN_DATA_POINTS_REQUIRED) {
      console.warn(`Insufficient data points for ${symbol}: only ${historicalData.length} points (minimum ${MIN_DATA_POINTS_REQUIRED} required)`);
      
      // Log event but don't crash
      addEvent({
        symbol,
        status: 'error',
        timestamp: Date.now(),
        message: `Insufficient data points: ${historicalData.length}`
      });
      
      return null;
    }
    
    // Check if analysis is being canceled
    if (cancelRequests[symbol]) {
      console.log(`Analysis for ${symbol} was canceled`);
      delete activeAnalysesRef.current[symbol];
      return null;
    }
    
    // Check if we already have a valid analysis
    if (!force && analyses[symbol]) {
      return analyses[symbol];
    }
    
    // Try to get from storage if not forced
    if (!force) {
      try {
        const { data: cacheEntry } = await supabase
          .from('cache')
          .select('data, timestamp')  // Select both data and timestamp fields
          .eq('key', `wave_analysis_${symbol}_1d`)
          .single();
        
        // If we found cache data and it's not expired
        if (cacheEntry && !isAnalysisExpired(cacheEntry.timestamp)) {
          // The analysis result is stored directly in the data field
          const analysisResult = cacheEntry.data as WaveAnalysisResult;
          
          setAnalyses(prev => ({
            ...prev,
            [symbol]: analysisResult
          }));
          
          return analysisResult;
        }
      } catch (error) {
        console.error(`Error retrieving stored analysis for ${symbol}:`, error);
      }
    }
    
    // We need to perform a new analysis
    if (activeAnalysesRef.current[symbol]) {
      console.log(`Analysis for ${symbol} is already in progress`);
      return null; // Another analysis is already in progress
    }
    
    // Mark as active
    activeAnalysesRef.current[symbol] = true;
    
    // Log the event
    if (!silent) {
      addEvent({
        symbol,
        status: 'started',
        timestamp: Date.now()
      });
    }
    
    try {
      // Perform the analysis
      const result = await analyzeElliottWaves(
        symbol,
        historicalData,
        // Check cancelation during analysis
        () => cancelRequests[symbol] || false,
        // Add progress callback parameter
        (waves) => {
          // Optional: Report progress to UI
          if (!silent) {
            addEvent({
              symbol,
              status: 'progress',
              timestamp: Date.now(),
              message: `Analyzing waves: ${waves.length} found`
            });
          }
        }
      );
      
      if (cancelRequests[symbol]) {
        console.log(`Analysis for ${symbol} was canceled during processing`);
        delete activeAnalysesRef.current[symbol];
        return null;
      }
      
      // Store the result
      await saveToCache(`wave_analysis_${symbol}_1d`, result, 7 * 24 * 60 * 60 * 1000);
      
      // Update state
      setAnalyses(prev => ({
        ...prev,
        [symbol]: result as WaveAnalysisResult
      }));
      
      // Log completion event
      if (!silent) {
        addEvent({
          symbol,
          status: 'completed',
          timestamp: Date.now()
        });
      }
      
      delete activeAnalysesRef.current[symbol]; // No longer active
      return result as WaveAnalysisResult;
      
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      
      // Log error event
      if (!silent) {
        addEvent({
          symbol,
          status: 'error',
          timestamp: Date.now(),
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      delete activeAnalysesRef.current[symbol]; // No longer active
      return null;
    }
  }, [analyses, cancelRequests, addEvent]);
  
  // Function to preload analyses for multiple symbols
  const preloadAnalyses = useCallback(async (symbols: string[]): Promise<void> => {
    // Implementation...
    // This would fetch historical data and then call getAnalysis for each symbol
  }, [getAnalysis]);
  
  // Function to clear analysis for a symbol or all symbols
  const clearAnalysis = useCallback((symbol?: string) => {
    if (symbol) {
      setAnalyses(prev => {
        const newAnalyses = {...prev};
        delete newAnalyses[symbol];
        return newAnalyses;
      });
    } else {
      setAnalyses({});
    }
  }, []);
  
  // Function to clear all cache (memory and storage)
  const clearCache = useCallback(() => {
    setAnalyses({});
    // Additional cache clearing logic if needed
  }, []);
  
  // Function to cancel analysis for a symbol
  const cancelAnalysis = useCallback((symbol: string) => {
    setCancelRequests(prev => ({
      ...prev,
      [symbol]: true
    }));
    
    // Add cancellation event
    addEvent({
      symbol,
      status: 'error',
      timestamp: Date.now(),
      message: 'Analysis canceled by user'
    });
    
    // Remove after a delay to ensure it's picked up
    setTimeout(() => {
      setCancelRequests(prev => {
        const newRequests = {...prev};
        delete newRequests[symbol];
        return newRequests;
      });
    }, 1000);
  }, [addEvent]);
  
  // Function to cancel all analyses
  const cancelAllAnalyses = useCallback(() => {
    // Get all active analyses
    const activeSymbols = Object.keys(activeAnalysesRef.current);
    
    // Cancel each one
    activeSymbols.forEach(symbol => {
      cancelAnalysis(symbol);
    });
  }, [cancelAnalysis]);
  
  // Function to load all analyses from Supabase
  const loadAllAnalysesFromSupabase = useCallback(async () => {
    try {
      // Query all wave analysis entries from Supabase
      const { data, error } = await supabase
        .from('cache')
        .select('key, data, timestamp')
        .like('key', 'wave_analysis_%');
        
      if (error) throw error;
      
      const analysesData = {};
      
      if (data) {
        for (const item of data) {
          try {
            const key = item.key.replace('wave_analysis_', '');
            
            // Extract the actual analysis from the nested data structure
            // The data is likely stored with different nesting than expected
            let analysisData = item.data;
            
            // Normalize the data structure to ensure it has currentWave
            if (!analysisData.currentWave) {
              // If there's an analysis property, that might have the structure we need
              if (analysisData.analysis) {
                analysisData = analysisData.analysis;
              }
              
              // If still no currentWave but we have waves array, use the last wave
              if (!analysisData.currentWave && Array.isArray(analysisData.waves) && analysisData.waves.length > 0) {
                analysisData.currentWave = analysisData.waves[analysisData.waves.length - 1];
              }
            }
            
            // Store the normalized data
            analysesData[key] = analysisData;
          } catch (err) {
            console.error(`Error processing analysis for ${item.key}:`, err);
          }
        }
        
        console.log(`Loaded and normalized ${Object.keys(analysesData).length} analyses from Supabase`);
        setAnalyses(analysesData);
      }
    } catch (error) {
      console.error('Error loading analyses from Supabase:', error);
    }
  }, [supabase]);

  // Call this function on component mount
  useEffect(() => {
    loadAllAnalysesFromSupabase();
  }, [loadAllAnalysesFromSupabase]);

  // Create memoized context value
  const contextValue = useMemo(() => ({
    analyses,
    getAnalysis,
    preloadAnalyses,
    clearAnalysis,
    clearCache,
    cancelAnalysis,
    cancelAllAnalyses,
    analysisEvents
  }), [
    analyses,
    getAnalysis,
    preloadAnalyses,
    clearAnalysis,
    clearCache,
    cancelAnalysis,
    cancelAllAnalyses,
    analysisEvents
  ]);
  
  return (
    <WaveAnalysisContext.Provider value={contextValue}>
      {children}
    </WaveAnalysisContext.Provider>
  );
};

// 4. Export the hook separately - this is what components will use
export const useWaveAnalysis = (): WaveAnalysisContextValue => {
  const context = useContext(WaveAnalysisContext);
  
  if (!context) {
    console.error('useWaveAnalysis must be used within a WaveAnalysisProvider');
    
    return {
      analyses: {},
      getAnalysis: async () => null,
      preloadAnalyses: async () => {},
      clearAnalysis: () => {},
      clearCache: () => {},
      cancelAnalysis: () => {},
      cancelAllAnalyses: () => {},
      analysisEvents: []
    };
  }
  
  return context;
};

// Convenience object for exports
const WaveAnalysis = {
  Provider: WaveAnalysisProvider,
  useWaveAnalysis,
  forcePreload: (symbols: string[]) => Promise.resolve()
};

// Initialize the forcePreload function
WaveAnalysis.forcePreload = (symbols: string[]) => Promise.resolve();

export default WaveAnalysis;