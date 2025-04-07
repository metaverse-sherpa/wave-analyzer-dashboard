import { StockHistoricalData } from '@/types/shared';

/**
 * Calculate average return over different time periods
 */
export function calculateAverageReturn(
  historicalData: Record<string, StockHistoricalData[]>
): { daily: number; weekly: number; monthly: number } {
  // Default returns
  const returns = {
    daily: 0,
    weekly: 0,
    monthly: 0
  };
  
  // Count of stocks with sufficient data
  let dailyCount = 0;
  let weeklyCount = 0;
  let monthlyCount = 0;
  
  Object.values(historicalData).forEach(data => {
    if (!data || data.length === 0) return;
    
    // Calculate daily return (1 day)
    if (data.length >= 2) {
      const dailyReturn = (data[data.length - 1].close - data[data.length - 2].close) / data[data.length - 2].close;
      returns.daily += dailyReturn;
      dailyCount++;
    }
    
    // Calculate weekly return (5 days)
    if (data.length >= 6) {
      const weeklyReturn = (data[data.length - 1].close - data[data.length - 6].close) / data[data.length - 6].close;
      returns.weekly += weeklyReturn;
      weeklyCount++;
    }
    
    // Calculate monthly return (22 days)
    if (data.length >= 23) {
      const monthlyReturn = (data[data.length - 1].close - data[data.length - 23].close) / data[data.length - 23].close;
      returns.monthly += monthlyReturn;
      monthlyCount++;
    }
  });
  
  // Average the returns
  if (dailyCount > 0) returns.daily /= dailyCount;
  if (weeklyCount > 0) returns.weekly /= weeklyCount;
  if (monthlyCount > 0) returns.monthly /= monthlyCount;
  
  return returns;
}

/**
 * Identify leading sectors based on performance
 */
export function identifyLeadingSectors(
  historicalData: Record<string, StockHistoricalData[]>,
  sectorMapping: Record<string, string>
): { leading: string[], lagging: string[] } {
  // Group by sectors
  const sectorPerformance: Record<string, number[]> = {};
  
  // Calculate returns by sector
  Object.keys(historicalData).forEach(symbol => {
    const data = historicalData[symbol];
    if (!data || data.length < 23) return;
    
    const sector = sectorMapping[symbol] || 'Other';
    if (!sectorPerformance[sector]) sectorPerformance[sector] = [];
    
    // Calculate monthly return
    const monthlyReturn = (data[data.length - 1].close - data[data.length - 23].close) / data[data.length - 23].close;
    sectorPerformance[sector].push(monthlyReturn);
  });
  
  // Average returns by sector
  const averageSectorReturns: Record<string, number> = {};
  Object.entries(sectorPerformance).forEach(([sector, returns]) => {
    if (returns.length > 0) {
      const sum = returns.reduce((acc, curr) => acc + curr, 0);
      averageSectorReturns[sector] = sum / returns.length;
    }
  });
  
  // Sort sectors by performance
  const sortedSectors = Object.entries(averageSectorReturns)
    .sort(([, a], [, b]) => b - a)
    .map(([sector]) => sector);
  
  // Return top 3 and bottom 3 sectors
  return {
    leading: sortedSectors.slice(0, 3),
    lagging: sortedSectors.slice(-3).reverse()
  };
}