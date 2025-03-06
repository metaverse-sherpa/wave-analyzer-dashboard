
import React, { useRef, useEffect } from 'react';
import { StockHistoricalData } from "@/services/yahooFinanceService";
import { Wave, FibTarget } from "@/utils/elliottWaveAnalysis";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  ReferenceLine,
  Label
} from 'recharts';

interface StockDetailChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
  currentWave: Wave;
  fibTargets: FibTarget[];
}

// Custom candle component for the candlestick chart
interface CustomCandleProps {
  x: number;
  y: number;
  width: number;
  height: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

const CustomCandle: React.FC<CustomCandleProps> = ({ x, y, width, height, open, close, high, low }) => {
  const isUp = close >= open;
  
  return (
    <g>
      {/* Candle body */}
      <rect
        x={x - width / 2}
        y={isUp ? y : y + height}
        width={width}
        height={Math.abs(height) || 1}
        fill={isUp ? 'var(--bullish)' : 'var(--bearish)'}
        stroke={isUp ? 'var(--bullish)' : 'var(--bearish)'}
      />
      
      {/* Upper wick */}
      <line
        x1={x}
        y1={isUp ? y : y + height}
        x2={x}
        y2={y - high}
        stroke={isUp ? 'var(--bullish)' : 'var(--bearish)'}
        strokeWidth={1}
      />
      
      {/* Lower wick */}
      <line
        x1={x}
        y1={isUp ? y + height : y}
        x2={x}
        y2={y + low}
        stroke={isUp ? 'var(--bullish)' : 'var(--bearish)'}
        strokeWidth={1}
      />
    </g>
  );
};

// Custom Wave line component
interface WaveLineProps {
  wave: Wave;
  data: StockHistoricalData[];
  color: string;
}

const WaveLine: React.FC<WaveLineProps> = ({ wave, data, color }) => {
  if (!wave || !data || !wave.startIndex || wave.startIndex >= data.length) return null;
  
  const startIdx = wave.startIndex;
  const endIdx = wave.endIndex ?? data.length - 1;
  
  if (startIdx === endIdx) return null;
  
  const startTimestamp = data[startIdx].timestamp;
  const endTimestamp = data[endIdx].timestamp;
  const startPrice = wave.startPrice;
  const endPrice = wave.endPrice ?? data[data.length - 1].close;
  
  return (
    <Line
      type="linear"
      dataKey="price"
      stroke={color}
      strokeWidth={2}
      dot={false}
      isAnimationActive={false}
      connectNulls
      data={[
        { timestamp: startTimestamp, price: startPrice },
        { timestamp: endTimestamp, price: endPrice }
      ]}
    />
  );
};

// Main chart component
const StockDetailChart: React.FC<StockDetailChartProps> = ({
  symbol,
  data,
  waves,
  currentWave,
  fibTargets
}) => {
  const chartRef = useRef<any>(null);
  
  useEffect(() => {
    // Any initialization for the chart
  }, [data, waves]);
  
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }
  
  // Format data for the chart
  const chartData = data.map(d => ({
    timestamp: d.timestamp * 1000, // Convert to milliseconds for date display
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    date: new Date(d.timestamp * 1000).toLocaleDateString()
  }));
  
  // Find min and max prices for y-axis
  const prices = data.flatMap(d => [d.high, d.low]);
  const fibPrices = fibTargets.map(target => target.price);
  const allPrices = [...prices, ...fibPrices];
  
  const minPrice = Math.min(...allPrices) * 0.98;
  const maxPrice = Math.max(...allPrices) * 1.02;
  
  // Custom tooltip formatter
  const tooltipFormatter = (value: any, name: string) => {
    if (name === 'close') {
      return [`$${value.toFixed(2)}`, 'Close'];
    }
    if (name === 'open') {
      return [`$${value.toFixed(2)}`, 'Open'];
    }
    if (name === 'high') {
      return [`$${value.toFixed(2)}`, 'High'];
    }
    if (name === 'low') {
      return [`$${value.toFixed(2)}`, 'Low'];
    }
    return [value, name];
  };
  
  // Wave colors
  const waveColors = {
    1: '#3B82F6', // blue
    2: '#EF4444', // red
    3: '#22C55E', // green
    4: '#F97316', // orange
    5: '#8B5CF6', // purple
    A: '#EC4899', // pink
    B: '#FBBF24', // yellow
    C: '#6366F1', // indigo
  };
  
  return (
    <div className="w-full h-[500px] bg-chart-background rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{symbol} - Elliott Wave Analysis</h3>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 50, left: 20, bottom: 20 }}
          ref={chartRef}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
            stroke="#94a3b8"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tickFormatter={(tick) => tick.toFixed(2)}
            orientation="right"
            stroke="#94a3b8"
          />
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            contentStyle={{ backgroundColor: 'var(--chart-tooltip)', border: 'none' }}
          />
          
          {/* Render candles */}
          {chartData.map((entry, index) => (
            <CustomCandle
              key={`candle-${index}`}
              x={entry.timestamp}
              y={entry.open}
              width={8}
              height={entry.close - entry.open}
              open={entry.open}
              close={entry.close}
              high={entry.high - entry.open}
              low={entry.low - entry.open}
            />
          ))}
          
          {/* Render all completed waves */}
          {waves.map((wave, index) => {
            const waveNumber = typeof wave.number === 'number' ? wave.number : wave.number;
            const color = waveColors[waveNumber as keyof typeof waveColors] || '#94a3b8';
            
            return (
              <WaveLine key={`wave-${index}`} wave={wave} data={data} color={color} />
            );
          })}
          
          {/* Render Fibonacci targets for current wave */}
          {fibTargets.map((target, index) => {
            if (!currentWave) return null;
            
            const startTimestamp = data[currentWave.startIndex].timestamp * 1000;
            const endTimestamp = data[data.length - 1].timestamp * 1000;
            
            return (
              <ReferenceLine
                key={`fib-${index}`}
                y={target.price}
                stroke={target.isExtension ? "#F59E0B" : "#60A5FA"}
                strokeDasharray={target.isExtension ? "3 3" : undefined}
                strokeWidth={1}
              >
                <Label
                  value={`${target.label} (${target.price.toFixed(2)})`}
                  position="right"
                  fill={target.isExtension ? "#F59E0B" : "#60A5FA"}
                  fontSize={10}
                />
              </ReferenceLine>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockDetailChart;
