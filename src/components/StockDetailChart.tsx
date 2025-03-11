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
  Rectangle,
  Line,
  Label
} from 'recharts';

// Import utils and constants
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData } from './chart/chartUtils';
import WaveLegend from './chart/WaveLegend';
import { getWaveColor, prepareWaveLines, getWavePatternDescription } from './chart/waveChartUtils';

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

// Define wave colors for consistency across the app
const WAVE_COLORS = {
  1: '#4CAF50', // Green
  2: '#FF9800', // Orange
  3: '#2196F3', // Blue
  4: '#F44336', // Red
  5: '#9C27B0', // Purple
  'A': '#FFEB3B', // Yellow
  'B': '#795548', // Brown
  'C': '#00BCD4'  // Cyan
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
  const [hoveredWave, setHoveredWave] = useState<Wave | null>(null);
  
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
  
  // Use our utility function instead of inline wave preparation
  const waveLines = prepareWaveLines(waves, data);
  
  // Extract wave numbers for the legend
  const waveNumbers = waves.map(w => w.number);
  
  // Calculate price range for y-axis
  const prices = filteredData.flatMap(d => [d.high, d.low]);
  const minPrice = Math.min(...prices) * 0.98; // 2% padding below
  const maxPrice = Math.max(...prices) * 1.02; // 2% padding above
  
  return (
    <div className="w-full h-[500px] bg-chart-background rounded-lg p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{symbol} - Elliott Wave Chart</h3>
          <p className="text-xs text-muted-foreground">
            {firstWave 
              ? `Showing Elliott Wave sequence starting from ${new Date(firstWave.startTimestamp * 1000).toLocaleDateString()}` 
              : `No wave patterns detected`
            }
          </p>
        </div>
        
        {waves.length > 0 && (
          <div className="bg-background/30 backdrop-blur-sm p-2 rounded-md">
            <WaveLegend waveNumbers={waveNumbers} compact />
          </div>
        )}
      </div>
      
      <ResponsiveContainer width="100%" height="85%">
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
          
          {/* Render candlesticks */}
          {({ xScale, yScale }) => (
            <CandlestickSeries
              data={chartData}
              xScale={xScale}
              yScale={yScale}
              width={8}
            />
          )}
          
          {/* Render fibonacci targets as horizontal lines */}
          {fibTargets.map((target, index) => (
            <ReferenceLine
              key={`fib-${index}`}
              y={target.price}
              stroke={target.isExtension ? "#9c27b0" : "#3f51b5"}
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              label={{
                position: 'right',
                value: `${target.label}: $${target.price.toFixed(2)}`,
                fill: target.isExtension ? "#9c27b0" : "#3f51b8",
                fontSize: 10
              }}
            />
          ))}
          
          {/* Render wave lines */}
          {waveLines.map((waveLine) => (
            <Line
              key={waveLine.id}
              data={waveLine.data}
              type="linear"
              dataKey="value"
              stroke={waveLine.color}
              strokeWidth={2}
              strokeDasharray={waveLine.wave.isImpulse ? "0" : "5 5"}
              activeDot={{
                r: 6,
                fill: waveLine.color,
                stroke: "#fff",
                strokeWidth: 1,
                onMouseOver: () => setHoveredWave(waveLine.wave),
                onMouseLeave: () => setHoveredWave(null)
              }}
              dot={{
                r: 4,
                fill: waveLine.color,
                stroke: "#fff",
                strokeWidth: 1
              }}
              label={({ x, y, value, index, wave }) => {
                // Only render labels at start and end of the line
                if (index !== 0 && index !== 1) return null;
                
                const wavePoint = waveLine.data[index];
                const isStart = wavePoint.wavePoint === 'start';
                const labelText = `${isStart ? 'Start' : 'End'} ${wavePoint.waveNumber}`;
                const xOffset = isStart ? -5 : 5;
                const textAnchor = isStart ? "end" : "start";
                
                return (
                  <text
                    x={x + xOffset}
                    y={y - 10}
                    fill={waveLine.color}
                    fontSize={10}
                    textAnchor={textAnchor}
                    fontWeight="bold"
                  >
                    {labelText}
                  </text>
                );
              }}
            />
          ))}
          
          {/* Highlight current wave */}
          {currentWave && currentWave.number && (
            <text
              x="95%"
              y="30"
              fill={WAVE_COLORS[currentWave.number] || '#FFFFFF'}
              fontSize={14}
              textAnchor="end"
              fontWeight="bold"
            >
              Current: Wave {currentWave.number}
            </text>
          )}

          {/* Additional information about wave pattern */}
          <text
            x="50%"
            y="30"
            fill="#94a3b8"
            fontSize={12}
            textAnchor="middle"
          >
            {getWavePatternDescription(waves)}
          </text>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockDetailChart;


