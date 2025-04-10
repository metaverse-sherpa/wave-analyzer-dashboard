import yahooFinance from 'yahoo-finance2';

// Update your corsHeaders constant
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // In production, restrict to your domain
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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

// Add this near the top with other constants
// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_MINI_APP_URL = 'https://wave-analyzer-dashboard.pages.dev/telegram';

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

      // Serve API documentation at the root path
      if (path === '' || path === '/') {
        return new Response(API_DOCUMENTATION, { 
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Add this to fix the Telegram token endpoint
      // Token retrieval handler
      if (path === '/get-telegram-token') {
        return handleGetTelegramToken(request, env);
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

      // Move this more specific route BEFORE the general stock endpoint handler
      // Stock insights endpoint - move this before the individual stock endpoint
      if (path.match(/\/stocks\/[A-Za-z0-9\.-]+\/insights/)) {
        try {
          // Extract symbol from path
          const matches = path.match(/\/stocks\/([A-Za-z0-9\.-]+)\/insights/);
          if (!matches || !matches[1]) {
            throw new Error('Invalid symbol in URL');
          }
          
          const symbol = matches[1].toUpperCase();
          console.log(`Processing insights request for symbol: ${symbol}`);
          
          // Check if we have cached insights for this symbol
          const cacheKey = `insights_${symbol}`;
          const cachedData = await getCachedData(cacheKey, env);
          
          if (cachedData) {
            console.log(`Returning cached insights for ${symbol}`);
            return new Response(JSON.stringify(cachedData), { headers });
          }
          
          console.log(`Fetching fresh insights for ${symbol}`);
          
          try {
            // First try the proper insights method with correct parameters
            console.log(`Calling insights API for ${symbol} with proper params`);
            
            const insights = await yahooFinance.insights(symbol, {
              lang: 'en-US',
              region: 'US',
              modules: ['recommendationTrend', 'financialData', 'earningsHistory', 'earningsTrend']
            });
            
            console.log(`Got insights response for ${symbol}`);
            
            // Format the response to match expected structure
            const formattedInsights = {
              technicalInsights: insights?.technicalInsights || {
                rating: "NEUTRAL",
                score: 5
              },
              insightsText: insights?.recommendation?.map(rec => ({
                text: rec.text || '',
                score: rec.score || 0,
                period: rec.period || ''
              })) || []
            };
            
            // Cache the results for 2 hours
            await setCachedData(cacheKey, formattedInsights, env, 2 * 60 * 60);
            
            console.log(`Successfully fetched insights for ${symbol}`);
            return new Response(JSON.stringify(formattedInsights), { headers });
            
          } catch (yahooError) {
            console.error(`Yahoo Finance insights API error: ${yahooError.message}`);
            console.log(`Falling back to quoteSummary for ${symbol}`);
            
            // Fallback to quoteSummary if insights API fails
            try {
              const quoteSummary = await yahooFinance.quoteSummary(symbol, {
                modules: [
                  'price',
                  'summaryDetail', 
                  'financialData',
                  'recommendationTrend',
                  'upgradeDowngradeHistory',
                  'earnings',
                  'defaultKeyStatistics'
                ]
              });
              
              // Create insights structure from quoteSummary data
              const formattedInsights = {
                technicalInsights: {
                  rating: quoteSummary.financialData?.recommendationMean < 3 ? "BULLISH" : "BEARISH",
                  score: parseFloat((5 - (quoteSummary.financialData?.recommendationMean || 3)).toFixed(1))
                },
                insightsText: []
              };
              
              // Add recommendation insights
              if (quoteSummary.recommendationTrend?.trend && 
                  Array.isArray(quoteSummary.recommendationTrend.trend) && 
                  quoteSummary.recommendationTrend.trend.length > 0) {
                
                const trend = quoteSummary.recommendationTrend.trend[0]; // Most recent
                
                formattedInsights.insightsText.push({
                  text: `Analyst consensus for ${symbol}: ${trend.buy + trend.strongBuy} buy, ${trend.hold} hold, and ${trend.sell + trend.strongSell} sell recommendations.`,
                  score: ((trend.buy + trend.strongBuy) / (trend.buy + trend.strongBuy + trend.hold + trend.sell + trend.strongSell)) || 0.5,
                  period: "current"
                });
              }
              
              // Add price target insights
              if (quoteSummary.financialData?.targetMeanPrice && 
                  quoteSummary.price?.regularMarketPrice) {
                
                const targetPrice = quoteSummary.financialData.targetMeanPrice;
                const currentPrice = quoteSummary.price.regularMarketPrice;
                const percentDiff = ((targetPrice / currentPrice) - 1) * 100;
                const direction = percentDiff >= 0 ? "upside" : "downside";
                
                formattedInsights.insightsText.push({
                  text: `Analysts set average price target of $${targetPrice.toFixed(2)} for ${symbol}, suggesting ${Math.abs(percentDiff).toFixed(1)}% ${direction} potential.`,
                  score: percentDiff > 0 ? 0.7 : 0.3,
                  period: "12mo"
                });
              }
              
              // Add market momentum insight
              if (quoteSummary.price?.regularMarketChangePercent) {
                const changePercent = quoteSummary.price.regularMarketChangePercent;
                let momentum = "neutral";
                
                if (changePercent > 2) momentum = "strong positive";
                else if (changePercent > 0.5) momentum = "positive";
                else if (changePercent < -2) momentum = "strong negative";
                else if (changePercent < -0.5) momentum = "negative";
                
                formattedInsights.insightsText.push({
                  text: `${symbol} is showing ${momentum} momentum with ${Math.abs(changePercent).toFixed(2)}% ${changePercent >= 0 ? 'gain' : 'loss'} today.`,
                  score: (changePercent + 5) / 10, // Convert to 0-1 scale centered around 0.5
                  period: "1d"
                });
              }
              
              // Cache the results from fallback for a shorter time
              await setCachedData(cacheKey, formattedInsights, env, 30 * 60); // 30 minutes
              
              console.log(`Successfully built insights for ${symbol} using quoteSummary data`);
              return new Response(JSON.stringify(formattedInsights), { headers });
            } catch (fallbackError) {
              console.error(`Fallback also failed for ${symbol}: ${fallbackError.message}`);
              throw fallbackError; // rethrow to be handled by outer catch
            }
          }
        } catch (error) {
          console.error(`Error in insights endpoint: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch stock insights',
            message: error.message
          }), { 
            status: 500, 
            headers 
          });
        }
      }

      // THEN keep the existing individual stock endpoint handler
      // Individual stock endpoint - AFTER the insights endpoint
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

      // Add these handlers within your main fetch handler function

      // Market news endpoint
      if (path === '/market/news' || path.startsWith('/market/news?')) {
        try {
          // Fetch market news from Yahoo Finance
          const newsData = await yahooFinance.search('Market', { newsCount: 5 });
          
          if (newsData && newsData.news && Array.isArray(newsData.news)) {
            console.log(`Returning ${newsData.news.length} market news items`);
            
            // Format the news data
            const formattedNews = newsData.news.map(item => ({
              title: item.title,
              publisher: item.publisher,
              link: item.link,
              publishedAt: item.providerPublishTime
            }));
            
            return new Response(JSON.stringify(formattedNews), { headers });
          } else {
            throw new Error('No news data returned');
          }
        } catch (error) {
          console.error(`Error fetching market news: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch market news',
            message: error.message
          }), { status: 500, headers });
        }
      }

      // Stock insights endpoint - update this implementation
      if (path.match(/\/stocks\/[A-Za-z0-9\.-]+\/insights/)) {
        try {
          // Extract symbol from path
          const matches = path.match(/\/stocks\/([A-Za-z0-9\.-]+)\/insights/);
          if (!matches || !matches[1]) {
            throw new Error('Invalid symbol in URL');
          }
          
          const symbol = matches[1].toUpperCase();
          console.log(`Processing insights request for symbol: ${symbol}`);
          
          // Check if we have cached insights for this symbol
          const cacheKey = `insights_${symbol}`;
          const cachedData = await getCachedData(cacheKey, env);
          
          if (cachedData) {
            console.log(`Returning cached insights for ${symbol}`);
            return new Response(JSON.stringify(cachedData), { headers });
          }
          
          console.log(`Fetching fresh insights for ${symbol}`);
          
          try {
            // First try the proper insights method with correct parameters
            console.log(`Calling insights API for ${symbol} with proper params`);
            
            const insights = await yahooFinance.insights(symbol, {
              lang: 'en-US',
              region: 'US',
              modules: ['recommendationTrend', 'financialData', 'earningsHistory', 'earningsTrend']
            });
            
            console.log(`Got insights response for ${symbol}`);
            
            // Format the response to match expected structure
            const formattedInsights = {
              technicalInsights: insights?.technicalInsights || {
                rating: "NEUTRAL",
                score: 5
              },
              insightsText: insights?.recommendation?.map(rec => ({
                text: rec.text || '',
                score: rec.score || 0,
                period: rec.period || ''
              })) || []
            };
            
            // Cache the results for 2 hours
            await setCachedData(cacheKey, formattedInsights, env, 2 * 60 * 60);
            
            console.log(`Successfully fetched insights for ${symbol}`);
            return new Response(JSON.stringify(formattedInsights), { headers });
            
          } catch (yahooError) {
            console.error(`Yahoo Finance insights API error: ${yahooError.message}`);
            console.log(`Falling back to quoteSummary for ${symbol}`);
            
            // Fallback to quoteSummary if insights API fails
            try {
              const quoteSummary = await yahooFinance.quoteSummary(symbol, {
                modules: [
                  'price',
                  'summaryDetail', 
                  'financialData',
                  'recommendationTrend',
                  'upgradeDowngradeHistory',
                  'earnings',
                  'defaultKeyStatistics'
                ]
              });
              
              // Create insights structure from quoteSummary data
              const formattedInsights = {
                technicalInsights: {
                  rating: quoteSummary.financialData?.recommendationMean < 3 ? "BULLISH" : "BEARISH",
                  score: parseFloat((5 - (quoteSummary.financialData?.recommendationMean || 3)).toFixed(1))
                },
                insightsText: []
              };
              
              // Add recommendation insights
              if (quoteSummary.recommendationTrend?.trend && 
                  Array.isArray(quoteSummary.recommendationTrend.trend) && 
                  quoteSummary.recommendationTrend.trend.length > 0) {
                
                const trend = quoteSummary.recommendationTrend.trend[0]; // Most recent
                
                formattedInsights.insightsText.push({
                  text: `Analyst consensus for ${symbol}: ${trend.buy + trend.strongBuy} buy, ${trend.hold} hold, and ${trend.sell + trend.strongSell} sell recommendations.`,
                  score: ((trend.buy + trend.strongBuy) / (trend.buy + trend.strongBuy + trend.hold + trend.sell + trend.strongSell)) || 0.5,
                  period: "current"
                });
              }
              
              // Add price target insights
              if (quoteSummary.financialData?.targetMeanPrice && 
                  quoteSummary.price?.regularMarketPrice) {
                
                const targetPrice = quoteSummary.financialData.targetMeanPrice;
                const currentPrice = quoteSummary.price.regularMarketPrice;
                const percentDiff = ((targetPrice / currentPrice) - 1) * 100;
                const direction = percentDiff >= 0 ? "upside" : "downside";
                
                formattedInsights.insightsText.push({
                  text: `Analysts set average price target of $${targetPrice.toFixed(2)} for ${symbol}, suggesting ${Math.abs(percentDiff).toFixed(1)}% ${direction} potential.`,
                  score: percentDiff > 0 ? 0.7 : 0.3,
                  period: "12mo"
                });
              }
              
              // Add market momentum insight
              if (quoteSummary.price?.regularMarketChangePercent) {
                const changePercent = quoteSummary.price.regularMarketChangePercent;
                let momentum = "neutral";
                
                if (changePercent > 2) momentum = "strong positive";
                else if (changePercent > 0.5) momentum = "positive";
                else if (changePercent < -2) momentum = "strong negative";
                else if (changePercent < -0.5) momentum = "negative";
                
                formattedInsights.insightsText.push({
                  text: `${symbol} is showing ${momentum} momentum with ${Math.abs(changePercent).toFixed(2)}% ${changePercent >= 0 ? 'gain' : 'loss'} today.`,
                  score: (changePercent + 5) / 10, // Convert to 0-1 scale centered around 0.5
                  period: "1d"
                });
              }
              
              // Cache the results from fallback for a shorter time
              await setCachedData(cacheKey, formattedInsights, env, 30 * 60); // 30 minutes
              
              console.log(`Successfully built insights for ${symbol} using quoteSummary data`);
              return new Response(JSON.stringify(formattedInsights), { headers });
            } catch (fallbackError) {
              console.error(`Fallback also failed for ${symbol}: ${fallbackError.message}`);
              throw fallbackError; // rethrow to be handled by outer catch
            }
          }
        } catch (error) {
          console.error(`Error in insights endpoint: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to fetch stock insights',
            message: error.message
          }), { 
            status: 500, 
            headers 
          });
        }
      }

      // Add this new route handler in your fetch function
      if (path === '/telegram/webhook') {
        console.log("Received request to Telegram webhook endpoint");
        return handleTelegramWebhook(request, env);
      }

      // Test endpoint for basic API functionality verification
      if (path === '/test-api') {
        return new Response(JSON.stringify({
          status: 'ok',
          message: 'API is functioning correctly',
          timestamp: new Date().toISOString(),
          path: path,
          url: request.url
        }), { headers });
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
        try {
          return JSON.parse(data);
        } catch (jsonError) {
          console.error(`Error parsing cached data for ${key}: ${jsonError.message}`);
        }
      }
    } catch (kvError) {
      console.error(`KV read error for ${key}: ${kvError.message}`);
    }
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
      const serialized = JSON.stringify(data);
      await env.CACHE_STORAGE.put(key, serialized, {expirationTtl: ttlSeconds});
      console.log(`Cached ${key} in KV storage (${serialized.length} bytes)`);
    } catch (kvError) {
      console.error(`KV write error for ${key}: ${kvError.message}`);
      // Fall back to memory cache on KV failure
      setMemoryCache(key, data, ttlSeconds);
    }
  } else {
    // Memory cache fallback
    setMemoryCache(key, data, ttlSeconds);
  }
}

function setMemoryCache(key, data, ttlSeconds) {
  CACHE[key] = {
    data: data,
    expires: Date.now() + (ttlSeconds * 1000)
  };
  console.log(`Cached ${key} in memory cache (expires in ${ttlSeconds}s)`);
  
  // Periodically clean memory cache
  cleanMemoryCache();
}

function cleanMemoryCache() {
  const now = Date.now();
  let removedCount = 0;
  
  for (const key in CACHE) {
    if (CACHE[key].expires < now) {
      delete CACHE[key];
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} expired items from memory cache`);
  }
}

/**
 * Generate technical rating based on available data
 */
function generateTechnicalRating(quoteSummary) {
  try {
    // Use multiple signals to determine the rating
    let bullishSignals = 0;
    let bearishSignals = 0;
    
    // Price momentum
    if (quoteSummary.price?.regularMarketChangePercent > 0) bullishSignals++;
    else bearishSignals++;
    
    // Target price
    if (quoteSummary.financialData?.targetMeanPrice > quoteSummary.price?.regularMarketPrice) bullishSignals++;
    else bearishSignals++;
    
    // Analyst recommendations
    if (quoteSummary.recommendationTrend?.trend?.[0]) {
      const trend = quoteSummary.recommendationTrend.trend[0];
      if (trend.buy + trend.strongBuy > trend.sell + trend.strongSell) bullishSignals++;
      else bearishSignals++;
    }
    
    // PE ratio vs growth
    if (quoteSummary.defaultKeyStatistics?.pegRatio && 
        quoteSummary.defaultKeyStatistics.pegRatio < 1.5) bullishSignals++;
    else bearishSignals++;
    
    // Determine the rating
    if (bullishSignals >= 3) return "BULLISH";
    else if (bearishSignals >= 3) return "BEARISH";
    else if (bullishSignals > bearishSignals) return "NEUTRAL_BULLISH";
    else if (bearishSignals > bullishSignals) return "NEUTRAL_BEARISH";
    else return "NEUTRAL";
    
  } catch (err) {
    console.log("Error generating technical rating:", err);
    return "NEUTRAL"; // Default fallback
  }
}

/**
 * Calculate a numerical score for the stock (0-10)
 */
function calculateScore(quoteSummary) {
  try {
    // Start with a neutral score
    let score = 5;
    
    // Adjust based on recommendation mean (1-5 scale)
    if (quoteSummary.financialData?.recommendationMean) {
      // Convert 1-5 scale (where 1 is strong buy) to 0-5 addition to our score
      score += (5 - quoteSummary.financialData.recommendationMean);
    }
    
    // Adjust based on price momentum (-2 to +2)
    if (quoteSummary.price?.regularMarketChangePercent) {
      // Add between -2 and +2 based on price change
      score += Math.min(Math.max(quoteSummary.price.regularMarketChangePercent / 5, -2), 2);
    }
    
    // Adjust based on target price potential (-1 to +1)
    if (quoteSummary.financialData?.targetMeanPrice && quoteSummary.price?.regularMarketPrice) {
      const targetPrice = quoteSummary.financialData.targetMeanPrice;
      const currentPrice = quoteSummary.price.regularMarketPrice;
      const percentDiff = ((targetPrice / currentPrice) - 1) * 100;
      
      // Add between -1 and +1 based on target price difference
      score += Math.min(Math.max(percentDiff / 20, -1), 1);
    }
    
    // Ensure score is between 0 and 10
    return Math.min(Math.max(score, 0), 10).toFixed(1);
    
  } catch (err) {
    console.log("Error calculating score:", err);
    return 5; // Default neutral score
  }
}

/**
 * Calculate sentiment score from recommendation trend
 */
function calculateSentimentScore(trend) {
  try {
    if (!trend) return 0.5; // Neutral default
    
    const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell;
    if (total === 0) return 0.5;
    
    // Calculate a score between 0-1 where 1 is very bullish
    const score = (trend.strongBuy * 1 + trend.buy * 0.75 + trend.hold * 0.5 + 
                   trend.sell * 0.25 + trend.strongSell * 0) / total;
                   
    return score;
  } catch (err) {
    return 0.5; // Neutral default
  }
}

/**
 * Get score based on analyst rating
 */
function getRatingScore(rating) {
  const ratingScores = {
    'Strong Buy': 0.9,
    'Buy': 0.7,
    'Outperform': 0.7,
    'Overweight': 0.7,
    'Neutral': 0.5,
    'Hold': 0.5,
    'Equal-Weight': 0.5,
    'Market Perform': 0.5,
    'Underperform': 0.3,
    'Underweight': 0.3,
    'Sell': 0.2,
    'Strong Sell': 0.1
  };
  
  return ratingScores[rating] || 0.5;
}

// Add improved Telegram webhook handler to replace the existing implementation
async function handleTelegramWebhook(request, env) {
  try {
    console.log("Telegram webhook handler called with URL:", request.url);
    
    // Check if token is available - add detailed logging
    const token = env?.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is not configured. env:", JSON.stringify({
        hasEnv: !!env,
        hasTelegramBotToken: !!(env && env.TELEGRAM_BOT_TOKEN),
        hasDefaultToken: !!TELEGRAM_BOT_TOKEN,
      }));
      return new Response(JSON.stringify({
        status: "error", 
        message: "Telegram bot token not configured. Please set TELEGRAM_BOT_TOKEN environment variable."
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      });
    }
    
    console.log("Using bot token starting with:", token.substring(0, 5) + "...");
    
    // Parse the incoming request JSON
    let payload;
    try {
      payload = await request.json();
      console.log("Parsed webhook payload:", JSON.stringify(payload));
    } catch (error) {
      console.error("Failed to parse webhook payload:", error);
      return new Response(JSON.stringify({
        status: "error",
        message: "Invalid JSON payload"
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Extract message details
    if (!payload.message) {
      console.log("No message in webhook payload");
      return new Response(JSON.stringify({
        status: "ok",
        message: "No message in payload"
      }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const chatId = payload.message.chat.id;
    const text = payload.message.text || '';
    const username = payload.message.from ? 
      (payload.message.from.username || payload.message.from.first_name || 'there') : 
      'there';
    
    console.log(`Received message "${text}" from ${username} in chat ${chatId}`);
    
    // Process commands
    if (text.startsWith('/start')) {
      console.log("Processing /start command");
      return await sendTelegramMessage(token, chatId, 
        `👋 Welcome to the Wave Analyzer Bot, ${username}!\n\n` +
        "I can help you analyze stocks and market indices using Elliott Wave theory.\n\n" +
        "🔍 Use our Mini App for full functionality:\n" +
        "👉 /analyze - Open the Wave Analyzer Mini App\n" +
        "📊 /market - Get current market overview",
        {
          parse_mode: "Markdown",
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                {
                  text: "🔍 Open Wave Analyzer",
                  web_app: { url: "https://wave-analyzer-dashboard.pages.dev/telegram" }
                }
              ]
            ]
          })
        }
      );
    }
    else if (text.startsWith('/help')) {
      console.log("Processing /help command");
      return await sendTelegramMessage(token, chatId,
        "📚 *Wave Analyzer Bot Help*\n\n" +
        "Available commands:\n" +
        "/analyze - Open the Wave Analyzer Mini App\n" +
        "/market - Get current market overview\n" +
        "/symbol [TICKER] - Get analysis for specific symbol\n" +
        "/logout - Sign out from your current session\n" +
        "/help - Show this help message\n\n" +
        "Visit our website for more features: https://wave-analyzer-dashboard.pages.dev",
        { parse_mode: "Markdown" }
      );
    }
    else if (text.startsWith('/analyze')) {
      console.log("Processing /analyze command");
      return await sendTelegramMessage(token, chatId,
        "📊 *Wave Analyzer*\n\n" +
        "Click below to open the Wave Analyzer Mini App:",
        {
          parse_mode: "Markdown",
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                {
                  text: "🔍 Open Wave Analyzer",
                  web_app: { url: "https://wave-analyzer-dashboard.pages.dev/telegram" }
                }
              ]
            ]
          })
        }
      );
    }
    else if (text.startsWith('/market')) {
      console.log("Processing /market command");
      return await sendTelegramMessage(token, chatId,
        "📈 *Market Overview*\n\n" +
        "Getting the latest market data...\n\n" +
        "For a complete analysis, please use our Mini App by clicking /analyze",
        { parse_mode: "Markdown" }
      );
    }
    else if (text.startsWith('/logout')) {
      console.log("Processing /logout command");
      // Clear user session data
      const userId = payload.message.from.id.toString();
      
      // If using KV storage:
      if (env && env.CACHE_STORAGE) {
        try {
          await env.CACHE_STORAGE.delete(`telegram_user_${userId}`);
          console.log(`Deleted KV session data for user ${userId}`);
        } catch (kvError) {
          console.error(`Error deleting KV data: ${kvError.message}`);
        }
      }
      
      // If using in-memory cache:
      if (CACHE[`telegram_user_${userId}`]) {
        delete CACHE[`telegram_user_${userId}`];
        console.log(`Deleted in-memory session data for user ${userId}`);
      }
      
      return await sendTelegramMessage(token, chatId, "You have been successfully logged out. Your session has been ended.");
    }
    else {
      console.log(`Received unrecognized message: "${text}"`);
      // For all other messages, prompt them to use commands
      return await sendTelegramMessage(token, chatId,
        "I'm here to help with Elliott Wave analysis! Try /start or /help to see what I can do."
      );
    }
  } catch (error) {
    console.error("Error handling Telegram webhook:", error);
    // Always return 200 OK to prevent Telegram from retrying
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `Error processed: ${error.message}` 
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Fix the sendTelegramMessage function
async function sendTelegramMessage(token, chatId, text, options = {}) {
  try {
    console.log(`Sending message to chat ${chatId}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const formData = {
      chat_id: chatId,
      text: text,
      ...options
    };
    
    console.log("Sending to Telegram API:", JSON.stringify(formData));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    console.log("Telegram API response:", JSON.stringify(result));
    
    if (!result.ok) {
      console.error("Telegram API error:", result.description);
      return new Response(JSON.stringify({
        status: "error",
        message: result.description
      }), {
        status: 200, // Still return 200 to Telegram
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Return a success response to Telegram
    return new Response(JSON.stringify({ 
      status: "success"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `Error: ${error.message}` 
    }), { 
      status: 200, // Still return 200 to Telegram
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Add this function to your worker.js file
async function handleGetTelegramToken(request, env) {
  // Check authentication - you should implement a proper auth check here
  // For example, verify API key in headers or check for session cookie
  
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({
      status: "error", 
      message: "Authentication required"
    }), { 
      status: 401,
      headers: { "Content-Type": "application/json" } 
    });
  }
  
  // In a real implementation, verify the auth token against a valid session
  // This is a simplified example
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  // Use your actual auth validation logic here
  // For example: if (!isValidToken(token)) { return unauthorized response }
  
  // Return just enough of the token to verify it's available (first few chars)
  // Never expose the full token to the frontend
  const botToken = env?.TELEGRAM_BOT_TOKEN || '';
  const tokenPreview = botToken ? 
    botToken.substring(0, 5) + '...' + botToken.substring(botToken.length - 4) : '';
  
  if (!botToken) {
    return new Response(JSON.stringify({
      status: "error", 
      message: "Token not configured"
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" } 
    });
  }
  
  return new Response(JSON.stringify({
    status: "success",
    token_available: !!botToken,
    token_preview: tokenPreview
  }), { 
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}