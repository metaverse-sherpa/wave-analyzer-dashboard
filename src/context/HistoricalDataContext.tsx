import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { fetchHistoricalData } from '@/services/yahooFinanceService';
import type { StockHistoricalData } from '@/types/shared';

// 1. Define a clear interface for the context value
interface HistoricalDataContextValue {
  historicalData: Record<string, StockHistoricalData[]>;
  getHistoricalData: (symbol: string, timeframe?: string, forceRefresh?: boolean) => Promise<StockHistoricalData[]>;
  preloadHistoricalData: (symbols: string[]) => Promise<void>;
  clearHistoricalData: (symbol?: string) => void;
}

// 2. Create the context with a proper default value
const HistoricalDataContext = createContext<HistoricalDataContextValue>({
  historicalData: {},
  getHistoricalData: async () => [],
  preloadHistoricalData: async () => {},
  clearHistoricalData: () => {},
});

// 3. Export the provider component separately from the hook
export const HistoricalDataProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [historicalData, setHistoricalData] = useState<Record<string, StockHistoricalData[]>>({});

  // Function to get historical data for a symbol
  const getHistoricalData = useCallback(async (
    symbol: string, 
    timeframe: string = '1d',
    forceRefresh: boolean = false
  ): Promise<StockHistoricalData[]> => {
    const cacheKey = `${symbol}_${timeframe}`;
    
    // If we already have this data and not forcing refresh, return it
    if (!forceRefresh && historicalData[cacheKey]) {
      return historicalData[cacheKey];
    }
    
    try {
      // Fetch new data
      const data = await fetchHistoricalData(symbol, timeframe, forceRefresh);
      
      // Update state with new data
      setHistoricalData(prev => ({
        ...prev,
        [cacheKey]: data
      }));
      
      return data;
    } catch (error) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error);
      
      // Return empty array instead of throwing
      return [];
    }
  }, [historicalData]);

  // Function to preload data for multiple symbols
  const preloadHistoricalData = useCallback(async (symbols: string[]): Promise<void> => {
    await Promise.all(symbols.map(symbol => getHistoricalData(symbol)));
  }, [getHistoricalData]);

  // Function to clear historical data
  const clearHistoricalData = useCallback((symbol?: string) => {
    if (symbol) {
      setHistoricalData(prev => {
        const newData = {...prev};
        // Remove all entries for this symbol (different timeframes)
        Object.keys(newData).forEach(key => {
          if (key.startsWith(symbol)) {
            delete newData[key];
          }
        });
        return newData;
      });
    } else {
      // Clear all data
      setHistoricalData({});
    }
  }, []);

  // Create context value object with memoization
  const contextValue = useMemo(() => ({
    historicalData,
    getHistoricalData,
    preloadHistoricalData,
    clearHistoricalData
  }), [historicalData, getHistoricalData, preloadHistoricalData, clearHistoricalData]);

  return (
    <HistoricalDataContext.Provider value={contextValue}>
      {children}
    </HistoricalDataContext.Provider>
  );
};

// 4. Define the hook separately and export it consistently
export const useHistoricalData = (): HistoricalDataContextValue => {
  const context = useContext(HistoricalDataContext);
  
  if (context === undefined) {
    throw new Error('useHistoricalData must be used within a HistoricalDataProvider');
  }
  
  return context;
};