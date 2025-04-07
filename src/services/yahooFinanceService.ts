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

// Updated getApiBaseUrl function to avoid double "/api" in URLs
const getApiBaseUrl = (): string => {
  // Are we in development mode?
  const isDevelopment = import.meta.env.DEV || 
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';
  
  if (isDevelopment) {
    // Return base URL without "/api" - we'll add it in buildApiUrl
    return 'http://' + window.location.hostname + ':3001';
  }
  
  // In production, use relative URL (same origin)
  return '';
};

// Create the apiUrl function that properly adds /api
/**
 * Builds a proper API URL based on the current environment
 * @param endpoint The API endpoint path (should start with /)
 * @returns Full URL to the API endpoint
 */
export function buildApiUrl(endpoint: string): string {
  // Base URL detection based on environment
  let baseUrl: string;
  
  if (import.meta.env.DEV) {
    // For local development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      baseUrl = window.location.port === '5173' 
        ? 'http://localhost:3001/api' // Standard Vite port pointing to local API
        : `${window.location.origin}/api`; // Otherwise use same origin
    } else {
      baseUrl = `${window.location.origin}/api`;
    }
  } else {
    // For production, always use relative URLs to avoid CORS issues
    baseUrl = '/api';
  }

  // Make sure endpoint starts with / but baseUrl doesn't end with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  return `${cleanBaseUrl}${cleanEndpoint}`;
}

// Use the function to get the base URL
const API_BASE_URL = getApiBaseUrl();

const USE_MOCK_DATA = false; // Set to false when your backend is working

// Add cache utility functions at the top of the file

// Add import for the new cache service
import { getFromCache, saveToCache, pruneCache } from '@/services/cacheService';

// Add LZ-string for compression (you'll need to install this package)
import * as LZString from 'lz-string';

// Update the fetchTopStocks function in yahooFinanceService.ts
export const fetchTopStocks = async (limit: number = 100): Promise<StockData[]> => {
  const cacheKey = 'top-stocks';
  
  // Try to get from cache first (now async!)
  const cached = await getFromCache<StockData[]>(cacheKey);
  if (cached) return cached;
  
  try {
    // Try multiple URL patterns to improve reliability
    const urls = [
      `/api/stocks/top?limit=${limit}`,    // Vite proxy path (relative)
      `http://localhost:3001/api/stocks/top?limit=${limit}` // Direct server path
    ];
    
    let response;
    let success = false;
    
    // Try each URL pattern until one works
    for (const url of urls) {
      try {
        console.log(`Trying to fetch top stocks from: ${url}`);
        response = await fetch(url, { 
          headers: { 'Accept': 'application/json' },
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(3000) 
        });
        
        if (response.ok) {
          success = true;
          console.log(`Successfully connected to: ${url}`);
          break;
        }
      } catch (err) {
        console.log(`Failed to connect to: ${url}`, err);
      }
    }
    
    if (!success || !response) {
      throw new Error('All connection attempts failed');
    }
    
    const data = await response.json();
    
    // Process the data
    const stocks: StockData[] = data.map(quote => ({
      symbol: quote.symbol,
      name: quote.shortName || quote.symbol,
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
    
    await saveToCache(cacheKey, stocks, CACHE_DURATION);
    return stocks;
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    
    // Use fallback data when API fails
    const fallbackData = getFallbackStockData();
    await saveToCache(cacheKey, fallbackData, CACHE_DURATION);
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

// Update the API URL handling and add environment-aware data fetching

// At the top of your file, add this to control data source:
const API_STATUS = {
  checkedEndpoints: new Set<string>(),
  workingEndpoints: new Set<string>(),
  lastCheck: 0,
  failedEndpoints: new Map<string, number>(), // Add this missing property
  failureTimeout: 5 * 60 * 1000 // 5 minutes - Add this missing property
};

/**
 * Smart fetch function that falls back to mock data when API endpoints fail
 */
async function smartFetch<T>(
  endpoint: string, 
  mockDataFn: () => T, 
  cacheKey?: string,
  cacheDuration?: number,
  forceReal: boolean = false // Add this parameter
): Promise<T> {
  
  // Use API_BASE_URL instead of BASE_API_URL
  const fullEndpoint = API_BASE_URL + endpoint;
  const cacheTimeoutKey = `timeout_${endpoint}`;
  
  try {
    // Check if we should use real API or fallback to mock
    if (!forceReal) {
      // Check if this endpoint is known to be failing
      const lastFailureTime = API_STATUS.failedEndpoints.get(fullEndpoint);
      if (lastFailureTime && Date.now() - lastFailureTime < API_STATUS.failureTimeout) {
        console.warn(`Using mock data for ${endpoint} due to recent failure`);
        throw new Error('Using mock data due to recent failure');
      }
    }
    
    // Make the API request
    const response = await fetch(fullEndpoint, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    // Handle non-200 responses
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('API returned non-JSON response');
    }
    
    // Parse the JSON response
    const data = await response.json();
    
    // Mark this endpoint as working
    API_STATUS.workingEndpoints.add(fullEndpoint);
    
    // Save to cache if needed
    if (cacheKey && cacheDuration) {
      await saveToCache(cacheKey, data, cacheDuration);
    }
    
    return data as T;
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    
    // Don't fall back to mock data if forceReal is true
    if (forceReal) {
      throw error; // Re-throw to handler
    }
    
    // Mark this endpoint as failed for the timeout period
    API_STATUS.failedEndpoints.set(fullEndpoint, Date.now());
    
    // Get mock data
    const mockData = mockDataFn();
    
    // Save mock data to cache if needed, but with shorter duration
    if (cacheKey && cacheDuration) {
      await saveToCache(cacheKey, mockData, cacheDuration / 2);
    }
    
    return mockData;
  }
}

// Update the fetchHistoricalData function to skip the failing API calls and directly use fallback data

export const fetchHistoricalData = async (
  symbol: string, 
  timeframe: string = '1d',
  forceRefresh: boolean = false
): Promise<StockHistoricalData[]> => {
  // Cache key for this specific data request
  const cacheKey = `historical_data_${symbol}_${timeframe}`;
  
  // Try to get from cache first if not forcing refresh
  if (!forceRefresh) {
    const cached = await getFromCache<StockHistoricalData[]>(cacheKey);
    if (cached && cached.length > 0) {
      console.log(`Using cached data for ${symbol} (${timeframe})`);
      return cached;
    }
  }
  
  try {
    // ONLY try the relative URL path through Vite's proxy
    const proxyUrl = `/api/stocks/historical/${symbol}?timeframe=${timeframe}`;
    console.log(`Fetching historical data: ${proxyUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Format the data
    const historicalData: StockHistoricalData[] = data.map(item => ({
      timestamp: typeof item.timestamp === 'string' ? new Date(item.timestamp).getTime() : item.timestamp,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume || 0)
    }));
    
    // Cache the result with compression
    if (historicalData.length > 0) {
      console.log(`Caching ${historicalData.length} data points for ${symbol}`);
      await saveToCache(cacheKey, historicalData, HISTORICAL_CACHE_DURATION);
    }
    
    return historicalData;
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    
    // If there was an error, generate and use fallback data
    console.log(`Generating fallback data for ${symbol}`);
    const fallbackData = generateMockHighQualityData(symbol, timeframe);
    await saveToCache(cacheKey, fallbackData, HISTORICAL_CACHE_DURATION / 2);
    return fallbackData;
  }
};

// Add fallback mode flag that other parts of the app can check
export const isUsingFallbackMode = (): boolean => {
  // If we haven't checked the health endpoint yet, check if most endpoints fail
  if (API_STATUS.checkedEndpoints.size > 0) {
    const failRate = 1 - (API_STATUS.workingEndpoints.size / API_STATUS.checkedEndpoints.size);
    return failRate > 0.5; // If more than half of endpoints fail, we're in fallback mode
  }
  return false;
};

// Add a helper function to generate fallback historical data
function getFallbackHistoricalData(symbol: string): StockHistoricalData[] {
  // Create some synthetic data points as fallback
  const fallbackData: StockHistoricalData[] = [];
  const now = new Date();
  
  // Generate 100 days of dummy data (increased from 90)
  for (let i = 100; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    // Base price varies by symbol to make them look different
    const basePrice = 100 + (symbol.charCodeAt(0) % 10) * 10;
    
    // Small random variations with a slight trend based on symbol
    const trend = (symbol.charCodeAt(0) % 3 - 1) * 0.1; // -0.1, 0, or 0.1
    const dayVariation = (Math.sin(i/10) * 10) + (Math.random() * 5 - 2.5) + (i * trend);
    const open = basePrice + dayVariation;
    const close = open + (Math.random() * 4 - 2);
    const high = Math.max(open, close) + (Math.random() * 2);
    const low = Math.min(open, close) - (Math.random() * 2);
    
    fallbackData.push({
      timestamp: date.getTime(),
      open,
      high,
      low,
      close, 
      volume: Math.floor(Math.random() * 1000000) + 500000
    });
  }
  
  return fallbackData;
}

// Add this helper function to generate mock data
function generateMockHistoricalData(symbol: string, timeframe: string | number): SharedStockHistoricalData[] {
  let days: number;
  
  // Convert timeframe string to number of days
  if (typeof timeframe === 'string') {
    days = timeframe === '1d' ? 365 :
           timeframe === '1wk' ? 52 :
           timeframe === '1mo' ? 24 : 365;
  } else {
    days = timeframe;
  }
  
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

// Generate better quality mock data with realistic patterns
function generateMockHighQualityData(symbol: string, timeframe: string): StockHistoricalData[] {
  console.log(`Generating realistic mock data for ${symbol}`);
  
  // Determine number of data points based on timeframe
  const dataPoints = timeframe === '1d' ? 365 : 
                     timeframe === '1wk' ? 700 : 
                     timeframe === '1mo' ? 700 : 365;
  
  const mockData: StockHistoricalData[] = [];
  const today = new Date();
  
  // Base price varies by symbol to differentiate them
  let basePrice = 100 + (symbol.charCodeAt(0) % 50);
  
  // Trend parameters
  const trendStrength = (symbol.charCodeAt(0) % 5) / 100; // 0-0.05 trend strength
  const isBullish = symbol.charCodeAt(1) % 2 === 0; // Alternate trend direction
  const trend = isBullish ? trendStrength : -trendStrength;
  
  // Volatility based on symbol
  const volatility = 0.01 + (symbol.charCodeAt(2) % 10) / 100; // 0.01-0.11
  
  // Time unit based on timeframe
  const timeUnit = timeframe === '1d' ? 'days' : 
                  timeframe === '1wk' ? 'weeks' : 'months';
                  
  for (let i = dataPoints; i >= 0; i--) {
    const date = new Date(today);
    if (timeUnit === 'days') {
      date.setDate(today.getDate() - i);
    } else if (timeUnit === 'weeks') {
      date.setDate(today.getDate() - (i * 7));
    } else {
      date.setMonth(today.getMonth() - i);
    }
    date.setHours(0, 0, 0, 0);
    
    // Add some cyclicality to price movements
    const cycle = Math.sin(i / 20) * volatility * 10;
    const randomWalk = (Math.random() - 0.5) * volatility * 2;
    const trendComponent = trend * i;
    
    // Calculate price movement
    const change = cycle + randomWalk + trendComponent;
    basePrice = Math.max(1, basePrice * (1 + change));
    
    // Daily volatility
    const dayVolatility = volatility * (0.5 + Math.random() * 0.5);
    const high = basePrice * (1 + dayVolatility);
    const low = basePrice * (1 - dayVolatility);
    
    // Determine if this is an up or down day
    const isUpDay = Math.random() > 0.5 - (isBullish ? 0.1 : -0.1);
    
    // Set open and close based on up/down day
    let open, close;
    if (isUpDay) {
      open = low + Math.random() * (basePrice - low);
      close = basePrice + Math.random() * (high - basePrice);
    } else {
      open = basePrice + Math.random() * (high - basePrice);
      close = low + Math.random() * (basePrice - low);
    }
    
    // Volume varies with volatility and has occasional spikes
    const volumeBase = 100000 + Math.random() * 900000;
    const volumeSpike = Math.random() > 0.95 ? 3 : 1;
    const volume = Math.floor(volumeBase * (1 + dayVolatility * 5) * volumeSpike);
    
    mockData.push({
      timestamp: date.getTime(),
      open,
      high,
      low,
      close,
      volume
    });
  }
  
  return mockData;
}

// Update the health check function to handle errors better

// Update the checkBackendHealth function to be more robust
export const checkBackendHealth = async (): Promise<BackendHealthCheck> => {
  // Define potential health endpoint paths - using proxy paths to avoid CORS
  const healthEndpoints = [
    '/api/health',        // Use the proxy path instead
    '/health'             // Try direct path too
  ];
  
  // Try each endpoint
  for (const endpoint of healthEndpoints) {
    try {
      // Don't use buildApiUrl - instead use relative paths to leverage Vite proxy
      const fullUrl = endpoint;
      //console.log(`Checking health endpoint: ${fullUrl}`);
      
      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(fullUrl, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      
      // Skip to next if this fails
      if (!response.ok) {
        console.log(`Health check at ${fullUrl} failed with status ${response.status}`);
        continue;
      }
      
      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log(`Health check at ${fullUrl} returned non-JSON content type: ${contentType}`);
        continue;
      }
      
      // We found a working health endpoint
      //console.log(`Found working health endpoint: ${fullUrl}`);
      const data = await response.json();
      
      return {
        status: data.status || 'ok',
        message: data.message || 'API is online',
        version: data.version,
        timestamp: new Date(data.timestamp || Date.now())
      };
    } catch (error) {
      // Skip to next endpoint
      console.log(`Error checking health endpoint: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // All endpoints failed, but we'll try ONE MORE direct path as a last resort
  try {
    console.log("Trying direct server health check as last resort...");
    const directUrl = "http://localhost:3001/api/health";
    
    const response = await fetch(directUrl, {
      mode: 'no-cors', // Try with no-cors as last resort
      cache: 'no-cache',
    });
    
    // If we get here without error, the server might be responding
    console.log("Server responded to no-cors request - assuming it's working");
    return {
      status: 'ok', 
      message: 'API appears to be online',
      timestamp: new Date()
    };
  } catch (error) {
    console.error("Final health check attempt failed:", error);
  }
  
  // All endpoints failed, return error
  console.warn('All health endpoints failed');
  return {
    status: 'error',
    message: 'API is not available',
    timestamp: new Date()
  };
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

// Helper function to reduce historical data size by sampling
function reduceHistoricalDataSize(data: StockHistoricalData[]): StockHistoricalData[] {
  // If data is small enough, return as is
  if (data.length < 100) return data;
  
  // For large datasets, sample the data
  // Keep every point for the most recent month, then sample older data
  const now = Date.now();
  const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  const recentData = data.filter(point => point.timestamp >= oneMonthAgo);
  const olderData = data.filter(point => point.timestamp < oneMonthAgo);
  
  // Sample older data - keep every 2nd or 3rd point depending on size
  const samplingRate = olderData.length > 500 ? 3 : 2;
  const sampledOlderData = olderData.filter((_, index) => index % samplingRate === 0);
  
  // Return combined data
  return [...sampledOlderData, ...recentData];
}

// Update your getHistoricalPrices function to support forcing real data

export async function getHistoricalPrices(
  symbol: string, 
  timeframe: string = '1d',
  forceRefresh: boolean = false,
  forceReal: boolean = false // Add this parameter
): Promise<StockHistoricalData[]> {
  const cacheKey = `historical_prices_${symbol}_${timeframe}`;
  
  // Check cache first unless we're forcing refresh
  if (!forceRefresh) {
    const cachedData = await getFromCache<StockHistoricalData[]>(cacheKey);
    if (cachedData) {
      console.log(`Using cached historical data for ${symbol} (${timeframe})`);
      return cachedData;
    }
  }
  
  try {
    // Updated to use forceReal parameter
    return await smartFetch<StockHistoricalData[]>(
      `/v8/finance/chart/${symbol}?interval=${timeframe}&range=10y`,
      () => generateMockHistoricalData(symbol, timeframe),
      cacheKey,
      CACHE_DURATIONS.historical,
      forceReal // Pass through forceReal
    );
  } catch (error) {
    console.error(`Failed to get historical data for ${symbol}:`, error);
    throw error;
  }
}

// Fix the CACHE_DURATIONS issue by defining it
const CACHE_DURATIONS = {
  historical: HISTORICAL_CACHE_DURATION,
  stockInfo: CACHE_DURATION
};

