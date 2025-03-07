import { toast } from "react-hot-toast";

const API_BASE_URL = 'http://localhost:3001/api'; // Replace with your backend URL

const topStockSymbols = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'LLY', 
  'JPM', 'V', 'AVGO', 'XOM', 'PG', 'MA', 'COST', 'HD', 'CVX', 'MRK', 
  'ABBV', 'KO', 'PEP', 'ADBE', 'WMT', 'BAC', 'CRM', 'TMO', 'CSCO', 'ACN', 
  'MCD', 'ABT', 'NFLX', 'LIN', 'DHR', 'AMD', 'CMCSA', 'VZ', 'INTC', 'DIS', 
  'PM', 'TXN', 'WFC', 'BMY', 'UPS', 'COP', 'NEE', 'RTX', 'ORCL', 'HON',
  'QCOM', 'LOW', 'UNP', 'IBM', 'GE', 'CAT', 'BA', 'SBUX', 'PFE', 'INTU',
  'DE', 'SPGI', 'AXP', 'AMAT', 'GS', 'MS', 'BLK', 'JNJ', 'GILD', 'C',
  'CVS', 'AMT', 'TJX', 'SYK', 'MDT', 'ADP', 'MDLZ', 'ISRG', 'ADI', 'CI',
  'BKNG', 'VRTX', 'MMC', 'PYPL', 'SLB', 'EOG', 'PLD', 'T', 'ETN', 'AMGN',
  'ZTS', 'SCHW', 'CB', 'PGR', 'SO', 'MO', 'REGN', 'DUK', 'BDX', 'CME'
];

export interface StockData {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageVolume: number;
  marketCap: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
}

export interface StockHistoricalData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const fetchTopStocks = async (limit: number = 50): Promise<StockData[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/stocks?symbols=${topStockSymbols.slice(0, limit).join(',')}`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    toast.error('Failed to fetch stock data. Please try again later.');
    return [];
  }
};

export const fetchHistoricalData = async (
  symbol: string,
  range: string = '1y',
  interval: string = '1d'
): Promise<{ symbol: string; historicalData: StockHistoricalData[] }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/historical?symbol=${symbol}&range=${range}&interval=${interval}`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    return { symbol, historicalData: data };
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    toast.error(`Failed to fetch historical data for ${symbol}`);
    return { symbol, historicalData: [] };
  }
};

export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}; 