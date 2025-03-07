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
  wave: number;
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
      dividendYield: quote.trailingAnnualDividendYield,
      wave: Math.floor(Math.random() * 5) + 1 // Replace with actual wave calculation
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
  timeframe: string = '1d',
  start_date?: string
): Promise<{ symbol: string; historicalData: StockHistoricalData[] }> => {
  // Validate symbol
  if (!symbol) {
    throw new Error('Symbol is required to fetch historical data');
  }

  // Calculate start_date if not provided
  if (!start_date) {
    const today = new Date();
    let daysToSubtract = 365; // Default for "1d"

    switch (timeframe) {
      case '1w':
        daysToSubtract = 365 * 2;
        break;
      case '1mo':
        daysToSubtract = 365 * 3;
        break;
      // "1d" is already the default
    }

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - daysToSubtract);
    start_date = startDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  }

  // Ensure start_date is a valid date string
  const startDateObj = new Date(start_date);
  if (isNaN(startDateObj.getTime())) {
    throw new Error(`Invalid start_date: ${start_date}`);
  }

  // Log the parameters being used
  console.log(`Fetching historical data for symbol: ${symbol}, timeframe: ${timeframe}, start_date: ${start_date}`);

  const cacheKey = `historical_${symbol}_${timeframe}_${start_date}`;

  try {
    const response = await fetch(
      `${API_BASE_URL}/historical?symbol=${symbol}&timeframe=${timeframe}&start_date=${start_date}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch historical data');
    }

    const data = await response.json();

    // Log the raw data returned from the API
    console.log(`Raw data for ${symbol}:`, data);

    // Ensure we have the required fields
    const historicalData: StockHistoricalData[] = data
      .map(item => {
        // Skip items with missing or invalid data
        if (!item || typeof item.timestamp !== 'number' || isNaN(item.timestamp)) {
          console.warn(`Invalid data for ${symbol}:`, item);
          return null;
        }
        return {
          timestamp: item.timestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume
        };
      })
      .filter(Boolean); // Filter out any null values

    // Log the transformed historical data
    console.log(`Transformed historical data for ${symbol}:`, historicalData);

    if (historicalData.length === 0) {
      console.warn(`No valid historical data found for ${symbol}`);
    }

    return {
      symbol,
      historicalData
    };
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    toast.error(`Failed to fetch historical data for ${symbol}`);
    return { symbol, historicalData: [] };
  }
};

