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

interface Quote {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume3Month: number;
  marketCap: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  trailingPE?: number;
  forwardPE?: number;
  trailingAnnualDividendYield?: number;
}

// Cache for API responses
const apiCache: Record<string, { data: unknown; timestamp: number }> = {};

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

// Replace yahooFinance imports with fetch calls to your backend
const API_BASE_URL = 'http://localhost:3001/api'; // Changed from 3000 to 3001

// Function to fetch top stocks
export const fetchTopStocks = async (limit: number = 50): Promise<StockData[]> => {
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

// Function to fetch historical data
export const fetchHistoricalData = async (
  symbol: string,
  range: string = '1y',
  interval: string = '1d'
): Promise<{ symbol: string; historicalData: StockHistoricalData[] }> => {
  const cacheKey = `historical_${symbol}_${range}_${interval}`;
  
  // Check if we have cached data
  if (apiCache[cacheKey] && Date.now() - apiCache[cacheKey].timestamp < CACHE_DURATION) {
    return apiCache[cacheKey].data as { symbol: string; historicalData: StockHistoricalData[] };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/historical?symbol=${symbol}&range=${range}&interval=${interval}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch historical data');
    }

    const data = await response.json();

    // Ensure data is an array
    if (!Array.isArray(data)) {
      throw new Error('Invalid historical data format');
    }

    // Transform the data
    const historicalData: StockHistoricalData[] = data.map(item => ({
      timestamp: Math.floor(new Date(item.date).getTime() / 1000),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume
    }));

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

// Helper function to get start date based on range
function getStartDate(range: string): Date {
  const now = new Date();
  switch (range) {
    case '1m': return new Date(now.setMonth(now.getMonth() - 1));
    case '3m': return new Date(now.setMonth(now.getMonth() - 3));
    case '6m': return new Date(now.setMonth(now.getMonth() - 6));
    case '1y': return new Date(now.setFullYear(now.getFullYear() - 1));
    case '2y': return new Date(now.setFullYear(now.getFullYear() - 2));
    case '5y': return new Date(now.setFullYear(now.getFullYear() - 5));
    default: return new Date(now.setFullYear(now.getFullYear() - 1));
  }
}
