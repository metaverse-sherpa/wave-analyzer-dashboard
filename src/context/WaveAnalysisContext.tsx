import React, { createContext, useContext, useState, useEffect } from 'react';
import { WaveAnalysisResult } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired, getAllAnalyses } from '@/services/databaseService';
import { fetchHistoricalData } from '@/services/yahooFinanceService';
import { analyzeElliottWaves } from '@/utils/elliottWaveAnalysis';

interface WaveAnalysisContextType {
  analyses: Record<string, WaveAnalysisResult>;
  getAnalysis: (symbol: string, timeframe: string, forceRefresh?: boolean) => Promise<WaveAnalysisResult | null>;
  isLoading: boolean;
  preloadAnalyses: (symbols: string[]) => Promise<void>;
  clearCache: () => void; // New method to clear cache
}

// Create context with default values
const WaveAnalysisContext = createContext<WaveAnalysisContextType>({
  analyses: {},
  getAnalysis: async () => null,
  isLoading: false,
  preloadAnalyses: async () => {},
  clearCache: () => {} // Default implementation
});

// Create a custom hook to use the context
export const useWaveAnalysis = () => {
  const context = useContext(WaveAnalysisContext);
  if (!context) {
    console.error('useWaveAnalysis must be used within a WaveAnalysisProvider');
    // Return a dummy implementation instead of throwing
    return {
      analyses: {},
      isLoading: false,
      getAnalysis: async () => null,
      preloadAnalyses: async () => {},
    };
  }
  return context;
};

// In WaveAnalysisContext.tsx, update the worker initialization code:

// Use a try/catch when initializing the worker
const createWorker = () => {
  try {
    if (typeof window === 'undefined') return null;
    return new Worker(new URL('../workers/waveAnalysisWorker.ts', import.meta.url));
  } catch (error) {
    console.error('Failed to initialize Web Worker:', error);
    return null;
  }
};

const worker = createWorker();

const workerAnalyzeElliottWaves = (data: StockHistoricalData[]): Promise<WaveAnalysisResult> => {
  return new Promise((resolve, reject) => {
    if (!worker) {
      // Fallback to direct analysis if workers aren't supported
      console.log('Using direct analysis (no web worker)');
      try {
        const result = analyzeElliottWaves(data);
        resolve(result);
      } catch (err) {
        reject(err);
      }
      return;
    }
    
    const id = Date.now();
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler);
      console.warn('Worker analysis timed out after 10 seconds, falling back to main thread');
      try {
        const result = analyzeElliottWaves(data);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }, 10000);
    
    const handler = (event: MessageEvent) => {
      if (event.data.id === id) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      }
    };
    
    worker.addEventListener('message', handler);
    worker.postMessage({ data, id });
  });
};

// Add to WaveAnalysisContext.tsx
// Optionally, you can add a synchronous fallback
const analyzeWithFallback = (data: StockHistoricalData[]): WaveAnalysisResult => {
  try {
    // This will run in the main thread if the worker fails
    return analyzeElliottWaves(data);
  } catch (error) {
    console.error('Failed to analyze data:', error);
    return {
      waves: [], 
      currentWave: {} as Wave, 
      fibTargets: [],
      trend: 'neutral',
      impulsePattern: false,
      correctivePattern: false
    };
  }
};

// Create a separate provider component
function WaveAnalysisProvider({ 
  children, 
  killSwitch = false 
}: { 
  children: React.ReactNode, 
  killSwitch?: boolean 
}) {
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
  
  // Add effect to respond to killSwitch
  useEffect(() => {
    if (killSwitch) {
      console.log("Kill switch activated - stopping analyses");
      // Optionally clear any in-progress work
    }
  }, [killSwitch]);

  // Log when killSwitch changes
  useEffect(() => {
    console.log(`Kill switch state changed: ${killSwitch}`);
  }, [killSwitch]);
  
  // Function to get a single analysis
  const getAnalysis = async (symbol: string, timeframe: string = '1d', forceRefresh: boolean = false): Promise<WaveAnalysisResult | null> => {
    if (!symbol) {
      console.error("getAnalysis called with no symbol");
      return null;
    }
    
    // Return cached results immediately if kill switch is active
    if (killSwitch && !forceRefresh) {
      const cacheKey = `${symbol}_${timeframe}`;
      if (analyses[cacheKey]) {
        return analyses[cacheKey];
      }
      
      const cachedAnalysis = retrieveWaveAnalysis(symbol, timeframe);
      if (cachedAnalysis) {
        return cachedAnalysis.analysis;
      }
      
      // If no cached result and kill switch on, return empty analysis
      return {
        waves: [],
        currentWave: {} as Wave,
        fibTargets: [],
        trend: 'neutral',
        impulsePattern: false,
        correctivePattern: false
      };
    }
    
    const cacheKey = `${symbol}_${timeframe}`;
    
    // Skip cache if forceRefresh is true
    if (!forceRefresh) {
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
    }
    
    // If forced refresh or not in cache or expired, fetch data and analyze
    try {
      // Fetch historical data
      console.log(`Starting analysis for ${symbol}`);
      let historicalData;
      
      try {
        const historicalResponse = await fetchHistoricalData(symbol, timeframe);
        historicalData = historicalResponse.historicalData;
      } catch (fetchError) {
        console.error(`Failed to fetch data for ${symbol}, using fallback data`, fetchError);
        // Use fallback mock data
        const mockData = generateFallbackData(symbol, 300);
        historicalData = mockData;
      }
      
      if (!historicalData || historicalData.length === 0) {
        console.error(`No historical data available for ${symbol}`);
        return null;
      }
      
      console.log(`Got ${historicalData.length} data points for ${symbol}`);
      
      // Analyze the data
      const analysis = await workerAnalyzeElliottWaves(historicalData);
      console.log(`Analysis complete for ${symbol}, found ${analysis.waves.length} waves`);
      
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
    console.log("Attempting to preload analyses", { 
      killSwitch, 
      isLoading, 
      symbolCount: symbols.length 
    });
    
    // Exit early if already loading or if there are no symbols
    if (isLoading) {
      console.log("Skipping preload - already loading");
      return;
    }
    
    if (!symbols || symbols.length === 0) {
      console.log("No symbols provided for preload");
      return;
    }
    
    // Use a unique ID to track this specific preload request
    const preloadId = Date.now();
    console.log(`Starting preload #${preloadId}`);
    
    setIsLoading(true);
    
    try {
      // Deduplicate symbols
      const uniqueSymbols = [...new Set(symbols)];
      
      if (killSwitch) {
        console.log("Kill switch is active - limiting preload");
        // We'll continue with a very limited set
        uniqueSymbols.splice(3); // Only try to load 3 symbols in kill switch mode
      }
      
      // Process in smaller batches to avoid overloading
      const batchSize = killSwitch ? 1 : 3;
      const maxSymbols = killSwitch ? 3 : 10;
      
      const limitedSymbols = uniqueSymbols.slice(0, maxSymbols);
      console.log(`Preload #${preloadId}: Beginning analysis of ${limitedSymbols.length} symbols in batches of ${batchSize}`);
      
      for (let i = 0; i < limitedSymbols.length; i += batchSize) {
        // Check if kill switch activated during processing
        if (killSwitch) {
          console.log(`Preload #${preloadId}: Kill switch activated, stopping remaining analyses`);
          break;
        }
        
        const batch = limitedSymbols.slice(i, i + batchSize);
        console.log(`Preload #${preloadId}: Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.join(', ')}`);
        
        try {
          for (const symbol of batch) {
            await getAnalysis(symbol, '1d');
            console.log(`Preload #${preloadId}: Successfully processed ${symbol}`);
          }
        } catch (batchError) {
          console.error(`Preload #${preloadId}: Error processing batch: ${batch.join(', ')}`, batchError);
        }
        
        // Add a small delay between batches
        if (i + batchSize < limitedSymbols.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`Preload #${preloadId}: All analysis batches complete`);
    } catch (error) {
      console.error(`Preload #${preloadId}: Error preloading analyses:`, error);
    } finally {
      setIsLoading(false);
      console.log(`Preload #${preloadId}: Completed`);
    }
  };
  
  // Add the clearCache method:
  const clearCache = () => {
    // Clear in-memory cache
    setAnalyses({});
    
    // Clear storage cache - this will depend on how your databaseService is implemented
    // This is a simplified example
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.includes('wave_analysis')) {
        localStorage.removeItem(key);
      }
    }
  };

  useEffect(() => {
    // Replace the placeholder with the actual function
    WaveAnalysis.forcePreload = (symbols) => {
      console.log("Force preload initiated for", symbols);
      return preloadAnalyses(symbols);
    };
    
    return () => {
      // Reset on unmount
      WaveAnalysis.forcePreload = () => Promise.resolve();
    };
  }, [preloadAnalyses]);

  const value = {
    analyses,
    getAnalysis,
    isLoading,
    preloadAnalyses,
    clearCache
  };
  
  return (
    <WaveAnalysisContext.Provider value={value}>
      {children}
    </WaveAnalysisContext.Provider>
  );
}

// Group exports at the end
const WaveAnalysis = {
  Provider: WaveAnalysisProvider,
  useWaveAnalysis,
  // Include forcePreload in the exported object
  forcePreload: (symbols: string[]) => Promise.resolve()
};

// Export only the Provider as a named export if needed
export { WaveAnalysisProvider };

// Export the main object as default
export default WaveAnalysis;