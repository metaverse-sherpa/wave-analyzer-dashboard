import React, { createContext, useContext, useState, useCallback } from 'react';
import type { StockHistoricalData } from '@/types/shared';

// Helper function for timestamp normalization
function normalizeTimestamp(timestamp: number | string | undefined): number {
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return timestamp || Date.now();
}

interface HistoricalDataContextValue {
  historicalData: Record<string, StockHistoricalData[]>;
  getHistoricalData: (symbol: string, timeframe?: string, forceRefresh?: boolean) => Promise<StockHistoricalData[]>;
  preloadHistoricalData: (symbols: string[]) => Promise<void>;
  clearHistoricalData: (symbol?: string) => void;
}

const HistoricalDataContext = createContext<HistoricalDataContextValue | null>(null);

export function HistoricalDataProvider({ children }: { children: React.ReactNode }) {
  const [historicalData, setHistoricalData] = useState<Record<string, StockHistoricalData[]>>({});

  const getHistoricalData = useCallback(async (
    symbol: string, 
    timeframe: string = '1d',
    forceRefresh: boolean = false
  ): Promise<StockHistoricalData[]> => {
    const cacheKey = `${symbol}_${timeframe}`;
    
    // Check in-memory state first if not forcing refresh
    if (!forceRefresh && historicalData[cacheKey]) {
      return historicalData[cacheKey];
    }
    
    try {
      const { fetchHistoricalData } = await import('@/services/yahooFinanceService');
      const data = await fetchHistoricalData(symbol, timeframe);
      
      // Normalize timestamps
      const normalizedData = data.map(item => ({
        ...item,
        timestamp: normalizeTimestamp(item.timestamp)
      }));
      
      // Update in-memory state
      setHistoricalData(prev => ({
        ...prev,
        [cacheKey]: normalizedData
      }));
      
      return normalizedData;
    } catch (error) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error);
      return [];
    }
  }, [historicalData]);

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

  return (
    <HistoricalDataContext.Provider value={{
      historicalData,
      getHistoricalData,
      preloadHistoricalData,
      clearHistoricalData
    }}>
      {children}
    </HistoricalDataContext.Provider>
  );
}

export function useHistoricalData(): HistoricalDataContextValue {
  const context = useContext(HistoricalDataContext);
  if (!context) {
    throw new Error('useHistoricalData must be used within a HistoricalDataProvider');
  }
  return context;
}