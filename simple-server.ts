import express from 'express';
import cors from 'cors';
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

// Generate mock historical data
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
app.get('/api/stocks', (req, res) => {
  try {
    console.log('Stock request received:', req.query);
    
    const symbols = (req.query.symbols?.toString() || '').split(',');
    console.log(`Fetching data for ${symbols.length} symbols`);
    
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
    
    console.log(`Returning ${quotes.length} stock quotes`);
    res.json(quotes);
  } catch (error) {
    console.error('Error in /api/stocks:', error);
    res.status(500).json({ error: 'Server error', message: (error as Error).message });
  }
});

// Historical data endpoint
app.get('/api/historical', (req, res) => {
  try {
    const symbol = req.query.symbol?.toString();
    const timeframe = req.query.timeframe?.toString() || '1d';
    
    console.log(`Historical data request for ${symbol} (${timeframe})`);
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Generate mock historical data
    const data = generateMockHistoricalData(symbol, 500);
    console.log(`Generated ${data.length} data points for ${symbol}`);
    res.json(data);
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
});