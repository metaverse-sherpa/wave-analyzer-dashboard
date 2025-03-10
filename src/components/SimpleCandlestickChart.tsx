import React, { useRef, useState } from 'react';
import { StockHistoricalData } from "@/services/yahooFinanceService";
import { Wave } from "@/utils/elliottWaveAnalysis";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

interface SimpleCandlestickChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
}

// Fallback simpler chart if the candlestick implementation isn't working
const SimpleCandlestickChart: React.FC<SimpleCandlestickChartProps> = ({
  symbol,
  data,
  waves
}) => {
  // Return early if no data available
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available for {symbol}</p>
      </div>
    );
  }
  
  // Find the first wave in the sequence (if available)
  const firstWave = waves.length > 0 ? waves[0] : null;
  
  // Filter data to show only from the first wave onwards, if available
  // If first wave is far back (>200 periods), show at least 200 periods for better visualization
  const filteredData = firstWave 
    ? data.filter(item => item.timestamp >= firstWave.startTimestamp)
    : data;
    
  // Make sure we're not showing too much data for clear visualization
  // If after filtering we still have over 500 data points, sample them
  let displayData = filteredData;
  if (displayData.length > 500) {
    const samplingFactor = Math.ceil(displayData.length / 500);
    displayData = displayData.filter((_, index) => index % samplingFactor === 0);
  }
  
  // Format the data for the chart
  const chartData = displayData.map(d => ({
    timestamp: d.timestamp * 1000, // Convert to milliseconds for date display
    price: d.close,
    date: new Date(d.timestamp * 1000).toLocaleDateString()
  }));
  
  // Calculate price range for y-axis
  const prices = displayData.map(d => d.close);
  const minPrice = Math.min(...prices) * 0.95; // 5% padding below
  const maxPrice = Math.max(...prices) * 1.05; // 5% padding above
  
  return (
    <div className="w-full h-[500px] bg-card rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{symbol} - Price Chart</h3>
      <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
        <span>
          {firstWave ? 
            `Showing data since Wave ${firstWave.number} (${new Date(firstWave.startTimestamp * 1000).toLocaleDateString()})` : 
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
            domain={[minPrice, maxPrice]}
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
};

export default SimpleCandlestickChart;