import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { WaveAnalysisResult } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired, getAllAnalyses } from '@/services/databaseService';
import { fetchHistoricalData } from '@/services/yahooFinanceService';
import { analyzeElliottWaves } from '@/utils/elliottWaveAnalysis';

interface WaveAnalysisContextType {
  analyses: Record<string, WaveAnalysisResult>;
  getAnalysis: (symbol: string, timeframe?: string, forceRefresh?: boolean) => Promise<WaveAnalysisResult | null>;
  isLoading: boolean;
  preloadAnalyses: (symbols: string[]) => Promise<void>;
  clearCache: () => void; // New method to clear cache
  analysisEvents: EventTarget; // Add this
}

// Create context with default values
const WaveAnalysisContext = createContext<WaveAnalysisContextType>({
  analyses: {},
  getAnalysis: async () => null,
  isLoading: false,
  preloadAnalyses: async () => {},
  clearCache: () => {}, // Default implementation
  analysisEvents: new EventTarget() // Default implementation
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
      analysisEvents: new EventTarget()
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

let worker = createWorker();

// Update these constants for better worker reliability
const WORKER_TIMEOUT_MS = 30000; // Increase to 30 seconds
const HEARTBEAT_MAX_DELAY = 5000; // Increase to 5 seconds
const LOW_MEMORY_WORKER_TIMEOUT_MS = 60000; // 60 seconds for low memory mode
const BATCH_SIZE = 500; // Reduce batch size for better responsiveness

// Add this helper function to generate an empty analysis result
const generateEmptyAnalysisResult = (): WaveAnalysisResult => {
  return {
    waves: [],
    currentWave: {} as Wave,
    fibTargets: [],
    trend: 'neutral',
    impulsePattern: false,
    correctivePattern: false
  };
};

// Add after the generateEmptyAnalysisResult function
const createSimpleWavePattern = (data: StockHistoricalData[]): WaveAnalysisResult => {
  // Enhanced validation
  if (!data || !Array.isArray(data)) {
    console.warn('Invalid data provided to createSimpleWavePattern: data is null or not an array');
    return generateEmptyAnalysisResult();
  }

  // Filter out invalid data points
  const validData = data.filter(point => (
    point &&
    typeof point.timestamp === 'number' &&
    typeof point.close === 'number' &&
    typeof point.high === 'number' &&
    typeof point.low === 'number'
  ));

  if (validData.length < 3) {
    console.warn(`Insufficient valid data points: ${validData.length}`);
    return generateEmptyAnalysisResult();
  }

  try {
    const third = Math.floor(validData.length / 3);
    const twoThirds = Math.floor(2 * validData.length / 3);

    // Ensure we have enough data points
    if (third === 0 || twoThirds === 0) {
      console.warn('Data segments too small for wave pattern');
      return generateEmptyAnalysisResult();
    }

    const waves: Wave[] = [
      {
        number: 1,
        startTimestamp: validData[0].timestamp,
        endTimestamp: validData[third].timestamp,
        startPrice: validData[0].close,
        endPrice: validData[third].close,
        type: 'impulse',
        isComplete: true,
        isImpulse: true
      },
      {
        number: 2,
        startTimestamp: validData[third].timestamp,
        endTimestamp: validData[twoThirds].timestamp,
        startPrice: validData[third].close,
        endPrice: validData[twoThirds].close,
        type: 'corrective',
        isComplete: true,
        isImpulse: false
      },
      {
        number: 3,
        startTimestamp: validData[twoThirds].timestamp,
        endTimestamp: validData[validData.length - 1].timestamp,
        startPrice: validData[twoThirds].close,
        endPrice: validData[validData.length - 1].close,
        type: 'impulse',
        isComplete: false,
        isImpulse: true
      }
    ];

    // Ensure the wave pattern follows basic Elliott Wave rules
    const trend = validData[validData.length - 1].close > validData[0].close ? 'bullish' : 'bearish';
    
    // If bearish, reverse wave types
    if (trend === 'bearish') {
      waves.forEach(wave => {
        wave.type = wave.type === 'impulse' ? 'corrective' : 'impulse';
        wave.isImpulse = !wave.isImpulse;
      });
    }

    return {
      waves,
      currentWave: waves[waves.length - 1],
      fibTargets: [],
      trend,
      impulsePattern: true,
      correctivePattern: false
    };
  } catch (error) {
    console.error('Error creating simple wave pattern:', error);
    return generateEmptyAnalysisResult();
  }
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
  // Move analysisEvents creation to the top of the provider
  const analysisEvents = useMemo(() => new EventTarget(), []);
  
  // Create a worker analysis function that has access to analysisEvents
  const workerAnalyzeElliottWaves = (data: StockHistoricalData[], symbol: string): Promise<WaveAnalysisResult> => {
    return new Promise((resolve, reject) => {
      if (!worker) {
        console.log(`Using direct analysis (no web worker) for ${symbol}`);
        return resolve(analyzeElliottWaves(data));
      }
  
      // Emit analysis start event
      analysisEvents.dispatchEvent(new CustomEvent('analysisStart', {
        detail: { symbol, startTime: Date.now() }
      }));
  
      const id = Date.now();
      let lastHeartbeat = Date.now();
      let hasResponded = false;
      let progressWaves: Wave[] = [];
  
      // More robust health monitoring
      const healthCheck = setInterval(() => {
        const timeSinceHeartbeat = Date.now() - lastHeartbeat;
        if (timeSinceHeartbeat > HEARTBEAT_MAX_DELAY) {
          console.warn(`Worker appears stuck for ${symbol}, no heartbeat for ${timeSinceHeartbeat}ms`);
          
          // Only recover if we haven't already responded
          if (!hasResponded) {
            hasResponded = true;
            clearInterval(healthCheck);
            worker?.removeEventListener('message', handler);
            
            // Terminate and recreate worker
            worker?.terminate();
            worker = createWorker();
            
            // Use fallback analysis
            const result = analyzeElliottWaves(data);
            analysisEvents.dispatchEvent(new CustomEvent('analysisComplete', {
              detail: { symbol, result }
            }));
            resolve(result);
          }
        }
      }, 1000);
  
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'heartbeat') {
          lastHeartbeat = event.data.timestamp;
          return;
        }
  
        if (event.data.id === id) {
          if (event.data.type === 'progress') {
            progressWaves = event.data.waves || progressWaves;
            analysisEvents.dispatchEvent(new CustomEvent('analysisProgress', {
              detail: { symbol, waves: progressWaves }
            }));
            return;
          }
  
          if (!hasResponded) {
            hasResponded = true;
            clearInterval(healthCheck);
            worker?.removeEventListener('message', handler);
  
            if (event.data.error) {
              console.warn(`Worker error for ${symbol}, using fallback`);
              const result = analyzeElliottWaves(data);
              resolve(result);
            } else {
              resolve(event.data.result);
            }
          }
        }
      };
  
      worker.addEventListener('message', handler);
  
      // Send data to worker in smaller chunks
      const chunkSize = BATCH_SIZE;
      const chunks = [];
      for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(data.slice(i, Math.min(i + chunkSize, data.length)));
      }
  
      worker.postMessage({ 
        data: chunks.length > 1 ? chunks[0] : data,
        id,
        symbol,
        isFirstChunk: true,
        totalChunks: chunks.length
      });
    });
  };

  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const pendingAnalyses = useRef<Record<string, Promise<WaveAnalysisResult | null>>>({});

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
    try {
      // Create and dispatch start event
      analysisEvents.dispatchEvent(new CustomEvent('analysisStart', {
        detail: { symbol, startTime: Date.now() }
      }));
      
      if (!symbol) {
        console.error("getAnalysis called with no symbol");
        return null;
      }
      
      const cacheKey = `${symbol}_${timeframe}`;
      
      // First check in-memory cache for faster access
      if (!forceRefresh && analyses[cacheKey]) {
        console.log(`Using in-memory cached analysis for ${symbol}`);
        return analyses[cacheKey];
      }
      
      // Return cached results immediately if kill switch is active
      if (killSwitch && !forceRefresh) {
        const cachedAnalysis = retrieveWaveAnalysis(symbol, timeframe);
        if (cachedAnalysis) {
          console.log(`Kill switch active - using cached analysis for ${symbol}`);
          setAnalyses(prev => ({
            ...prev,
            [cacheKey]: cachedAnalysis.analysis
          }));
          return cachedAnalysis.analysis;
        }
        // If no cached analysis available with kill switch active, return empty result
        return null;
      }
      
      // Check localStorage cache if not already refreshing
      if (!forceRefresh) {
        const cachedAnalysis = retrieveWaveAnalysis(symbol, timeframe);
        if (cachedAnalysis && !isAnalysisExpired(cachedAnalysis.timestamp)) {
          console.log(`Using cached analysis for ${symbol} from localStorage`);
          // Store in state for future quick access
          setAnalyses(prev => ({
            ...prev,
            [cacheKey]: cachedAnalysis.analysis
          }));
          
          return cachedAnalysis.analysis;
        }
      }
      
      // If we're already fetching this analysis, don't start another fetch
      if (pendingAnalyses.current[cacheKey]) {
        console.log(`Already fetching analysis for ${symbol}, waiting for that to complete`);
        try {
          return await pendingAnalyses.current[cacheKey];
        } catch (error) {
          console.error(`Error waiting for pending analysis of ${symbol}:`, error);
          return null;
        }
      }
      
      // If forced refresh or not in cache or expired, fetch data and analyze
      const analysisPromise = (async () => {
        try {
          const response = await fetchHistoricalData(symbol, timeframe);
          
          // Extract historical data from response
          const historicalData = Array.isArray(response) 
            ? response 
            : response.historicalData;
          
          if (!historicalData || !Array.isArray(historicalData)) {
            console.error(`Invalid historical data format for ${symbol}`);
            return generateEmptyAnalysisResult();
          }

          // Pass the historical data array to worker
          const result = await workerAnalyzeElliottWaves(historicalData, symbol);

          // Store result in cache if valid
          if (result.waves.length > 0) {
            storeWaveAnalysis(symbol, timeframe, result);
            
            // Update in-memory cache
            setAnalyses(prev => ({
              ...prev,
              [cacheKey]: result
            }));
          }

          return result;
        } catch (error) {
          // Dispatch error event
          analysisEvents.dispatchEvent(new CustomEvent('analysisError', {
            detail: { 
              symbol, 
              error: error instanceof Error ? error.message : String(error) 
            }
          }));
          throw error;
        }
      })();
      
      // Store the promise in pendingAnalyses
      pendingAnalyses.current[cacheKey] = analysisPromise;
      
      return analysisPromise;
    } catch (error) {
      // On error
      analysisEvents.dispatchEvent(new CustomEvent('analysisError', {
        detail: { symbol, error }
      }));
      throw error;
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

  // Add this to the context value
  const contextValue = useMemo(() => ({
    analyses,
    getAnalysis,
    isLoading,
    preloadAnalyses,
    clearCache,
    analysisEvents  // Include in context
  }), [analyses, isLoading, analysisEvents]);

  return (
    <WaveAnalysisContext.Provider value={contextValue}>
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