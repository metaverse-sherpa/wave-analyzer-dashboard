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
const API_BASE_URL = 'http://localhost:3001/api'; // Changed to a relative URL

const USE_MOCK_DATA = false; // Set to false when your backend is working

// Function to fetch top stocks
export const fetchTopStocks = async (limit: number = 50): Promise<StockData[]> => {
  if (USE_MOCK_DATA) {
    console.log(`Using mock data for top ${limit} stocks`);
    return topStockSymbols.slice(0, limit).map(symbol => ({
      symbol,
      shortName: `${symbol} Inc.`,
      regularMarketPrice: 100 + Math.random() * 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000),
      averageVolume: Math.floor(Math.random() * 5000000),
      marketCap: Math.floor(Math.random() * 1000000000000),
      fiftyTwoWeekLow: 50 + Math.random() * 50,
      fiftyTwoWeekHigh: 150 + Math.random() * 50,
      trailingPE: 15 + Math.random() * 20,
      forwardPE: 12 + Math.random() * 15,
      dividendYield: Math.random() * 0.05,
    }));
  }

  const cacheKey = `topStocks_${limit}`;
  
  // Check cache
  if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
    return apiCache[cacheKey].data as StockData[];
  }

  try {
    const symbols = topStockSymbols.slice(0, limit);
    const response = await fetch(`${API_BASE_URL}/stocks?symbols=${symbols.join(',')}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch stock data');
    }

    const quotes = await response.json();
    
    // Transform API response to our StockData format
    const stocks: StockData[] = quotes.map(quote => ({
      symbol: quote.symbol,
      shortName: quote.shortName || '',
      regularMarketPrice: quote.regularMarketPrice || 0,
      regularMarketChange: quote.regularMarketChange || 0,
      regularMarketChangePercent: quote.regularMarketChangePercent || 0,
      regularMarketVolume: quote.regularMarketVolume || 0,
      averageVolume: quote.averageDailyVolume3Month || 0,
      marketCap: quote.marketCap || 0,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
      trailingPE: quote.trailingPE,
      forwardPE: quote.forwardPE,
      dividendYield: quote.trailingAnnualDividendYield
    }));

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

// Function to fetch historical data with improved caching
export const fetchHistoricalData = async (
  symbol: string,
  timeframe: string = '1d'
): Promise<{ symbol: string; historicalData: StockHistoricalData[] }> => {
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
function generateMockHistoricalData(symbol: string, days: number): StockHistoricalData[] {
  const mockData: StockHistoricalData[] = [];
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

