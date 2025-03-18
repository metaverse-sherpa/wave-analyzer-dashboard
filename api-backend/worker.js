import yahooFinance from 'yahoo-finance2';

// Configure CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// In-memory cache for non-KV environments
const CACHE = {};

// Add this near the top with other constants
const SCREENER_TYPES = [
  'day_gainers',
  'most_actives',
  'undervalued_large_caps',
  'growth_technology_stocks',
  'aggressive_small_caps',
  'undervalued_growth_stocks',
  'most_shorted_stocks',
  'small_cap_gainers',
  'solid_large_growth_funds',
  'portfolio_anchors'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { ...corsHeaders };
    const path = url.pathname.startsWith('/api') 
      ? url.pathname.substring(4)
      : url.pathname;

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Health check endpoint
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), { headers });
      }

      // Replace the existing top stocks endpoint handler
      if (path === '/stocks/top' || path.startsWith('/stocks/top?')) {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        console.log(`Fetching top ${limit} stocks`);
        
        // Try to get from cache first
        const cacheKey = `top_stocks_${limit}`;
        const cachedData = await getCachedData(cacheKey, env);
        
        if (cachedData) {
          return new Response(JSON.stringify(cachedData), { headers });
        }
        
        try {
          let allStocks = [];
          let seenSymbols = new Set();
          
          for (const scrId of SCREENER_TYPES) {
            if (seenSymbols.size >= limit) break;
            
            console.log(`Fetching from screener: ${scrId}`);
            try {
              // Proper screener call with queryOptions
              const result = await yahooFinance.screener({
                scrIds: scrId,
                count: Math.min(100, limit * 2),
                region: 'US',
                lang: 'en-US'
              });
              
              if (result?.quotes) {
                // Process each quote
                for (const quote of result.quotes) {
                  if (seenSymbols.size >= limit) break;
                  
                  // Skip if we've already seen this symbol or missing critical data
                  if (seenSymbols.has(quote.symbol) || !quote.symbol || !quote.regularMarketPrice) {
                    continue;
                  }
                  
                  seenSymbols.add(quote.symbol);
                  allStocks.push({
                    symbol: quote.symbol,
                    name: quote.shortName || quote.longName || quote.symbol,
                    regularMarketPrice: quote.regularMarketPrice,
                    regularMarketChange: quote.regularMarketChange || 0,
                    regularMarketChangePercent: quote.regularMarketChangePercent || 0,
                    price: quote.regularMarketPrice,
                    change: quote.regularMarketChange || 0,
                    changePercent: quote.regularMarketChangePercent || 0,
                    volume: quote.regularMarketVolume || 0,
                    marketCap: quote.marketCap || 0,
                    averageVolume: quote.averageDailyVolume3Month || quote.averageVolume || 0
                  });
                }
              }
              
              console.log(`Got ${result?.quotes?.length || 0} stocks from ${scrId}, total unique: ${seenSymbols.size}`);
              
              // Add delay between screener calls
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } catch (screenerError) {
              console.warn(`Error with screener ${scrId}:`, screenerError);
              continue;
            }
          }
          
          // Sort by market cap and slice to limit
          const topStocksData = allStocks
            .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
            .slice(0, limit);
          
          if (topStocksData.length === 0) {
            throw new Error('No valid stocks returned from screeners');
          }
          
          console.log(`Returning ${topStocksData.length} stocks out of ${allStocks.length} total collected`);
          
          // Cache the results
          await setCachedData(cacheKey, topStocksData, env, 60 * 15); // 15 minutes cache
          return new Response(JSON.stringify(topStocksData), { headers });
          
        } catch (error) {
          console.error(`Error fetching top stocks: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch top stocks',
            message: error.message
          }), { 
            status: 500, 
            headers 
          });
        }
      }

      // Historical data endpoint
      if (path.includes('/history') || path.includes('/historical')) {
        try {
          let symbol;
          const timeframe = url.searchParams.get('timeframe');
          const interval = url.searchParams.get('interval') || '1d';
          
          // Extract symbol from URL path
          if (path.includes('/historical/')) {
            symbol = path.split('/historical/')[1].split('?')[0].toUpperCase();
          } else if (path.includes('/history/')) {
            symbol = path.split('/history/')[1].split('?')[0].toUpperCase();
          } else {
            const parts = path.split('/');
            for (let i = 0; i < parts.length; i++) {
              if (parts[i] === 'stocks' && i + 1 < parts.length) {
                symbol = parts[i + 1].toUpperCase();
                break;
              }
            }
          }

          if (!symbol) {
            throw new Error(`Could not extract symbol from path: ${path}`);
          }

          console.log(`Fetching historical data for ${symbol}, timeframe: ${timeframe || '2y'}`);

          // Calculate date range - default to 2 years
          const startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - 2); // 2 years ago

          // Fetch from Yahoo Finance
          const historicalData = await yahooFinance.historical(symbol, {
            period1: startDate,
            interval: interval
          });

          if (!historicalData || historicalData.length === 0) {
            throw new Error(`No data returned for ${symbol}`);
          }

          console.log(`Retrieved ${historicalData.length} data points for ${symbol}`);

          // Transform the data
          const formattedData = historicalData.map(item => ({
            timestamp: Math.floor(new Date(item.date).getTime() / 1000),
            open: Number(item.open),
            high: Number(item.high),
            close: Number(item.close),
            low: Number(item.low),
            volume: Number(item.volume || 0)
          }));

          return new Response(JSON.stringify(formattedData), { headers });
        } catch (error) {
          console.error(`Historical data error: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch historical data',
            message: error.message
          }), { 
            status: 500, 
            headers 
          });
        }
      }

      // Handle unknown endpoints
      return new Response(JSON.stringify({
        error: 'Not found',
        path: path
      }), {
        status: 404,
        headers
      });

    } catch (error) {
      console.error(`Server error: ${error.message}`);
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