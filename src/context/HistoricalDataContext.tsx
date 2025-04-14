import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { fetchHistoricalData } from '@/services/yahooFinanceService';
import type { StockHistoricalData } from '@/types/shared';
import { supabase } from '@/lib/supabase';
import { saveToCache } from '@/services/cacheService';

// Helper function for timestamp normalization
function normalizeTimestamp(timestamp: number | string | undefined): number {
  try {
    if (timestamp === undefined || timestamp === null) {
      return Date.now();
    }

    if (typeof timestamp === 'string') {
      const parsed = parseInt(timestamp, 10);
      if (!isNaN(parsed)) {
        return parsed < 4000000000 ? parsed * 1000 : parsed;
      }
      const dateValue = new Date(timestamp).getTime();
      if (!isNaN(dateValue)) {
        return dateValue;
      }
      return Date.now();
    }

    if (timestamp < 4000000000) {
      timestamp *= 1000;
    }

    const date = new Date(timestamp);
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
      return timestamp;
    }

    return Date.now();
  } catch (error) {
    return Date.now();
  }
}

interface HistoricalDataContextValue {
  historicalData: Record<string, StockHistoricalData[]>;
  getHistoricalData: (symbol: string, timeframe?: string, forceRefresh?: boolean) => Promise<StockHistoricalData[]>;
  preloadHistoricalData: (symbols: string[]) => Promise<void>;
  clearHistoricalData: (symbol?: string) => void;
}

const HistoricalDataContext = createContext<HistoricalDataContextValue | null>(null);

// Define the provider component as a named function declaration
export function HistoricalDataProvider({ children }: { children: React.ReactNode }) {
  const [historicalData, setHistoricalData] = useState<Record<string, StockHistoricalData[]>>({});

  const getHistoricalData = useCallback(async (
    symbol: string, 
    timeframe: string = '1d',
    forceRefresh: boolean = false
  ): Promise<StockHistoricalData[]> => {
    const cacheKey = `${symbol}_${timeframe}`;
    
    const { data: cachedItem } = await supabase
      .from('cache')
      .select('data')
      .eq('key', `historical_data_${symbol}_${timeframe}`)
      .single();
      
    const cached = cachedItem?.data;
    if (!forceRefresh && cached) {
      return cached.map((item: StockHistoricalData) => ({
        ...item,
        timestamp: normalizeTimestamp(item.timestamp)
      }));
    }
    
    try {
      const data = await fetchHistoricalData(symbol, timeframe, forceRefresh);
      
      const normalizedData = data.map(item => ({
        ...item,
        timestamp: normalizeTimestamp(item.timestamp)
      }));
      
      setHistoricalData(prev => ({
        ...prev,
        [cacheKey]: normalizedData
      }));
      
      await saveToCache(`historical_data_${symbol}_${timeframe}`, normalizedData, 7 * 24 * 60 * 60 * 1000);
      
      return normalizedData;
    } catch (error) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error);
      return [];
    }
  }, []);

  const preloadHistoricalData = useCallback(async (symbols: string[]): Promise<void> => {
    await Promise.all(symbols.map(symbol => getHistoricalData(symbol)));
  }, [getHistoricalData]);

  const clearHistoricalData = useCallback((symbol?: string) => {
    if (symbol) {
      setHistoricalData(prev => {
        const newData = {...prev};
        Object.keys(newData).forEach(key => {
          if (key.startsWith(symbol)) {
            delete newData[key];
          }
        });
        return newData;
      });
    } else {
      setHistoricalData({});
    }
  }, []);

  const value = useMemo(() => ({
    historicalData,
    getHistoricalData,
    preloadHistoricalData,
    clearHistoricalData
  }), [historicalData, getHistoricalData, preloadHistoricalData, clearHistoricalData]);

  return (
    <HistoricalDataContext.Provider value={value}>
      {children}
    </HistoricalDataContext.Provider>
  );
}

// Define and export the hook as a named export
export function useHistoricalData(): HistoricalDataContextValue {
  const context = useContext(HistoricalDataContext);
  if (!context) {
    throw new Error('useHistoricalData must be used within a HistoricalDataProvider');
  }
  return context;
}