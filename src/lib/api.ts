const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Remove trailing slash if present
const getBaseUrl = (): string => {
  return API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
};

export async function checkApiHealth(): Promise<boolean> {
  try {
    // Instead of using /health, use /stocks/AAPL as our health check
    // since we know this endpoint works
    const response = await fetch(`${getBaseUrl()}/stocks/AAPL`);
    return response.ok;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}

export async function fetchStockData(symbol: string) {
  const response = await fetch(`${getBaseUrl()}/stocks/${symbol}`);
  if (!response.ok) throw new Error(`Failed to fetch data for ${symbol}`);
  return response.json();
}

export async function fetchHistoricalData(symbol: string, period = '1y', interval = '1d') {
  const response = await fetch(`${getBaseUrl()}/stocks/${symbol}/history?period=${period}&interval=${interval}`);
  if (!response.ok) throw new Error(`Failed to fetch historical data for ${symbol}`);
  return response.json();
}

// Add other API functions as needed