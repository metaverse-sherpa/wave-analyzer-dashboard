// Make sure imports are ESM-compatible
import express from 'express';
import path from 'path';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Suppress the deprecated method warning
yahooFinance.suppressNotices(['ripHistorical']);

// When using ESM, __dirname is not available, so create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { QueryOptions } from 'yahoo-finance2/dist/esm/src/modules/quote';
dotenv.config();

const app = express();

// Environment variables with defaults
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DIST_DIR = path.join(__dirname, 'dist'); // Assuming your frontend builds to 'dist'

// CORS setup
app.use(cors({
  origin: process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3000' 
    : 'https://your-production-domain.com',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// API routes
app.use('/api', (req, res, next) => {
  console.log(`API request: ${req.method} ${req.path}`);
  next();
});

interface StockHistoricalData {
  timestamp: number;
  open: number;
  high: number;
  close: number;
  low: number;
  volume: number;
}

// Define USE_MOCK_DATA flag to control data source
const USE_MOCK_DATA = process.env.ENABLE_MOCK_DATA === 'true';
const USE_CACHE = process.env.ENABLE_CACHING !== 'false';

// Simple in-memory cache with TTL
const cache: Record<string, { data: any, expires: number }> = {};

// Function to get cached data or fetch new data
async function getCachedData<T>(key: string, fetchFn: () => Promise<T>, ttlMinutes: number = 60): Promise<T> {
  const now = Date.now();
  
  // Return cached data if it exists and hasn't expired
  if (USE_CACHE && cache[key] && cache[key].expires > now) {
    console.log(`Cache hit for ${key}`);
    return cache[key].data;
  }
  
  // Fetch new data
  console.log(`Cache miss for ${key}, fetching fresh data`);
  const data = await fetchFn();
  
  // Store in cache with expiration
  if (USE_CACHE) {
    cache[key] = {
      data,
      expires: now + (ttlMinutes * 60 * 1000)
    };
  }
  
  return data;
}

// Generate mock historical data (keep for fallback)
const generateMockHistoricalData = (symbol: string, days: number = 300): StockHistoricalData[] => {
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
      volume: Math.floor(Math.random() * 10000000) + 500000
    });
  }
  
  return mockData;
};

// Mock top stock symbols
const topStockSymbols = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'LLY', 
  'JPM', 'V', 'AVGO', 'XOM', 'PG', 'MA', 'COST', 'HD', 'CVX', 'MRK'
];

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check request received');
  res.status(200).json({ 
    status: 'ok',
    message: 'API server is online',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// Stocks endpoint
app.get('/api/stocks', async (req, res) => {
  try {
    console.log('Stock request received:', req.query);
    
    const symbols = (req.query.symbols?.toString() || '').split(',');
    console.log(`Fetching data for ${symbols.length} symbols`);
    
    if (USE_MOCK_DATA) {
      // Generate mock stock data
      const quotes = symbols.map(symbol => ({
        symbol,
        shortName: `${symbol} Inc.`,
        regularMarketPrice: 100 + Math.random() * 100,
        regularMarketChange: (Math.random() * 10) - 5,
        regularMarketChangePercent: (Math.random() * 10) - 5,
        regularMarketVolume: Math.floor(Math.random() * 10000000),
        averageDailyVolume3Month: Math.floor(Math.random() * 5000000),
        marketCap: Math.floor(Math.random() * 1000000000000),
        fiftyTwoWeekLow: 50 + Math.random() * 50,
        fiftyTwoWeekHigh: 150 + Math.random() * 50,
        trailingPE: 15 + Math.random() * 20,
        forwardPE: 12 + Math.random() * 15,
        trailingAnnualDividendYield: Math.random() * 0.05
      }));
      
      console.log(`Returning ${quotes.length} mock stock quotes`);
      return res.json(quotes);
    }
    
    // Use yahoo-finance2 to get real data
    try {
      // Use the caching function to get or fetch data
      const fetchQuotes = async () => {
        const options: QueryOptions = {
          fields: [
            'shortName', 'regularMarketPrice', 'regularMarketChange', 
            'regularMarketChangePercent', 'regularMarketVolume', 'averageDailyVolume3Month',
            'marketCap', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh', 'trailingPE',
            'forwardPE', 'trailingAnnualDividendYield'
          ]
        };
        
        // Handle rate limiting with sequential requests
        const results = [];
        for (const symbol of symbols) {
          try {
            // Add a small delay between requests to avoid rate limiting
            if (results.length > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const quote = await yahooFinance.quote(symbol, options);
            results.push(quote);
          } catch (error) {
            console.error(`Error fetching quote for ${symbol}:`, error);
            // Add a placeholder for failed requests
            results.push({
              symbol,
              shortName: `${symbol} Inc.`,
              regularMarketPrice: 0,
              error: (error as Error).message
            });
          }
        }
        
        return results;
      };
      
      // Get quotes with 15 minute cache
      const quotes = await getCachedData(`stocks_${symbols.join('_')}`, fetchQuotes, 15);
      
      console.log(`Returning ${quotes.length} real stock quotes from Yahoo Finance`);
      return res.json(quotes);
    } catch (yahooError) {
      console.error('Failed to get data from Yahoo Finance:', yahooError);
      console.log('Falling back to mock data');
      
      // Fall back to mock data
      const quotes = symbols.map(symbol => ({
        symbol,
        shortName: `${symbol} Inc.`,
        regularMarketPrice: 100 + Math.random() * 100,
        regularMarketChange: (Math.random() * 10) - 5,
        regularMarketChangePercent: (Math.random() * 10) - 5,
        regularMarketVolume: Math.floor(Math.random() * 10000000),
        averageDailyVolume3Month: Math.floor(Math.random() * 5000000),
        marketCap: Math.floor(Math.random() * 1000000000000),
        fiftyTwoWeekLow: 50 + Math.random() * 50,
        fiftyTwoWeekHigh: 150 + Math.random() * 50,
        trailingPE: 15 + Math.random() * 20,
        forwardPE: 12 + Math.random() * 15,
        trailingAnnualDividendYield: Math.random() * 0.05
      }));
      
      return res.json(quotes);
    }
  } catch (error) {
    console.error('Error in /api/stocks:', error);
    res.status(500).json({ error: 'Server error', message: (error as Error).message });
  }
});

// Historical data endpoint
app.get('/api/historical', async (req, res) => {
  try {
    const symbol = req.query.symbol?.toString();
    const timeframe = req.query.timeframe?.toString() || '1d';
    
    console.log(`Historical data request for ${symbol} (${timeframe})`);
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    if (USE_MOCK_DATA) {
      // Generate mock historical data
      const data = generateMockHistoricalData(symbol, 500);
      console.log(`Generated ${data.length} mock data points for ${symbol}`);
      return res.json(data);
    }
    
    // Calculate period1 (start) and period2 (end) based on timeframe
    const now = new Date();
    const period2 = now; // End date is always now
    let period1: Date; // Start date varies based on timeframe
    
    // Calculate period1 based on timeframe - with more reasonable date ranges
    switch (timeframe) {
      case '1d':
        // For 1 day view, get 7 days of data
        period1 = new Date(now);
        period1.setDate(now.getDate() - 365);
        break;
      case '5d':
        // For 5 day view, get 14 days of data
        period1 = new Date(now);
        period1.setDate(now.getDate() - 365);
        break;
      case '1mo':
        // 1 month ago
        period1 = new Date(now);
        period1.setMonth(now.getMonth() - 12);
        break;
      case '6mo':
        // 6 months ago
        period1 = new Date(now);
        period1.setMonth(now.getMonth() - 36);
        break;
      default:
        // Default to 1 year
        period1 = new Date(now);
        period1.setFullYear(now.getFullYear() - 1);
    }
    
    try {
      const fetchHistoricalData = async () => {
        console.log(`Requesting chart data for ${symbol} from ${period1.toISOString()} to ${period2.toISOString()}`);
        
        // Add different interval for short timeframes
        const interval = (timeframe === '1d' || timeframe === '5d') ? '1d' : '1d';
        
        // Use chart() method with the appropriate options
        const chartOptions = {
          period1,
          period2
        };
        
        console.log('Chart options:', chartOptions);
        
        try {
          const result = await yahooFinance.chart(symbol, chartOptions);
          
          // Enhanced error logging
          if (!result) {
            console.error('Received empty result from Yahoo Finance');
            throw new Error('Empty response from Yahoo Finance');
          }
          
          console.log('Yahoo response structure:', Object.keys(result));
          
          if (!result.quotes) {
            console.error('Missing quotes data in response:', result);
            throw new Error('Missing quotes data in response');
          }
          
          if (result.quotes.error) {
            console.error('Quotes error:', result.quotes.error);
            throw new Error(result.quotes.error.description || 'Quotes error');
          }
          
          // Transform into the expected format
          const data = result.quotes.map(quote => ({
            timestamp: quote.date ? new Date(quote.date): null,
            open: quote.open ?? null,
            high: quote.high ?? null,
            close: quote.close ?? null,
            low: quote.low ?? null,
            volume: quote.volume ?? 0
          }))
          .filter(item => item.open !== null && item.high !== null && item.close !== null && item.low !== null);
          
          console.log(`Transformed to ${data.length} valid data points`);
          return data;
        } catch (error) {
          console.error('Error in chart request:', error);
          throw error;
        }
      };
      
      // Get historical data with caching
      const cacheTTL = timeframe === '1d' ? 15 : (timeframe === '5d' ? 30 : 60);
      const data = await getCachedData(`chart_${symbol}_${timeframe}`, fetchHistoricalData, cacheTTL);
      
      console.log(`Returning ${data.length} real chart data points for ${symbol}`);
      return res.json(data);
    } catch (yahooError) {
      console.error('Failed to get chart data from Yahoo Finance:', yahooError);
      console.log('Falling back to mock data');
      
      // Fall back to mock data
      const data = generateMockHistoricalData(symbol, 500);
      console.log(`Generated ${data.length} mock data points for ${symbol} (fallback)`);
      return res.json(data);
    }
  } catch (error) {
    console.error('Error in /api/historical:', error);
    res.status(500).json({ error: 'Server error', message: (error as Error).message });
  }
});

// Add new endpoint for historical data that matches your client paths
app.get('/api/stocks/historical/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    const timeframe = req.query.timeframe?.toString() || '1d';
    
    console.log(`Historical data request for ${symbol} (${timeframe})`);
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Skip the mock data check and always try to get real data
    // Calculate period1 (start) and period2 (end) based on timeframe
    const now = new Date();
    const period2 = now; // End date is always now
    let period1: Date; // Start date varies based on timeframe
    
    // Calculate period1 based on timeframe - use longer periods for better analysis
    switch (timeframe) {
      case '1d':
        // For 1d interval, get 2 years of data for wave analysis
        period1 = new Date(now);
        period1.setFullYear(now.getFullYear() - 2);
        break;
      case '1wk':
        // For weekly interval, get 5 years of data
        period1 = new Date(now);
        period1.setFullYear(now.getFullYear() - 5);
        break;
      case '1mo':
        // For monthly interval, get 10 years of data
        period1 = new Date(now);
        period1.setFullYear(now.getFullYear() - 10);
        break;
      default:
        // Default to 2 years
        period1 = new Date(now);
        period1.setFullYear(now.getFullYear() - 2);
    }
    
    const fetchHistoricalData = async () => {
      console.log(`Requesting Yahoo Finance chart data for ${symbol} from ${period1.toISOString()} to ${period2.toISOString()}`);
      
      // Set interval based on timeframe
      const interval = timeframe;
      
      // Use chart() method with the appropriate options
      const chartOptions = {
        period1,
        period2,
        interval
      };
      
      console.log('Yahoo Finance chart options:', chartOptions);
      
      try {
        const result = await yahooFinance.chart(symbol, chartOptions);
        
        if (!result || !result.quotes || !Array.isArray(result.quotes)) {
          console.error('Invalid response from Yahoo Finance:', result);
          throw new Error('Invalid response from Yahoo Finance chart API');
        }
        
        console.log(`Yahoo returned ${result.quotes.length} data points`);
        
        // Transform into the expected format
        const data = result.quotes
          .filter(quote => quote.open !== null && quote.high !== null && 
                          quote.close !== null && quote.low !== null)
          .map(quote => ({
            timestamp: Math.floor(new Date(quote.date).getTime() / 1000), // Convert to Unix timestamp (seconds)
            open: quote.open ?? 0,
            high: quote.high ?? 0,
            close: quote.close ?? 0,
            low: quote.low ?? 0,
            volume: quote.volume ?? 0
          }));
        
        console.log(`Transformed ${data.length} valid data points for ${symbol}`);
        return data;
      } catch (error) {
        console.error('Error in Yahoo Finance chart request:', error);
        throw error;
      }
    };
    
    // Get historical data with caching - longer cache for older timeframes
    const cacheTTL = timeframe === '1d' ? 60 : (timeframe === '1wk' ? 240 : 1440); // 1hr, 4hrs, or 1 day
    const cacheKey = `historical_${symbol}_${timeframe}`;
    
    try {
      const data = await getCachedData(cacheKey, fetchHistoricalData, cacheTTL);
      
      console.log(`Returning ${data.length} real data points for ${symbol}`);
      return res.json(data);
      
    } catch (yahooError) {
      console.error('Failed to get data from Yahoo Finance:', yahooError);
      
      // Only fall back to mock data if real data fetch fails
      console.log('Falling back to mock data due to Yahoo Finance API error');
      const mockData = generateMockHistoricalData(symbol, 500);
      console.log(`Generated ${mockData.length} mock data points as fallback`);
      return res.json(mockData);
    }
    
  } catch (error) {
    console.error('Error in /api/stocks/historical:', error);
    res.status(500).json({ error: 'Server error', message: (error as Error).message });
  }
});

// Update the top stocks endpoint to use Yahoo Finance screener
app.get('/api/stocks/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit?.toString() || '20', 10);
    
    // Use cached data or fetch from Yahoo Finance
    const fetchTopStocks = async () => {
      console.log(`Fetching top ${limit} most active stocks from Yahoo Finance`);
      
      try {
        // Correct options format with scrIds instead of screenerType
        const queryOptions = { 
          scrIds: 'most_actives', 
          count: limit,
          region: 'US',
          lang: 'en-US'
        };
        
        const result = await yahooFinance.screener(queryOptions);
        
        if (!result?.quotes || !Array.isArray(result.quotes)) {
          console.error('Invalid response format from Yahoo Finance screener:', result);
          throw new Error('Invalid response format from screener API');
        }
        
        console.log(`Retrieved ${result.quotes.length} stocks from screener`);
        
        // Transform to expected format
        return result.quotes.map(quote => ({
          symbol: quote.symbol,
          shortName: quote.shortName || `${quote.symbol} Inc.`,
          regularMarketPrice: quote.regularMarketPrice || 0,
          regularMarketChange: quote.regularMarketChange || 0,
          regularMarketChangePercent: quote.regularMarketChangePercent || 0,
          regularMarketVolume: quote.regularMarketVolume || 0,
          marketCap: quote.marketCap || 0,
          averageVolume: quote.averageDailyVolume3Month || quote.averageVolume || 0
        }));
      } catch (error) {
        console.error('Error fetching from Yahoo Finance screener:', error);
        
        // Fallback to predefined list when Yahoo Finance fails
        console.log('Falling back to predefined stock list');
        return topStockSymbols.slice(0, limit).map(symbol => ({
          symbol,
          shortName: `${symbol} Inc.`,
          regularMarketPrice: 100 + Math.random() * 100,
          regularMarketChange: (Math.random() * 10) - 5,
          regularMarketChangePercent: (Math.random() * 10) - 5,
          regularMarketVolume: Math.floor(Math.random() * 10000000),
          marketCap: Math.floor(Math.random() * 1000000000000),
          averageVolume: Math.floor(Math.random() * 5000000)
        }));
      }
    };
    
    // Get data with 10-minute cache TTL
    const stocks = await getCachedData(`top_stocks_${limit}`, fetchTopStocks, 10);
    
    res.json(stocks);
  } catch (error) {
    console.error('Error in /api/stocks/top:', error);
    res.status(500).json({ error: 'Server error', message: (error as Error).message });
  }
});

// Add to simple-server.ts
app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    
    if (USE_MOCK_DATA) {
      return res.json({
        symbol,
        shortName: `${symbol} Inc.`,
        regularMarketPrice: 100 + Math.random() * 100,
        regularMarketChange: (Math.random() * 10) - 5,
        regularMarketChangePercent: (Math.random() * 10) - 5,
        regularMarketVolume: Math.floor(Math.random() * 10000000),
        averageVolume: Math.floor(Math.random() * 5000000),
        marketCap: Math.floor(Math.random() * 1000000000000),
        name: `${symbol} Inc.`,
        price: 100 + Math.random() * 100,
        change: (Math.random() * 10) - 5,
        changePercent: (Math.random() * 10) - 5,
        volume: Math.floor(Math.random() * 10000000)
      });
    }
    
    // Try to get from Yahoo Finance
    const quote = await yahooFinance.quote(symbol);
    return res.json({
      symbol: quote.symbol,
      shortName: quote.shortName || quote.longName || quote.symbol,
      name: quote.shortName || quote.longName || quote.symbol,
      regularMarketPrice: quote.regularMarketPrice,
      regularMarketChange: quote.regularMarketChange,
      regularMarketChangePercent: quote.regularMarketChangePercent,
      regularMarketVolume: quote.regularMarketVolume,
      averageVolume: quote.averageVolume || quote.averageDailyVolume3Month,
      marketCap: quote.marketCap,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      volume: quote.regularMarketVolume
    });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// In production, serve the frontend static files
if (NODE_ENV === 'production') {
  console.log(`Serving static files from: ${DIST_DIR}`);
  
  // Serve static files
  app.use(express.static(DIST_DIR));
  
  // For all non-API routes, serve the index.html file
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) return next();
    
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running in ${NODE_ENV} mode at http://localhost:${PORT}`);
  console.log(`API available at ${NODE_ENV === 'production' ? '' : 'http://localhost:' + PORT}/api`);
});