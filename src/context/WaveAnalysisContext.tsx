import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
import { analyzeElliottWaves } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired } from '@/services/databaseService';
import type { WaveAnalysisResult, StockHistoricalData, Wave, FibTarget, DeepSeekWaveAnalysis } from '@/types/shared';
import { supabase } from '@/lib/supabase';
import { saveToCache } from '@/services/cacheService';
import { getDeepSeekWaveAnalysis } from '@/api/deepseekApi';

// Add this flag at the top of the file with your other imports
const AUTO_LOAD_ANALYSES_FROM_SUPABASE = true;  // Set this to true

// Add these helper functions from elliottWaveAnalysis.ts
function determineWaveType(waveNumber: string | number): 'impulse' | 'corrective' {
  if (typeof waveNumber === 'number' || !isNaN(parseInt(waveNumber as string))) {
    // Waves 1, 3, 5 are impulse; 2, 4 are corrective
    const num = typeof waveNumber === 'number' ? waveNumber : parseInt(waveNumber);
    return num % 2 === 1 ? 'impulse' : 'corrective';
  } else {
    // Waves A, C are corrective; B is impulse
    return waveNumber === 'B' ? 'impulse' : 'corrective';
  }
}

function isImpulseWave(waveNumber: string | number): boolean {
  if (typeof waveNumber === 'number' || !isNaN(parseInt(waveNumber as string))) {
    // Waves 1, 3, 5 are impulse
    const num = typeof waveNumber === 'number' ? waveNumber : parseInt(waveNumber);
    return num % 2 === 1;
  } else {
    // Wave B is impulse, A and C are not
    return waveNumber === 'B';
  }
}

// Define a type for analysis events
export type AnalysisEvent = {
  symbol: string;
  status: 'started' | 'completed' | 'error' | 'progress';
  timestamp: number;
  message?: string;
};

// Update the interface definitions near the top of the file
interface WaveAnalysisWithTimestamp {
  analysis: WaveAnalysisResult;
  timestamp: number;
  isLoaded: boolean;
}

// Update the context interface to use the correct type
export interface WaveAnalysisContextType {
  analyses: Record<string, WaveAnalysisResult>;
  allAnalyses: Record<string, WaveAnalysisWithTimestamp>;
  loadAnalysisFromSupabase: (symbol: string) => Promise<WaveAnalysisResult | null>;
  loadAllAnalysesFromSupabase: () => Promise<void>;
  getAnalysis: (symbol: string, historicalData: StockHistoricalData[], forceRefresh?: boolean) => Promise<WaveAnalysisResult>;
}

// Update the WaveAnalysisContextValue interface to include allAnalyses
interface WaveAnalysisContextValue {
  analyses: Record<string, WaveAnalysisResult>;
  allAnalyses: Record<string, WaveAnalysisWithTimestamp>; 
  isDataLoaded: boolean; // Add this line
  getAnalysis: (symbol: string, historicalData: StockHistoricalData[], force?: boolean, silent?: boolean) => Promise<WaveAnalysisResult | null>;
  preloadAnalyses: (symbols: string[]) => Promise<void>;
  clearAnalysis: (symbol?: string) => void;
  clearCache: () => void;
  cancelAnalysis: (symbol: string) => void;
  cancelAllAnalyses: () => void;
  analysisEvents: AnalysisEvent[];
  loadAllAnalysesFromSupabase: () => Promise<void>;
  loadCacheTableData: () => Promise<void>;
}

// Create context with a default value (but don't export it - we'll only export the hook)
const WaveAnalysisContext = createContext<WaveAnalysisContextValue>({
  analyses: {},
  allAnalyses: {},
  isDataLoaded: false, // Add this line
  getAnalysis: async () => null,
  preloadAnalyses: async () => {},
  clearAnalysis: () => {},
  clearCache: () => {},
  cancelAnalysis: () => {},
  cancelAllAnalyses: () => {},
  analysisEvents: [],
  loadAllAnalysesFromSupabase: async () => {},
  loadCacheTableData: async () => {}
});

// 3. Export the provider component
export function WaveAnalysisProvider({ children }: { children: ReactNode }) {
  // NOTE: This is a legacy/simple provider. Do not use in place of the main WaveAnalysisProvider.
  // TODO: Refactor or remove if not needed.
  const [waveData, setWaveData] = useState<Record<string, WaveAnalysisResult>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadWaveAnalysis = useCallback(async (symbol: string) => {
    if (!symbol) return;

    setIsLoading(prev => ({ ...prev, [symbol]: true }));
    setErrors(prev => ({ ...prev, [symbol]: '' }));

    try {
      const response = await supabase
        .from('wave_analysis')
        .select('*')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (response.error) throw new Error(response.error.message);
      
      if (!response.data || !response.data.analysis_data || 
          !Array.isArray(response.data.analysis_data.points) || 
          response.data.analysis_data.points.length < 50) {
        throw new Error(`Insufficient data points for ${symbol}: ${
          response.data?.analysis_data?.points?.length || 0
        } points (minimum 50 required)`);
      }

      setWaveData(prev => ({
        ...prev,
        [symbol]: response.data.analysis_data
      }));
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        [symbol]: error instanceof Error ? error.message : 'Failed to load wave analysis'
      }));
    } finally {
      setIsLoading(prev => ({ ...prev, [symbol]: false }));
    }
  }, []);

  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [allAnalyses, setAllAnalyses] = useState<Record<string, WaveAnalysisWithTimestamp>>({});
  const [analysisEvents, setAnalysisEvents] = useState<AnalysisEvent[]>([]);
  const initialLoadPerformed = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Add improved validation helpers at the top
  function isValidWave(wave: any): boolean {
    return wave && 
           wave.startTime && 
           wave.endTime && 
           typeof wave.startPrice === 'number' && 
           typeof wave.endPrice === 'number' &&
           wave.number !== undefined;
  }

  function isValidCurrentWave(wave: any): boolean {
    return wave && 
           wave.startTime && 
           typeof wave.startPrice === 'number' &&
           wave.number !== undefined;
  }

  // Update loadAllAnalysesFromSupabase implementation
  const loadAllAnalysesFromSupabase = useCallback(async () => {
    if (initialLoadPerformed.current) {
      console.log('Skipping load - already performed');
      return;
    }

    try {
      console.log('Fetching wave analyses from Supabase...');
      const { data: cacheEntries, error } = await supabase
        .from('cache')
        .select('*')
        .like('key', 'wave_analysis_%')
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

      if (!cacheEntries || cacheEntries.length === 0) {
        console.log('No wave analyses found in cache');
        await new Promise<void>(resolve => {
          setAllAnalyses({});
          setTimeout(() => {
            initialLoadPerformed.current = true;
            setIsLoaded(true);
            resolve();
          }, 0);
        });
        return;
      }

      console.log(`Found ${cacheEntries.length} wave analyses in cache`);
      const analysisMap: Record<string, WaveAnalysisWithTimestamp> = {};
      const processingErrors: any[] = [];
      
      for (const entry of cacheEntries) {
        try {
          if (!entry.key || !entry.data) {
            console.warn(`Invalid cache entry found: ${JSON.stringify(entry)}`);
            continue;
          }

          // Extract symbol from key (format: wave_analysis_SYMBOL_TIMEFRAME)
          const [, , symbol, timeframe] = entry.key.split('_');
          if (!symbol) {
            console.warn(`Invalid key format: ${entry.key}`);
            continue;
          }

          const key = `${symbol}:${timeframe || '1d'}`;
          
          // Parse if string data
          let analysisData = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
          
          // Handle nested data structure
          if (analysisData.data && analysisData.status === 'success') {
            analysisData = analysisData.data;
          }

          // Validate and transform the analysis data
          const transformedData: WaveAnalysisResult = {
            waves: Array.isArray(analysisData.waves) ? analysisData.waves : [],
            invalidWaves: Array.isArray(analysisData.invalidWaves) ? analysisData.invalidWaves : [],
            currentWave: analysisData.currentWave || null,
            fibTargets: Array.isArray(analysisData.fibTargets) ? analysisData.fibTargets : [],
            trend: analysisData.trend || 'neutral',
            impulsePattern: !!analysisData.impulsePattern,
            correctivePattern: !!analysisData.correctivePattern
          };

          analysisMap[key] = {
            analysis: transformedData,
            timestamp: entry.timestamp,
            isLoaded: true
          };

        } catch (error) {
          processingErrors.push({ entry: entry.key, error });
          console.error(`Error processing entry ${entry.key}:`, error);
        }
      }

      const processedCount = Object.keys(analysisMap).length;
      console.log(`Successfully processed ${processedCount} valid analyses out of ${cacheEntries.length} total entries`);
      if (processingErrors.length > 0) {
        console.warn(`Encountered ${processingErrors.length} errors while processing analyses:`, processingErrors);
      }

      // Update state and mark as loaded
      await new Promise<void>(resolve => {
        setAllAnalyses(analysisMap);
        setTimeout(() => {
          initialLoadPerformed.current = true;
          setIsLoaded(true);
          resolve();
        }, 0);
      });

    } catch (error) {
      console.error('Error loading analyses from Supabase:', error);
      throw error;
    }
  }, []); // Remove supabase from dependencies since it's stable

  const getAnalysis = useCallback(async (
    symbol: string, 
    historicalData: StockHistoricalData[], 
    force?: boolean, 
    silent?: boolean
  ): Promise<WaveAnalysisResult | null> => {
    try {
      // Implement actual analysis logic here
      const result = await getDeepSeekWaveAnalysis(symbol, historicalData);
      const analysis = convertDeepSeekToWaveAnalysis(result, historicalData);
      
      setAnalyses(prev => ({
        ...prev,
        [symbol]: analysis
      }));
      
      setAllAnalyses(prev => ({
        ...prev,
        [symbol]: {
          analysis,
          timestamp: Date.now(),
          isLoaded: true
        }
      }));
      
      return analysis;
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      return null;
    }
  }, []);

  const preloadAnalyses = useCallback(async (symbols: string[]) => {
    // Implement preloading logic
    // This could pre-fetch analyses for a list of symbols
  }, []);

  const clearAnalysis = useCallback((symbol?: string) => {
    if (symbol) {
      setAnalyses(prev => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
      setAllAnalyses(prev => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
    } else {
      setAnalyses({});
      setAllAnalyses({});
    }
  }, []);

  const clearCache = useCallback(() => {
    setAnalyses({});
    setAllAnalyses({});
    setAnalysisEvents([]);
  }, []);

  const cancelAnalysis = useCallback((symbol: string) => {
    // Add logic to cancel ongoing analysis for a symbol
    setAnalysisEvents(prev => [
      ...prev,
      {
        symbol,
        status: 'error',
        timestamp: Date.now(),
        message: 'Analysis cancelled'
      }
    ]);
  }, []);

  const cancelAllAnalyses = useCallback(() => {
    // Add logic to cancel all ongoing analyses
    setAnalysisEvents(prev => [
      ...prev,
      {
        symbol: 'all',
        status: 'error',
        timestamp: Date.now(),
        message: 'All analyses cancelled'
      }
    ]);
  }, []);

  const loadCacheTableData = async () => {
    try {
      // This should delegate to loadAllAnalysesFromSupabase since that's the existing
      // function that loads data from the database
      await loadAllAnalysesFromSupabase();
    } catch (error) {
      console.error('Error loading cache table data:', error);
      throw error;
    }
  };

  const value = {
    analyses,
    allAnalyses,
    isDataLoaded: isLoaded, // Use the state instead of the ref
    getAnalysis,
    preloadAnalyses,
    clearAnalysis,
    clearCache,
    cancelAnalysis,
    cancelAllAnalyses,
    analysisEvents,
    loadAllAnalysesFromSupabase,
    loadCacheTableData,
  };

  // Fix the automatic load effect to prevent infinite loops
  useEffect(() => {
    const loadData = async () => {
      if (AUTO_LOAD_ANALYSES_FROM_SUPABASE && !initialLoadPerformed.current) {
        try {
          await loadAllAnalysesFromSupabase();
          // Only mark as performed after successful load
          initialLoadPerformed.current = true;
        } catch (error) {
          console.error('Error in initial wave analyses load:', error);
          // Only reset on specific errors, not all errors
          if (error.message?.includes('network') || error.message?.includes('connection')) {
            initialLoadPerformed.current = false;
          }
        }
      }
    };

    loadData();
  }, []); // No dependencies - runs once on mount

  // Provide a value that matches WaveAnalysisContextValue
  const legacyValue: WaveAnalysisContextValue = {
    analyses: waveData,
    allAnalyses: {}, // Not implemented in this legacy provider
    isDataLoaded: false, // Add this line
    getAnalysis: async () => null, // Not implemented in this legacy provider
    preloadAnalyses: async () => {},
    clearAnalysis: () => {},
    clearCache: () => {},
    cancelAnalysis: () => {},
    cancelAllAnalyses: () => {},
    analysisEvents: [],
    loadAllAnalysesFromSupabase: async () => {},
    loadCacheTableData: async () => {}
  };

  return (
    <WaveAnalysisContext.Provider value={value}>
      {children}
    </WaveAnalysisContext.Provider>
  );
}

// 4. Export the hook separately - this is what components will use
// Use function declaration for the hook instead of const assignment
export function useWaveAnalysis() {
  const context = useContext(WaveAnalysisContext);
  if (!context) {
    throw new Error('useWaveAnalysis must be used within a WaveAnalysisProvider');
  }
  return context;
}

// Update convertDeepSeekToWaveAnalysis to properly handle currentWave
function convertDeepSeekToWaveAnalysis(
  deepSeekAnalysis: DeepSeekWaveAnalysis, 
  historicalData: StockHistoricalData[]
): WaveAnalysisResult {
  if (!deepSeekAnalysis) {
    console.error('DeepSeek API returned null or undefined response');
    return createEmptyAnalysisResult();
  }

  try {
    const waves: Wave[] = [];
    const fibTargets: FibTarget[] = [];
    let currentWave: Wave | null = null;
    
    // Process completed waves first
    if (Array.isArray(deepSeekAnalysis.completedWaves)) {
      deepSeekAnalysis.completedWaves.forEach(wave => {
        if (!wave || !wave.startTime || !wave.endTime || 
            typeof wave.startPrice !== 'number' || 
            typeof wave.endPrice !== 'number') {
          return;
        }
        
        const waveNumber = wave.number !== undefined ? wave.number : '?';
        const newWave = {
          number: waveNumber,
          startTimestamp: new Date(wave.startTime).getTime(),
          endTimestamp: new Date(wave.endTime).getTime(),
          startPrice: wave.startPrice,
          endPrice: wave.endPrice,
          type: determineWaveType(waveNumber),
          isComplete: true,
          isImpulse: isImpulseWave(waveNumber)
        };
        
        waves.push(newWave);
      });
    }
    
    // Process current wave
    if (deepSeekAnalysis.currentWave && 
        deepSeekAnalysis.currentWave.startTime && 
        typeof deepSeekAnalysis.currentWave.startPrice === 'number') {
      
      const currentWaveNumber = deepSeekAnalysis.currentWave.number !== undefined 
        ? deepSeekAnalysis.currentWave.number 
        : '?';
        
      currentWave = {
        number: currentWaveNumber,
        startTimestamp: new Date(deepSeekAnalysis.currentWave.startTime).getTime(),
        startPrice: deepSeekAnalysis.currentWave.startPrice,
        type: determineWaveType(currentWaveNumber),
        isComplete: false,
        isImpulse: isImpulseWave(currentWaveNumber)
      };
      
      waves.push(currentWave);
    }
    
    // Process Fibonacci targets
    if (Array.isArray(deepSeekAnalysis.fibTargets)) {
      deepSeekAnalysis.fibTargets.forEach(target => {
        if (!target || typeof target.price !== 'number') return;
        
        try {
          fibTargets.push({
            level: target.level ? parseFloat(target.level) : 0,
            price: target.price,
            label: target.label || '',
            isExtension: target.level ? parseFloat(target.level) > 1.0 : false,
            isCritical: target.level === '0.618' || target.level === '1.0'
          });
        } catch (targetError) {
          console.warn('Error processing fib target:', targetError);
        }
      });
    }

    return {
      waves,
      invalidWaves: [],
      currentWave: currentWave || waves[waves.length - 1] || null,
      fibTargets,
      trend: deepSeekAnalysis.trend || 'neutral',
      impulsePattern: waves.some(w => w.number === 5),
      correctivePattern: waves.some(w => w.number === 'C')
    };

  } catch (error) {
    console.error('Error converting DeepSeek analysis:', error);
    return createEmptyAnalysisResult();
  }
}

// Helper function to create an empty analysis result
function createEmptyAnalysisResult(): WaveAnalysisResult {
  return {
    waves: [],
    invalidWaves: [],
    currentWave: null,
    fibTargets: [],
    trend: 'neutral' as 'bullish' | 'bearish' | 'neutral',
    impulsePattern: false,
    correctivePattern: false
  };
}