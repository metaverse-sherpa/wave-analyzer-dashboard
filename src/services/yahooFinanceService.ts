import { toast } from "@/lib/toast";

// Types for our Yahoo Finance API
export interface StockData {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  averageVolume: number;
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
  adjustedClose: number;
}

export interface StockHistoricalResponse {
  symbol: string;
  historicalData: StockHistoricalData[];
}

// Cache management
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const stockDataCache: { [key: string]: { data: any; timestamp: number } } = {};

const isDataCached = (cacheKey: string): boolean => {
  const cachedItem = stockDataCache[cacheKey];
  if (!cachedItem) return false;
  
  const now = Date.now();
  return now - cachedItem.timestamp < CACHE_DURATION;
};

const getCachedData = (cacheKey: string): any => {
  return stockDataCache[cacheKey]?.data;
};

const setCachedData = (cacheKey: string, data: any): void => {
  stockDataCache[cacheKey] = {
    data,
    timestamp: Date.now(),
  };
};

// Base Yahoo Finance API URL
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com';

// Helper for error handling
const handleApiError = (error: any, customMessage: string): never => {
  console.error(customMessage, error);
  toast.error(customMessage);
  throw new Error(customMessage);
};

// Fetch the top stocks by marketcap
export const fetchTopStocks = async (limit: number = 100): Promise<StockData[]> => {
  const cacheKey = `topStocks-${limit}`;
  
  if (isDataCached(cacheKey)) {
    return getCachedData(cacheKey);
  }
  
  try {
    // In a real implementation, you'd fetch from Yahoo Finance API
    // For now, we'll use a mock approach with common stocks
    const popularTickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'NFLX',
      'DIS', 'PYPL', 'ADBE', 'CRM', 'INTC', 'AMD', 'CSCO', 'PEP', 'KO', 'WMT',
      'PG', 'JNJ', 'UNH', 'BAC', 'HD', 'MA', 'XOM', 'CVX', 'PFE', 'MRK',
      'VZ', 'T', 'CMCSA', 'ORCL', 'IBM', 'QCOM', 'TXN', 'UBER', 'ZM', 'SHOP',
      'SQ', 'SPOT', 'TWLO', 'BABA', 'TSM', 'ASML', 'NKE', 'MCD', 'SBUX', 'LMT',
      'BA', 'CAT', 'MMM', 'GE', 'HON', 'RTX', 'GS', 'MS', 'C', 'WFC',
      'AXP', 'BLK', 'SCHW', 'CME', 'ICE', 'CB', 'MET', 'PRU', 'TRV', 'ALL',
      'PNC', 'USB', 'TFC', 'SPGI', 'MCO', 'MSCI', 'TROW', 'BX', 'KKR', 'APO',
      'BRK-B', 'BRK-A', 'COST', 'TGT', 'LOW', 'CVS', 'WBA', 'AMGN', 'GILD', 'REGN',
      'BIIB', 'LLY', 'TMO', 'DHR', 'ABT', 'MDT', 'ISRG', 'BMY', 'SYK', 'ZTS'
    ];
    
    const tickersQuery = popularTickers.slice(0, limit).join(',');
    const url = `${YAHOO_FINANCE_API}/v7/finance/quote?symbols=${tickersQuery}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch stock data: ${response.status}`);
    }
    
    const data = await response.json();
    const results = data.quoteResponse.result;
    
    const stocks: StockData[] = results.map((stock: any) => ({
      symbol: stock.symbol,
      shortName: stock.shortName || stock.symbol,
      longName: stock.longName || stock.shortName || stock.symbol,
      regularMarketPrice: stock.regularMarketPrice || 0,
      regularMarketChange: stock.regularMarketChange || 0,
      regularMarketChangePercent: stock.regularMarketChangePercent || 0,
      regularMarketVolume: stock.regularMarketVolume || 0,
      marketCap: stock.marketCap || 0,
      fiftyTwoWeekHigh: stock.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: stock.fiftyTwoWeekLow || 0,
      averageVolume: stock.averageDailyVolume10Day || 0,
      trailingPE: stock.trailingPE,
      forwardPE: stock.forwardPE,
      dividendYield: stock.dividendYield,
    }));
    
    // Sort by market cap
    stocks.sort((a, b) => b.marketCap - a.marketCap);
    
    setCachedData(cacheKey, stocks);
    return stocks;
  } catch (error) {
    return handleApiError(error, 'Failed to fetch top stocks');
  }
};

// Fetch historical data for a stock
export const fetchHistoricalData = async (
  symbol: string,
  period: string = '2y',
  interval: string = '1d'
): Promise<StockHistoricalResponse> => {
  const cacheKey = `historicalData-${symbol}-${period}-${interval}`;
  
  if (isDataCached(cacheKey)) {
    return getCachedData(cacheKey);
  }
  
  try {
    const url = `${YAHOO_FINANCE_API}/v8/finance/chart/${symbol}?range=${period}&interval=${interval}&includePrePost=false`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch historical data: ${response.status}`);
    }
    
    const data = await response.json();
    const result = data.chart.result[0];
    
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    const adjClose = result.indicators.adjclose?.[0]?.adjclose || [];
    
    const historicalData: StockHistoricalData[] = timestamps.map((timestamp: number, index: number) => ({
      timestamp,
      open: quotes.open[index] || 0,
      high: quotes.high[index] || 0,
      low: quotes.low[index] || 0,
      close: quotes.close[index] || 0,
      volume: quotes.volume[index] || 0,
      adjustedClose: adjClose[index] || quotes.close[index] || 0,
    }));
    
    const stockHistoricalResponse: StockHistoricalResponse = {
      symbol,
      historicalData,
    };
    
    setCachedData(cacheKey, stockHistoricalResponse);
    return stockHistoricalResponse;
  } catch (error) {
    return handleApiError(error, `Failed to fetch historical data for ${symbol}`);
  }
};

// Invalidate cache for specific key or pattern
export const invalidateCache = (pattern?: RegExp): void => {
  if (pattern) {
    Object.keys(stockDataCache).forEach(key => {
      if (pattern.test(key)) {
        delete stockDataCache[key];
      }
    });
  } else {
    Object.keys(stockDataCache).forEach(key => {
      delete stockDataCache[key];
    });
  }
};
