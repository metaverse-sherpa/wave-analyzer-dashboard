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
  ReferenceLine
} from 'recharts';

// Import extracted components
import CustomCandle from './chart/CustomCandle';
import WaveLine from './chart/WaveLine';
import FibonacciTargets from './chart/FibonacciTargets';
import { waveColors, tooltipFormatter } from './chart/chartConstants';
import { formatChartData, calculatePriceRange } from './chart/chartUtils';

interface StockDetailChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
  currentWave: Wave;
  fibTargets: FibTarget[];
}

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
  
  // Format data and calculate price range using utility functions
  const chartData = formatChartData(data);
  const { minPrice, maxPrice } = calculatePriceRange(data, fibTargets);
  
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
              height={Math.abs(entry.close - entry.open)}
              fill={entry.close > entry.open ? 'var(--bullish)' : 'var(--bearish)'}
              stroke={entry.close > entry.open ? 'var(--bullish)' : 'var(--bearish)'}
              highLowLines={{
                high: entry.high,
                low: entry.low,
                stroke: entry.close > entry.open ? 'var(--bullish)' : 'var(--bearish)'
              }}
            />
          ))}
          
          {/* Render Fibonacci targets */}
          <FibonacciTargets fibTargets={fibTargets} />
          
          {/* Render Elliott Wave lines */}
          {waves.map((wave, index) => (
            <WaveLine 
              key={`wave-${index}`}
              wave={wave}
              data={data}
              color={waveColors[index % waveColors.length]}
            />
          ))}
          
          {/* Add wave number labels */}
          {waves.map((wave, index) => {
            const startPoint = data.find(d => d.timestamp === wave.startTimestamp);
            if (!startPoint) return null;
            
            return (
              <ReferenceLine
                key={`wave-label-${index}`}
                x={startPoint.timestamp * 1000}
                stroke={waveColors[index % waveColors.length]}
                strokeDasharray="3 3"
                label={{
                  value: `${wave.number}`,
                  position: 'insideTopRight',
                  fill: waveColors[index % waveColors.length],
                  fontSize: 12
                }}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockDetailChart;
