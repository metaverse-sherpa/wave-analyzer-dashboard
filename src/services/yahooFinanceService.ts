
import { toast } from "@/lib/toast";

// Types for our Yahoo Finance API
export interface StockData {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageVolume: number;
  marketCap: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
}

export interface StockHistoricalData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Cache for API responses
const apiCache: Record<string, { data: any; timestamp: number }> = {};

// Cache duration in milliseconds (15 minutes)
const CACHE_DURATION = 15 * 60 * 1000;

// Clear all cached data
export const invalidateCache = (): void => {
  Object.keys(apiCache).forEach(key => {
    delete apiCache[key];
  });
};

// Mock data for top stocks
const topStockSymbols = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'LLY', 
  'JPM', 'V', 'AVGO', 'XOM', 'PG', 'MA', 'COST', 'HD', 'CVX', 'MRK', 
  'ABBV', 'KO', 'PEP', 'ADBE', 'WMT', 'BAC', 'CRM', 'TMO', 'CSCO', 'ACN', 
  'MCD', 'ABT', 'NFLX', 'LIN', 'DHR', 'AMD', 'CMCSA', 'VZ', 'INTC', 'DIS', 
  'PM', 'TXN', 'WFC', 'BMY', 'UPS', 'COP', 'NEE', 'RTX', 'ORCL', 'HON',
  'QCOM', 'LOW', 'UNP', 'IBM', 'GE', 'CAT', 'BA', 'SBUX', 'PFE', 'INTU',
  'DE', 'SPGI', 'AXP', 'AMAT', 'GS', 'MS', 'BLK', 'JNJ', 'GILD', 'C',
  'CVS', 'AMT', 'TJX', 'SYK', 'MDT', 'ADP', 'MDLZ', 'ISRG', 'ADI', 'CI',
  'BKNG', 'VRTX', 'MMC', 'PYPL', 'SLB', 'EOG', 'PLD', 'T', 'ETN', 'AMGN',
  'ZTS', 'SCHW', 'CB', 'PGR', 'SO', 'MO', 'REGN', 'DUK', 'BDX', 'CME'
];

// Function to fetch top stocks
export const fetchTopStocks = async (limit: number = 50): Promise<StockData[]> => {
  const cacheKey = `topStocks_${limit}`;
  
  // Check if we have cached data
  if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
    return apiCache[cacheKey].data;
  }
  
  try {
    // In a real implementation, this would call the Yahoo Finance API
    // For this demo, we'll return mock data
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const stocks: StockData[] = topStockSymbols.slice(0, limit).map((symbol, index) => {
      // Create semi-random data based on the symbol
      const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const priceBase = 50 + (seed % 450);
      const price = priceBase + Math.sin(Date.now() / 1000000 + index) * 50;
      const change = (Math.sin(Date.now() / 1000000 + index + 1) * 10);
      
      return {
        symbol,
        shortName: `${symbol} Inc.`,
        regularMarketPrice: price,
        regularMarketChange: change,
        regularMarketChangePercent: (change / price) * 100,
        regularMarketVolume: 1000000 + (seed % 10000000),
        averageVolume: 1200000 + (seed % 15000000),
        marketCap: price * (10000000 + (seed % 1000000000)),
        fiftyTwoWeekLow: price * 0.7,
        fiftyTwoWeekHigh: price * 1.3,
        trailingPE: (10 + (seed % 40)),
        forwardPE: (8 + (seed % 30)),
        dividendYield: (seed % 10) > 7 ? (0.5 + (seed % 35) / 100) : undefined,
      };
    });
    
    // Cache the response
    apiCache[cacheKey] = {
      data: stocks,
      timestamp: Date.now()
    };
    
    return stocks;
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    toast.error('Failed to fetch stock data');
    return [];
  }
};

// Function to fetch historical data
export const fetchHistoricalData = async (
  symbol: string,
  range: string = '1y',
  interval: string = '1d'
): Promise<{ symbol: string; historicalData: StockHistoricalData[] }> => {
  const cacheKey = `historical_${symbol}_${range}_${interval}`;
  
  // Check if we have cached data
  if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
    return apiCache[cacheKey].data;
  }
  
  try {
    // In a real implementation, this would call the Yahoo Finance API
    // For this demo, we'll return mock data
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Create semi-random data based on the symbol
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let priceBase = 50 + (seed % 450);
    const volatility = 0.02 + (seed % 10) / 100;
    
    // Determine data points based on range
    let days = 0;
    switch (range) {
      case '1m': days = 30; break;
      case '3m': days = 90; break;
      case '6m': days = 180; break;
      case '1y': days = 365; break;
      case '2y': days = 730; break;
      case '5y': days = 1825; break;
      default: days = 365;
    }
    
    // Generate data points
    const historicalData: StockHistoricalData[] = [];
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // Generate a trend bias for this stock
    const trendBias = seed % 3 - 1; // -1 (downtrend), 0 (sideways), 1 (uptrend)
    
    // Move back to start date
    currentDate.setDate(currentDate.getDate() - days);
    
    // Create wave patterns
    const waves = [
      { length: Math.floor(days * 0.15), bias: 0.8 },   // Wave 1 - Up
      { length: Math.floor(days * 0.08), bias: -0.5 },  // Wave 2 - Down
      { length: Math.floor(days * 0.25), bias: 1.5 },   // Wave 3 - Strong up
      { length: Math.floor(days * 0.12), bias: -0.4 },  // Wave 4 - Down
      { length: Math.floor(days * 0.20), bias: 0.7 },   // Wave 5 - Up
      { length: Math.floor(days * 0.10), bias: -0.9 },  // Wave A - Down
      { length: Math.floor(days * 0.06), bias: 0.6 },   // Wave B - Up
      { length: Math.floor(days * 0.14), bias: -1.1 },  // Wave C - Down
    ];
    
    let waveIndex = 0;
    let waveDay = 0;
    
    for (let i = 0; i < days; i++) {
      // Check if we need to move to next wave
      if (waveDay >= waves[waveIndex].length) {
        waveIndex = (waveIndex + 1) % waves.length;
        waveDay = 0;
      }
      
      const waveBias = waves[waveIndex].bias;
      
      // Create daily price action with random noise + trend + wave
      const dayVolatility = volatility * (0.5 + Math.random());
      const trendEffect = (trendBias * 0.001) * i;
      const waveEffect = waveBias * 0.002;
      
      const dailyChange = priceBase * (
        (Math.random() * 2 - 1) * dayVolatility + // Random noise
        trendEffect + // Long term trend
        waveEffect // Wave pattern
      );
      
      const open = priceBase;
      const close = priceBase + dailyChange;
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = Math.floor(500000 + Math.random() * 5000000);
      
      // Skip weekends (simple approach)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        historicalData.push({
          timestamp: Math.floor(currentDate.getTime() / 1000),
          open,
          high,
          low,
          close,
          volume
        });
        
        // Update price base for next day
        priceBase = close;
        waveDay++;
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const result = {
      symbol,
      historicalData
    };
    
    // Cache the response
    apiCache[cacheKey] = {
      data: result,
      timestamp: Date.now()
    };
    
    return result;
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    toast.error(`Failed to fetch historical data for ${symbol}`);
    return { symbol, historicalData: [] };
  }
};
