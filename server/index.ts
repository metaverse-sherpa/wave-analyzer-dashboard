import express from 'express';
import yahooFinance from 'yahoo-finance2';
import cors from 'cors';

// Suppress cookie and survey notices
yahooFinance.suppressNotices(['yahooSurvey']);

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
    const { symbol, start_date, timeframe } = req.query;
    if (typeof symbol !== 'string') {
      throw new Error('Invalid query parameters. Missing symbol');
    }

    // Set default timeframe to "1d" if not provided or invalid
    const validTimeframes = ['1d', '1wk', '1mo'];
    const selectedTimeframe = (typeof timeframe === 'string' && validTimeframes.includes(timeframe)) 
      ? timeframe 
      : '1d';

    // Calculate start date if not provided
    let startDate: Date;
    if (start_date && typeof start_date === 'string') {
      startDate = new Date(start_date);
    } else {
      const today = new Date();
      // Use a static object for timeframe to days mapping
      const timeframeDays = {
        '1d': 365,
        '1wk': 365 * 2,
        '1mo': 365 * 3
      };
      const daysBack = timeframeDays[selectedTimeframe] || 365; // Default to 365 if invalid timeframe
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