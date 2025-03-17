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
    
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle OPTIONS requests (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // Add JSON content type for all responses
    headers['Content-Type'] = 'application/json';
    
    try {
      // Health check endpoint
      if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          message: 'API server is online',
          version: '1.0.0',
          timestamp: new Date()
        }), { headers });
      }
      
      // Stock API endpoint
      if (url.pathname.startsWith('/stocks/') && !url.pathname.includes('/history')) {
        const symbol = url.pathname.split('/')[2].toUpperCase();
        
        // Try to get from cache first
        const cacheKey = `stock_${symbol}`;
        const cachedData = await getCachedData(cacheKey, env);
        
        if (cachedData) {
          return new Response(JSON.stringify(cachedData), { headers });
        }
        
        // If not in cache, fetch from Yahoo Finance
        try {
          const stockData = await fetchStockData(symbol);
          
          // Store in cache
          await setCachedData(cacheKey, stockData, env);
          
          return new Response(JSON.stringify(stockData), { headers });
        } catch (error) {
          return new Response(JSON.stringify({ 
            error: 'Failed to fetch stock data',
            symbol,
            message: error.message
          }), { 
            status: 500,
            headers 
          });
        }
      }
      
      // Historical data endpoint
      if (url.pathname.includes('/history')) {
        const pathParts = url.pathname.split('/');
        const symbol = pathParts[2].toUpperCase();
        const period = url.searchParams.get('period') || '1y';
        const interval = url.searchParams.get('interval') || '1d';
        
        // Try to get from cache first
        const cacheKey = `history_${symbol}_${period}_${interval}`;
        const cachedData = await getCachedData(cacheKey, env);
        
        if (cachedData) {
          return new Response(JSON.stringify(cachedData), { headers });
        }
        
        // If not in cache, fetch from Yahoo Finance
        try {
          const historicalData = await fetchHistoricalData(symbol, period, interval);
          
          // Store in cache
          await setCachedData(cacheKey, historicalData, env, 60 * 60); // 1 hour cache
          
          return new Response(JSON.stringify(historicalData), { headers });
        } catch (error) {
          return new Response(JSON.stringify({ 
            error: 'Failed to fetch historical data',
            symbol,
            message: error.message
          }), { 
            status: 500,
            headers 
          });
        }
      }
      
      // Not found for any other routes
      return new Response(JSON.stringify({
        error: 'Not found'
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

// Stock data fetch function
async function fetchStockData(symbol) {
  try {
    const quoteData = await yahooFinance.quote(symbol);
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
      volume: quoteData.regularMarketVolume
    };
  } catch (error) {
    // Return mock data if real data fails
    return {
      symbol: symbol,
      shortName: `${symbol} Inc.`,
      regularMarketPrice: 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000),
      price: 100,
      change: (Math.random() * 10) - 5,
      changePercent: (Math.random() * 10) - 5,
      volume: Math.floor(Math.random() * 10000000)
    };
  }
}

// Historical data fetch function
async function fetchHistoricalData(symbol, period, interval) {
  try {
    const period1 = getStartDate(period);
    
    const historicalData = await yahooFinance.historical(symbol, {
      period1,
      interval: interval
    });
    
    return historicalData.map(item => ({
      timestamp: Math.floor(new Date(item.date).getTime() / 1000),
      open: item.open,
      high: item.high,
      close: item.close,
      low: item.low,
      volume: item.volume
    }));
  } catch (error) {
    // Return mock data if real data fails
    const mockData = generateMockHistoricalData(symbol, 200);
    return mockData;
  }
}

// Helper function to get start date based on period
function getStartDate(period) {
  const now = new Date();
  
  switch (period) {
    case '1d': return new Date(now.setDate(now.getDate() - 1)).toISOString();
    case '5d': return new Date(now.setDate(now.getDate() - 5)).toISOString();
    case '1mo': return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
    case '3mo': return new Date(now.setMonth(now.getMonth() - 3)).toISOString();
    case '6mo': return new Date(now.setMonth(now.getMonth() - 6)).toISOString();
    case '1y': return new Date(now.setFullYear(now.getFullYear() - 1)).toISOString();
    case '2y': return new Date(now.setFullYear(now.getFullYear() - 2)).toISOString();
    case '5y': return new Date(now.setFullYear(now.getFullYear() - 5)).toISOString();
    default: return new Date(now.setFullYear(now.getFullYear() - 1)).toISOString();
  }
}

// Generate mock data for fallbacks
function generateMockHistoricalData(symbol, days = 300) {
  const mockData = [];
  const today = new Date();
  let price = 100 + (symbol.charCodeAt(0) % 50);
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    const change = (Math.random() - 0.48) * 2;
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
    const data = await env.CACHE_STORAGE.get(key);
    if (data) {
      return JSON.parse(data);
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
    await env.CACHE_STORAGE.put(key, JSON.stringify(data), {expirationTtl: ttlSeconds});
  } else {
    // Memory cache fallback
    CACHE[key] = {
      data: data,
      expires: Date.now() + (ttlSeconds * 1000)
    };
  }
}