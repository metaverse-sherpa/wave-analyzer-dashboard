// worker.js
import yahooFinance from 'yahoo-finance2';

// Configure the Yahoo Finance library
yahooFinance.suppressNotices(['yahooSurvey', 'ripHistorical']);
yahooFinance.setGlobalConfig({
  validation: {
    logErrors: false,
    logWarnings: false,
    ignoreValidationErrors: true
  }
});

// Simple memory cache implementation
const CACHE = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Add CORS headers to allow requests from any domain
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours cache for preflight
    };
    
    // Handle OPTIONS requests (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Add JSON content type for all responses
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/json'
    };
    
    // Extract the proper path, stripping /api prefix if present
    const path = url.pathname.startsWith('/api') 
      ? url.pathname.substring(4)  // Remove /api prefix
      : url.pathname;

    console.log(`Request path: ${url.pathname}, normalized path: ${path}`);

    try {
      // Health check endpoint
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          message: 'API server is online',
          version: '1.0.0',
          timestamp: new Date()
        }), { headers });
      }
      
      // More specific route definitions first:
      // 1. Top stocks endpoint - MOVED UP to take precedence
      if (path === '/stocks/top' || path.startsWith('/stocks/top?')) {
        // Get limit parameter (default to 20)
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        console.log(`Fetching top ${limit} stocks`);
        
        // Try to get from cache first
        const cacheKey = `top_stocks_${limit}`;
        const cachedData = await getCachedData(cacheKey, env);
        
        if (cachedData) {
          return new Response(JSON.stringify(cachedData), { headers });
        }
        
        // Use real top stock symbols (no random generation)
        const topSymbols = [
          'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'LLY', 
          'JPM', 'V', 'AVGO', 'XOM', 'PG', 'MA', 'COST', 'HD', 'CVX', 'MRK',
          'ABBV', 'KO', 'PEP', 'ADBE', 'WMT', 'BAC', 'CRM', 'TMO', 'CSCO', 'ACN', 
          'MCD', 'ABT', 'NFLX', 'LIN', 'DHR', 'AMD', 'CMCSA', 'VZ', 'INTC', 'DIS',
          'PM', 'TXN', 'WFC', 'BMY', 'UPS', 'COP', 'NEE', 'RTX', 'ORCL', 'HON'
        ].slice(0, Math.min(limit, 50)); // Limit to 50 real companies
        
        try {
          // Fetch data for each symbol
          const stockDataPromises = topSymbols.map(symbol => yahooFinance.quote(symbol).catch(() => null));
          const rawStockData = await Promise.all(stockDataPromises);
          
          // Filter out failed requests and map to expected format
          const stocksData = rawStockData
            .filter(data => data !== null)
            .map(quoteData => ({
              symbol: quoteData.symbol,
              shortName: quoteData.shortName || quoteData.longName || quoteData.symbol,
              regularMarketPrice: quoteData.regularMarketPrice,
              regularMarketChange: quoteData.regularMarketChange,
              regularMarketChangePercent: quoteData.regularMarketChangePercent,
              regularMarketVolume: quoteData.regularMarketVolume,
              price: quoteData.regularMarketPrice,
              change: quoteData.regularMarketChange,
              changePercent: quoteData.regularMarketChangePercent,
              volume: quoteData.regularMarketVolume,
              marketCap: quoteData.marketCap,
              averageVolume: quoteData.averageDailyVolume3Month || quoteData.averageVolume
            }));
          
          // Store in cache
          await setCachedData(cacheKey, stocksData, env);
          
          return new Response(JSON.stringify(stocksData), { headers });
        } catch (error) {
          console.error(`Error fetching top stocks: ${error.message}`);
          
          // More informative error
          return new Response(JSON.stringify({
            error: 'Failed to fetch stock data',
            message: error.message,
            timestamp: new Date()
          }), { 
            status: 500,
            headers 
          });
        }
      }
      
      // 2. Historical data endpoint - FIX: Handle all three URL formats
      if (path.includes('/history') || path.includes('/historical')) {
        try {
          // Extract symbol from any of these formats:
          // 1. /stocks/AAPL/history
          // 2. /stocks/history/AAPL
          // 3. /stocks/historical/AAPL
          let symbol;
          let period = url.searchParams.get('period') || url.searchParams.get('timeframe') || '1y';
          let interval = url.searchParams.get('interval') || '1d';
          
          console.log(`Processing historical data request: ${path}, period: ${period}, interval: ${interval}`);
          
          // Handle /stocks/historical/AAPL format
          if (path.includes('/historical/')) {
            const parts = path.split('/historical/');
            if (parts.length >= 2) {
              symbol = parts[1].split('?')[0].toUpperCase();
            }
          } 
          // Handle /stocks/history/AAPL format - NEW CASE
          else if (path.includes('/history/')) {
            const parts = path.split('/history/');
            if (parts.length >= 2) {
              symbol = parts[1].split('?')[0].toUpperCase();
            }
          }
          // Original format: /stocks/AAPL/history
          else if (path.includes('/history')) {
            const pathParts = path.split('/');
            // Find stocks and get the next part
            for (let i = 0; i < pathParts.length; i++) {
              if (pathParts[i] === 'stocks' && i + 1 < pathParts.length && pathParts[i+1] !== 'history') {
                symbol = pathParts[i + 1].toUpperCase();
                break;
              }
            }
          }
          
          // If we still don't have a symbol, try a different approach
          if (!symbol) {
            const pathParts = path.split('/');
            // Find all parts that look like stock symbols (not 'stocks', 'history', 'historical', etc)
            for (const part of pathParts) {
              if (part && 
                  part !== 'stocks' && 
                  part !== 'history' && 
                  part !== 'historical' &&
                  part.length > 0 && 
                  part.length <= 5 && 
                  /^[A-Za-z\-]+$/.test(part)) {
                symbol = part.toUpperCase();
                break;
              }
            }
          }
          
          if (!symbol) {
            throw new Error(`Could not extract symbol from path: ${path}`);
          }
          
          console.log(`Extracted symbol: ${symbol} from path: ${path}`);
          
          // Try to get from cache first
          const cacheKey = `history_${symbol}_${period}_${interval}`;
          const cachedData = await getCachedData(cacheKey, env);
          
          if (cachedData) {
            return new Response(JSON.stringify(cachedData), { headers });
          }
          
          // Calculate date range
          const period1 = getStartDate(period);
          
          // Fetch from Yahoo Finance
          const historicalData = await yahooFinance.historical(symbol, {
            period1,
            interval
          }).catch(async (error) => {
            console.error(`Initial historical fetch failed for ${symbol}: ${error.message}, trying fallback...`);
            
            // Fallback to simpler params
            return yahooFinance.historical(symbol, {
              period1: getStartDate('6mo'),
              interval: '1d'
            });
          });
          
          // Transform to expected format
          const formattedData = historicalData.map(item => ({
            timestamp: Math.floor(new Date(item.date).getTime() / 1000),
            open: item.open,
            high: item.high,
            close: item.close,
            low: item.low,
            volume: item.volume
          }));
          
          // Store in cache
          await setCachedData(cacheKey, formattedData, env, 60 * 60); // 1 hour cache
          
          return new Response(JSON.stringify(formattedData), { headers });
        } catch (error) {
          console.error(`Error in historical data endpoint: ${error.message}, path: ${path}`);
          
          // Generate fallback data that is ALWAYS an array (not an error object with nested data)
          const mockData = generateMockHistoricalData("AAPL", 300);
          
          // Return direct fallback data without wrapping it in an error object
          return new Response(JSON.stringify(mockData), { 
            status: 200,
            headers 
          });
        }
      }
      
      // 3. Individual stock data - MORE SPECIFIC PATTERN MATCHING
      if (path.startsWith('/stocks/') && path.split('/').length === 3) {
        const symbol = path.split('/')[2].split('?')[0].toUpperCase();
        
        // Try to get from cache first
        const cacheKey = `stock_${symbol}`;
        const cachedData = await getCachedData(cacheKey, env);
        
        if (cachedData) {
          return new Response(JSON.stringify(cachedData), { headers });
        }
        
        try {
          // Fetch from Yahoo Finance directly
          const quoteData = await yahooFinance.quote(symbol);
          
          const stockData = {
            symbol: quoteData.symbol,
            shortName: quoteData.shortName || quoteData.longName || quoteData.symbol,
            regularMarketPrice: quoteData.regularMarketPrice,
            regularMarketChange: quoteData.regularMarketChange,
            regularMarketChangePercent: quoteData.regularMarketChangePercent,
            regularMarketVolume: quoteData.regularMarketVolume,
            price: quoteData.regularMarketPrice,
            change: quoteData.regularMarketChange,
            changePercent: quoteData.regularMarketChangePercent,
            volume: quoteData.regularMarketVolume,
            marketCap: quoteData.marketCap,
            averageVolume: quoteData.averageDailyVolume3Month || quoteData.averageVolume
          };
          
          // Store in cache
          await setCachedData(cacheKey, stockData, env);
          
          return new Response(JSON.stringify(stockData), { headers });
        } catch (error) {
          console.error(`Error fetching stock data for ${symbol}: ${error.message}`);
          
          return new Response(JSON.stringify({
            error: 'Failed to fetch stock data',
            symbol,
            message: error.message
          }), { 
            status: 404,
            headers 
          });
        }
      }
      
      // Not found for any other routes
      return new Response(JSON.stringify({
        error: 'Not found',
        path: path
      }), {
        status: 404,
        headers
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers
      });
    }
  }
};

// Handle top stocks separately to avoid path conflicts
async function handleTopStocks(limit, headers, env) {
  try {
    console.log(`Handling top stocks request with limit: ${limit}`);
    
    // Try to get from cache first
    const cacheKey = `top_stocks_${limit}`;
    const cachedData = await getCachedData(cacheKey, env);
    
    if (cachedData) {
      return new Response(JSON.stringify(cachedData), { headers });
    }
    
    // Generate fallback stocks immediately (like in simple-server.ts)
    const stocks = generateMockStocks(limit);
    
    // Store in cache
    await setCachedData(cacheKey, stocks, env, 30 * 60); // 30 minutes cache
    
    return new Response(JSON.stringify(stocks), { headers });
  } catch (error) {
    console.error('Error in handleTopStocks:', error);
    
    // Return a minimal fallback array
    const fallbackStocks = Array(limit).fill(null).map((_, i) => ({
      symbol: `S${i}`,
      shortName: `Stock ${i}`,
      regularMarketPrice: 100 + Math.random() * 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000)
    }));
    
    return new Response(JSON.stringify(fallbackStocks), { headers });
  }
}

// Stock data fetch function with improved error handling (from simple-server.ts)
async function fetchStockDataWithFallback(symbol) {
  try {
    // Attempt to fetch quote data
    const quoteData = await yahooFinance.quote(symbol);
    
    // If we get here, the quote was successful
    return {
      symbol: quoteData.symbol,
      shortName: quoteData.shortName || quoteData.longName || quoteData.symbol,
      regularMarketPrice: quoteData.regularMarketPrice,
      regularMarketChange: quoteData.regularMarketChange,
      regularMarketChangePercent: quoteData.regularMarketChangePercent,
      regularMarketVolume: quoteData.regularMarketVolume,
      price: quoteData.regularMarketPrice,
      change: quoteData.regularMarketChange,
      changePercent: quoteData.regularMarketChangePercent,
      volume: quoteData.regularMarketVolume,
      marketCap: quoteData.marketCap,
      averageVolume: quoteData.averageDailyVolume3Month || quoteData.averageVolume
    };
  } catch (error) {
    console.log(`Error fetching data for ${symbol}: ${error.message}`);
    
    // Check if this is a validation error from Yahoo with partial data
    if (error.name === 'FailedYahooValidationError' && error.result && Array.isArray(error.result)) {
      // Try to extract useful data from the error response
      const partialData = error.result[0];
      
      if (partialData) {
        // Create a minimal valid response with available data
        return {
          symbol: partialData.symbol || symbol,
          shortName: partialData.shortName || `${symbol} Stock`,
          regularMarketPrice: partialData.regularMarketPrice || partialData.twoHundredDayAverage || 100,
          regularMarketChange: partialData.regularMarketChange || 0,
          regularMarketChangePercent: partialData.regularMarketChangePercent || 0,
          regularMarketVolume: partialData.regularMarketVolume || 0,
          price: partialData.regularMarketPrice || partialData.twoHundredDayAverage || 100,
          change: partialData.regularMarketChange || 0,
          changePercent: partialData.regularMarketChangePercent || 0,
          volume: partialData.regularMarketVolume || 0
        };
      }
    }
    
    // Use simplified fallback from original worker.js
    return {
      symbol: symbol,
      shortName: `${symbol} Inc.`,
      regularMarketPrice: 100 + Math.random() * 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000),
      price: 100 + Math.random() * 100,
      change: (Math.random() * 10) - 5,
      changePercent: (Math.random() * 10) - 5,
      volume: Math.floor(Math.random() * 10000000),
      marketCap: Math.floor(Math.random() * 1000000000000),
      averageVolume: Math.floor(Math.random() * 5000000)
    };
  }
}

// Simplified stock data fetch for use in Promise.all
async function fetchStockData(symbol) {
  try {
    return await fetchStockDataWithFallback(symbol);
  } catch (error) {
    // Return mock data in case of any errors
    return {
      symbol: symbol,
      shortName: `${symbol} Inc.`,
      regularMarketPrice: 100 + Math.random() * 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000),
      price: 100 + Math.random() * 100,
      change: (Math.random() * 10) - 5,
      changePercent: (Math.random() * 10) - 5,
      volume: Math.floor(Math.random() * 10000000)
    };
  }
}

// Historical data fetch function with better error handling (from simple-server.ts)
async function fetchHistoricalDataWithFallback(symbol, period, interval) {
  try {
    // Calculate proper date range based on period
    const period1 = getStartDate(period);
    
    // Try to fetch historical data
    try {
      const historicalData = await yahooFinance.historical(symbol, {
        period1,
        interval
      });
      
      // Transform into the expected format
      return historicalData.map(item => ({
        timestamp: Math.floor(new Date(item.date).getTime() / 1000),
        open: item.open,
        high: item.high,
        close: item.close,
        low: item.low,
        volume: item.volume
      }));
      
    } catch (histError) {
      console.log(`Error in historical fetch for ${symbol}: ${histError.message}`);
      
      // If we have a validation error, try with more limited params
      if (histError.name === 'FailedYahooValidationError') {
        console.log(`Trying fallback historical data fetch for ${symbol}`);
        
        // Simpler fetch attempt
        const fallbackData = await yahooFinance.historical(symbol, {
          period1: getStartDate('6mo'), // Use shorter time period
          interval: '1d'               // Always use daily interval
        });
        
        return fallbackData.map(item => ({
          timestamp: Math.floor(new Date(item.date).getTime() / 1000),
          open: item.open,
          high: item.high,
          close: item.close,
          low: item.low,
          volume: item.volume
        }));
      }
      
      // For other errors, generate mock data
      throw histError;
    }
  } catch (error) {
    console.error(`Failed to get historical data: ${error.message}`);
    
    // Generate mock data as fallback
    return generateMockHistoricalData(symbol, period === '1d' ? 30 : 500);
  }
}

// Helper function to get start date based on period (from simple-server.ts)
function getStartDate(period) {
  const now = new Date();
  
  switch (period) {
    case '1d': return new Date(now.setDate(now.getDate() - 2)).toISOString();
    case '5d': return new Date(now.setDate(now.getDate() - 7)).toISOString();
    case '1mo': return new Date(now.setMonth(now.getMonth() - 2)).toISOString();
    case '3mo': return new Date(now.setMonth(now.getMonth() - 4)).toISOString();
    case '6mo': return new Date(now.setMonth(now.getMonth() - 7)).toISOString();
    case '1y': return new Date(now.setFullYear(now.getFullYear() - 2)).toISOString();
    case '2y': return new Date(now.setFullYear(now.getFullYear() - 3)).toISOString();
    case '5y': return new Date(now.setFullYear(now.getFullYear() - 6)).toISOString();
    default: return new Date(now.setFullYear(now.getFullYear() - 2)).toISOString();
  }
}

// Generate mock data for fallbacks (enhanced from simple-server.ts)
function generateMockHistoricalData(symbol, days = 300) {
  const mockData = [];
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
      volume: Math.floor(Math.random() * 10000000) + 500000
    });
  }
  
  return mockData;
}

// Cache helper functions using either KV or memory
async function getCachedData(key, env) {
  // Try KV if available
  if (env && env.CACHE_STORAGE) {
    try {
      const data = await env.CACHE_STORAGE.get(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`KV cache error for ${key}: ${error.message}`);
    }
    return null;
  }
  
  // Memory cache fallback
  if (CACHE[key] && CACHE[key].expires > Date.now()) {
    return CACHE[key].data;
  }
  
  return null;
}

async function setCachedData(key, data, env, ttlSeconds = 900) {
  // Use KV if available
  if (env && env.CACHE_STORAGE) {
    try {
      await env.CACHE_STORAGE.put(key, JSON.stringify(data), {expirationTtl: ttlSeconds});
    } catch (error) {
      console.error(`KV cache write error for ${key}: ${error.message}`);
    }
  } else {
    // Memory cache fallback
    CACHE[key] = {
      data: data,
      expires: Date.now() + (ttlSeconds * 1000)
    };
  }
}

// Generate mock stocks (from simple-server.ts)
function generateMockStocks(count) {
  const result = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  // Extended stock symbol list from simple-server.ts
  const extendedSymbols = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'LLY', 
    'JPM', 'V', 'AVGO', 'XOM', 'PG', 'MA', 'COST', 'HD', 'CVX', 'MRK',
    'ABBV', 'KO', 'PEP', 'ADBE', 'WMT', 'BAC', 'CRM', 'TMO', 'CSCO', 'ACN', 
    'MCD', 'ABT', 'NFLX', 'LIN', 'DHR', 'AMD', 'CMCSA', 'VZ', 'INTC', 'DIS',
    'PM', 'TXN', 'WFC', 'BMY', 'UPS', 'COP', 'NEE', 'RTX', 'ORCL', 'HON',
    'LOW', 'UNP', 'QCOM', 'IBM', 'AMAT', 'DE', 'CAT', 'AXP', 'LMT', 'SPGI',
    'GE', 'SBUX', 'GILD', 'MMM', 'AMT', 'MDLZ', 'ADI', 'TJX', 'REGN', 'ETN',
    'BKNG', 'GS', 'ISRG', 'BLK', 'VRTX', 'TMUS', 'PLD', 'C', 'MS', 'ZTS',
    'MRNA', 'PANW', 'PYPL', 'ABNB', 'COIN', 'SNOW', 'SHOP', 'SQ', 'PLTR'
  ];
  
  // First use all known symbols
  for (let i = 0; i < Math.min(count, extendedSymbols.length); i++) {
    const symbol = extendedSymbols[i];
    result.push({
      symbol,
      shortName: `${symbol} Inc.`,
      regularMarketPrice: 100 + Math.random() * 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000),
      price: 100 + Math.random() * 100,
      change: (Math.random() * 10) - 5,
      changePercent: (Math.random() * 10) - 5,
      volume: Math.floor(Math.random() * 10000000),
      marketCap: Math.floor(Math.random() * 1000000000000),
      averageVolume: Math.floor(Math.random() * 5000000)
    });
  }
  
  // If we need more, generate synthetic ones
  if (count > extendedSymbols.length) {
    for (let i = extendedSymbols.length; i < count; i++) {
      // Generate 2-4 letter symbol
      const length = Math.floor(Math.random() * 3) + 2;
      let symbol = '';
      for (let j = 0; j < length; j++) {
        symbol += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      
      result.push({
        symbol,
        shortName: `${symbol} Inc.`,
        regularMarketPrice: 100 + Math.random() * 100,
        regularMarketChange: (Math.random() * 10) - 5,
        regularMarketChangePercent: (Math.random() * 10) - 5,
        regularMarketVolume: Math.floor(Math.random() * 10000000),
        price: 100 + Math.random() * 100,
        change: (Math.random() * 10) - 5,
        changePercent: (Math.random() * 10) - 5,
        volume: Math.floor(Math.random() * 10000000),
        marketCap: Math.floor(Math.random() * 1000000000000),
        averageVolume: Math.floor(Math.random() * 5000000)
      });
    }
  }
  
  return result;
}