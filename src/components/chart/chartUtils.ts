
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
export const calculatePriceRange = (data: StockHistoricalData[], fibTargets: FibTarget[]) => {
  const prices = data.flatMap(d => [d.high, d.low]);
  const fibPrices = fibTargets.map(target => target.price);
  const allPrices = [...prices, ...fibPrices];
  
  const minPrice = Math.min(...allPrices) * 0.98;
  const maxPrice = Math.max(...allPrices) * 1.02;
  
  return { minPrice, maxPrice };
};
