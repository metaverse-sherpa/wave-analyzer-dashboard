
import { WaveAnalysisResult } from "@/utils/elliottWaveAnalysis";
import { toast } from "@/lib/toast";

// Cache duration in milliseconds (6 hours)
const CACHE_DURATION = 6 * 60 * 60 * 1000;

// Storage key prefix
const STORAGE_KEY_PREFIX = 'wave_analysis_';

// Store wave analysis in local storage
export const storeWaveAnalysis = (
  symbol: string, 
  timeframe: string, 
  analysis: WaveAnalysisResult
): void => {
  try {
    const key = `${STORAGE_KEY_PREFIX}${symbol}_${timeframe}`;
    const data = {
      analysis,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Error storing wave analysis:', error);
    toast.error('Failed to store analysis data locally');
  }
};

// Retrieve wave analysis from local storage
export const retrieveWaveAnalysis = (
  symbol: string, 
  timeframe: string
): { analysis: WaveAnalysisResult; timestamp: number } | null => {
  try {
    const key = `${STORAGE_KEY_PREFIX}${symbol}_${timeframe}`;
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

// Clear all analyses from local storage
export const clearAllAnalyses = (): void => {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing analyses:', error);
    toast.error('Failed to clear cached analyses');
  }
};

// Get all stored analyses
export const getAllAnalyses = (): { symbol: string; timeframe: string; analysis: WaveAnalysisResult; timestamp: number }[] => {
  try {
    const analyses: { symbol: string; timeframe: string; analysis: WaveAnalysisResult; timestamp: number }[] = [];
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        const [, symbolAndTimeframe] = key.split(STORAGE_KEY_PREFIX);
        const [symbol, timeframe] = symbolAndTimeframe.split('_');
        const data = localStorage.getItem(key);
        
        if (data) {
          const parsedData = JSON.parse(data);
          analyses.push({
            symbol,
            timeframe,
            analysis: parsedData.analysis,
            timestamp: parsedData.timestamp,
          });
        }
      }
    });
    
    return analyses;
  } catch (error) {
    console.error('Error getting all analyses:', error);
    toast.error('Failed to retrieve stored analyses');
    return [];
  }
};
