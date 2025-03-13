import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useHistoricalData } from './HistoricalDataContext';
import type { Wave, StockHistoricalData, WaveAnalysisResult } from '@/types/shared';

// Create an event emitter for analysis updates
const analysisEvents = new EventTarget();

// Define the context type
export interface WaveAnalysisContextType {
  analyses: Record<string, WaveAnalysisResult>;
  isLoading: boolean;
  getAnalysis: (symbol: string, timeframe?: string, forceRefresh?: boolean) => Promise<WaveAnalysisResult>;
  preloadAnalyses: (symbols?: string[]) => Promise<void>;
  analysisEvents: EventTarget;
  cancelAllAnalyses: () => void;
  hasActiveAnalyses: boolean;
  clearCache: () => void;
}

// Create a default context
export const WaveAnalysisContext = createContext<WaveAnalysisContextType>({
  analyses: {},
  isLoading: false,
  getAnalysis: async () => ({
    waves: [],
    currentWave: null,
    fibTargets: [],
    trend: 'neutral',
    impulsePattern: false,
    correctivePattern: false
  }),
  preloadAnalyses: async () => {},
  analysisEvents,
  cancelAllAnalyses: () => {},
  hasActiveAnalyses: false,
  clearCache: () => {}
});

// Helper functions for wave analysis
const determineTrend = (waves: Wave[]): 'bullish' | 'bearish' | 'neutral' => {
  if (!waves || waves.length === 0) return 'neutral';
  
  const lastWave = waves[waves.length - 1];
  if (!lastWave) return 'neutral';
  
  if (lastWave.endPrice && lastWave.startPrice) {
    return lastWave.endPrice > lastWave.startPrice ? 'bullish' : 'bearish';
  }
  return 'neutral';
};

const hasImpulsePattern = (waves: Wave[]): boolean => {
  return waves.filter(w => w.type === 'impulse').length >= 3;
};

const hasCorrectivePattern = (waves: Wave[]): boolean => {
  return waves.filter(w => w.type === 'corrective').length >= 2;
};

// Placeholder for the actual analysis function
const analyzeElliottWaves = (data: StockHistoricalData[], progressCallback?: (waves: Wave[]) => void): WaveAnalysisResult => {
  // Simple implementation that would normally be replaced by actual analysis
  const waves: Wave[] = [];
  // ... analysis logic would go here
  
  return {
    waves,
    currentWave: waves.length > 0 ? waves[waves.length - 1] : null,
    fibTargets: [],
    trend: determineTrend(waves),
    impulsePattern: hasImpulsePattern(waves),
    correctivePattern: hasCorrectivePattern(waves)
  };
};

// Storage helpers
const storeWaveAnalysis = (symbol: string, timeframe: string, analysis: WaveAnalysisResult): void => {
  try {
    localStorage.setItem(`wave-analysis:${symbol}:${timeframe}`, JSON.stringify({
      analysis,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to store wave analysis:', error);
  }
};

const retrieveWaveAnalysis = (symbol: string, timeframe: string): { analysis: WaveAnalysisResult; timestamp: number } | null => {
  try {
    const data = localStorage.getItem(`wave-analysis:${symbol}:${timeframe}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to retrieve wave analysis:', error);
    return null;
  }
};

const isAnalysisExpired = (timestamp: number): boolean => {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  return Date.now() - timestamp > ONE_DAY;
};

const getAllAnalyses = (): Record<string, { analysis: WaveAnalysisResult; timestamp: number }> => {
  const result: Record<string, { analysis: WaveAnalysisResult; timestamp: number }> = {};
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('wave-analysis:')) {
        const data = localStorage.getItem(key);
        if (data) {
          result[key.replace('wave-analysis:', '')] = JSON.parse(data);
        }
      }
    }
  } catch (error) {
    console.error('Failed to get all analyses:', error);
  }
  
  return result;
};

// Create the provider component
export const WaveAnalysisProvider: React.FC<{
  children: React.ReactNode;
  killSwitch?: boolean;
}> = ({ children, killSwitch = false }) => {
  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeAnalyses, setActiveAnalyses] = useState<Set<string>>(new Set());
  const { getHistoricalData } = useHistoricalData();
  const pendingAnalyses = useRef<Record<string, Promise<WaveAnalysisResult>>>({});
  const cancellationTokens = useRef<Map<string, boolean>>(new Map());
  
  // Clear cache function
  const clearCache = useCallback(() => {
    const cacheKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('wave-analysis:') || key.startsWith('historical-data:')
    );
    
    cacheKeys.forEach(key => localStorage.removeItem(key));
    setAnalyses({});
  }, []);

  // Cancel all analyses
  const cancelAllAnalyses = useCallback(() => {
    cancellationTokens.current.forEach((_, key) => {
      cancellationTokens.current.set(key, true);
    });
    
    analysisEvents.dispatchEvent(new CustomEvent('analysisCancelled', {
      detail: { message: 'All analyses cancelled' }
    }));
    
    setActiveAnalyses(new Set());
  }, []);

  // Get analysis for a single symbol
  const getAnalysis = useCallback(async (
    symbol: string,
    timeframe: string = '1d',
    forceRefresh: boolean = false
  ): Promise<WaveAnalysisResult> => {
    const cacheKey = `${symbol}:${timeframe}`;
    
    // Check for cached analysis
    const cachedItem = retrieveWaveAnalysis(symbol, timeframe);
    if (cachedItem && !isAnalysisExpired(cachedItem.timestamp) && !forceRefresh) {
      return cachedItem.analysis;
    }
    
    // Update to match the HistoricalDataContext interface
    const historicalData = await getHistoricalData(symbol, timeframe);
    
    if (!historicalData || historicalData.length === 0) {
      return {
        waves: [],
        currentWave: null,
        fibTargets: [],
        trend: 'neutral',
        impulsePattern: false,
        correctivePattern: false
      };
    }
    
    // Perform analysis
    const result = analyzeElliottWaves(historicalData, (waves) => {
      // Progress reporting
      analysisEvents.dispatchEvent(new CustomEvent('progress', { 
        detail: { symbol, waves } 
      }));
    });
    
    // Store result
    storeWaveAnalysis(symbol, timeframe, result);
    
    // Update analyses state
    setAnalyses(prev => ({
      ...prev,
      [cacheKey]: result
    }));
    
    // Emit completion event
    analysisEvents.dispatchEvent(new CustomEvent('complete', { 
      detail: { symbol } 
    }));
    
    return result;
  }, [getHistoricalData]);

  // Preload analyses for multiple symbols
  const preloadAnalyses = useCallback(async (symbols: string[] = []) => {
    if (isLoading || !symbols.length) return;
    
    setIsLoading(true);
    
    try {
      const uniqueSymbols = [...new Set(symbols)];
      const batchSize = killSwitch ? 1 : 3;
      const maxSymbols = killSwitch ? 3 : 10;
      
      const limitedSymbols = uniqueSymbols.slice(0, maxSymbols);
      
      for (let i = 0; i < limitedSymbols.length; i += batchSize) {
        if (killSwitch) break;
        
        const batch = limitedSymbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(symbol => getAnalysis(symbol, '1d')));
        
        if (i + batchSize < limitedSymbols.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error('Error preloading analyses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, killSwitch, getAnalysis]);

  // Load cached analyses on mount
  useEffect(() => {
    const loadCachedAnalyses = () => {
      const allCachedAnalyses = getAllAnalyses();
      const validAnalyses: Record<string, WaveAnalysisResult> = {};
      
      Object.entries(allCachedAnalyses).forEach(([key, cachedItem]) => {
        if (!isAnalysisExpired(cachedItem.timestamp)) {
          validAnalyses[key] = cachedItem.analysis;
        }
      });
      
      setAnalyses(validAnalyses);
    };
    
    loadCachedAnalyses();
  }, []);

  // Context value
  const contextValue = useMemo(() => ({
    analyses,
    getAnalysis,
    isLoading,
    preloadAnalyses,
    clearCache,
    analysisEvents,
    cancelAllAnalyses,
    hasActiveAnalyses: activeAnalyses.size > 0
  }), [
    analyses,
    getAnalysis,
    isLoading,
    preloadAnalyses,
    clearCache,
    cancelAllAnalyses,
    activeAnalyses.size
  ]);

  return (
    <WaveAnalysisContext.Provider value={contextValue}>
      {children}
    </WaveAnalysisContext.Provider>
  );
};

// Hook to use the context
export const useWaveAnalysis = () => {
  const context = useContext(WaveAnalysisContext);
  
  if (!context) {
    console.error('useWaveAnalysis must be used within a WaveAnalysisProvider');
    
    return {
      analyses: {},
      isLoading: false,
      getAnalysis: async () => ({
        waves: [],
        currentWave: null,
        fibTargets: [],
        trend: 'neutral',
        impulsePattern: false,
        correctivePattern: false
      }),
      preloadAnalyses: async () => {},
      analysisEvents: new EventTarget(),
      cancelAllAnalyses: () => {},
      hasActiveAnalyses: false,
      clearCache: () => {}
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