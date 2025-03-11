import React, { useRef, useState, useEffect } from 'react';
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
} from 'recharts';

// Import utils and constants
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData, calculatePriceRange } from './chart/chartUtils';
import WaveLegend from './chart/WaveLegend';
import { getWaveColor, prepareWaveLines, getWavePatternDescription } from './chart/waveChartUtils';

// Define wave colors for consistency
const WAVE_COLORS = {
  1: '#4CAF50',
  2: '#FF9800',
  3: '#2196F3',
  4: '#F44336',
  5: '#9C27B0',
  'A': '#FFEB3B',
  'B': '#795548',
  'C': '#00BCD4'
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
  const [chartData, setChartData] = useState<any[]>([]);
  const [waveLines, setWaveLines] = useState<any[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  
  // Process chart data when inputs change
  useEffect(() => {
    if (!data || data.length === 0) return;
    
    // Find the first wave in the sequence (if available)
    const firstWave = waves.length > 0 ? waves[0] : null;
    
    // Filter data to show only from the first wave onwards, if available
    const filteredData = firstWave 
      ? data.filter(item => item.timestamp >= firstWave.startTimestamp)
      : data;
    
    // Format the data for the chart
    const formattedData = formatChartData(filteredData);
    setChartData(formattedData);
    
    // Prepare wave lines
    const lines = prepareWaveLines(waves, data);
    setWaveLines(lines);
    
    try {
      // Calculate price range
      const range = calculatePriceRange(filteredData, fibTargets);
      setPriceRange(range);
    } catch (error) {
      console.error("Error calculating price range:", error);
      setPriceRange([
        Math.min(...filteredData.map(d => d.low)) * 0.98,
        Math.max(...filteredData.map(d => d.high)) * 1.02
      ]);
    }
    
    console.log(`Chart data prepared: ${formattedData.length} points, waves: ${lines.length}`);
  }, [data, waves, fibTargets]);
  
  // Return early if no data available
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }
  
  // Extract wave numbers for the legend
  const waveNumbers = [...new Set(waves.map(w => w.number))];
  
  return (
    <div className="w-full h-[500px] bg-chart-background rounded-lg p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{symbol} - Elliott Wave Chart</h3>
          <p className="text-xs text-muted-foreground">
            {waves.length > 0 
              ? `Showing Elliott Wave sequence starting from ${new Date(waves[0].startTimestamp * 1000).toLocaleDateString()}` 
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
            domain={priceRange}
            tickFormatter={(tick) => tick.toFixed(2)}
            orientation="right"
            stroke="#94a3b8"
          />
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            contentStyle={{ backgroundColor: 'var(--chart-tooltip)', border: 'none' }}
          />
          
          {/* Render price line */}
          <Line
            type="monotone"
            dataKey="close"
            stroke="var(--chart-line, #94a3b8)"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          
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
              dot={{
                r: 4,
                fill: waveLine.color,
                stroke: "#fff",
                strokeWidth: 1
              }}
              activeDot={{ r: 6 }}
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
      
      {/* Add debug info for troubleshooting */}
      <div className="text-xs text-muted-foreground mt-2">
        {chartData.length} data points | {waves.length} waves | {fibTargets.length} targets
      </div>
    </div>
  );
};

export default StockDetailChart;


