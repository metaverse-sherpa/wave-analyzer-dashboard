import { toast } from "@/lib/toast";
import type { 
  StockData as SharedStockData, 
  StockHistoricalData as SharedStockHistoricalData, 
  BackendHealthCheck 
} from '@/types/shared';

// Re-export the types to maintain compatibility
export type StockData = SharedStockData;
export type StockHistoricalData = SharedStockHistoricalData;

// Cache for API responses
const apiCache: Record<string, { data: unknown; timestamp: number }> = {};

// Increase cache duration to 24 hours for price data
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes for regular stock data
const HISTORICAL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for historical data

// Clear all cached data
export const invalidateCache = (): void => {
  Object.keys(apiCache).forEach(key => {
    delete apiCache[key];
  });
};

// Export the top stocks array
export const topStockSymbols = [
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

// Replace yahooFinance imports with fetch calls to your backend
const getApiBaseUrl = (): string => {
  // For production environments, use relative URLs
  // This will automatically use the same host/port as the UI
  return '/api';
};

// Use the function to get the base URL
const API_BASE_URL = getApiBaseUrl();

const USE_MOCK_DATA = false; // Set to false when your backend is working

// Add cache utility functions at the top of the file

// Generic function to get data from cache
function getFromCache<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    const parsed = JSON.parse(item);
    
    // Check if the cache has expired
    if (parsed.timestamp && Date.now() - parsed.timestamp > parsed.duration) {
      localStorage.removeItem(key);
      return null;
    }
    
    return parsed.data as T;
  } catch (error) {
    console.error(`Error retrieving ${key} from cache:`, error);
    return null;
  }
}

// Generic function to save data to cache
function saveToCache<T>(key: string, data: T, duration: number): void {
  try {
    const item = {
      data,
      timestamp: Date.now(),
      duration
    };
    localStorage.setItem(key, JSON.stringify(item));
  } catch (error) {
    console.error(`Error saving ${key} to cache:`, error);
  }
}

// Function to fetch top stocks
export const fetchTopStocks = async (limit: number = 100): Promise<StockData[]> => {
  const cacheKey = 'top-stocks';
  
  // Try to get from cache first
  const cached = getFromCache<StockData[]>(cacheKey);
  if (cached) return cached;
  
  try {
    const response = await fetch('/api/stocks/top');
    const contentType = response.headers.get('content-type');
    
    // Check if response is JSON before parsing
    if (!contentType || !contentType.includes('application/json')) {
      // Return fallback data when API returns non-JSON
      console.warn('API returned non-JSON response, using fallback data');
      const fallbackData = getFallbackStockData();
      saveToCache(cacheKey, fallbackData, CACHE_DURATION);
      return fallbackData;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('API returned unexpected format');
    }
    
    const stocks: StockData[] = data.map(quote => ({
      symbol: quote.symbol,
      name: quote.shortName || quote.longName || quote.symbol,
      shortName: quote.shortName || quote.symbol,
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0,
      marketCap: quote.marketCap || 0,
      averageVolume: quote.averageVolume || quote.averageDailyVolume3Month || 0,
      regularMarketPrice: quote.regularMarketPrice || 0,
      regularMarketChange: quote.regularMarketChange || 0,
      regularMarketChangePercent: quote.regularMarketChangePercent || 0,
      regularMarketVolume: quote.regularMarketVolume || 0
    }));
    
    saveToCache(cacheKey, stocks, CACHE_DURATION);
    return stocks;
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    
    // Use fallback data when API fails
    const fallbackData = getFallbackStockData();
    saveToCache(cacheKey, fallbackData, CACHE_DURATION);
    return fallbackData;
  }
};

// Add helper function for fallback data
function getFallbackStockData(): StockData[] {
  // Return a small set of major stocks as fallback
  const topSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'V', 'JPM', 'WMT'];
  
  return topSymbols.map(symbol => ({
    symbol,
    name: symbol,
    shortName: symbol,
    price: 100,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: 0,
    averageVolume: 0,
    regularMarketPrice: 100,
    regularMarketChange: 0,
    regularMarketChangePercent: 0,
    regularMarketVolume: 0
  }));
}

// Function to fetch historical data with improved caching
export const fetchHistoricalData = async (
  symbol: string,
  timeframe: string = '1d'
): Promise<{ symbol: string; historicalData: SharedStockHistoricalData[] }> => {
  // If using mock data, bypass API calls entirely
  if (USE_MOCK_DATA) {
    console.log(`Using mock data for ${symbol} (${timeframe})`);
    return {
      symbol,
      historicalData: generateMockHistoricalData(symbol, 500)
    };
  }

  // Validate symbol
  if (!symbol) {
    throw new Error('Symbol is required to fetch historical data');
  }

  try {
    console.log(`Fetching historical data for ${symbol} from: ${API_BASE_URL}/historical?symbol=${symbol}&timeframe=${timeframe}`);
    
    const response = await fetch(`${API_BASE_URL}/historical?symbol=${symbol}&timeframe=${timeframe}`);
    
    // Log the response status
    console.log(`API response status for ${symbol}: ${response.status} ${response.statusText}`);
    
    // Check content type
    const contentType = response.headers.get('content-type');
    console.log(`Content-Type: ${contentType}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText} (${response.status})`);
    }
    
    // Log the first part of the response to debug
    const responseText = await response.text();
    console.log(`Response preview: ${responseText.substring(0, 100)}...`);
    
    // Try to parse the JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      throw new Error(`Invalid JSON response: ${responseText.substring(0, 50)}...`);
    }
    
    if (Array.isArray(data) && data.length > 0) {
      console.log(`Successfully parsed ${data.length} data points for ${symbol}`);
      return {
        symbol,
        historicalData: data
      };
    }
    
    // Fall back to mock data for now to get the app working
    console.log(`No data returned for ${symbol}, using mock data`);
    return {
      symbol,
      historicalData: generateMockHistoricalData(symbol, 300)
    };
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    
    // Fall back to mock data so the app can continue
    console.log(`Falling back to mock data for ${symbol}`);
    return {
      symbol,
      historicalData: generateMockHistoricalData(symbol, 300)
    };
  }
};

// Add this helper function to generate mock data
function generateMockHistoricalData(symbol: string, days: number): SharedStockHistoricalData[] {
  const mockData: SharedStockHistoricalData[] = [];
  const today = new Date();
  let price = 100 + (symbol.charCodeAt(0) % 50); // Base price on first letter of symbol
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    // Generate some random price movement with an upward trend
    const change = (Math.random() - 0.48) * 2; // Slight upward bias
    price = Math.max(10, price * (1 + change / 100));
    
    const dayVolatility = Math.random() * 0.02;
    const high = price * (1 + dayVolatility);
    const low = price * (1 - dayVolatility);
    const open = low + Math.random() * (high - low);
    
    mockData.push({
      timestamp: Math.floor(date.getTime() / 1000),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      close: Number(price.toFixed(2)),
      low: Number(low.toFixed(2)),
      volume: Math.floor(Math.random() * 10000)
    });
  }
  
  return mockData;
}

// Update the health check function to use the proper type
export const checkBackendHealth = async (): Promise<BackendHealthCheck> => {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    return {
      status: data.status,
      message: data.message,
      version: data.version,
      timestamp: new Date(data.timestamp) // Timestamp is now expected in the type
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date() // Timestamp is now expected in the type
    };
  }
};

// Fix the quotes mapping
export const getTopStocks = async (): Promise<SharedStockData[]> => {
  const response = await fetch('/api/stocks/top');
  const quotes = await response.json();
  
  const stocks: SharedStockData[] = quotes.map((quote: any) => ({
    symbol: quote.symbol,
    name: quote.shortName || quote.longName || quote.symbol,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    marketCap: quote.marketCap,
    volume: quote.regularMarketVolume
  }));
  
  return stocks;
};

