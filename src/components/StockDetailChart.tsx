import React, { useRef, useState } from 'react';
import { StockHistoricalData } from "@/services/yahooFinanceService";
import { Wave, FibTarget } from "@/utils/elliottWaveAnalysis";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Rectangle
} from 'recharts';

// Import utils
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData } from './chart/chartUtils';

// A completely reworked candlestick renderer for Recharts
const CandlestickSeries = (props) => {
  const { data, xScale, yScale, xAccessor, yAccessor, width = 6 } = props;

  return data.map((candle, index) => {
    const x = xScale(candle.timestamp);
    const y = yScale(Math.max(candle.open, candle.close));
    const height = Math.abs(yScale(candle.open) - yScale(candle.close));
    const candleY = candle.close > candle.open ? yScale(candle.close) : yScale(candle.open);
    const halfWidth = width / 2;

    const isUp = candle.close > candle.open;
    const color = isUp ? 'var(--bullish)' : 'var(--bearish)';

    // Skip rendering if x or y is undefined
    if (x === undefined || y === undefined) return null;

    // Make sure we have a minimum height for visibility
    const effectiveHeight = Math.max(height, 1);

    return (
      <g key={`candle-${index}`}>
        {/* High-low line */}
        <line
          x1={x}
          y1={yScale(candle.high)}
          x2={x}
          y2={yScale(candle.low)}
          stroke={color}
          strokeWidth={1}
        />
        {/* Candle body */}
        <rect
          x={x - halfWidth}
          y={candleY}
          width={width}
          height={effectiveHeight}
          fill={color}
          stroke="none"
        />
      </g>
    );
  });
};

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
  
  // Return early if no data available
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }
  
  // Find the first wave in the sequence (if available)
  const firstWave = waves.length > 0 ? waves[0] : null;
  
  // Filter data to show only from the first wave onwards, if available
  const filteredData = firstWave 
    ? data.filter(item => item.timestamp >= firstWave.startTimestamp)
    : data;
  
  // Format the data for the chart
  const chartData = formatChartData(filteredData);
  
  // Calculate price range for y-axis
  const prices = filteredData.flatMap(d => [d.high, d.low]);
  const minPrice = Math.min(...prices) * 0.98; // 2% padding below
  const maxPrice = Math.max(...prices) * 1.02; // 2% padding above
  
  return (
    <div className="w-full h-[500px] bg-chart-background rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{symbol} - Historical Price Chart</h3>
      <p className="text-xs mb-2">Data points: {chartData.length}</p>
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
          
          {/* Direct rendering of candlesticks using the scales from the chart */}
          {({ xScale, yScale }) => (
            <CandlestickSeries
              data={chartData}
              xScale={xScale}
              yScale={yScale}
              width={8}
            />
          )}
          
          {/* Wave information */}
          {firstWave && (
            <text 
              x="50%" 
              y="20" 
              textAnchor="middle" 
              dominantBaseline="hanging"
              fill="#94a3b8"
              fontSize="12"
            >
              Showing data since Wave 1 start: {new Date(firstWave.startTimestamp * 1000).toLocaleDateString()}
            </text>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockDetailChart;
