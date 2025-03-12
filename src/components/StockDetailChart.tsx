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
  Line,
  Area,
  Bar
} from 'recharts';

// Make sure to include these imports
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData } from './chart/chartUtils';
import WaveLegend from './chart/WaveLegend';
import { getWaveColor, prepareWaveLines, getWavePatternDescription } from './chart/waveChartUtils';

// Define wave colors
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
  
  // Process chart data to include candlestick values
  const processedChartData = chartData.map(d => ({
    ...d,
    // Add properties for candlestick rendering
    candleHeight: Math.abs(d.close - d.open),
    candleY: Math.min(d.open, d.close),
    candleColor: d.close >= d.open ? 'var(--bullish)' : 'var(--bearish)',
    // For high-low lines
    highValue: d.high,
    lowValue: d.low
  }));
  
  // Use our utility function for wave preparation
  const waveLines = prepareWaveLines(waves, data);
    
  // Extract wave numbers for the legend
  const waveNumbers = [...new Set(waves.map(w => w.number))];
  
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
          data={processedChartData}
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
            // Add these properties to fix the duplicate keys
            ticks={processedChartData
              .filter((_, index) => index % Math.ceil(processedChartData.length / 6) === 0)
              .map(d => d.timestamp)}
            interval="preserveStartEnd"
            minTickGap={50}
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
          
          {/* METHOD 1: Render price data as a line chart for simplicity */}
          <Line
            type="monotone"
            dataKey="close"
            stroke="rgba(255,255,255,0.5)"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          
          {/* METHOD 2: Alternatively, use this for more advanced price chart */}
          {/* 
          <Area 
            type="monotone"
            dataKey="candleHeight"
            stroke="none"
            fill="url(#colorCandleStick)"
            stackId="1"
            baseValue={(d) => d.candleY}
            fillOpacity={1}
          />
          <Line
            type="monotone"
            dataKey="high"
            stroke="rgba(255,255,255,0.3)"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="low"
            stroke="rgba(255,255,255,0.3)"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          */}
          
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
          
          {/* Render wave lines with labels */}
          {waveLines.map((waveLine) => (
            <Line
              key={waveLine.id}
              data={waveLine.data}
              type="linear"
              dataKey="value"
              stroke={waveLine.color}
              strokeWidth={2.5} // Make slightly thicker to stand out
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
              label={({ x, y, index }) => {
                // Only label the end point
                if (index !== 1) return null;
                
                const waveNumber = waveLine.wave.number;
                const isImpulse = waveLine.wave.isImpulse;
                
                // Position above for impulse waves, below for corrective
                const yOffset = isImpulse ? -15 : 15;
                
                return (
                  <g>
                    {/* Optional: add background for better visibility */}
                    <rect 
                      x={x - 12}
                      y={y + yOffset - 12}
                      width={24}
                      height={20}
                      rx={4}
                      fill="rgba(0,0,0,0.6)"
                      opacity={0.7}
                    />
                    {/* The wave number label */}
                    <text
                      x={x}
                      y={y + yOffset}
                      fill={waveLine.color}
                      fontSize={12}
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {waveNumber}
                    </text>
                  </g>
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


