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

// HTML documentation to serve at the root path
const API_DOCUMENTATION = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wave Analyzer API Documentation</title>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #2563eb;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        h2 {
            color: #1d4ed8;
            margin-top: 30px;
        }
        h3 {
            color: #1e40af;
            margin-top: 25px;
        }
        .endpoint {
            background-color: #f9fafb;
            border-left: 4px solid #2563eb;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .method {
            background-color: #2563eb;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
            margin-right: 10px;
        }
        .path {
            font-family: monospace;
            font-weight: bold;
            font-size: 1.1em;
        }
        code {
            background-color: #f1f5f9;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: monospace;
        }
        pre {
            background-color: #f1f5f9;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 10px;
            text-align: left;
        }
        th {
            background-color: #f9fafb;
            font-weight: bold;
        }
        .example-request, .example-response {
            margin-top: 10px;
        }
        .note {
            background-color: #fffbeb;
            border-left: 4px solid #f59e0b;
            padding: 10px 15px;
            margin: 15px 0;
            border-radius: 4px;
        }
        footer {
            margin-top: 50px;
            text-align: center;
            color: #6b7280;
            font-size: 0.9em;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
    </style>
</head>
<body>
    <h1>Wave Analyzer API Documentation</h1>
    
    <p>Welcome to the Wave Analyzer API documentation. This API provides access to stock market data, historical prices, and analysis tools.</p>
    
    <div class="note">
        <strong>Base URL:</strong> <code>https://api-backend.metaversesherpa.workers.dev</code>
    </div>
    
    <h2>API Health</h2>
    
    <div class="endpoint">
        <span class="method">GET</span>
        <span class="path">/health</span>
        <p>Checks if the API is operational.</p>
        
        <h4>Example Response:</h4>
        <pre>{
  "status": "ok",
  "timestamp": "2023-11-05T12:34:56.789Z"
}</pre>
    </div>

    <h2>Stock Data</h2>
    
    <div class="endpoint">
        <span class="method">GET</span>
        <span class="path">/stocks/{symbol}</span>
        <p>Retrieves detailed information about a specific stock.</p>
        
        <h4>Parameters:</h4>
        <table>
            <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
            </tr>
            <tr>
                <td>symbol</td>
                <td>string</td>
                <td>Stock ticker symbol (e.g., AAPL, MSFT)</td>
            </tr>
        </table>
        
        <h4>Example Request:</h4>
        <code>GET /stocks/AAPL</code>
        
        <h4>Example Response:</h4>
        <pre>{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "regularMarketPrice": 178.85,
  "regularMarketChange": 0.43,
  "regularMarketChangePercent": 0.24,
  "price": 178.85,
  "change": 0.43,
  "changePercent": 0.24,
  "marketCap": 2800000000000,
  "currency": "USD",
  "averageVolume": 58920000,
  "fiftyTwoWeekLow": 124.17,
  "fiftyTwoWeekHigh": 198.23,
  "trailingPE": 29.21,
  "forwardPE": 27.13,
  "dividendYield": 0.0054
}</pre>
    </div>
    
    <div class="endpoint">
        <span class="method">GET</span>
        <span class="path">/stocks/top</span>
        <p>Returns a list of top stocks based on market capitalization.</p>
        
        <h4>Query Parameters:</h4>
        <table>
            <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
            </tr>
            <tr>
                <td>limit</td>
                <td>integer</td>
                <td>20</td>
                <td>Maximum number of stocks to return</td>
            </tr>
        </table>
        
        <h4>Example Request:</h4>
        <code>GET /stocks/top?limit=10</code>
        
        <h4>Example Response:</h4>
        <pre>[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "regularMarketPrice": 178.85,
    "regularMarketChange": 0.43,
    "regularMarketChangePercent": 0.24,
    "price": 178.85,
    "change": 0.43,
    "changePercent": 0.24,
    "marketCap": 2800000000000,
    "currency": "USD",
    "averageVolume": 58920000,
    "fiftyTwoWeekLow": 124.17,
    "fiftyTwoWeekHigh": 198.23,
    "trailingPE": 29.21,
    "forwardPE": 27.13,
    "dividendYield": 0.0054
  },
  ...
]</pre>
    </div>
    
    <div class="endpoint">
        <span class="method">GET</span>
        <span class="path">/quotes</span>
        <p>Fetches quotes for multiple stock symbols.</p>
        
        <h4>Query Parameters:</h4>
        <table>
            <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
            </tr>
            <tr>
                <td>symbols</td>
                <td>string</td>
                <td>Comma-separated list of stock ticker symbols (e.g., AAPL,MSFT,GOOGL)</td>
            </tr>
        </table>
        
        <h4>Example Request:</h4>
        <code>GET /quotes?symbols=AAPL,MSFT,GOOGL</code>
        
        <h4>Example Response:</h4>
        <pre>[
  {
    "symbol": "AAPL",
    "price": 178.85,
    "change": 0.43,
    "changePercent": 0.24,
    "volume": 58920000,
    "marketCap": 2800000000000
  },
  {
    "symbol": "MSFT",
    "price": 305.22,
    "change": -1.15,
    "changePercent": -0.38,
    "volume": 23450000,
    "marketCap": 2300000000000
  },
  ...
]</pre>
    </div>
    
    <h2>Historical Data</h2>
    
    <div class="endpoint">
        <span class="method">GET</span>
        <span class="path">/history/{symbol}</span>
        <p>Retrieves historical price data for a specific stock.</p>
        
        <h4>Parameters:</h4>
        <table>
            <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
            </tr>
            <tr>
                <td>symbol</td>
                <td>string</td>
                <td>Stock ticker symbol (e.g., AAPL, MSFT)</td>
            </tr>
        </table>
        
        <h4>Query Parameters:</h4>
        <table>
            <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
            </tr>
            <tr>
                <td>timeframe</td>
                <td>string</td>
                <td>2y</td>
                <td>Timeframe for historical data (e.g., 1d, 1mo, 1y)</td>
            </tr>
            <tr>
                <td>interval</td>
                <td>string</td>
                <td>1d</td>
                <td>Data interval (e.g., 1d, 1wk, 1mo)</td>
            </tr>
        </table>
        
        <h4>Example Request:</h4>
        <code>GET /history/AAPL?timeframe=1y&interval=1d</code>
        
        <h4>Example Response:</h4>
        <pre>[
  {
    "timestamp": 1633046400,
    "open": 142.47,
    "high": 144.38,
    "close": 141.50,
    "low": 141.27,
    "volume": 89000000
  },
  ...
]</pre>
    </div>
    
    <footer>
        <p>&copy; 2023 Wave Analyzer. All rights reserved.</p>
    </footer>
</body>
</html>
`;

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

      // Serve API documentation at the root path
      if (path === '' || path === '/') {
        return new Response(API_DOCUMENTATION, { 
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          }
        });
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
          
          // First, get favorites from KV/cache
          const favoritesData = await getCachedData('favorite_stocks', env);
          const favorites = favoritesData || [];
          
          // Add favorites first
          for (const symbol of favorites) {
            try {
              const quote = await yahooFinance.quote(symbol);
              if (quote && quote.regularMarketPrice) {
                seenSymbols.add(symbol);
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
            } catch (error) {
              console.warn(`Error fetching favorite ${symbol}:`, error);
            }
          }
          
          // Then proceed with screener calls
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

      // Individual stock endpoint - add this before the "Handle unknown endpoints" section
      if (path.startsWith('/stocks/') && !path.includes('/history') && !path.includes('/historical') && path !== '/stocks/top') {
        try {
          const symbol = path.split('/stocks/')[1].split('?')[0].toUpperCase();
          if (!symbol) {
            throw new Error('No symbol provided');
          }
          
          console.log(`Fetching quote data for ${symbol}`);
          
          // Try to get from cache first with a short TTL
          const cacheKey = `stock_quote_${symbol}`;
          const cachedData = await getCachedData(cacheKey, env);
          
          if (cachedData) {
            return new Response(JSON.stringify(cachedData), { headers });
          }
          
          // Get the quote summary for more detailed information
          const quoteSummary = await yahooFinance.quoteSummary(symbol, {
            modules: [
              'price', 
              'summaryDetail',
              'defaultKeyStatistics',
              'financialData'
            ]
          });
          
          if (!quoteSummary || !quoteSummary.price) {
            throw new Error(`No data returned for ${symbol}`);
          }
          
          // Format the response - combine useful data from different modules
          const stockData = {
            symbol: symbol,
            regularMarketPrice: quoteSummary.price.regularMarketPrice,
            regularMarketChange: quoteSummary.price.regularMarketChange,
            regularMarketChangePercent: quoteSummary.price.regularMarketChangePercent,
            regularMarketVolume: quoteSummary.price.regularMarketVolume,
            regularMarketDayHigh: quoteSummary.price.regularMarketDayHigh,
            regularMarketDayLow: quoteSummary.price.regularMarketDayLow,
            regularMarketOpen: quoteSummary.price.regularMarketOpen,
            regularMarketPreviousClose: quoteSummary.price.regularMarketPreviousClose,
            marketCap: quoteSummary.price.marketCap,
            name: quoteSummary.price.shortName || quoteSummary.price.longName,
            currency: quoteSummary.price.currency,
            
            // Add more fields from other modules
            averageVolume: quoteSummary.summaryDetail?.averageVolume,
            fiftyTwoWeekLow: quoteSummary.summaryDetail?.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: quoteSummary.summaryDetail?.fiftyTwoWeekHigh,
            trailingPE: quoteSummary.summaryDetail?.trailingPE,
            forwardPE: quoteSummary.summaryDetail?.forwardPE,
            dividendYield: quoteSummary.summaryDetail?.dividendYield,
            
            // From finance data section
            recommendationMean: quoteSummary.financialData?.recommendationMean,
            targetMeanPrice: quoteSummary.financialData?.targetMeanPrice,
            
            // Make data easily accessible with common field names for UI consistency
            price: quoteSummary.price.regularMarketPrice,
            change: quoteSummary.price.regularMarketChange,
            changePercent: quoteSummary.price.regularMarketChangePercent
          };
          
          // Cache the results for 5 minutes
          await setCachedData(cacheKey, stockData, env, 60 * 5);
          
          console.log(`Successfully fetched and returning data for ${symbol}`);
          return new Response(JSON.stringify(stockData), { headers });
          
        } catch (error) {
          console.error(`Error fetching stock data: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch stock data',
            message: error.message
          }), { 
            status: 500, 
            headers 
          });
        }
      }

      // You can also add a batch quotes endpoint to improve efficiency for multiple symbols
      if (path === '/quotes' || path.startsWith('/quotes?')) {
        try {
          const symbols = url.searchParams.get('symbols');
          if (!symbols) {
            throw new Error('No symbols provided');
          }
          
          const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
          console.log(`Fetching quotes for ${symbolList.length} symbols`);
          
          const quotes = await yahooFinance.quote(symbolList);
          
          // Transform the response to a consistent format
          const formattedQuotes = Array.isArray(quotes) 
            ? quotes.map(quote => ({
                symbol: quote.symbol,
                price: quote.regularMarketPrice,
                change: quote.regularMarketChange,
                changePercent: quote.regularMarketChangePercent,
                volume: quote.regularMarketVolume,
                marketCap: quote.marketCap
              }))
            : [{
                symbol: quotes.symbol,
                price: quotes.regularMarketPrice,
                change: quotes.regularMarketChange,
                changePercent: quotes.regularMarketChangePercent,
                volume: quotes.regularMarketVolume,
                marketCap: quotes.marketCap
              }];
          
          return new Response(JSON.stringify(formattedQuotes), { headers });
          
        } catch (error) {
          console.error(`Error fetching batch quotes: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch quotes',
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