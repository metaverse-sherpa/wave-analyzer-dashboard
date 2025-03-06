
import { WaveAnalysisResult } from "@/utils/elliottWaveAnalysis";

// In a real implementation, this would connect to a database
// For this demo, we'll use localStorage for persistence

const DB_PREFIX = 'elliott_wave_app_';

export interface StoredWaveAnalysis {
  symbol: string;
  timeframe: string;
  analysis: WaveAnalysisResult;
  timestamp: number;
}

// Store wave analysis
export const storeWaveAnalysis = (
  symbol: string,
  timeframe: string,
  analysis: WaveAnalysisResult
): void => {
  try {
    const key = `${DB_PREFIX}wave_${symbol}_${timeframe}`;
    const data: StoredWaveAnalysis = {
      symbol,
      timeframe,
      analysis,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to store wave analysis:', error);
  }
};

// Retrieve wave analysis
export const retrieveWaveAnalysis = (
  symbol: string,
  timeframe: string
): StoredWaveAnalysis | null => {
  try {
    const key = `${DB_PREFIX}wave_${symbol}_${timeframe}`;
    const data = localStorage.getItem(key);
    
    if (!data) return null;
    
    return JSON.parse(data) as StoredWaveAnalysis;
  } catch (error) {
    console.error('Failed to retrieve wave analysis:', error);
    return null;
  }
};

// Check if an analysis is expired (older than 24 hours)
export const isAnalysisExpired = (timestamp: number): boolean => {
  const now = Date.now();
  const age = now - timestamp;
  const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  
  return age > MAX_AGE;
};

// Clear all stored analyses
export const clearAllAnalyses = (): void => {
  try {
    const keys = Object.keys(localStorage);
    
    for (const key of keys) {
      if (key.startsWith(DB_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error('Failed to clear analyses:', error);
  }
};

// Get all stored analyses
export const getAllAnalyses = (): StoredWaveAnalysis[] => {
  try {
    const keys = Object.keys(localStorage);
    const analyses: StoredWaveAnalysis[] = [];
    
    for (const key of keys) {
      if (key.startsWith(`${DB_PREFIX}wave_`)) {
        const data = localStorage.getItem(key);
        if (data) {
          analyses.push(JSON.parse(data) as StoredWaveAnalysis);
        }
      }
    }
    
    return analyses;
  } catch (error) {
    console.error('Failed to get all analyses:', error);
    return [];
  }
};
