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
  Bar,
  Rectangle
} from 'recharts';

// Import utils
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData } from './chart/chartUtils';

// Custom Candlestick component 
const CustomCandlestick = (props: any) => {
  const { x, y, width, height, open, close, low, high } = props;
  console.log('CustomCandlestick props:', { x, y, width, height, open, close, low, high });
  
  // Validate inputs
  if (x === undefined || y === undefined || width === undefined || 
      open === undefined || close === undefined || 
      low === undefined || high === undefined) {
    console.error('CustomCandlestick received undefined props', props);
    return null;
  }
  
  const isRising = close > open;
  const color = isRising ? 'var(--bullish)' : 'var(--bearish)';
  const halfWidth = width / 2;
  
  return (
    <g>
      {/* Vertical line (wick) from high to low */}
      <line 
        x1={x + halfWidth}
        y1={y + (close > open ? 0 : height)}
        x2={x + halfWidth} 
        y2={low}
        stroke={color}
        strokeWidth={1}
      />
      <line 
        x1={x + halfWidth}
        y1={y}
        x2={x + halfWidth} 
        y2={high}
        stroke={color}
        strokeWidth={1}
      />
      
      {/* Rectangle (body) from open to close */}
      <rect
        x={x}
        y={close > open ? open : close}
        width={width}
        height={Math.max(1, Math.abs(close - open))}
        fill={color}
      />
    </g>
  );
};

// Debug helper function
const debugData = (data: any, label: string) => {
  console.log(`DEBUG ${label}:`, data);
  console.log(`DEBUG ${label} length:`, data?.length || 0);
  if (data && data.length > 0) {
    console.log(`DEBUG ${label} first item:`, data[0]);
    console.log(`DEBUG ${label} last item:`, data[data.length - 1]);
  } else {
    console.log(`DEBUG ${label}: empty or invalid data`);
  }
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
  
  // Debug incoming data
  useEffect(() => {
    console.log('StockDetailChart rendering with:');
    console.log('Symbol:', symbol);
    debugData(data, 'Raw data');
    debugData(waves, 'Waves');
    console.log('Current wave:', currentWave);
    debugData(fibTargets, 'FibTargets');
  }, [symbol, data, waves, currentWave, fibTargets]);
  
  // Return early if no data available
  if (!data || data.length === 0) {
    console.error('StockDetailChart: No data provided');
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }
  
  // Find the first wave in the sequence (if available)
  const firstWave = waves.length > 0 ? waves[0] : null;
  console.log('First wave:', firstWave);
  
  // Filter data to show only from the first wave onwards, if available
  const filteredData = firstWave 
    ? data.filter(item => item.timestamp >= firstWave.startTimestamp)
    : data;
  debugData(filteredData, 'Filtered data');
  
  // Format the data for the chart
  const chartData = formatChartData(filteredData);
  debugData(chartData, 'Formatted chart data');
  
  // Calculate price range for y-axis
  const prices = filteredData.flatMap(d => [d.high, d.low]);
  console.log('Min price value:', Math.min(...prices));
  console.log('Max price value:', Math.max(...prices));
  const minPrice = Math.min(...prices) * 0.98; // 2% padding below
  const maxPrice = Math.max(...prices) * 1.02; // 2% padding above
  console.log('Y-axis domain:', [minPrice, maxPrice]);
  
  // Calculate width of each candlestick based on data length
  const candleWidth = Math.max(5, Math.min(15, 800 / chartData.length));
  console.log('Candle width:', candleWidth);
  
  return (
    <div 
      className="w-full h-[500px] bg-chart-background rounded-lg p-4"
      style={{
        // Add a visible border for debugging
        border: '1px solid red'
      }}
    >
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
          
          {/* Render candle bodies - draw manually as Recharts doesn't have a built-in candlestick */}
          {chartData.map((entry, index) => {
            // Debug every 10th entry for less noise
            if (index % 10 === 0) {
              console.log(`Candlestick ${index}:`, {
                open: entry.open,
                close: entry.close,
                high: entry.high,
                low: entry.low,
                date: new Date(entry.timestamp).toLocaleDateString()
              });
            }
            
            return (
              <Bar 
                key={`candle-${index}`}
                dataKey="high" 
                stackId={`stack-${index}`}
                fill="transparent"
                stroke="transparent"
                barSize={candleWidth} 
                shape={(props) => {
                  // Log a few shape properties for debugging
                  if (index % 10 === 0) {
                    console.log(`Bar shape props for ${index}:`, props);
                  }
                  
                  return (
                    <CustomCandlestick 
                      open={entry.open} 
                      close={entry.close}
                      high={entry.high}
                      low={entry.low}
                      {...props}
                    />
                  );
                }}
              />
            );
          })}
          
          {/* Show wave information in the chart header if available */}
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
