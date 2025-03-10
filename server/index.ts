import express from 'express';
import yahooFinance from 'yahoo-finance2';
import cors from 'cors';

// Modify console methods to suppress Yahoo Finance messages
const originalConsole = { ...console };
console.log = (...args) => {
  if (!args[0]?.includes?.('yahoo-finance2')) {
    originalConsole.log(...args);
  }
};
console.warn = (...args) => {
  if (!args[0]?.includes?.('yahoo-finance2')) {
    originalConsole.warn(...args);
  }
};

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/stocks', async (req, res) => {
  try {
    const symbols = req.query.symbols?.toString().split(',') || [];
    const quotes = await yahooFinance.quote(symbols);
    res.json(quotes);
  } catch (error) {
    console.error('Error fetching stock data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stock data',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/historical', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const selectedTimeframe = req.query.timeframe as string || '1d';
    let startDate: Date;

    if (req.query.start_date) {
      startDate = new Date(req.query.start_date as string);
    } else {
      const today = new Date();
      const timeframeDays = {
        '1d': 730, // 2 years for daily data (changed from 365)
        '1wk': 365 * 3, // 3 years for weekly
        '1mo': 365 * 5  // 5 years for monthly
      };
      const daysBack = timeframeDays[selectedTimeframe] || 730; // Default to 2 years
      startDate = new Date(today.setDate(today.getDate() - daysBack));
    }

    // Fetch historical data
    const historicalData = await yahooFinance.chart(symbol, { 
      period1: startDate, 
      interval: selectedTimeframe as '1d' | '1wk' | '1mo' 
    });

    if (!historicalData.quotes || historicalData.quotes.length === 0) {
      throw new Error('No historical data available');
    }

    // Ensure we return an array of data points
    const formattedData = historicalData.quotes.map(quote => ({
      timestamp: Math.floor(new Date(quote.date).getTime() / 1000),
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.close,
      volume: quote.volume
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch historical data',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});