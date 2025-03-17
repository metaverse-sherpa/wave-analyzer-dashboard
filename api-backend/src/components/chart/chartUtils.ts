import { StockHistoricalData } from "@/services/yahooFinanceService";
import { FibTarget } from "@/utils/elliottWaveAnalysis";

// Format data for the chart
export const formatChartData = (data: StockHistoricalData[]) => {
  return data.map(d => ({
    timestamp: d.timestamp * 1000, // Convert to milliseconds for date display
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    date: new Date(d.timestamp * 1000).toLocaleDateString()
  }));
};

// Calculate price range for y-axis
export const calculatePriceRange = (data: StockHistoricalData[], fibTargets: FibTarget[] = []): [number, number] => {
  if (!data || data.length === 0) return [0, 100];
  
  const prices = data.flatMap(d => [d.high, d.low]);
  const fibPrices = fibTargets.map(target => target.price);
  const allPrices = [...prices, ...fibPrices].filter(p => typeof p === 'number' && !isNaN(p));
  
  if (allPrices.length === 0) return [0, 100];
  
  const minPrice = Math.min(...allPrices) * 0.98; // 2% padding below
  const maxPrice = Math.max(...allPrices) * 1.02; // 2% padding above
  
  return [minPrice, maxPrice]; // Add this return statement
};

