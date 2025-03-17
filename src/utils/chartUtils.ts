import { StockHistoricalData } from '@/types/shared';

/**
 * Formats historical stock data for chart display
 */
export const formatChartData = (data: StockHistoricalData[]): any[] => {
  if (!data || !Array.isArray(data)) return [];
  
  return data.map(item => ({
    date: new Date(item.timestamp).getTime(),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));
};

/**
 * Formats date timestamps to readable strings
 */
export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

/**
 * Formats price values with dollar signs and fixed decimals
 */
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(price);
};