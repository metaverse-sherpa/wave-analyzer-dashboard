import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';
import { QueryOptions } from 'yahoo-finance2/dist/esm/src/modules/quote';

const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

interface StockHistoricalData {
  timestamp: number;
  open: number;
  high: number;
  close: number;
  low: number;
  volume: number;
}

// Define USE_MOCK_DATA flag to control data source
const USE_MOCK_DATA = false;
const USE_CACHE = true;

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
  res.status(200).json({ status: 'ok' });
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
    
    // Map timeframe to yahoo-finance2 period parameters
    let period: string;
    let interval: string;
    
    switch (timeframe) {
      case '1d':
        period = '1d';
        interval = '5m';
        break;
      case '5d':
        period = '5d';
        interval = '15m';
        break;
      case '1mo':
        period = '1mo';
        interval = '1d';
        break;
      case '6mo':
        period = '6mo';
        interval = '1d';
        break;
      case '1y':
        period = '1y';
        interval = '1d';
        break;
      case '5y':
        period = '5y';
        interval = '1wk';
        break;
      default:
        period = '1y';
        interval = '1d';
    }
    
    try {
      const fetchHistoricalData = async () => {
        const queryOptions = {
          period,
          interval
        };
        
        const result = await yahooFinance.historical(symbol, queryOptions);
        
        // Transform to expected format
        return result.map(item => ({
          timestamp: Math.floor(new Date(item.date).getTime() / 1000),
          open: item.open,
          high: item.high,
          close: item.close,
          low: item.low,
          volume: item.volume
        }));
      };
      
      // Get historical data with caching
      // Use shorter cache for shorter timeframes
      const cacheTTL = timeframe === '1d' ? 15 : (timeframe === '5d' ? 30 : 60);
      const data = await getCachedData(`historical_${symbol}_${timeframe}`, fetchHistoricalData, cacheTTL);
      
      console.log(`Returning ${data.length} real historical data points for ${symbol}`);
      return res.json(data);
    } catch (yahooError) {
      console.error('Failed to get historical data from Yahoo Finance:', yahooError);
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

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Simple API server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  - GET /api/health');
  console.log('  - GET /api/stocks?symbols=AAPL,MSFT,GOOGL');
  console.log('  - GET /api/historical?symbol=AAPL&timeframe=1d');
  console.log(`Using ${USE_MOCK_DATA ? 'MOCK' : 'REAL'} data from Yahoo Finance`);
  console.log(`Caching is ${USE_CACHE ? 'ENABLED' : 'DISABLED'}`);
});