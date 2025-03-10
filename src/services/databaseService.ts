import { WaveAnalysisResult } from "@/utils/elliottWaveAnalysis";
import { StockHistoricalData } from "@/services/yahooFinanceService";
import { toast } from "@/lib/toast";

// Update cache duration to 24 hours (in milliseconds)
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Storage key prefixes
const WAVE_STORAGE_KEY_PREFIX = 'wave_analysis_';
const HISTORICAL_STORAGE_KEY_PREFIX = 'historical_data_';

// Wave Analysis - existing functions
export const storeWaveAnalysis = (
  symbol: string, 
  timeframe: string, 
  analysis: WaveAnalysisResult
): void => {
  try {
    localStorage.setItem(
      `${WAVE_STORAGE_KEY_PREFIX}${symbol}_${timeframe}`,
      JSON.stringify({
        analysis,
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.error('Error storing wave analysis:', error);
    toast.error('Failed to store analysis data locally');
  }
};

// Add Historical Data storage
export const storeHistoricalData = (
  symbol: string,
  timeframe: string,
  historicalData: StockHistoricalData[]
): void => {
  try {
    localStorage.setItem(
      `${HISTORICAL_STORAGE_KEY_PREFIX}${symbol}_${timeframe}`,
      JSON.stringify({
        historicalData,
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.error('Error storing historical data:', error);
  }
};

export const retrieveHistoricalData = (
  symbol: string,
  timeframe: string
): { historicalData: StockHistoricalData[]; timestamp: number } | null => {
  try {
    const data = localStorage.getItem(`${HISTORICAL_STORAGE_KEY_PREFIX}${symbol}_${timeframe}`);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.error('Error retrieving historical data:', error);
    return null;
  }
};

// Get all stored historical data
export const getAllHistoricalData = (): Record<string, { historicalData: StockHistoricalData[]; timestamp: number }> => {
  try {
    const historicalData: Record<string, { historicalData: StockHistoricalData[]; timestamp: number }> = {};
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(HISTORICAL_STORAGE_KEY_PREFIX)) {
        const data = localStorage.getItem(key);
        if (data) {
          const parsedData = JSON.parse(data);
          const symbolKey = key.replace(HISTORICAL_STORAGE_KEY_PREFIX, '');
          historicalData[symbolKey] = parsedData;
        }
      }
    });
    
    return historicalData;
  } catch (error) {
    console.error('Error retrieving all historical data:', error);
    return {};
  }
};

// Rest of existing functions
export const retrieveWaveAnalysis = (
  symbol: string, 
  timeframe: string
): { analysis: WaveAnalysisResult; timestamp: number } | null => {
  try {
    const key = `${WAVE_STORAGE_KEY_PREFIX}${symbol}_${timeframe}`;
    const data = localStorage.getItem(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving wave analysis:', error);
    toast.error('Failed to retrieve analysis data');
    return null;
  }
};

// Check if analysis is expired
export const isAnalysisExpired = (timestamp: number): boolean => {
  const now = Date.now();
  return (now - timestamp) > CACHE_DURATION;
};

// Add this function for historical data
export const isHistoricalDataExpired = (timestamp: number): boolean => {
  return Date.now() - timestamp > CACHE_DURATION;
};

// Clear all analyses from local storage
export const clearAllAnalyses = (): void => {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(WAVE_STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing analyses:', error);
    toast.error('Failed to clear cached analyses');
  }
};

// Get all stored analyses
export const getAllAnalyses = (): Record<string, { analysis: WaveAnalysisResult, timestamp: number }> => {
  try {
    const analyses: Record<string, { analysis: WaveAnalysisResult, timestamp: number }> = {};
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(WAVE_STORAGE_KEY_PREFIX)) {
        const data = localStorage.getItem(key);
        if (data) {
          const parsedData = JSON.parse(data);
          const symbolKey = key.replace(WAVE_STORAGE_KEY_PREFIX, '');
          analyses[symbolKey] = parsedData;
        }
      }
    });
    
    return analyses;
  } catch (error) {
    console.error('Error retrieving all analyses:', error);
    return {};
  }
};
