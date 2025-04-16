import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
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
  allAnalyses: Record<string, WaveAnalysisWithTimestamp>; // Add this line
  getAnalysis: (symbol: string, historicalData: StockHistoricalData[], force?: boolean, silent?: boolean) => Promise<WaveAnalysisResult | null>;
  preloadAnalyses: (symbols: string[]) => Promise<void>;
  clearAnalysis: (symbol?: string) => void;
  clearCache: () => void;
  cancelAnalysis: (symbol: string) => void;
  cancelAllAnalyses: () => void;
  analysisEvents: AnalysisEvent[];
  loadAllAnalysesFromSupabase: () => Promise<void>;
}

// Update the default context value to include allAnalyses
const WaveAnalysisContext = createContext<WaveAnalysisContextValue>({
  analyses: {},
  allAnalyses: {}, // Add this line
  getAnalysis: async () => null,
  preloadAnalyses: async () => {},
  clearAnalysis: () => {},
  clearCache: () => {},
  cancelAnalysis: () => {},
  cancelAllAnalyses: () => {},
  analysisEvents: [],
  loadAllAnalysesFromSupabase: async () => {}
});

// 3. Export the provider component
export const WaveAnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  // Provide a value that matches WaveAnalysisContextValue
  const value: WaveAnalysisContextValue = {
    analyses: waveData,
    allAnalyses: {}, // Not implemented in this legacy provider
    getAnalysis: async () => null, // Not implemented in this legacy provider
    preloadAnalyses: async () => {},
    clearAnalysis: () => {},
    clearCache: () => {},
    cancelAnalysis: () => {},
    cancelAllAnalyses: () => {},
    analysisEvents: [],
    loadAllAnalysesFromSupabase: async () => {},
  };

  return (
    <WaveAnalysisContext.Provider value={value}>
      {children}
    </WaveAnalysisContext.Provider>
  );
};

// 4. Export the hook separately - this is what components will use
// Use function declaration for the hook instead of const assignment
export function useWaveAnalysis(): WaveAnalysisContextValue {
  const context = useContext(WaveAnalysisContext);
  
  if (!context) {
    console.error('useWaveAnalysis must be used within a WaveAnalysisProvider');
    
    return {
      analyses: {},
      allAnalyses: {},
      getAnalysis: async () => null,
      preloadAnalyses: async () => {},
      clearAnalysis: () => {},
      clearCache: () => {},
      cancelAnalysis: () => {},
      cancelAllAnalyses: () => {},
      analysisEvents: [],
      loadAllAnalysesFromSupabase: async () => {}
    };
  }
  
  return context;
}

function convertDeepSeekToWaveAnalysis(
  deepSeekAnalysis: DeepSeekWaveAnalysis, 
  historicalData: StockHistoricalData[]
): WaveAnalysisResult {
  // Defensive check: If deepSeekAnalysis is completely missing or null
  if (!deepSeekAnalysis) {
    console.error('DeepSeek API returned null or undefined response');
    return createEmptyAnalysisResult();
  }

  try {
    // Convert completed waves to our Wave format with comprehensive error handling
    const waves: Wave[] = [];
    
    // Process completed waves with careful error handling
    if (Array.isArray(deepSeekAnalysis.completedWaves)) {
      deepSeekAnalysis.completedWaves.forEach(wave => {
        if (!wave) return; // Skip null/undefined waves
        
        try {
          // Safely handle wave number which could be undefined
          const waveNumber = wave.number !== undefined ? wave.number : '?';
          
          waves.push({
            number: typeof waveNumber === 'string' ? waveNumber : String(waveNumber),
            startTimestamp: wave.startTime ? new Date(wave.startTime).getTime() : Date.now(),
            endTimestamp: wave.endTime ? new Date(wave.endTime).getTime() : Date.now(),
            startPrice: typeof wave.startPrice === 'number' ? wave.startPrice : 0,
            endPrice: typeof wave.endPrice === 'number' ? wave.endPrice : 0,
            type: determineWaveType(waveNumber),
            isComplete: true,
            isImpulse: isImpulseWave(waveNumber)
          });
        } catch (waveError) {
          console.error('Error processing completed wave:', waveError);
          // Continue with next wave instead of failing entire analysis
        }
      });
    }
    
    // Add current wave with comprehensive error handling
    if (deepSeekAnalysis.currentWave) {
      try {
        const currentWaveNumber = deepSeekAnalysis.currentWave.number !== undefined 
          ? deepSeekAnalysis.currentWave.number 
          : '?';
          
        waves.push({
          number: typeof currentWaveNumber === 'string' 
            ? currentWaveNumber 
            : String(currentWaveNumber),
          startTimestamp: deepSeekAnalysis.currentWave.startTime 
            ? new Date(deepSeekAnalysis.currentWave.startTime).getTime() 
            : Date.now(),
          startPrice: typeof deepSeekAnalysis.currentWave.startPrice === 'number' 
            ? deepSeekAnalysis.currentWave.startPrice 
            : 0,
          // No end properties for current wave as it's ongoing
          type: determineWaveType(currentWaveNumber),
          isComplete: false,
          isImpulse: isImpulseWave(currentWaveNumber)
        });
      } catch (currentWaveError) {
        console.error('Error processing current wave:', currentWaveError);
        // Continue execution instead of failing entire analysis
      }
    }
    
    // Convert Fibonacci targets with comprehensive error handling
    const fibTargets: FibTarget[] = [];
    if (Array.isArray(deepSeekAnalysis.fibTargets)) {
      deepSeekAnalysis.fibTargets.forEach(target => {
        if (!target) return; // Skip null/undefined targets
        
        try {
          fibTargets.push({
            level: target.level ? parseFloat(target.level) : 0,
            price: typeof target.price === 'number' ? target.price : 0,
            label: target.label || '',
            isExtension: target.level ? parseFloat(target.level) > 1.0 : false,
            isCritical: target.level === '0.618' || target.level === '1.0'
          });
        } catch (targetError) {
          console.error('Error processing fib target:', targetError);
          // Continue with next target instead of failing
        }
      });
    }
    
    return {
      waves,
      invalidWaves: [], // DeepSeek doesn't provide invalidated waves
      currentWave: waves.length > 0 ? waves[waves.length - 1] : null,
      fibTargets,
      trend: (deepSeekAnalysis.trend as 'bullish' | 'bearish' | 'neutral') || 'neutral',
      impulsePattern: waves.some(w => typeof w.number === 'string' && w.number === '5'),
      correctivePattern: waves.some(w => typeof w.number === 'string' && w.number === 'C')
    };
  } catch (error) {
    console.error('Error converting DeepSeek analysis to WaveAnalysisResult:', error);
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