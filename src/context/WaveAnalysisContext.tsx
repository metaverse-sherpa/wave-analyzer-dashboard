import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { WaveAnalysis, WaveAnalysisResult, Wave, DeepSeekWaveAnalysis } from '@/types/shared';
import { getDeepSeekWaveAnalysis } from '@/api/deepseekApi';
import { getCachedWaveAnalysis, convertDeepSeekToWaveAnalysis } from '@/utils/wave-analysis';
import { supabase } from '@/lib/supabase';
import { getAllWaveAnalyses } from '@/services/cacheService';

// Global flags to track the loading state across component mounts/unmounts
let isLoadingCacheData = false;
let hasLoadedCacheData = false; // New flag to remember if data was ever successfully loaded

// Define proper type for analysis events
interface AnalysisEvent {
  symbol: string;
  status: 'started' | 'completed' | 'error';
  timestamp: number;
  message?: string;
}

interface WaveAnalysisContextType {
  analysis: WaveAnalysisResult | null;
  loading: boolean;
  error: Error | null;
  fetchAnalysis: (symbol: string) => Promise<void>;
  analyses: Record<string, WaveAnalysisResult>;
  getAnalysis: (symbol: string) => WaveAnalysisResult | null;
  allAnalyses: Record<string, { 
    analysis: WaveAnalysisResult;
    timestamp: number;
    isLoaded: boolean;
  }>;
  isDataLoaded: boolean;
  analysisEvents: AnalysisEvent[];
  loadAllAnalysesFromSupabase: () => Promise<void>;
  cancelAllAnalyses: () => void;
  clearCache: () => void;
  loadCacheTableData: (forceRefresh?: boolean) => Promise<void>;
  waveAnalysesCache: Record<string, WaveAnalysisResult>; // Add missing property
}

const WaveAnalysisContext = createContext<WaveAnalysisContextType | undefined>(undefined);

// Use named function for Fast Refresh compatibility
function WaveAnalysisProvider({ children }: { children: React.ReactNode }) {
  const [analysis, setAnalysis] = useState<WaveAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [allAnalyses, setAllAnalyses] = useState<Record<string, { 
    analysis: WaveAnalysisResult;
    timestamp: number;
    isLoaded: boolean;
  }>>({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [analysisEvents, setAnalysisEvents] = useState<AnalysisEvent[]>([]);

  const fetchAnalysis = async (symbol: string) => {
    try {
      setLoading(true);
      setError(null);
      const cachedAnalysis = await getCachedWaveAnalysis(symbol);
      if (cachedAnalysis) {
        setAnalysis(cachedAnalysis);
      } else {
        const freshAnalysis = await getDeepSeekWaveAnalysis(symbol);
        setAnalysis(convertDeepSeekToWaveAnalysis(freshAnalysis));
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch analysis'));
    } finally {
      setLoading(false);
    }
  };

  const getAnalysis = (symbol: string) => {
    return analyses[symbol] || null;
  };

  const loadAllAnalysesFromSupabase = async () => {
    try {
      console.log('loadAllAnalysesFromSupabase called');
      
      // If we already have data, don't override it
      if (Object.keys(allAnalyses).length > 0) {
        console.log(`Using existing ${Object.keys(allAnalyses).length} wave analyses already loaded`);
        setIsDataLoaded(true);
        return;
      }
      
      console.log('Loading all wave analyses from Supabase via loadAllAnalysesFromSupabase...');
      
      // This function is now just a wrapper around loadCacheTableData
      // to avoid duplicate logic and ensure data is loaded only once
      await loadCacheTableData();
      
      setIsDataLoaded(true);
    } catch (error) {
      console.error('Error in loadAllAnalysesFromSupabase:', error);
      setIsDataLoaded(true); // Still mark as loaded so UI doesn't hang
    }
  };

  const cancelAllAnalyses = () => {
    // Add event to cancel all analyses
    setAnalysisEvents(prev => [
      {
        symbol: 'all',
        status: 'error',
        timestamp: Date.now(),
        message: 'Analysis canceled by user'
      },
      ...prev
    ]);
  };

  const clearCache = () => {
    // Clear local state
    setAllAnalyses({});
    setAnalyses({});
    hasLoadedCacheData = false; // Reset the loaded flag when clearing cache
    
    // Clear session storage flag
    try {
      sessionStorage.removeItem('wave_analyses_loaded');
    } catch (e) {
      // Ignore storage errors
    }
  };

  const loadCacheTableData = useCallback(async (forceRefresh = false) => {
    // Check if data is already loaded or being loaded
    if (!forceRefresh && hasLoadedCacheData && Object.keys(allAnalyses).length > 0) {
      console.log('Data already loaded - skipping loadCacheTableData');
      setIsDataLoaded(true);
      return;
    }

    // Check the global flag to prevent concurrent loading
    if (isLoadingCacheData) {
      console.log('Another component is already loading cache data - skipping duplicate load');
      return;
    }

    try {
      isLoadingCacheData = true; // Set the global flag
      console.log('Loading wave analysis data from cache table...');
      
      // Fetch data from Supabase cache
      const { data: waveData, error } = await supabase
        .from('cache')
        .select('key, timestamp, data')
        .like('key', 'wave_analysis_%');
        
      if (error) {
        throw error;
      }
      
      if (!waveData || waveData.length === 0) {
        console.warn('No wave analysis data found in cache table');
        setIsDataLoaded(true);
        return;
      }
      
      console.log(`Found ${waveData.length} wave analyses in cache table`);
      
      // Debug the first item to understand its structure
      if (waveData.length > 0) {
        const sampleItem = waveData[0];
        console.log('Sample wave analysis data structure:', {
          key: sampleItem.key,
          dataType: typeof sampleItem.data,
          hasNestedData: sampleItem.data?.data !== undefined,
          nestedDataKeys: sampleItem.data?.data ? Object.keys(sampleItem.data.data) : [],
          fullDataStructure: sampleItem.data
        });
      }
      
      // Process each analysis and format it for the UI
      const formattedAnalyses: Record<string, { 
        analysis: WaveAnalysisResult;
        timestamp: number;
        isLoaded: boolean;
      }> = {};
      
      let processedCount = 0;
      let invalidCount = 0;
      
      waveData.forEach(item => {
        try {
          // Extract symbol and timeframe from key (wave_analysis_SYMBOL_TIMEFRAME)
          const parts = item.key.split('_');
          if (parts.length >= 3) {
            const symbol = parts[2];
            const timeframe = parts[3] || '1d';
            const cacheKey = `${symbol}:${timeframe}`;
            
            // Handle the nested data structure
            // The wave analysis is stored in item.data.data
            let analysisData;
            
            // Check if we have a nested data structure
            if (item.data?.data) {
              analysisData = item.data.data;
              console.log(`Processing nested data for ${item.key}`);
            } else {
              analysisData = item.data;
              console.log(`Processing direct data for ${item.key}`);
            }
            
            if (analysisData) {
              // Create a properly formatted WaveAnalysisResult
              const processedAnalysis: WaveAnalysisResult = {
                // Initialize with default values
                waves: [],
                currentWave: null,
                fibTargets: [],
                trend: 'neutral',
                impulsePattern: false,
                correctivePattern: false,
                invalidWaves: [],
                
                // Map fields from the stored structure
                ...(analysisData.trend && { trend: analysisData.trend }),
                ...(analysisData.impulsePattern && { impulsePattern: analysisData.impulsePattern }),
                ...(analysisData.correctivePattern && { correctivePattern: analysisData.correctivePattern }),
                ...(analysisData.analysis && { analysis: analysisData.analysis }),
                ...(analysisData.stopLoss && { stopLoss: analysisData.stopLoss }),
                ...(Array.isArray(analysisData.fibTargets) && { fibTargets: analysisData.fibTargets })
              };
              
              // Handle currentWave (needs special formatting)
              if (analysisData.currentWave) {
                processedAnalysis.currentWave = {
                  number: analysisData.currentWave.number,
                  startPrice: analysisData.currentWave.startPrice || 0,
                  startTimestamp: analysisData.currentWave.startTime ? new Date(analysisData.currentWave.startTime).getTime() : Date.now(),
                  type: 'impulse', // Default to impulse if not specified
                  isComplete: false // Current wave is not complete
                };
              }
              
              // Handle waves: combine completedWaves with currentWave
              const waves: Wave[] = [];
              
              // Add completed waves if they exist
              if (Array.isArray(analysisData.completedWaves)) {
                analysisData.completedWaves.forEach(completedWave => {
                  waves.push({
                    number: completedWave.number,
                    startPrice: completedWave.startPrice,
                    endPrice: completedWave.endPrice,
                    startTimestamp: completedWave.startTime ? new Date(completedWave.startTime).getTime() : 0,
                    endTimestamp: completedWave.endTime ? new Date(completedWave.endTime).getTime() : 0,
                    type: ['1', '3', '5', 'A', 'C'].includes(String(completedWave.number)) ? 'impulse' : 'corrective',
                    isComplete: true
                  });
                });
              }
              
              // Add current wave to the waves array if it exists
              if (processedAnalysis.currentWave) {
                waves.push({
                  ...processedAnalysis.currentWave,
                  isComplete: false
                });
              }
              
              // If we have traditional waves structure, use that instead
              if (Array.isArray(analysisData.waves) && analysisData.waves.length > 0) {
                processedAnalysis.waves = analysisData.waves;
              } else {
                processedAnalysis.waves = waves;
              }
              
              // Only add if we have at least one wave
              if (processedAnalysis.waves.length > 0 || processedAnalysis.currentWave) {
                formattedAnalyses[cacheKey] = {
                  analysis: processedAnalysis,
                  timestamp: item.timestamp || Date.now(),
                  isLoaded: true
                };
                processedCount++;
              } else {
                console.warn(`Skipping ${item.key} - no valid waves found`);
                invalidCount++;
              }
            } else {
              console.warn(`Skipping ${item.key} - no analysis data`);
              invalidCount++;
            }
          } else {
            console.warn(`Invalid cache key format: ${item.key}`);
            invalidCount++;
          }
        } catch (err) {
          console.error(`Error processing wave analysis item ${item.key}:`, err);
          invalidCount++;
        }
      });
      
      console.log(`Processing summary: Total: ${waveData.length}, Processed: ${processedCount}, Invalid: ${invalidCount}`);
      console.log(`Successfully processed ${Object.keys(formattedAnalyses).length} wave analyses`);
      
      // Update state with the formatted analyses
      setAllAnalyses(formattedAnalyses);
      setIsDataLoaded(true);
      hasLoadedCacheData = true; // Mark that data has been successfully loaded
      
      // Store an easy-to-use cache of just the analysis results
      const simpleCache: Record<string, WaveAnalysisResult> = {};
      Object.entries(formattedAnalyses).forEach(([key, data]) => {
        simpleCache[key] = data.analysis;
      });
      setAnalyses(simpleCache);
      
      // Store session storage flag to track loaded state across page refreshes
      try {
        sessionStorage.setItem('wave_analyses_loaded', 'true');
      } catch (e) {
        // Ignore storage errors
      }
    } catch (err) {
      console.error('Error loading cache table data:', err);
      setIsDataLoaded(true); // Still mark as loaded so UI doesn't hang
    } finally {
      isLoadingCacheData = false; // Reset the global flag
    }
  }, [allAnalyses]);

  // Check session storage on mount to detect if data was loaded in this session
  useEffect(() => {
    try {
      const wasLoaded = sessionStorage.getItem('wave_analyses_loaded') === 'true';
      if (wasLoaded) {
        hasLoadedCacheData = true;
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, []);

  return (
    <WaveAnalysisContext.Provider value={{ 
      analysis, 
      loading, 
      error, 
      fetchAnalysis,
      analyses,
      getAnalysis,
      allAnalyses,
      isDataLoaded,
      analysisEvents,
      loadAllAnalysesFromSupabase,
      cancelAllAnalyses,
      clearCache,
      loadCacheTableData,
      waveAnalysesCache: analyses // Using the analyses record as the waveAnalysesCache
    }}>
      {children}
    </WaveAnalysisContext.Provider>
  );
}

// Named function for React Fast Refresh compatibility
function useWaveAnalysis() {
  const context = useContext(WaveAnalysisContext);
  if (context === undefined) {
    throw new Error('useWaveAnalysis must be used within a WaveAnalysisProvider');
  }
  return context;
}

export { WaveAnalysisProvider, useWaveAnalysis };