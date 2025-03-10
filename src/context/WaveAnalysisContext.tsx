import React, { createContext, useContext, useState, useEffect } from 'react';
import { WaveAnalysisResult } from '@/utils/elliottWaveAnalysis';
import { storeWaveAnalysis, retrieveWaveAnalysis, isAnalysisExpired } from '@/services/databaseService';

interface WaveAnalysisContextType {
  analyses: Record<string, WaveAnalysisResult>;
  getAnalysis: (symbol: string, timeframe: string) => Promise<WaveAnalysisResult | null>;
  isLoading: boolean;
}

const WaveAnalysisContext = createContext<WaveAnalysisContextType>({
  analyses: {},
  getAnalysis: async () => null,
  isLoading: false
});

export const useWaveAnalysis = () => useContext(WaveAnalysisContext);

export const WaveAnalysisProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [analyses, setAnalyses] = useState<Record<string, WaveAnalysisResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  const getAnalysis = async (symbol: string, timeframe: string = '1d'): Promise<WaveAnalysisResult | null> => {
    // First check if we already have it in state
    const cacheKey = `${symbol}_${timeframe}`;
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
    
    return null;
  };
  
  const value = {
    analyses,
    getAnalysis,
    isLoading
  };
  
  return (
    <WaveAnalysisContext.Provider value={value}>
      {children}
    </WaveAnalysisContext.Provider>
  );
};