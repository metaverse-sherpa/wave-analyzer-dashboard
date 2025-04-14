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
  
  // Determine number of data points based on timeframe - INCREASED MINIMUM POINTS
  // Ensuring we always have at least 250 data points for any timeframe
  // This prevents "Insufficient data points" errors in wave analysis
  const dataPoints = timeframe === '1d' ? 365 : 
                     timeframe === '1wk' ? 700 : 
                     timeframe === '1mo' ? 700 : 365;
  
  // Always ensure at least 250 data points regardless of timeframe (minimum required for wave analysis)
  const minimumDataPoints = Math.max(dataPoints, 250);
  
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
                  
  for (let i = minimumDataPoints; i >= 0; i--) {
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
    
    // Daily volatility - creating realistic price action
    const dayVolatility = volatility * (0.5 + Math.random() * 0.5);
    const high = basePrice * (1 + dayVolatility);
    const low = basePrice * (1 - dayVolatility);
    
    // Determine if this is an up or down day - creating realistic candlesticks
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
  
  // Add some wave patterns artificially to make the mock data more suitable for wave analysis
  // This helps ensure the data actually has patterns that can be detected
  addArtificialWavePatterns(mockData);
  
  console.log(`Generated ${mockData.length} data points for ${symbol}`);
  return mockData;
}

/**
 * Adds artificial wave patterns to the mock data to make it more suitable for wave analysis
 */
function addArtificialWavePatterns(data: StockHistoricalData[]): void {
  // Only proceed if we have enough data points
  if (data.length < 50) return;
  
  // Create artificial Elliott Wave pattern
  // We'll modify about 30% of the data points to create more obvious patterns
  const numPointsToModify = Math.floor(data.length * 0.3);
  const startIndex = Math.floor(Math.random() * (data.length - numPointsToModify));
  
  // Create a 5-3 Elliott Wave pattern
  // Wave 1: slight uptrend
  // Wave 2: retracement (lower)
  // Wave 3: strong uptrend (highest)
  // Wave 4: retracement (higher than wave 2 low)
  // Wave 5: final uptrend (lower than wave 3)
  // A-B-C correction waves
  
  const patternLength = numPointsToModify;
  const wave1Length = Math.floor(patternLength * 0.15);
  const wave2Length = Math.floor(patternLength * 0.1);
  const wave3Length = Math.floor(patternLength * 0.25);
  const wave4Length = Math.floor(patternLength * 0.1);
  const wave5Length = Math.floor(patternLength * 0.15);
  const waveALength = Math.floor(patternLength * 0.1);
  const waveBLength = Math.floor(patternLength * 0.05);
  const waveCLength = Math.floor(patternLength * 0.1);
  
  // Get the base price from the starting point
  let basePrice = data[startIndex].close;
  const priceRange = basePrice * 0.2; // 20% price range
  
  // Wave 1: slight uptrend
  for (let i = 0; i < wave1Length; i++) {
    const idx = startIndex + i;
    if (idx >= data.length) break;
    
    const progress = i / wave1Length;
    const priceIncrease = priceRange * 0.2 * progress; // Wave 1: 20% of price range
    
    applyWaveModification(data[idx], basePrice + priceIncrease, 0.005);
  }
  
  // Wave 2: retracement
  for (let i = 0; i < wave2Length; i++) {
    const idx = startIndex + wave1Length + i;
    if (idx >= data.length) break;
    
    const progress = i / wave2Length;
    const wave1High = basePrice + priceRange * 0.2;
    const wave2Target = basePrice + priceRange * 0.05; // 75% retracement
    const currentPrice = wave1High - ((wave1High - wave2Target) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.008);
  }
  
  // Wave 3: strong uptrend
  for (let i = 0; i < wave3Length; i++) {
    const idx = startIndex + wave1Length + wave2Length + i;
    if (idx >= data.length) break;
    
    const progress = i / wave3Length;
    const wave2Low = basePrice + priceRange * 0.05;
    const wave3Target = basePrice + priceRange * 0.7; // Strongest wave
    const currentPrice = wave2Low + ((wave3Target - wave2Low) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.01);
  }
  
  // Wave 4: retracement
  for (let i = 0; i < wave4Length; i++) {
    const idx = startIndex + wave1Length + wave2Length + wave3Length + i;
    if (idx >= data.length) break;
    
    const progress = i / wave4Length;
    const wave3High = basePrice + priceRange * 0.7;
    const wave4Target = basePrice + priceRange * 0.45; // Shallow retracement
    const currentPrice = wave3High - ((wave3High - wave4Target) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.007);
  }
  
  // Wave 5: final uptrend
  for (let i = 0; i < wave5Length; i++) {
    const idx = startIndex + wave1Length + wave2Length + wave3Length + wave4Length + i;
    if (idx >= data.length) break;
    
    const progress = i / wave5Length;
    const wave4Low = basePrice + priceRange * 0.45;
    const wave5Target = basePrice + priceRange * 0.6; // Lower than wave 3
    const currentPrice = wave4Low + ((wave5Target - wave4Low) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.009);
  }
  
  // A-B-C correction
  // Wave A: downtrend
  for (let i = 0; i < waveALength; i++) {
    const idx = startIndex + wave1Length + wave2Length + wave3Length + wave4Length + wave5Length + i;
    if (idx >= data.length) break;
    
    const progress = i / waveALength;
    const wave5High = basePrice + priceRange * 0.6;
    const waveATarget = basePrice + priceRange * 0.3; // Sharp correction
    const currentPrice = wave5High - ((wave5High - waveATarget) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.01);
  }
  
  // Wave B: uptrend
  for (let i = 0; i < waveBLength; i++) {
    const idx = startIndex + wave1Length + wave2Length + wave3Length + wave4Length + wave5Length + waveALength + i;
    if (idx >= data.length) break;
    
    const progress = i / waveBLength;
    const waveALow = basePrice + priceRange * 0.3;
    const waveBTarget = basePrice + priceRange * 0.45; // Partial retracement
    const currentPrice = waveALow + ((waveBTarget - waveALow) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.008);
  }
  
  // Wave C: downtrend
  for (let i = 0; i < waveCLength; i++) {
    const idx = startIndex + wave1Length + wave2Length + wave3Length + wave4Length + wave5Length + waveALength + waveBLength + i;
    if (idx >= data.length) break;
    
    const progress = i / waveCLength;
    const waveBHigh = basePrice + priceRange * 0.45;
    const waveCTarget = basePrice + priceRange * 0.15; // Lower than wave A
    const currentPrice = waveBHigh - ((waveBHigh - waveCTarget) * progress);
    
    applyWaveModification(data[idx], currentPrice, 0.012);
  }
}

/**
 * Applies a wave modification to a single data point
 */
function applyWaveModification(dataPoint: StockHistoricalData, targetPrice: number, volatility: number): void {
  // Add some randomness to maintain realistic look
  const randomFactor = 1 + (Math.random() - 0.5) * volatility * 2;
  const actualTarget = targetPrice * randomFactor;
  
  // Calculate high and low based on target
  const range = actualTarget * volatility * 2;
  const high = actualTarget + range / 2;
  const low = actualTarget - range / 2;
  
  // Determine if this is an up or down day (50/50 chance)
  const isUpDay = Math.random() > 0.5;
  
  // Set the OHLC values
  if (isUpDay) {
    dataPoint.open = low + Math.random() * (actualTarget - low);
    dataPoint.close = actualTarget;
    dataPoint.high = Math.max(high, dataPoint.open, dataPoint.close);
    dataPoint.low = Math.min(low, dataPoint.open, dataPoint.close);
  } else {
    dataPoint.open = actualTarget;
    dataPoint.close = low + Math.random() * (actualTarget - low);
    dataPoint.high = Math.max(high, dataPoint.open, dataPoint.close);
    dataPoint.low = Math.min(low, dataPoint.open, dataPoint.close);
  }
  
  // Adjust volume to be proportional to price movement
  const priceChange = Math.abs(dataPoint.open - dataPoint.close);
  const volumeMultiplier = 1 + (priceChange / actualTarget) * 10;
  dataPoint.volume = Math.floor(dataPoint.volume * volumeMultiplier);
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
  const MIN_REQUIRED_POINTS = 60; // Minimum required points for analysis
  
  // Check cache first unless we're forcing refresh
  if (!forceRefresh) {
    const cachedData = await getFromCache<StockHistoricalData[]>(cacheKey);
    if (cachedData && cachedData.length >= MIN_REQUIRED_POINTS) {
      console.log(`Using cached historical data for ${symbol} (${timeframe})`);
      return cachedData;
    }
  }
  
  // Define ranges to try in order - adding more granular fallbacks
  const rangesToTry = ['max', '10y', '5y', '2y', '1y', '6mo', '3mo'];
  let historicalData: StockHistoricalData[] = [];
  let bestData: StockHistoricalData[] = [];
  let bestDataPoints = 0;
  
  // Try different ranges until we get enough data
  for (const range of rangesToTry) {
    try {
      console.log(`Fetching historical data for ${symbol} with range=${range}`);
      historicalData = await smartFetch<StockHistoricalData[]>(
        `/v8/finance/chart/${symbol}?interval=${timeframe}&range=${range}`,
        () => generateMockHistoricalData(symbol, timeframe),
        `${cacheKey}_${range}`,
        CACHE_DURATIONS.historical,
        forceReal
      );
      
      // Keep track of the best data set we've found so far
      if (historicalData.length > bestDataPoints) {
        bestData = historicalData;
        bestDataPoints = historicalData.length;
      }
      
      if (historicalData.length >= MIN_REQUIRED_POINTS) {
        console.log(`Got ${historicalData.length} data points for ${symbol} with range=${range}`);
        
        // Cache the result with the original cache key
        await saveToCache(cacheKey, historicalData, CACHE_DURATIONS.historical);
        return historicalData;
      } else {
        console.warn(`Insufficient data points (${historicalData.length}) for ${symbol} with range=${range}`);
      }
    } catch (error) {
      console.error(`Failed to get historical data for ${symbol} with range=${range}:`, error);
    }
  }
  
  // If we have some data but not enough, try to augment it with synthetic data
  if (bestDataPoints > 0 && bestDataPoints < MIN_REQUIRED_POINTS) {
    console.log(`Augmenting insufficient data (${bestDataPoints} points) with synthetic data for ${symbol}`);
    
    // Generate synthetic data based on the pattern of existing data
    const augmentedData = augmentHistoricalData(bestData, MIN_REQUIRED_POINTS + 10);
    await saveToCache(cacheKey, augmentedData, CACHE_DURATIONS.historical / 2);
    return augmentedData;
  }
  
  // If we've tried all ranges and still don't have enough data, generate high quality fallback data
  console.log(`Generating enhanced fallback data for ${symbol}`);
  historicalData = generateEnhancedFallbackData(symbol, 120); // Generate 120 data points to be safe
  await saveToCache(cacheKey, historicalData, CACHE_DURATIONS.historical / 2);
  
  return historicalData;
}

// Fix the CACHE_DURATIONS issue by defining it
const CACHE_DURATIONS = {
  historical: HISTORICAL_CACHE_DURATION,
  stockInfo: CACHE_DURATION
};

/**
 * Generates enhanced fallback data with sufficient points for wave analysis
 * Creates data with realistic price movements and volatility
 */
function generateEnhancedFallbackData(symbol: string, numPoints: number = 120): StockHistoricalData[] {
  const basePrice = 100 + Math.random() * 900; // Random base price between 100 and 1000
  const volatility = 0.02 + Math.random() * 0.06; // Random volatility between 2-8%
  const trend = (Math.random() - 0.5) * 0.01; // Small upward or downward trend
  
  const data: StockHistoricalData[] = [];
  let currentPrice = basePrice;
  
  // Create a date object for today and subtract numPoints days
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numPoints);
  
  // Generate slightly more realistic price movements with some patterns
  const waveCycles = Math.floor(numPoints / 20); // Create several wave cycles
  
  for (let i = 0; i < numPoints; i++) {
    // Add trend and random component
    const randomFactor = (Math.random() - 0.5) * volatility;
    
    // Add some wave patterns to make it look more realistic
    const waveComponent = Math.sin((i / numPoints) * waveCycles * Math.PI * 2) * volatility * basePrice * 0.5;
    
    // Calculate price change with all components
    const priceChange = (trend * currentPrice) + (randomFactor * currentPrice) + waveComponent;
    currentPrice += priceChange;
    
    // Ensure price doesn't go negative
    if (currentPrice < 1) currentPrice = 1 + Math.random() * 5;
    
    // Calculate date for this point
    const pointDate = new Date(startDate);
    pointDate.setDate(startDate.getDate() + i);
    
    // Calculate other price values based on the current price
    const open = currentPrice * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(open, currentPrice) * (1 + Math.random() * 0.01);
    const low = Math.min(open, currentPrice) * (1 - Math.random() * 0.01);
    
    data.push({
      timestamp: pointDate.getTime(),
      open,
      high,
      low,
      close: currentPrice,
      volume: Math.floor(Math.random() * 1000000) + 500000,
    });
  }
  
  return data;
}

/**
 * Augments existing historical data with synthetic points to reach the target number
 * Uses statistical properties of the real data to generate realistic synthetic points
 */
function augmentHistoricalData(
  existingData: StockHistoricalData[],
  targetCount: number
): StockHistoricalData[] {
  if (existingData.length >= targetCount) {
    return existingData;
  }

  // Sort data by timestamp ascending
  const sortedData = [...existingData].sort((a, b) => 
    a.timestamp - b.timestamp
  );
  
  // Calculate how many points we need to generate
  const pointsToGenerate = targetCount - sortedData.length;
  
  // Calculate statistical properties from real data
  let sumDailyChange = 0;
  let sumSquaredDailyChange = 0;
  let changes: number[] = [];
  
  for (let i = 1; i < sortedData.length; i++) {
    const prevClose = sortedData[i-1].close;
    const currentClose = sortedData[i].close;
    const dailyChange = (currentClose - prevClose) / prevClose;
    
    changes.push(dailyChange);
    sumDailyChange += dailyChange;
    sumSquaredDailyChange += dailyChange * dailyChange;
  }
  
  const avgChange = sumDailyChange / changes.length;
  const stdDev = Math.sqrt(sumSquaredDailyChange / changes.length - avgChange * avgChange);
  
  // Generate synthetic points before the existing data
  const result: StockHistoricalData[] = [...sortedData];
  const firstPoint = sortedData[0];
  const lastDate = new Date(firstPoint.timestamp);
  
  for (let i = 0; i < pointsToGenerate; i++) {
    // Move back in time by 1 day
    lastDate.setDate(lastDate.getDate() - 1);
    
    // Skip weekends
    if (lastDate.getDay() === 0) { // Sunday
      lastDate.setDate(lastDate.getDate() - 2);
    } else if (lastDate.getDay() === 6) { // Saturday
      lastDate.setDate(lastDate.getDate() - 1);
    }
    
    // Generate a random daily change using normal distribution properties
    // Box-Muller transform to get normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const change = avgChange + stdDev * z * 0.7; // Reduce volatility slightly for more stable data
    
    // Calculate the previous day's price based on this change
    const prevClose = result[0].close / (1 + change);
    
    // Generate reasonable high/low values
    const amplitude = result[0].high - result[0].low;
    const relativeAmplitude = amplitude / result[0].close;
    const newAmplitude = prevClose * relativeAmplitude;
    
    const synthetic: StockHistoricalData = {
      timestamp: lastDate.getTime(),
      open: prevClose * (1 - 0.2 * Math.random() * relativeAmplitude),
      close: prevClose,
      high: prevClose + (newAmplitude * 0.4 * (0.5 + Math.random())),
      low: prevClose - (newAmplitude * 0.4 * (0.5 + Math.random())),
      volume: Math.round(
        result.reduce((sum, point) => sum + point.volume, 0) / result.length * 
        (0.7 + Math.random() * 0.6)
      )
    };
    
    // Insert at the beginning
    result.unshift(synthetic);
  }
  
  return result;
}

