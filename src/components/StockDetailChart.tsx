import React, { useRef, useState, useMemo } from 'react';
import { StockHistoricalData } from "@/services/yahooFinanceService";
import { Wave, FibTarget } from "@/utils/elliottWaveAnalysis";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Line,
  Area,
  Bar,
  Brush
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
  const [zoomRange, setZoomRange] = useState<{start: number; end: number} | null>(null);
  const [highlightedWave, setHighlightedWave] = useState<Wave | null>(null);

  // Find the most recent Wave 1
  const mostRecentWave1 = useMemo(() => 
    [...waves]
      .sort((a, b) => b.startTimestamp - a.startTimestamp) // Sort by most recent first
      .find(wave => wave.number === 1),
    [waves]
  );

  // Filter data to start from most recent Wave 1
  const baseData = useMemo(() => {
    if (!mostRecentWave1 || !data.length) return data;
    
    // Find the index where the most recent Wave 1 starts
    return data.filter(item => item.timestamp >= mostRecentWave1.startTimestamp);
  }, [data, mostRecentWave1]);

  // Format the filtered data for the chart
  const processedChartData = useMemo(() => {
    const formattedData = formatChartData(baseData);
    return formattedData.map(d => ({
      ...d,
      candleHeight: Math.abs(d.close - d.open),
      candleY: Math.min(d.open, d.close),
      candleColor: d.close >= d.open ? 'var(--bullish)' : 'var(--bearish)',
      highValue: d.high,
      lowValue: d.low
    }));
  }, [baseData]);

  // Update display data based on zoom
  const displayData = useMemo(() => 
    zoomRange 
      ? processedChartData.slice(zoomRange.start, zoomRange.end + 1)
      : processedChartData,
    [processedChartData, zoomRange]
  );

  // Calculate price range for y-axis based on display data
  const { minPrice, maxPrice } = useMemo(() => {
    const prices = displayData.flatMap(d => [d.high, d.low]);
    return {
      minPrice: Math.min(...prices) * 0.98,
      maxPrice: Math.max(...prices) * 1.02
    };
  }, [displayData]);

  // Return early if no data available
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }

  // Use our utility function for wave preparation
  const waveLines = prepareWaveLines(waves, data);
    
  // Extract wave numbers for the legend
  const waveNumbers = [...new Set(waves.map(w => w.number))];

  // Add function to handle brush change
  const handleBrushChange = (brushRange: any) => {
    if (!brushRange) {
      setZoomRange(null);
      return;
    }
    
    const { startIndex, endIndex } = brushRange;
    setZoomRange({
      start: startIndex,
      end: endIndex
    });
  };

  const handleWaveSelect = (wave: Wave) => {
    setHighlightedWave(wave);
    
    // Find the data point indices for the selected wave
    const startIndex = processedChartData.findIndex(d => d.timestamp === wave.startTimestamp);
    const endIndex = processedChartData.findIndex(d => d.timestamp === wave.endTimestamp);
    
    // Set zoom range to show the selected wave
    setZoomRange({
      start: Math.max(0, startIndex - 5),
      end: Math.min(processedChartData.length - 1, endIndex + 5)
    });
  };

  // Update the wave lines to highlight the selected wave
  const updatedWaveLines = useMemo(() => {
    return waves.map(wave => ({
      ...wave,
      strokeWidth: wave === highlightedWave ? 3 : 1,
      strokeOpacity: wave === highlightedWave ? 1 : 0.6
    }));
  }, [waves, highlightedWave]);

  return (
    <div className="w-full h-[500px] bg-chart-background rounded-lg p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{symbol} - Elliott Wave Chart</h3>
          <p className="text-xs text-muted-foreground">
            {mostRecentWave1 
              ? `Showing Elliott Wave sequence starting from Wave 1 (${new Date(mostRecentWave1.startTimestamp * 1000).toLocaleDateString()})` 
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
          data={displayData}
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
          
          {/* Remove Tooltip component */}

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
          {updatedWaveLines.map((waveLine) => (
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

          {/* Enhanced brush for better zooming */}
          <Brush
            dataKey="timestamp"
            height={40}
            stroke="#8884d8"
            fill="rgba(136, 132, 216, 0.1)"
            tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
            startIndex={Math.max(0, processedChartData.length - 90)}
            travellerWidth={10}
            gap={1}
            className="mt-4"
            onChange={handleBrushChange}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <WaveSequencePagination 
        waves={waves} 
        onWaveSelect={handleWaveSelect} 
      />
    </div>
  );
};

export default StockDetailChart;


