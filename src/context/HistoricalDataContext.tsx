import React, { createContext, useContext, useState, useEffect } from 'react';
import { StockHistoricalData, fetchHistoricalData } from '@/services/yahooFinanceService';
import { storeHistoricalData, retrieveHistoricalData, isHistoricalDataExpired, getAllHistoricalData } from '@/services/databaseService';

interface HistoricalDataContextType {
  data: Record<string, StockHistoricalData[]>;
  getHistoricalData: (symbol: string, timeframe: string) => Promise<StockHistoricalData[]>;
  isLoading: boolean;
  preloadHistoricalData: (symbols: string[]) => Promise<void>;
}

const HistoricalDataContext = createContext<HistoricalDataContextType>({
  data: {},
  getHistoricalData: async () => [],
  isLoading: false,
  preloadHistoricalData: async () => {}
});

export const useHistoricalData = () => useContext(HistoricalDataContext);

export const HistoricalDataProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [data, setData] = useState<Record<string, StockHistoricalData[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Load any cached historical data from localStorage when the app starts
  useEffect(() => {
    const loadCachedData = async () => {
      const allCachedData = getAllHistoricalData();
      const validData: Record<string, StockHistoricalData[]> = {};
      
      // Filter out expired data
      Object.entries(allCachedData).forEach(([key, cachedItem]) => {
        if (!isHistoricalDataExpired(cachedItem.timestamp)) {
          validData[key] = cachedItem.historicalData;
        }
      });
      
      setData(validData);
    };
    
    loadCachedData();
  }, []);
  
  // Function to get historical data for a single symbol
  const getHistoricalData = async (symbol: string, timeframe: string = '1d'): Promise<StockHistoricalData[]> => {
    const cacheKey = `${symbol}_${timeframe}`;
    
    // First check if we already have it in state
    if (data[cacheKey]) {
      return data[cacheKey];
    }
    
    // Next check localStorage
    const cachedData = retrieveHistoricalData(symbol, timeframe);
    if (cachedData && !isHistoricalDataExpired(cachedData.timestamp)) {
      // Store in state for future quick access
      setData(prev => ({
        ...prev,
        [cacheKey]: cachedData.historicalData
      }));
      
      return cachedData.historicalData;
    }
    
    // If not in cache or expired, fetch data
    try {
      // Fetch historical data
      const historicalResponse = await fetchHistoricalData(symbol, timeframe);
      const historicalData = historicalResponse.historicalData;
      
      // After fetching fresh data
      console.log(`Fetched historical data for ${symbol}: Length = ${historicalData.length}`);
      if (historicalData.length === 0) {
        console.error(`No historical data returned from API for ${symbol}`);
      }
      
      // Store in cache
      storeHistoricalData(symbol, timeframe, historicalData);
      
      // Update state
      setData(prev => ({
        ...prev,
        [cacheKey]: historicalData
      }));
      
      return historicalData;
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  };
  
  // Function to preload historical data for multiple symbols
  const preloadHistoricalData = async (symbols: string[]) => {
    setIsLoading(true);
    
    try {
      // Process in batches to avoid overloading the browser
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        await Promise.all(batch.map(symbol => getHistoricalData(symbol, '1d')));
      }
    } catch (error) {
      console.error('Error preloading historical data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const value = {
    data,
    getHistoricalData,
    isLoading,
    preloadHistoricalData
  };
  
  return (
    <HistoricalDataContext.Provider value={value}>
      {children}
    </HistoricalDataContext.Provider>
  );
};