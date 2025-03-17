import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// For ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to generate mock data
const generateMockHistoricalData = (symbol: string, days = 300) => {
  const mockData = [];
  const today = new Date();
  let price = 100 + (symbol.charCodeAt(0) % 50); // Base price on first letter of symbol
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    // Generate price movement
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
      volume: Math.floor(Math.random() * 1000000)
    });
  }
  
  return mockData;
};

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Stocks endpoint
app.get('/api/stocks', (req, res) => {
  try {
    const symbols = (req.query.symbols?.toString() || '').split(',');
    
    // Generate mock stock data
    const quotes = symbols.map(symbol => ({
      symbol,
      shortName: `${symbol} Inc.`,
      regularMarketPrice: 100 + Math.random() * 100,
      regularMarketChange: (Math.random() * 10) - 5,
      regularMarketChangePercent: (Math.random() * 10) - 5,
      regularMarketVolume: Math.floor(Math.random() * 10000000),
      averageVolume: Math.floor(Math.random() * 5000000),
      marketCap: Math.floor(Math.random() * 1000000000000),
      fiftyTwoWeekLow: 50 + Math.random() * 50,
      fiftyTwoWeekHigh: 150 + Math.random() * 50,
      trailingPE: 15 + Math.random() * 20,
      forwardPE: 12 + Math.random() * 15,
      dividendYield: Math.random() * 0.05,
    }));
    
    res.json(quotes);
  } catch (error) {
    console.error('Error in /api/stocks:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Historical data endpoint
app.get('/api/historical', (req, res) => {
  try {
    const symbol = req.query.symbol?.toString();
    const timeframe = req.query.timeframe?.toString() || '1d';
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Generate mock historical data
    const data = generateMockHistoricalData(symbol, 500);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/historical:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});