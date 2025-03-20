import React, { useMemo } from 'react';
import { StockHistoricalData } from "@/services/yahooFinanceService";
import { Wave } from "@/types/shared";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

interface SimpleCandlestickChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
}

// Fallback simpler chart if the candlestick implementation isn't working
const SimpleCandlestickChart: React.FC<SimpleCandlestickChartProps> = React.memo(({
  symbol,
  data,
  waves
}) => {
  const { analyses, getAnalysis } = useWaveAnalysis();
  
  // Return early if no data available
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available for {symbol}</p>
      </div>
    );
  }
  
  // Process data with useMemo to prevent recalculations
  const { filteredData, chartData, priceRange } = useMemo(() => {
    // Find the first wave
    const firstWave = waves.length > 0 ? waves[0] : null;
    
    // Filter data
    const filtered = firstWave 
      ? data.filter(item => item.timestamp >= firstWave.startTimestamp)
      : data;
    
    // Sample data if too large
    let displayData = filtered;
    if (displayData.length > 500) {
      const samplingFactor = Math.ceil(displayData.length / 500);
      displayData = displayData.filter((_, index) => index % samplingFactor === 0);
    }
    
    // Format chart data
    const formatted = displayData.map(d => ({
      timestamp: d.timestamp * 1000,
      price: d.close,
      date: new Date(d.timestamp * 1000).toLocaleDateString()
    }));
    
    // Calculate price range
    const prices = displayData.map(d => d.close);
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    
    return { 
      filteredData: displayData, 
      chartData: formatted,
      priceRange: [minPrice, maxPrice]
    };
  }, [data, waves]);
  
  return (
    <div className="w-full h-[500px] bg-card rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{symbol} - Price Chart</h3>
      <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
        <span>
          {waves.length > 0 ? 
            `Showing data since Wave ${waves[0].number} (${new Date(waves[0].startTimestamp * 1000).toLocaleDateString()})` : 
            `Showing ${chartData.length} data points from ${chartData[0]?.date || 'unknown'} to ${chartData[chartData.length-1]?.date || 'unknown'}`
          }
        </span>
        <span>Data: {data.length} points, Display: {chartData.length} points</span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
        >
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
          />
          <YAxis
            domain={priceRange}
            tickFormatter={(tick) => tick.toFixed(2)}
          />
          <Tooltip
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            formatter={(value: number) => ["$" + value.toFixed(2), "Price"]}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#8884d8" 
            fillOpacity={1} 
            fill="url(#colorPrice)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default SimpleCandlestickChart;