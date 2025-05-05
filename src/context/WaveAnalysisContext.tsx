import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { WaveAnalysis, WaveAnalysisResult, Wave, DeepSeekWaveAnalysis } from '@/types/shared';
import { getDeepSeekWaveAnalysis } from '@/api/deepseekApi';
import { getCachedWaveAnalysis, convertDeepSeekToWaveAnalysis } from '@/utils/wave-analysis';
import { supabase } from '@/lib/supabase';
import { getAllWaveAnalyses, saveToCache } from '@/services/cacheService';

// Global flags to track the loading state across component mounts/unmounts
let isLoadingCacheData = false;
// let hasLoadedCacheData = false; // <-- Re-comment out for debugging

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
  refreshStockAnalysis: (symbol: string) => Promise<boolean>; // Add new function
}

const WaveAnalysisContext = createContext<WaveAnalysisContextType | undefined>(undefined);

// Define the context hook separately from its export for Fast Refresh compatibility
const useWaveAnalysisContext = () => {
  const context = useContext(WaveAnalysisContext);
  if (context === undefined) {
    throw new Error('useWaveAnalysis must be used within a WaveAnalysisProvider');
  }
  return context;
};

// Export as a named export for Fast Refresh compatibility
export const useWaveAnalysis = useWaveAnalysisContext;

export function WaveAnalysisProvider({ children }: { children: React.ReactNode }) {
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
    
    // Clear session storage flag
    try {
      sessionStorage.removeItem('wave_analyses_loaded');
    } catch (e) {
      // Ignore storage errors
    }
  };

  // New function to refresh a single stock analysis using local algorithm
  const refreshStockAnalysis = async (symbol: string): Promise<boolean> => {
    try {
      console.log(`[RefreshStock] Starting refresh for ${symbol}`);
      
      // Add event to show analysis has started
      setAnalysisEvents(prev => [
        {
          symbol: symbol,
          status: 'started',
          timestamp: Date.now(),
          message: `Starting fresh Elliott Wave analysis for ${symbol}`
        },
        ...prev
      ]);

      // Create a function to get historical data
      async function fetchHistoricalData() {
        try {
          // Import the fetchHistoricalData function from yahooFinanceService
          const { fetchHistoricalData } = await import('@/services/yahooFinanceService');
          
          console.log(`[RefreshStock] Fetching historical data for ${symbol}`);
          return await fetchHistoricalData(symbol, '1d');
        } catch (error) {
          console.error(`[RefreshStock] Failed to fetch historical data: ${error.message}`);
          throw new Error(`Failed to get historical data for analysis: ${error.message}`);
        }
      }
      
      // Get historical data
      const historicalData = await fetchHistoricalData();
      
      if (!historicalData || historicalData.length < 50) {
        console.error(`[RefreshStock] Insufficient historical data for ${symbol} (${historicalData?.length || 0} data points)`);
        throw new Error('Insufficient historical data for analysis');
      }

      // --- START ADDED LOGGING ---
      console.log(`[RefreshStock] Data for ${symbol}:`);
      console.log(`  - Points: ${historicalData.length}`);
      console.log(`  - First Timestamp: ${new Date(historicalData[0].timestamp).toISOString()}`);
      console.log(`  - Last Timestamp: ${new Date(historicalData[historicalData.length - 1].timestamp).toISOString()}`);
      // --- END ADDED LOGGING ---

      // Import the local Elliott Wave analysis function
      console.log(`[RefreshStock] Performing local Elliott Wave analysis for ${symbol}`);
      const { analyzeElliottWaves } = await import('@/utils/elliottWaveAnalysis');
      
      // Run the Elliott Wave analysis on the historical data with the correct parameters
      const waveAnalysis = await analyzeElliottWaves(symbol, historicalData);
      
      console.log(`[RefreshStock] Analysis complete for ${symbol}:`, waveAnalysis);
      
      if (waveAnalysis) {
        // Explicitly cast the wave analysis result to WaveAnalysis to satisfy TypeScript
        const typedAnalysis = waveAnalysis as WaveAnalysis;
        
        // CRITICAL FIX: Check for invalid waves, especially Wave 4
        let hasInvalidWave = false;
        const invalidWaves = typedAnalysis.invalidWaves || [];
        
        // Process each wave to check for invalidation flags
        if (typedAnalysis.waves) {
          for (let i = 0; i < typedAnalysis.waves.length; i++) {
            const wave = typedAnalysis.waves[i];
            
            // Check if this wave is marked as invalid
            if (wave.isValid === false || wave.isInvalidated || wave.isTerminated) {
              console.log(`[RefreshStock] Found invalid wave ${wave.number} for ${symbol}`);
              hasInvalidWave = true;
              
              // ALWAYS mark invalidated waves as complete
              wave.isComplete = true;
              
              // If endTimestamp and endPrice are missing, set them to the invalidation timestamp and price
              if (!wave.endTimestamp && wave.invalidationTimestamp) {
                wave.endTimestamp = wave.invalidationTimestamp;
                console.log(`[RefreshStock] Setting endTimestamp for invalid wave ${wave.number} to invalidationTimestamp`);
              }
              
              if (!wave.endPrice && wave.invalidationPrice) {
                wave.endPrice = wave.invalidationPrice;
                console.log(`[RefreshStock] Setting endPrice for invalid wave ${wave.number} to invalidationPrice`);
              }
              
              // Add this wave to invalidWaves if not already there
              if (!invalidWaves.some(invWave => 
                invWave.number === wave.number && 
                invWave.startTimestamp === wave.startTimestamp
              )) {
                invalidWaves.push({...wave});
                console.log(`[RefreshStock] Added wave ${wave.number} to invalidWaves array`);
              }
              
              // CRITICAL FIX: If this is an invalid Wave 4 or any wave that terminates a pattern,
              // clear currentWave and fibTargets
              if (wave.number === 4 || wave.isTerminated) {
                console.log(`[RefreshStock] Wave ${wave.number} is invalid for ${symbol}, clearing currentWave and fibTargets`);
                typedAnalysis.currentWave = null;
                typedAnalysis.fibTargets = [];
              }
            }
          }
        }
        
        // Update the invalidWaves array in the analysis
        typedAnalysis.invalidWaves = invalidWaves;

        // ADDITIONAL CHECK: If there's an invalid wave in the invalidWaves array but not in the waves array,
        // check if it's a Wave 4 and handle accordingly
        if (typedAnalysis.invalidWaves && typedAnalysis.invalidWaves.length > 0) {
          const currentWaveNumber = typedAnalysis.currentWave?.number;
          
          // If currentWave is a Wave 4 that's marked as invalid in invalidWaves, clear it
          if (currentWaveNumber === 4) {
            const invalidWave4 = typedAnalysis.invalidWaves.find(w => 
              w.number === 4 && 
              (w.isValid === false || w.isInvalidated || w.isTerminated)
            );
            
            if (invalidWave4) {
              console.log(`[RefreshStock] Found invalid Wave 4 in invalidWaves array, ensuring currentWave is cleared`);
              typedAnalysis.currentWave = null;
              typedAnalysis.fibTargets = [];
              hasInvalidWave = true;
            }
          }
        }

        // Handle the currentWave only if no invalidation was found
        if (!hasInvalidWave && typedAnalysis.currentWave) {
          const currentWaveNumber = typedAnalysis.currentWave.number;
          const currentWaveStartTimestamp = typedAnalysis.currentWave.startTimestamp;

          // 1. Fix the currentWave property itself
          typedAnalysis.currentWave.isComplete = false;
          if ('endTimestamp' in typedAnalysis.currentWave) delete typedAnalysis.currentWave.endTimestamp;
          if ('endPrice' in typedAnalysis.currentWave) delete typedAnalysis.currentWave.endPrice;
          console.log(`[RefreshStock] Cleaned up currentWave property for ${symbol} (Wave ${currentWaveNumber})`);

          // 2. Find and fix the corresponding wave object within the waves array
          const waveIndex = typedAnalysis.waves.findIndex(
            w => w.startTimestamp === currentWaveStartTimestamp && w.number === currentWaveNumber
          );
          if (waveIndex !== -1) {
            typedAnalysis.waves[waveIndex].isComplete = false;
            if ('endTimestamp' in typedAnalysis.waves[waveIndex]) delete typedAnalysis.waves[waveIndex].endTimestamp;
            if ('endPrice' in typedAnalysis.waves[waveIndex]) delete typedAnalysis.waves[waveIndex].endPrice;
            console.log(`[RefreshStock] Cleaned up corresponding wave in waves array at index ${waveIndex} for ${symbol}`);
          } else {
             // This case might happen if currentWave is somehow detached from the main array, log a warning.
             console.warn(`[RefreshStock] Could not find matching wave in waves array for currentWave ${currentWaveNumber} starting at ${currentWaveStartTimestamp}. The currentWave property was still cleaned.`);
          }
        } else if (hasInvalidWave) {
           console.log(`[RefreshStock] Invalidated waves found for ${symbol}, current wave was cleared.`);
        } else {
           console.log(`[RefreshStock] No currentWave property found for ${symbol}. Assuming analysis is complete.`);
        }
        
        // Make sure fibTargets is defined even if missing from the analysis
        if (!typedAnalysis.fibTargets || !Array.isArray(typedAnalysis.fibTargets)) {
          typedAnalysis.fibTargets = [];
          console.log(`[RefreshStock] Created empty fibTargets array for ${symbol}`);
        }
        
        // Log the final analysis state for debugging
        console.log(`[RefreshStock] Final analysis state:`, {
          hasInvalidWaves: hasInvalidWave,
          invalidWavesCount: invalidWaves.length,
          currentWave: typedAnalysis.currentWave ? {
            number: typedAnalysis.currentWave.number,
            isComplete: typedAnalysis.currentWave.isComplete
          } : null,
          fibTargetsLength: typedAnalysis.fibTargets.length
        });
        
        // Update analyses state with the new analysis
        setAnalyses(prev => ({
          ...prev,
          [`${symbol}:1d`]: typedAnalysis
        }));
        
        // Update the allAnalyses state too
        setAllAnalyses(prev => ({
          ...prev,
          [`${symbol}:1d`]: {
            analysis: typedAnalysis,
            timestamp: Date.now(),
            isLoaded: true
          }
        }));
        
        // SAVE TO SUPABASE CACHE - Default cache duration is 7 days
        const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
        const cacheKey = `wave_analysis_${symbol}_1d`;
        
        try {
          console.log(`[RefreshStock] Saving analysis for ${symbol} to Supabase cache`);
          await saveToCache(cacheKey, typedAnalysis, CACHE_DURATION);
          console.log(`[RefreshStock] Successfully saved analysis for ${symbol} to Supabase cache`);
        } catch (cacheError) {
          // Just log the error but continue - not critical for the function to succeed
          console.error(`[RefreshStock] Error saving to Supabase cache: ${cacheError.message}`);
        }
        
        // Add event to show analysis is complete
        setAnalysisEvents(prev => [
          {
            symbol: symbol,
            status: 'completed',
            timestamp: Date.now(),
            message: `Completed Elliott Wave analysis for ${symbol}`
          },
          ...prev
        ]);
        
        console.log(`[RefreshStock] Successfully refreshed analysis for ${symbol}`);
        return true;
      } else {
        throw new Error('Wave analysis returned no results');
      }
    } catch (error) {
      console.error(`[RefreshStock] Error refreshing analysis for ${symbol}:`, error);
      
      // Add event to show analysis failed
      setAnalysisEvents(prev => [
        {
          symbol: symbol,
          status: 'error',
          timestamp: Date.now(),
          message: `Failed to refresh Elliott Wave analysis for ${symbol}: ${error.message}`
        },
        ...prev
      ]);
      
      return false;
    }
  };

  const loadCacheTableData = useCallback(async (forceRefresh = false) => {
    // Check if data is already loaded or being loaded
    // if (!forceRefresh && hasLoadedCacheData && Object.keys(allAnalyses).length > 0) { // <-- Re-comment out this block for debugging
    //   console.log('[CacheCheck] Data already loaded - skipping loadCacheTableData');
    //   setIsDataLoaded(true);
    //   return;
    // }

    // Check the global flag to prevent concurrent loading
    if (isLoadingCacheData) {
      console.log('[CacheCheck] Another component is already loading cache data - skipping duplicate load');
      return;
    }

    try {
      isLoadingCacheData = true;
      console.log(`[CacheLoad] Starting loadCacheTableData. forceRefresh=${forceRefresh}`);

      // Fetch data from Supabase cache
      const { data: waveData, error } = await supabase
        .from('cache')
        .select('key, timestamp, data')
        .like('key', 'wave_analysis_%');

      if (error) throw error;
      if (!waveData || waveData.length === 0) {
        console.warn('No wave analysis data found in cache table');
        setIsDataLoaded(true);
        return;
      }

      console.log(`[CacheLoad] Found ${waveData.length} wave analyses in cache table`);

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

      // Process each analysis
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
          if (parts.length < 3) {
            console.warn(`Invalid cache key format: ${item.key}`);
            invalidCount++;
            return;
          }
          const symbol = parts[2];
          const timeframe = parts[3] || '1d';
          const cacheKey = `${symbol}:${timeframe}`;

          // Handle the nested data structure
          let analysisData;
          if (item.data?.data) { // Check for the nested 'data' property first
            analysisData = item.data.data;
          } else if (typeof item.data === 'object' && item.data !== null) { // Check if item.data itself is the object
             analysisData = item.data;
          } else {
             console.warn(`Skipping ${item.key} - invalid data structure`);
             invalidCount++;
             return;
          }

          if (symbol === 'RNMBY') {
            console.log(`[WaveContext:RNMBY] Raw analysisData for key ${item.key}:`, JSON.stringify(analysisData));
          }

          if (!analysisData || typeof analysisData !== 'object') {
            console.warn(`Skipping ${item.key} - analysisData is missing or not an object`);
            invalidCount++;
            return;
          }

          // --- Start Wave Processing Logic ---
          const processedCompletedWaves: Wave[] = [];
          let lastCompletedWaveEndTimestamp: number | null = null;

          // 1. Process completed waves first - check both completedWaves and waves arrays
          if (Array.isArray(analysisData.completedWaves)) {
            analysisData.completedWaves.forEach((completedWave: any) => {
              const startTimestamp = completedWave.startTime ? new Date(completedWave.startTime).getTime() : 0;
              const endTimestamp = completedWave.endTime ? new Date(completedWave.endTime).getTime() : 0;

              if (startTimestamp === 0 || endTimestamp === 0) {
                 console.warn(`[WaveProc] Skipping completed wave ${completedWave.number} for ${symbol} due to missing timestamps.`);
                 return;
              }

              processedCompletedWaves.push({
                number: completedWave.number,
                startPrice: completedWave.startPrice,
                endPrice: completedWave.endPrice,
                startTimestamp: startTimestamp,
                endTimestamp: endTimestamp,
                type: ['1', '3', '5', 'A', 'C'].includes(String(completedWave.number)) ? 'impulse' : 'corrective',
                isComplete: true // Completed waves are always complete
              });
              if (endTimestamp > (lastCompletedWaveEndTimestamp || 0)) {
                lastCompletedWaveEndTimestamp = endTimestamp;
              }
            });
             processedCompletedWaves.sort((a, b) => Number(a.number) - Number(b.number));
          } 
          // If completedWaves is missing, check for a 'waves' array with isComplete=true waves
          else if (Array.isArray(analysisData.waves)) {
            // Looking at the logs, this is the format that's being used for RNMBY
            analysisData.waves
              .filter((wave: any) => wave.isComplete === true)
              .forEach((completedWave: any) => {
                const startTimestamp = completedWave.startTimestamp || 0;
                const endTimestamp = completedWave.endTimestamp || 0;
                
                if (startTimestamp === 0 || endTimestamp === 0) {
                  console.warn(`[WaveProc] Skipping wave ${completedWave.number} for ${symbol} due to missing timestamps.`);
                  return;
                }

                processedCompletedWaves.push({
                  number: completedWave.number,
                  startPrice: completedWave.startPrice,
                  endPrice: completedWave.endPrice,
                  startTimestamp: startTimestamp,
                  endTimestamp: endTimestamp,
                  type: completedWave.type || 
                        (['1', '3', '5', 'A', 'C'].includes(String(completedWave.number)) ? 'impulse' : 'corrective'),
                  isComplete: true
                });
                
                if (endTimestamp > (lastCompletedWaveEndTimestamp || 0)) {
                  lastCompletedWaveEndTimestamp = endTimestamp;
                }
              });
              
            processedCompletedWaves.sort((a, b) => Number(a.number) - Number(b.number));
            
            if (symbol === 'RNMBY') {
              console.log(`[WaveContext:RNMBY] Processed waves array:`, JSON.stringify(processedCompletedWaves));
            }
          } else if (symbol === 'RNMBY') {
              console.warn(`[WaveContext:RNMBY] Neither analysisData.completedWaves nor analysisData.waves is a valid array.`);
          }


          let processedCurrentWave: Wave | null = null;
          // Determine if the *entire sequence* is marked complete in the source data
          const isSequenceComplete = !!analysisData.isComplete; // Use top-level flag

          // 2. Process current wave *only if the sequence is NOT complete*
          if (!isSequenceComplete && analysisData.currentWave && typeof analysisData.currentWave === 'object') {
             // Determine start timestamp
             let currentWaveStartTimestamp: number | null = null;
             if (analysisData.currentWave.startTime) {
               currentWaveStartTimestamp = new Date(analysisData.currentWave.startTime).getTime();
             } else if (lastCompletedWaveEndTimestamp) {
               currentWaveStartTimestamp = lastCompletedWaveEndTimestamp;
             } else {
               currentWaveStartTimestamp = Date.now(); // Fallback
             }

             processedCurrentWave = {
               number: analysisData.currentWave.number,
               startPrice: analysisData.currentWave.startPrice || 0,
               startTimestamp: currentWaveStartTimestamp,
               endPrice: undefined, // Current wave cannot have end price/time
               endTimestamp: undefined,
               type: ['1', '3', '5', 'A', 'C'].includes(String(analysisData.currentWave.number)) ? 'impulse' : 'corrective',
               isComplete: false // Current wave is never complete by definition
             };

             if (symbol === 'RNMBY') {
               console.log(`[WaveContext:RNMBY] Processed INCOMPLETE currentWave object:`, JSON.stringify(processedCurrentWave));
             }
          } else if (symbol === 'RNMBY' && !isSequenceComplete) {
             console.warn(`[WaveContext:RNMBY] Sequence is INCOMPLETE but analysisData.currentWave is missing or not an object.`);
          } else if (symbol === 'RNMBY' && isSequenceComplete) {
             console.log(`[WaveContext:RNMBY] Sequence is COMPLETE. No currentWave processed.`);
          }

          // 3. Combine waves:
          // Start with the processed completed waves.
          let combinedWaves: Wave[] = [...processedCompletedWaves];

          // If the sequence is complete, the last wave in `completedWaves` *should* be the final wave (e.g., wave 5).
          // If the sequence is *not* complete, add the `processedCurrentWave` if it exists.
          if (!isSequenceComplete && processedCurrentWave) {
              combinedWaves.push(processedCurrentWave);
          }

          if (symbol === 'RNMBY') {
            console.log(`[WaveContext:RNMBY] Combined waves array (isSequenceComplete: ${isSequenceComplete}):`, JSON.stringify(combinedWaves));
          }


          // 4. Construct the final analysis object
          const processedAnalysis: WaveAnalysisResult = {
            waves: combinedWaves, // Use the correctly combined array
            // currentWave is only non-null if the sequence is incomplete AND we successfully processed one
            currentWave: !isSequenceComplete ? processedCurrentWave : null,
            fibTargets: Array.isArray(analysisData.fibTargets) ? analysisData.fibTargets : [],
            trend: analysisData.trend || 'neutral',
            impulsePattern: analysisData.impulsePattern || false,
            correctivePattern: analysisData.correctivePattern || false,
            invalidWaves: analysisData.invalidWaves || [],
            analysis: analysisData.analysis,
            stopLoss: analysisData.stopLoss
          };

          // Only add if we have at least one wave
          if (processedAnalysis.waves.length > 0) {
            formattedAnalyses[cacheKey] = {
              analysis: processedAnalysis,
              timestamp: item.timestamp || Date.now(),
              isLoaded: true
            };
            processedCount++;
            if (symbol === 'RNMBY') {
              console.log(`[WaveContext:RNMBY] Storing final processed analysis in formattedAnalyses for key ${cacheKey}:`, JSON.stringify(processedAnalysis));
            }
          } else {
            console.warn(`Skipping ${item.key} - no valid waves found after processing`);
            invalidCount++;
          }
          // --- End Wave Processing Logic ---

        } catch (err) {
          console.error(`Error processing wave analysis item ${item.key}:`, err);
          invalidCount++;
        }
      }); // End of waveData.forEach

      console.log(`Processing summary: Total: ${waveData.length}, Processed: ${processedCount}, Invalid: ${invalidCount}`);
      console.log(`Successfully processed ${Object.keys(formattedAnalyses).length} wave analyses`);

      // Update state with the formatted analyses
      setAllAnalyses(formattedAnalyses);
      setIsDataLoaded(true);
      // hasLoadedCacheData = true; // <-- Re-comment out for debugging

      // Store an easy-to-use cache of just the analysis results
      const simpleCache: Record<string, WaveAnalysisResult> = {};
      Object.entries(formattedAnalyses).forEach(([key, data]) => {
        simpleCache[key] = data.analysis;
      });
      setAnalyses(simpleCache);

      // Store session storage flag to track loaded state across page refreshes
      // try { // <-- Re-comment out session storage set for debugging
      //   sessionStorage.setItem('wave_analyses_loaded', 'true');
      // } catch (e) { /* Ignore storage errors */ }

    } catch (err) {
      console.error('[CacheLoad] Error loading cache table data:', err);
      setIsDataLoaded(true); // Still mark as loaded so UI doesn't hang
    } finally {
      isLoadingCacheData = false; // Reset the global flag
      console.log('[CacheLoad] Finished loadCacheTableData execution.');
    }
  }, [allAnalyses]); // Added allAnalyses dependency - review if needed

  // Check session storage on initial load to set the loaded state
  useEffect(() => {
    // try { // <-- Re-comment out session storage check for debugging
    //   const loaded = sessionStorage.getItem('wave_analyses_loaded');
    //   if (loaded) {
    //     console.log('[CacheCheck] Found session storage flag - setting initial loaded state.');
    //     hasLoadedCacheData = true;
    //     setIsDataLoaded(true);
    //   } else {
    //      console.log('[CacheCheck] No session storage flag found.');
    //   }
    // } catch (e) {
    //   // Ignore storage errors
    // }
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
      waveAnalysesCache: analyses, // Using the analyses record as the waveAnalysesCache
      refreshStockAnalysis // Add the new function to the context
    }}>
      {children}
    </WaveAnalysisContext.Provider>
  );
}