import { buildApiUrl } from '@/config/apiConfig';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Remove trailing slash if present
const getBaseUrl = (): string => {
  // In development, always use relative paths for Vite proxy
  if (import.meta.env.DEV) {
    return '/api';
  }
  
  // In production, use absolute URL if provided
  if (API_BASE_URL) {
    return API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  }
  
  // Fallback to relative path
  return '/api';
};

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl('health'), {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Health check failed:', response.status, response.statusText);
      return false;
    }
    
    const data = await response.json();
    return data.status === 'success';
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}

export async function fetchStockData(symbol: string) {
  const response = await fetch(buildApiUrl(`stocks/${symbol}`));
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch data for ${symbol}: ${error}`);
  }
  return response.json();
}

export async function fetchHistoricalData(symbol: string, period = '1y', interval = '1d') {
  const response = await fetch(buildApiUrl(`stocks/${symbol}/history`));
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch historical data for ${symbol}: ${error}`);
  }
  const json = await response.json();
  return json.data || json;
}

// Add other API functions as needed