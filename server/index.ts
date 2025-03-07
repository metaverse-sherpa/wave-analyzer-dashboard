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

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
}); 