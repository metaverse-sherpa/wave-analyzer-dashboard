import React, { createContext, useContext, useState } from 'react';
import { WaveAnalysis, WaveAnalysisResult, Wave, DeepSeekWaveAnalysis } from '@/types/shared';
import { getDeepSeekWaveAnalysis } from '@/api/deepseekApi';
import { getCachedWaveAnalysis, convertDeepSeekToWaveAnalysis } from '@/utils/wave-analysis';

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
  loadCacheTableData: () => Promise<void>;
}

const WaveAnalysisContext = createContext<WaveAnalysisContextType | undefined>(undefined);

export const WaveAnalysisProvider = ({ children }: { children: React.ReactNode }) => {
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
    setIsDataLoaded(true);
  };

  const cancelAllAnalyses = () => {
    // Placeholder for implementation
  };

  const clearCache = () => {
    // Placeholder for implementation
  };

  const loadCacheTableData = async () => {
    // Placeholder for implementation
  };

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
      loadCacheTableData
    }}>
      {children}
    </WaveAnalysisContext.Provider>
  );
};

export const useWaveAnalysis = () => {
  const context = useContext(WaveAnalysisContext);
  if (context === undefined) {
    throw new Error('useWaveAnalysis must be used within a WaveAnalysisProvider');
  }
  return context;
};