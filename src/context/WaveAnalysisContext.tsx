import React, { createContext, useContext, useState, useEffect } from 'react';
import { WaveAnalysisResult } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired, getAllAnalyses } from '@/services/databaseService';
import { fetchHistoricalData } from '@/services/yahooFinanceService';
import { analyzeElliottWaves } from '@/utils/elliottWaveAnalysis';

interface WaveAnalysisContextType {
  analyses: Record<string, WaveAnalysisResult>;
  getAnalysis: (symbol: string, timeframe: string) => Promise<WaveAnalysisResult | null>;
  isLoading: boolean;
  preloadAnalyses: (symbols: string[]) => Promise<void>;
}

// Create context with default values
const WaveAnalysisContext = createContext<WaveAnalysisContextType>({
  analyses: {},
  getAnalysis: async () => null,
  isLoading: false,
  preloadAnalyses: async () => {}
});

// Export the hook as a named function to fix HMR issues
export function useWaveAnalysis() {
  return useContext(WaveAnalysisContext);
}

// Export the provider as a named function component
export function WaveAnalysisProvider({ children }: {children: React.ReactNode}) {
  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Load any cached analyses from localStorage when the app starts
  useEffect(() => {
    const loadCachedAnalyses = async () => {
      const allCachedAnalyses = getAllAnalyses();
      const validAnalyses: Record<string, WaveAnalysisResult> = {};
      
      // Filter out expired analyses
      Object.entries(allCachedAnalyses).forEach(([key, cachedItem]) => {
        if (!isAnalysisExpired(cachedItem.timestamp)) {
          validAnalyses[key] = cachedItem.analysis;
        }
      });
      
      setAnalyses(validAnalyses);
    };
    
    loadCachedAnalyses();
  }, []);
  
  // Function to get a single analysis
  const getAnalysis = async (symbol: string, timeframe: string = '1d'): Promise<WaveAnalysisResult | null> => {
    const cacheKey = `${symbol}_${timeframe}`;
    
    // First check if we already have it in state
    if (analyses[cacheKey]) {
      return analyses[cacheKey];
    }
    
    // Next check IndexedDB/localStorage
    const cachedAnalysis = retrieveWaveAnalysis(symbol, timeframe);
    if (cachedAnalysis && !isAnalysisExpired(cachedAnalysis.timestamp)) {
      // Store in state for future quick access
      setAnalyses(prev => ({
        ...prev,
        [cacheKey]: cachedAnalysis.analysis
      }));
      
      return cachedAnalysis.analysis;
    }
    
    // If not in cache or expired, fetch data and analyze
    try {
      // Fetch historical data
      const historicalResponse = await fetchHistoricalData(symbol, timeframe);
      
      // Analyze the data
      const analysis = analyzeElliottWaves(historicalResponse.historicalData);
      
      // Store in cache
      storeWaveAnalysis(symbol, timeframe, analysis);
      
      // Update state
      setAnalyses(prev => ({
        ...prev,
        [cacheKey]: analysis
      }));
      
      return analysis;
    } catch (error) {
      console.error(`Error analyzing waves for ${symbol}:`, error);
      return null;
    }
  };
  
  // Function to preload analyses for multiple symbols
  const preloadAnalyses = async (symbols: string[]) => {
    setIsLoading(true);
    
    try {
      // Process in batches to avoid overloading the browser
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        await Promise.all(batch.map(symbol => getAnalysis(symbol, '1d')));
      }
    } catch (error) {
      console.error('Error preloading analyses:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const value = {
    analyses,
    getAnalysis,
    isLoading,
    preloadAnalyses
  };
  
  return (
    <WaveAnalysisContext.Provider value={value}>
      {children}
    </WaveAnalysisContext.Provider>
  );
}