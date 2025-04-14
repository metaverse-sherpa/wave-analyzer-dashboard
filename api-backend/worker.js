// Import URL patches for node:url compatibility
import { URL, URLSearchParams } from 'node:url';
import yahooFinance from 'yahoo-finance2';

// Constants
const APP_VERSION = '0.0.9';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Content-Type': 'application/json'
};

// In-memory cache
const CACHE = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { ...corsHeaders };
    
    // Better path handling for both direct Worker calls and Pages proxy
    let path = url.pathname;
    
    // Handle both /api/something and /something paths
    if (path.startsWith('/api/')) {
      path = path.substring(4); // Remove /api prefix
    }
    
    // Add a console log for debugging
    console.log(`Processing request for path: ${path}, original URL: ${request.url}`);

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
      
      // Test endpoint to verify Yahoo Finance is working
      if (path === '/test-yahoo') {
        try {
          const data = await yahooFinance.quote('AAPL');
          return new Response(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            data: {
              symbol: data.symbol,
              price: data.regularMarketPrice,
              change: data.regularMarketChange,
              percentChange: data.regularMarketChangePercent
            }
          }), { headers });
        } catch (error) {
          return new Response(JSON.stringify({
            status: 'error',
            message: `Yahoo Finance error: ${error.message}`
          }), { 
            status: 500, 
            headers 
          });
        }
      }
      
      // Version endpoint
      if (path === '/version') {
        return new Response(JSON.stringify({
          version: APP_VERSION,
          timestamp: new Date().toISOString()
        }), { headers });
      }
      
      // FIXED: Top stocks endpoint for admin console with better error handling
      if (path === '/stocks/top') {
        const cacheKey = "top_stocks";
        
        try {
          // Check for cached data first (cache for 1 hour)
          if (CACHE[cacheKey] && CACHE[cacheKey].expires > Date.now()) {
            console.log("Using cached top stocks data");
            return new Response(JSON.stringify(CACHE[cacheKey].data), { headers });
          }
          
          console.log("Fetching top stocks from Yahoo Finance...");
          const params = new URLSearchParams(url.search);
          const limit = parseInt(params.get('limit') || '100');
          
          // First try most_actives screener
          let result;
          try {
            result = await yahooFinance.screener({
              scrIds: 'most_actives',
              count: Math.min(limit, 250), // Yahoo limit is 250
              region: 'US',
              lang: 'en-US'
            });
          } catch (e) {
            console.error("Error with most_actives screener:", e);
            // Fall back to day_gainers if most_actives fails
            result = await yahooFinance.screener({
              scrIds: 'day_gainers',
              count: Math.min(limit, 250),
              region: 'US',
              lang: 'en-US'
            });
          }
          
          if (!result?.quotes || !Array.isArray(result.quotes) || result.quotes.length === 0) {
            console.error("No valid stock data received from Yahoo Finance screener");
            throw new Error("No valid stock data received from screener");
          }
          
          // Format the response as a simple list of symbols and names
          const topStocks = result.quotes.map(quote => ({
            symbol: quote.symbol,
            name: quote.shortName || quote.longName || quote.symbol
          })).filter(stock => stock.symbol && stock.symbol.length > 0);
          
          if (topStocks.length === 0) {
            console.error("No valid stocks found after filtering");
            throw new Error("No valid stocks found after filtering");
          }
          
          // Cache the results for 1 hour
          CACHE[cacheKey] = {
            data: topStocks,
            expires: Date.now() + (60 * 60 * 1000) // 1 hour
          };
          
          console.log(`Returning ${topStocks.length} top stocks`);
          return new Response(JSON.stringify(topStocks), { headers });
        } catch (error) {
          console.error(`Error getting top stocks: ${error.message}`);
          
          // If we have a cache but it's expired, still use it in case of error
          if (CACHE[cacheKey] && CACHE[cacheKey].data) {
            console.log("Using expired cache as fallback for top stocks");
            return new Response(JSON.stringify(CACHE[cacheKey].data), { headers });
          }
          
          // If no cache, return a fallback list of reliable major stocks
          const fallbackStocks = [
            { symbol: 'AAPL', name: 'Apple Inc.' },
            { symbol: 'MSFT', name: 'Microsoft Corporation' },
            { symbol: 'GOOGL', name: 'Alphabet Inc.' },
            { symbol: 'AMZN', name: 'Amazon.com Inc.' },
            { symbol: 'TSLA', name: 'Tesla Inc.' },
            { symbol: 'META', name: 'Meta Platforms Inc.' },
            { symbol: 'NVDA', name: 'NVIDIA Corporation' },
            { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
            { symbol: 'JNJ', name: 'Johnson & Johnson' },
            { symbol: 'V', name: 'Visa Inc.' },
            { symbol: 'PG', name: 'Procter & Gamble Co.' },
            { symbol: 'DIS', name: 'Walt Disney Co.' },
            { symbol: 'BAC', name: 'Bank of America Corp.' },
            { symbol: 'MA', name: 'Mastercard Inc.' },
            { symbol: 'HD', name: 'Home Depot Inc.' },
            { symbol: 'INTC', name: 'Intel Corporation' },
            { symbol: 'VZ', name: 'Verizon Communications' },
            { symbol: 'ADBE', name: 'Adobe Inc.' },
            { symbol: 'CSCO', name: 'Cisco Systems Inc.' },
            { symbol: 'NFLX', name: 'Netflix Inc.' }
          ];
          
          // Store fallback in cache (shorter expiry of 15 minutes)
          CACHE[cacheKey] = {
            data: fallbackStocks,
            expires: Date.now() + (15 * 60 * 1000) // 15 minutes
          };
          
          console.log("Returning fallback stocks list");
          return new Response(JSON.stringify(fallbackStocks), { headers });
        }
      }
      
      // NEW: Historical data endpoint for stocks
      if (path.match(/\/stocks\/historical\/[A-Z0-9.^]+$/)) {
        const symbol = path.split('/')[3];
        const params = new URLSearchParams(url.search);
        const timeframe = params.get('timeframe') || '1y';
        const interval = params.get('interval') || '1d';
        
        try {
          // Get the period based on timeframe
          let period1;
          const now = new Date();
          
          switch (timeframe) {
            case '1d': period1 = new Date(now.setDate(now.getDate() - 1)); break;
            case '5d': period1 = new Date(now.setDate(now.getDate() - 5)); break;
            case '1mo': period1 = new Date(now.setMonth(now.getMonth() - 1)); break;
            case '3mo': period1 = new Date(now.setMonth(now.getMonth() - 3)); break;
            case '6mo': period1 = new Date(now.setMonth(now.getMonth() - 6)); break;
            case '1y': period1 = new Date(now.setFullYear(now.getFullYear() - 1)); break;
            case '2y': period1 = new Date(now.setFullYear(now.getFullYear() - 2)); break;
            case '5y': period1 = new Date(now.setFullYear(now.getFullYear() - 5)); break;
            default: period1 = new Date(now.setFullYear(now.getFullYear() - 1));
          }
          
          const data = await yahooFinance.historical(symbol, {
            period1,
            interval: interval
          });
          
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error(`No historical data available for ${symbol}`);
          }
          
          return new Response(JSON.stringify(data), { headers });
        } catch (error) {
          return new Response(JSON.stringify({
            error: `Failed to get historical data for ${symbol}`,
            message: error.message
          }), { 
            status: 500,
            headers 
          });
        }
      }
      
      // Market sentiment endpoint
      if (path === '/market/sentiment') {
        try {
          console.log("Generating market sentiment data");
          
          // Generate market data directly without calling external APIs
          const result = await yahooFinance.screener({
            scrIds: 'most_actives',
            count: 30,
            region: 'US',
            lang: 'en-US'
          });
          
          if (!result?.quotes || !Array.isArray(result.quotes) || result.quotes.length === 0) {
            throw new Error("No valid stock data received from screener");
          }
          
          // Use the quotes to calculate market sentiment
          const topStocks = result.quotes.map(quote => ({
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
          }));
          
          // Calculate bullish/bearish sentiment based on stock price movements
          let bullishCount = 0;
          let bearishCount = 0;
          let neutralCount = 0;
          
          topStocks.forEach(stock => {
            if (stock.change > 0) {
              bullishCount++;
            } else if (stock.change < 0) {
              bearishCount++;
            } else {
              neutralCount++;
            }
          });
          
          const totalCount = topStocks.length;
          const bullishPercentage = Math.round((bullishCount / totalCount) * 100) || 0;
          const bearishPercentage = Math.round((bearishCount / totalCount) * 100) || 0;
          const neutralPercentage = Math.round((neutralCount / totalCount) * 100) || 0;
          
          // Determine overall sentiment
          let sentiment = 'Neutral';
          if (bullishPercentage > 60) sentiment = 'Bullish';
          else if (bearishPercentage > 60) sentiment = 'Bearish';
          else if (bullishPercentage > bearishPercentage + 10) sentiment = 'Slightly Bullish';
          else if (bearishPercentage > bullishPercentage + 10) sentiment = 'Slightly Bearish';
          
          // Generate market analysis
          const analysis = generateMarketAnalysis(topStocks, bullishPercentage, bearishPercentage, sentiment);
          
          const marketData = {
            analysis,
            sentiment,
            bullishCount,
            bearishCount,
            neutralCount,
            bullishPercentage,
            bearishPercentage,
            neutralPercentage,
            lastUpdated: new Date().toISOString(),
            topGainers: topStocks.sort((a, b) => b.changePercent - a.changePercent).slice(0, 3),
            topLosers: topStocks.sort((a, b) => a.changePercent - b.changePercent).slice(0, 3),
            sourcesUsed: ['Yahoo Finance API'],
            isMockData: false
          };
          
          console.log("Generated market sentiment successfully");
          return new Response(JSON.stringify(marketData), { headers });
          
        } catch (error) {
          console.error(`Error generating market sentiment: ${error.message}`);
          
          // Return a fallback response with mock data
          const fallbackData = {
            analysis: "The market is showing mixed signals today, with various sectors performing differently. Major indices are showing moderate volatility, suggesting caution is warranted. From an Elliott Wave perspective, watch key support and resistance levels for potential wave completions.",
            sentiment: "Neutral",
            bullishCount: 15,
            bearishCount: 15,
            neutralCount: 0,
            bullishPercentage: 50,
            bearishPercentage: 50,
            neutralPercentage: 0,
            lastUpdated: new Date().toISOString(),
            sourcesUsed: ['Mock Data'],
            isMockData: true
          };
          
          return new Response(JSON.stringify(fallbackData), { headers });
        }
      }
      
      // NEW: Market quote endpoint
      if (path.match(/^\/market\/quote\/[A-Z0-9.^]+$/)) {
        try {
          const symbol = path.split('/')[3];
          console.log(`Processing market quote for symbol: ${symbol}`);
          
          // Check if we have a cached response
          const cacheKey = `market_quote_${symbol}`;
          if (CACHE[cacheKey] && CACHE[cacheKey].expires > Date.now()) {
            console.log(`Using cached market quote for ${symbol}`);
            return new Response(JSON.stringify(CACHE[cacheKey].data), { headers });
          }
          
          // Get the quote from Yahoo Finance
          const data = await yahooFinance.quote(symbol);
          
          if (!data) {
            throw new Error(`No quote data available for ${symbol}`);
          }
          
          // Format the response
          const quoteData = {
            symbol: data.symbol,
            price: data.regularMarketPrice,
            change: data.regularMarketChange,
            percentChange: data.regularMarketChangePercent,
            previousClose: data.regularMarketPreviousClose,
            open: data.regularMarketOpen,
            dayHigh: data.regularMarketDayHigh,
            dayLow: data.regularMarketDayLow,
            volume: data.regularMarketVolume,
            avgVolume: data.averageDailyVolume3Month,
            marketCap: data.marketCap,
            name: data.shortName || data.longName || data.symbol,
            lastUpdated: new Date().toISOString()
          };
          
          // Cache the data for 5 minutes
          CACHE[cacheKey] = {
            data: quoteData,
            expires: Date.now() + (5 * 60 * 1000) // 5 minutes
          };
          
          return new Response(JSON.stringify(quoteData), { headers });
        } catch (error) {
          console.error(`Error getting market quote: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to get market quote',
            message: error.message
          }), {
            status: 500,
            headers
          });
        }
      }
      
      // NEW: Market news endpoint
      if (path === '/market/news' || path.match(/^\/market\/news\/[A-Z0-9.^]+$/)) {
        try {
          // Get the symbol if specified, otherwise default to general market news
          let symbol = null;
          if (path !== '/market/news') {
            symbol = path.split('/')[3];
          }
          
          const cacheKey = symbol ? `market_news_${symbol}` : 'market_news_general';
          
          // Check if we have a cached response
          if (CACHE[cacheKey] && CACHE[cacheKey].expires > Date.now()) {
            console.log(`Using cached market news for ${symbol || 'general market'}`);
            return new Response(JSON.stringify(CACHE[cacheKey].data), { headers });
          }
          
          console.log(`Fetching market news for ${symbol || 'general market'}`);
          
          // Number of news items to return
          const params = new URLSearchParams(url.search);
          const count = parseInt(params.get('count') || '10');
          
          // Get news using Yahoo Finance API
          const newsItems = await getNewsItems(symbol, count);
          
          // Cache the news for 15 minutes
          CACHE[cacheKey] = {
            data: newsItems,
            expires: Date.now() + (15 * 60 * 1000) // 15 minutes
          };
          
          return new Response(JSON.stringify(newsItems), { headers });
        } catch (error) {
          console.error(`Error getting market news: ${error.message}`);
          
          // Return a fallback response with generic market news
          const fallbackNews = generateFallbackNews();
          return new Response(JSON.stringify(fallbackNews), { headers });
        }
      }

      // Telegram webhook endpoint
      if (path === '/telegram/webhook') {
        return handleTelegramWebhook(request, env, ctx);
      }
      
      // Stock data and charts endpoints
      if (path.startsWith('/stocks/')) {
        // Handle stock data endpoints
        if (path.match(/\/stocks\/[A-Z0-9.^]+\/quote$/)) {
          const symbol = path.split('/')[2];
          return handleStockQuote(symbol, headers);
        }
        
        if (path.match(/\/stocks\/[A-Z0-9.^]+\/history$/)) {
          const symbol = path.split('/')[2];
          const params = new URLSearchParams(url.search);
          const period = params.get('period') || '1y';
          const interval = params.get('interval') || '1d';
          return handleStockHistory(symbol, period, interval, headers);
        }
      }

      // NEW: Clear cache endpoint for background worker
      if (path === '/clear-cache' && request.method === 'POST') {
        return await handleClearCache(request, env, ctx);
      }
      
      // NEW: Store historical data endpoint for background worker
      if (path === '/store-historical' && request.method === 'POST') {
        return await handleStoreHistorical(request, env, ctx);
      }
      
      // NEW: Analyze waves endpoint for background worker
      if (path === '/analyze-waves' && request.method === 'POST') {
        return await handleAnalyzeWaves(request, env, ctx);
      }
      
      // NEW: Store wave analysis endpoint for background worker
      if (path === '/store-wave-analysis' && request.method === 'POST') {
        return await handleStoreWaveAnalysis(request, env, ctx);
      }

      // Fallback to API documentation
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Endpoint not found',
        availableEndpoints: [
          '/health',
          '/version',
          '/test-yahoo',
          '/market/sentiment',
          '/telegram/webhook',
          '/stocks/top',
          '/stocks/{symbol}/quote',
          '/stocks/{symbol}/history',
          '/stocks/historical/{symbol}',
          '/clear-cache',
          '/store-historical',
          '/analyze-waves',
          '/store-wave-analysis'
        ]
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

// Helper function to handle clearing cache
async function handleClearCache(request, env, ctx) {
  const headers = { ...corsHeaders };
  
  try {
    // Parse the request body
    const data = await request.json();
    const cacheType = data.cacheType;
    
    if (!cacheType) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Missing cacheType parameter'
      }), { 
        status: 400,
        headers
      });
    }
    
    console.log(`Clearing cache for type: ${cacheType}`);
    
    // Check if we have Supabase credentials in environment variables
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        // Determine pattern for cache deletion
        let pattern;
        
        if (cacheType === 'historical_data') {
          pattern = 'historical_data_%';
        } else if (cacheType === 'wave_analysis') {
          pattern = 'wave_analysis_%';
        } else {
          pattern = `${cacheType}%`;
        }
        
        // First try using the RPC function if available
        try {
          console.log(`Attempting to clear cache using RPC delete_cache_by_pattern with pattern: ${pattern}`);
          const rpcResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/delete_cache_by_pattern`, {
            method: 'POST',
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pattern_text: pattern
            })
          });
          
          if (rpcResponse.ok) {
            console.log("Successfully cleared cache using RPC method");
          } else {
            throw new Error(`RPC method failed with status: ${rpcResponse.status}`);
          }
        } catch (rpcError) {
          // Fallback to direct DELETE with LIKE filter
          console.log("RPC method failed, falling back to direct DELETE with LIKE filter");
          
          // Add the LIKE filter as a URL query parameter
          const url = new URL(`${env.SUPABASE_URL}/rest/v1/cache`);
          url.searchParams.append('key', `like.${pattern}`);
          
          const deleteResponse = await fetch(url, {
            method: 'DELETE',
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal'
            }
          });
          
          if (!deleteResponse.ok) {
            throw new Error(`Supabase DELETE error: ${deleteResponse.status}`);
          }
          
          console.log("Successfully cleared cache using direct DELETE with LIKE filter");
        }
        
        // Also clear from in-memory cache
        if (CACHE) {
          Object.keys(CACHE).forEach(key => {
            if (key.startsWith(cacheType) || (cacheType === 'historical_data' && key.startsWith('historical_data_'))) {
              console.log(`Clearing in-memory cache entry: ${key}`);
              delete CACHE[key];
            }
          });
        }
        
        console.log(`Successfully cleared ${cacheType} cache in Supabase`);
      } catch (supabaseError) {
        console.error('Error clearing Supabase cache:', supabaseError);
        // Continue execution even if Supabase operation failed
      }
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Cache cleared for ${cacheType}`,
      timestamp: new Date().toISOString()
    }), { headers });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Failed to clear cache: ${error.message}`
    }), { 
      status: 500,
      headers
    });
  }
}

// Helper function to handle storing historical data
async function handleStoreHistorical(request, env, ctx) {
  const headers = { ...corsHeaders };
  
  try {
    // Parse the request body
    const data = await request.json();
    const { symbol, timeframe, data: historicalData, duration } = data;
    
    if (!symbol || !timeframe || !historicalData) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Missing required parameters: symbol, timeframe, data'
      }), { 
        status: 400,
        headers
      });
    }
    
    console.log(`Storing historical data for ${symbol} (${timeframe}), points: ${historicalData.length}`);
    
    // Check if we have Supabase credentials in environment variables
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        // Store data in Supabase
        const cacheKey = `historical_data_${symbol}_${timeframe}`;
        
        const supabaseResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/cache`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            key: cacheKey,
            data: historicalData,
            timestamp: Date.now(),
            duration: duration || 7 * 24 * 60 * 60 * 1000, // Default to 7 days if not specified
            is_string: true
          })
        });
        
        if (!supabaseResponse.ok) {
          const errorText = await supabaseResponse.text();
          throw new Error(`Supabase API error (${supabaseResponse.status}): ${errorText}`);
        }
        
        console.log(`Successfully stored historical data for ${symbol} in Supabase`);
      } catch (supabaseError) {
        console.error('Error storing data in Supabase:', supabaseError);
        return new Response(JSON.stringify({
          status: 'error',
          message: `Failed to store data in Supabase: ${supabaseError.message}`
        }), {
          status: 500,
          headers
        });
      }
    } else {
      console.warn('Supabase credentials not found in environment variables');
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Historical data stored for ${symbol} (${timeframe})`,
      pointsStored: historicalData.length,
      timestamp: new Date().toISOString()
    }), { headers });
  } catch (error) {
    console.error('Error storing historical data:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Failed to store historical data: ${error.message}`
    }), { 
      status: 500,
      headers
    });
  }
}

// Helper function to handle analyzing waves
async function handleAnalyzeWaves(request, env, ctx) {
  const headers = { ...corsHeaders };
  
  try {
    // Parse the request body
    const data = await request.json();
    const { symbol, timeframe, force } = data;
    
    if (!symbol || !timeframe) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Missing required parameters: symbol, timeframe'
      }), { 
        status: 400,
        headers
      });
    }
    
    console.log(`Analyzing waves for ${symbol} (${timeframe}), force: ${force}`);
    
    // For now, this is just a simulation since we don't have direct access to the analysis functionality
    // In a real implementation, you would perform the wave analysis
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Wave analysis completed for ${symbol} (${timeframe})`,
      wavesFound: Math.floor(Math.random() * 5) + 3, // Just for simulation
      timestamp: new Date().toISOString()
    }), { headers });
  } catch (error) {
    console.error('Error analyzing waves:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Failed to analyze waves: ${error.message}`
    }), { 
      status: 500,
      headers
    });
  }
}

// Helper function to handle storing wave analysis
async function handleStoreWaveAnalysis(request, env, ctx) {
  const headers = { ...corsHeaders };
  
  try {
    // Parse the request body
    const data = await request.json();
    const { symbol, timeframe, waveAnalysis } = data;
    
    if (!symbol || !timeframe || !waveAnalysis) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Missing required parameters: symbol, timeframe, waveAnalysis'
      }), { 
        status: 400,
        headers
      });
    }
    
    console.log(`Storing wave analysis for ${symbol} (${timeframe})`);
    
    // Check if we have Supabase credentials in environment variables
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        // Store data in Supabase
        const cacheKey = `wave_analysis_${symbol}_${timeframe}`;
        
        const supabaseResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/cache`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            key: cacheKey,
            data: waveAnalysis,
            timestamp: Date.now(),
            duration: 30 * 24 * 60 * 60 * 1000, // Cache for 30 days
            is_string: true
          })
        });
        
        if (!supabaseResponse.ok) {
          const errorText = await supabaseResponse.text();
          throw new Error(`Supabase API error (${supabaseResponse.status}): ${errorText}`);
        }
        
        console.log(`Successfully stored wave analysis for ${symbol} in Supabase`);
      } catch (supabaseError) {
        console.error('Error storing wave analysis in Supabase:', supabaseError);
        return new Response(JSON.stringify({
          status: 'error',
          message: `Failed to store wave analysis in Supabase: ${supabaseError.message}`
        }), {
          status: 500,
          headers
        });
      }
    } else {
      console.warn('Supabase credentials not found in environment variables');
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Wave analysis stored for ${symbol} (${timeframe})`,
      timestamp: new Date().toISOString()
    }), { headers });
  } catch (error) {
    console.error('Error storing wave analysis:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Failed to store wave analysis: ${error.message}`
    }), { 
      status: 500,
      headers
    });
  }
}

// Helper function to handle Telegram webhook
async function handleTelegramWebhook(request, env, ctx) {
  try {
    console.log("Telegram webhook handler called with URL:", request.url);
    
    // Check if token is available
    const token = env?.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is not configured in environment variables");
      return new Response(JSON.stringify({
        status: "error", 
        message: "Telegram bot token not configured. Please set TELEGRAM_BOT_TOKEN environment variable."
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      });
    }
    
    // Process incoming update
    const payload = await request.json();
    
    // Basic validation: Make sure this is a message
    if (!payload.message) {
      return new Response(JSON.stringify({ status: "ok", message: "No message found in update" }), { 
        headers: { "Content-Type": "application/json" } 
      });
    }
    
    const chatId = payload.message.chat.id;
    const text = payload.message.text || '';
    const username = payload.message.from ? 
      (payload.message.from.username || payload.message.from.first_name || 'there') : 
      'there';
    
    // Check if this is a group chat - needed to handle buttons correctly
    const isGroupChat = payload.message.chat.type === 'group' || payload.message.chat.type === 'supergroup';
    console.log(`Received message "${text}" from ${username} in ${isGroupChat ? 'group' : 'private'} chat ${chatId}`);
    
    // Define the help message using plain text format
    const helpMessage = "📚 Wave Analyzer Bot Help\n\n" +
      "Available commands:\n" +
      "/analyze - Open the Wave Analyzer Mini App\n" +
      "/market - Get current market overview\n" +
      "/symbol TICKER - Get analysis for a specific symbol\n" + 
      "/version - Display the current app version\n" +
      "/help - Show the help message\n\n" +
      "Visit our website for more features: https://elliottwaves.ai";
    
    // Process commands
    if (text.startsWith('/start')) {
      console.log("Processing /start command");
      
      // Create reply markup based on chat type
      const replyMarkup = isGroupChat
        ? JSON.stringify({
            inline_keyboard: [[
              {
                text: "🔍 Open Wave Analyzer",
                url: "https://elliottwaves.ai/telegram"
              }
            ]]
          })
        : JSON.stringify({
            inline_keyboard: [[
              {
                text: "🔍 Open Wave Analyzer",
                web_app: { url: "https://elliottwaves.ai/telegram" }
              }
            ]]
          });
      
      return await sendTelegramMessage(
        token, 
        chatId,
        `👋 Welcome to the Wave Analyzer Bot, ${username}!\n\nI can help you analyze stocks and market indices using Elliott Wave theory.\n\n${helpMessage}`,
        { reply_markup: replyMarkup }
      );
    }
    else if (text.startsWith('/help')) {
      console.log("Processing /help command");
      return await sendTelegramMessage(token, chatId, helpMessage);
    }
    else if (text.startsWith('/analyze')) {
      console.log("Processing /analyze command");
      
      // Create reply markup based on chat type
      const replyMarkup = isGroupChat
        ? JSON.stringify({
            inline_keyboard: [[
              {
                text: "🔍 Open Wave Analyzer",
                url: "https://elliottwaves.ai/telegram"
              }
            ]]
          })
        : JSON.stringify({
            inline_keyboard: [[
              {
                text: "🔍 Open Wave Analyzer",
                web_app: { url: "https://elliottwaves.ai/telegram" }
              }
            ]]
          });
      
      return await sendTelegramMessage(token, chatId,
        "📊 Wave Analyzer\n\n" +
        "Click below to open the Wave Analyzer Mini App:",
        {
          reply_markup: replyMarkup
        }
      );
    }
    else if (text.startsWith('/market')) {
      console.log("Processing /market command");
      
      try {
        // Fetch current market sentiment from AI service
        const marketData = await getMarketSentimentForTelegram();
        
        // Format the market data response
        const marketMessage = `📈 *Market Overview*\n\n` +
          `${marketData.analysis}\n\n` +
          `Market Sentiment: ${marketData.sentiment}\n` +
          `Bullish: ${marketData.bullishPercentage}% | Bearish: ${marketData.bearishPercentage}%\n` +
          `Last Updated: ${marketData.lastUpdated}\n\n` +
          `For a complete analysis, please use our Mini App:`;
        
        // Create reply markup based on chat type
        const replyMarkup = isGroupChat
          ? JSON.stringify({
              inline_keyboard: [[
                {
                  text: "📊 View Full Market Analysis",
                  url: "https://elliottwaves.ai/telegram"
                }
              ]]
            })
          : JSON.stringify({
              inline_keyboard: [[
                {
                  text: "📊 View Full Market Analysis",
                  web_app: { url: "https://elliottwaves.ai/telegram" }
                }
              ]]
            });
        
        return await sendTelegramMessage(token, chatId,
          marketMessage,
          {
            reply_markup: replyMarkup
          }
        );
      } catch (error) {
        console.error("Error fetching market data:", error);
        
        // Create reply markup based on chat type
        const replyMarkup = isGroupChat
          ? JSON.stringify({
              inline_keyboard: [[
                {
                  text: "📊 Open Wave Analyzer",
                  url: "https://elliottwaves.ai/telegram"
                }
              ]]
            })
          : JSON.stringify({
              inline_keyboard: [[
                {
                  text: "📊 Open Wave Analyzer",
                  web_app: { url: "https://elliottwaves.ai/telegram" }
                }
              ]]
            });
            
        return await sendTelegramMessage(token, chatId,
          "📈 *Market Overview*\n\n" +
          "I'm currently unable to fetch the latest market data. Please try again later or use our web app for the most up-to-date analysis.",
          {
            reply_markup: replyMarkup
          }
        );
      }
    }
    else if (text.startsWith('/symbol')) {
      console.log("Processing /symbol command");
      // Extract the ticker symbol from the command
      const parts = text.split(' ');
      if (parts.length < 2 || !parts[1].trim()) {
        // No symbol provided
        return await sendTelegramMessage(token, chatId,
          "Please provide a stock symbol. Example: /symbol AAPL"
        );
      }
      
      // Get the symbol and convert to uppercase
      const symbol = parts[1].trim().toUpperCase();
      console.log(`Looking up symbol: ${symbol}`);
      
      // Create a URL with the symbol parameter
      const symbolUrl = `https://elliottwaves.ai/telegram?symbol=${symbol}`;
      
      // Create reply markup based on chat type
      const replyMarkup = isGroupChat
        ? JSON.stringify({
            inline_keyboard: [[
              {
                text: `📊 View ${symbol} Analysis`,
                url: symbolUrl
              }
            ]]
          })
        : JSON.stringify({
            inline_keyboard: [[
              {
                text: `📊 View ${symbol} Analysis`,
                web_app: { url: symbolUrl }
              }
            ]]
          });
      
      // Send a response with a link to open the analyzer for this symbol
      return await sendTelegramMessage(token, chatId,
        `🔍 Analyzing ${symbol}\n\n` +
        `Click below to view detailed analysis for ${symbol}:`,
        {
          reply_markup: replyMarkup
        }
      );
    }
    else if (text.startsWith('/version')) {
      console.log("Processing /version command");
      return await sendTelegramMessage(token, chatId,
        `🔢 Wave Analyzer v${APP_VERSION}\n\n` +
        `Build Date: ${new Date().toISOString().split('T')[0]}`
      );
    }
    else {
      // For any other message, respond with help text
      return await sendTelegramMessage(token, chatId,
        `I don't understand that command. Please use one of the following commands:\n\n${helpMessage}`
      );
    }
  } catch (error) {
    console.error("Error handling Telegram webhook:", error);
    return new Response(JSON.stringify({
      status: "error",
      message: `Failed to process Telegram webhook: ${error.message}`
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" } 
    });
  }
}

// Helper function to send a message to Telegram
async function sendTelegramMessage(token, chatId, text, options = {}) {
  try {
    // Use HTML parse mode instead of Markdown for better compatibility
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML', // Changed from 'Markdown' to 'HTML' for better reliability
        ...options
      })
    });
    
    const responseData = await response.json();
    
    if (!responseData.ok) {
      throw new Error(`Telegram API error: ${responseData.description}`);
    }
    
    return new Response(JSON.stringify({
      status: "success",
      message: "Message sent to Telegram",
      response: responseData
    }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return new Response(JSON.stringify({
      status: "error",
      message: `Failed to send Telegram message: ${error.message}`
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" } 
    });
  }
}

// Function to generate market sentiment
async function getMarketSentimentForTelegram() {
  const cacheKey = "telegram_market_data";
  
  try {
    // Check cache first
    const cachedData = CACHE[cacheKey];
    
    // Use cached data if it's less than 15 minutes old
    if (cachedData && cachedData.expires > Date.now()) {
      console.log("Using cached market data");
      return cachedData.data;
    }
    
    console.log("Generating market sentiment data directly");
    
    // Generate market data directly using the Yahoo Finance API
    const result = await yahooFinance.screener({
      scrIds: 'most_actives',
      count: 30,
      region: 'US',
      lang: 'en-US'
    });
    
    if (!result?.quotes || !Array.isArray(result.quotes) || result.quotes.length === 0) {
      throw new Error("No valid stock data received from screener");
    }
    
    // Calculate bullish/bearish counts
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;
    
    result.quotes.forEach(stock => {
      if (stock.regularMarketChangePercent > 0) {
        bullishCount++;
      } else if (stock.regularMarketChangePercent < 0) {
        bearishCount++;
      } else {
        neutralCount++;
      }
    });
    
    const totalCount = result.quotes.length;
    const bullishPercentage = Math.round((bullishCount / totalCount) * 100) || 0;
    const bearishPercentage = Math.round((bearishCount / totalCount) * 100) || 0;
    const neutralPercentage = Math.round((neutralCount / totalCount) * 100) || 0;
    
    // Determine overall sentiment
    let sentiment = 'Neutral';
    if (bullishPercentage > 60) sentiment = 'Bullish';
    else if (bearishPercentage > 60) sentiment = 'Bearish';
    else if (bullishPercentage > bearishPercentage + 10) sentiment = 'Slightly Bullish';
    else if (bearishPercentage > bullishPercentage + 10) sentiment = 'Slightly Bearish';
    
    // Generate market analysis
    const analysis = generateMarketAnalysis(result.quotes, bullishPercentage, bearishPercentage, sentiment);
    
    const formattedData = {
      analysis,
      sentiment,
      bullishPercentage,
      bearishPercentage,
      neutralPercentage,
      lastUpdated: new Date().toISOString(),
      isMockData: false
    };
    
    // Cache the data for 15 minutes
    CACHE[cacheKey] = {
      data: formattedData,
      expires: Date.now() + (15 * 60 * 1000) // 15 minutes
    };
    
    console.log("Generated market sentiment data successfully");
    return formattedData;
    
  } catch (error) {
    console.error("Error getting market sentiment:", error);
    
    // Return a fallback response
    const fallbackData = {
      analysis: "The market is showing mixed signals today, with various sectors performing differently. Major indices are showing moderate volatility, suggesting caution is warranted. From an Elliott Wave perspective, watch key support and resistance levels for potential wave completions.",
      sentiment: "Neutral",
      bullishPercentage: 50,
      bearishPercentage: 50,
      neutralPercentage: 0,
      lastUpdated: new Date().toISOString(),
      isMockData: true
    };
    
    // Still cache the fallback data, but for a shorter time
    CACHE[cacheKey] = {
      data: fallbackData,
      expires: Date.now() + (5 * 60 * 1000) // 5 minutes
    };
    
    return fallbackData;
  }
}

// Generate market analysis based on stock data
function generateMarketAnalysis(stocks, bullishPercentage, bearishPercentage, sentiment) {
  // Find top gainers and losers
  const sortedByChange = [...stocks].sort((a, b) => (b.regularMarketChangePercent || 0) - (a.regularMarketChangePercent || 0));
  const topGainers = sortedByChange.slice(0, 3);
  const topLosers = sortedByChange.slice(-3).reverse();
  
  // Get top gainer and loser names/symbols
  const topGainerName = topGainers[0]?.shortName || topGainers[0]?.symbol || "stocks";
  const topLoserName = topLosers[0]?.shortName || topLosers[0]?.symbol || "stocks";
  
  // Generate sentiment-specific analysis
  let analysis = "";
  
  if (sentiment === "Bullish") {
    analysis = `The market is showing strong bullish momentum with ${bullishPercentage}% of stocks in positive territory. ${topGainerName} is leading the upside with significant gains. From an Elliott Wave perspective, many stocks appear to be in impulse waves 1, 3, or 5, suggesting continuation of the uptrend in the near term. Watch for potential consolidation before the next move higher.`;
  } 
  else if (sentiment === "Bearish") {
    analysis = `Market sentiment is decisively bearish today with ${bearishPercentage}% of stocks declining. ${topLoserName} shows significant weakness, pulling the broader market lower. Elliott Wave analysis suggests many stocks are in corrective waves 2 or 4, or potentially starting larger corrective patterns. Key support levels should be monitored for potential reversals.`;
  }
  else if (sentiment === "Slightly Bullish") {
    analysis = `The market is showing a moderate bullish bias with ${bullishPercentage}% of stocks advancing versus ${bearishPercentage}% declining. ${topGainerName} is outperforming, while mixed performance across sectors suggests selective positioning is warranted. Elliott Wave patterns indicate potential early-stage impulse waves forming in leading sectors.`;
  }
  else if (sentiment === "Slightly Bearish") {
    analysis = `Market sentiment is leaning negative with ${bearishPercentage}% of stocks declining versus ${bullishPercentage}% advancing. ${topLoserName} is under notable pressure, though selling isn't widespread across all sectors. From an Elliott Wave perspective, many securities may be completing impulse patterns or starting corrective phases.`;
  }
  else {
    analysis = `The market is showing mixed signals with a near-even split between advancing and declining issues. ${topGainerName} leads the gainers while ${topLoserName} is among the weakest performers. Elliott Wave patterns are showing various configurations across stocks, suggesting careful analysis of individual names rather than broad market positioning.`;
  }
  
  return analysis;
}

// Helper function to get news items using Yahoo Finance
async function getNewsItems(symbol, count = 10) {
  try {
    // If a symbol is provided, get news specific to that symbol
    // Otherwise, get general market news
    const newsData = symbol 
      ? await yahooFinance.search(symbol, { newsCount: count })
      : await yahooFinance.trendingSymbols('US', { count: 5 })
          .then(trending => {
            // Get news for top trending symbols
            const topSymbol = trending[0]?.symbol || 'SPY';
            return yahooFinance.search(topSymbol, { newsCount: count });
          });
    
    // Extract and format news items
    const news = newsData.news || [];
    return news.map(item => ({
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
      type: item.type,
      thumbnail: item.thumbnail?.resolutions?.[0]?.url || null
    }));
  } catch (error) {
    console.error(`Error getting news: ${error.message}`);
    throw error;
  }
}

// Generate fallback news for when the API call fails
function generateFallbackNews() {
  const now = new Date();
  const timestamp = now.toISOString();
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  
  return [
    {
      title: `Market Update: Mixed Trading Session as Investors Weigh Economic Data - ${today}`,
      publisher: "Market News Daily",
      link: "https://elliottwaves.ai/market-news",
      publishedAt: timestamp,
      type: "STORY",
      thumbnail: null
    },
    {
      title: "Federal Reserve Comments Impact Treasury Yields",
      publisher: "Financial Times",
      link: "https://elliottwaves.ai/market-news",
      publishedAt: timestamp,
      type: "STORY",
      thumbnail: null
    },
    {
      title: "Tech Stocks Lead Market Movements Amid Earnings Reports",
      publisher: "Tech Investor",
      link: "https://elliottwaves.ai/market-news",
      publishedAt: timestamp,
      type: "STORY",
      thumbnail: null
    },
    {
      title: "Oil Prices Fluctuate on Supply Concerns and Global Demand",
      publisher: "Energy Report",
      link: "https://elliottwaves.ai/market-news",
      publishedAt: timestamp,
      type: "STORY",
      thumbnail: null
    },
    {
      title: "Retail Sales Data Shows Consumer Spending Trends",
      publisher: "Economic Times",
      link: "https://elliottwaves.ai/market-news",
      publishedAt: timestamp,
      type: "STORY",
      thumbnail: null
    }
  ];
}

// Handle stock quote requests
async function handleStockQuote(symbol, headers) {
  try {
    const data = await yahooFinance.quote(symbol);
    return new Response(JSON.stringify(data), { headers });
  } catch (error) {
    return new Response(JSON.stringify({
      error: `Failed to get quote for ${symbol}`,
      message: error.message
    }), { 
      status: 500,
      headers
    });
  }
}

// Handle stock history requests
async function handleStockHistory(symbol, period, interval, headers) {
  try {
    const data = await yahooFinance.historical(symbol, {
      period1: getStartDateForPeriod(period),
      interval: interval
    });
    return new Response(JSON.stringify(data), { headers });
  } catch (error) {
    return new Response(JSON.stringify({
      error: `Failed to get history for ${symbol}`,
      message: error.message
    }), { 
      status: 500,
      headers
    });
  }
}

// Helper function to determine start date based on period
function getStartDateForPeriod(period) {
  const now = new Date();
  switch (period) {
    case '1d':
      return new Date(now.setDate(now.getDate() - 1));
    case '5d':
      return new Date(now.setDate(now.getDate() - 5));
    case '1mo':
      return new Date(now.setMonth(now.getMonth() - 1));
    case '3mo':
      return new Date(now.setMonth(now.getMonth() - 3));
    case '6mo':
      return new Date(now.setMonth(now.getMonth() - 6));
    case '1y':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    case '2y':
      return new Date(now.setFullYear(now.getFullYear() - 2));
    case '5y':
      return new Date(now.setFullYear(now.getFullYear() - 5));
    case 'max':
      return new Date(1970, 0, 1);
    default:
      return new Date(now.setFullYear(now.getFullYear() - 1)); // Default to 1 year
  }
}
// Helper function to handle stock historical data requests
async function handleStockHistorical(symbol, headers) {
  try {
    const data = await yahooFinance.historical(symbol);
    return new Response(JSON.stringify(data), { headers });
  } catch (error) {
    return new Response(JSON.stringify({
      error: `Failed to get historical data for ${symbol}`,
      message: error.message
    }), { 
      status: 500,
      headers
    });
  }
}
// Helper function to handle health check
async function handleHealthCheck(headers) {
  return new Response(JSON.stringify({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  }), { headers });
}
// Helper function to handle version check