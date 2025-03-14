import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { analyzeElliottWaves } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired } from '@/services/databaseService';
import type { WaveAnalysisResult, StockHistoricalData } from '@/types/shared';

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
  getAnalysis: (symbol: string, historicalData: StockHistoricalData[], force?: boolean) => Promise<WaveAnalysisResult | null>;
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
    force: boolean = false
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
        const stored = await retrieveWaveAnalysis(symbol, '1d');
        
        if (stored && !isAnalysisExpired(stored.timestamp)) {
          setAnalyses(prev => ({
            ...prev,
            [symbol]: stored.analysis as WaveAnalysisResult
          }));
          return stored.analysis as WaveAnalysisResult;
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
    addEvent({
      symbol,
      status: 'started',
      timestamp: Date.now()
    });
    
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
          addEvent({
            symbol,
            status: 'progress',
            timestamp: Date.now(),
            message: `Analyzing waves: ${waves.length} found`
          });
        }
      );
      
      if (cancelRequests[symbol]) {
        console.log(`Analysis for ${symbol} was canceled during processing`);
        delete activeAnalysesRef.current[symbol];
        return null;
      }
      
      // Store the result
      await storeWaveAnalysis(symbol, '1d', result);
      
      // Update state
      setAnalyses(prev => ({
        ...prev,
        [symbol]: result as WaveAnalysisResult
      }));
      
      // Log completion event
      addEvent({
        symbol,
        status: 'completed',
        timestamp: Date.now()
      });
      
      delete activeAnalysesRef.current[symbol]; // No longer active
      return result as WaveAnalysisResult;
      
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      
      // Log error event
      addEvent({
        symbol,
        status: 'error',
        timestamp: Date.now(),
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      
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