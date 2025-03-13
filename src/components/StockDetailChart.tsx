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
  ReferenceArea, // Add this import
  Line,
  Area,
  Bar,
  Brush,
  Label,
  ReferenceDot, // Add this import
} from 'recharts';

// Make sure to include these imports
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData } from './chart/chartUtils';
import WaveLegend from './chart/WaveLegend';
import { getWaveColor, prepareWaveLines, getWavePatternDescription } from './chart/waveChartUtils';
import WaveSequencePagination from './WaveSequencePagination'; // Add this import

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
  currentWave: Wave | null;
  fibTargets: FibTarget[];
  selectedWave: Wave | null; // Add this prop
  onClearSelection: () => void; // Add this prop
}

const StockDetailChart: React.FC<StockDetailChartProps> = ({
  symbol,
  data,
  waves,
  currentWave,
  fibTargets,
  selectedWave, // Add this prop
  onClearSelection // Add this prop
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

  // Use all historical data for the base chart
  const baseData = useMemo(() => {
    return data;
  }, [data]);

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
  const waveLines = useMemo(() => {
    return prepareWaveLines(waves, data);
  }, [waves, data]);
    
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

  return (
    <div className="w-full h-[500px] bg-chart-background rounded-lg p-4">
      {/* Chart header */}
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
      
      {/* Main chart container */}
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
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
            
            {/* Render wave lines */}
            {waveLines.map((waveLine, index) => {
              // Use startTimestamp for comparison instead of id
              const isSelected = selectedWave && waveLine.wave.startTimestamp === selectedWave.startTimestamp;
              
              // Determine label position
              const isImpulsiveWave = 
                waveLine.wave.number === 1 || 
                waveLine.wave.number === 3 || 
                waveLine.wave.number === 5 || 
                waveLine.wave.number === 'B';
              
              return (
                <Line
                  key={`wave-${index}-${waveLine.id}`}
                  data={waveLine.data}
                  type="linear"
                  dataKey="value"
                  stroke={waveLine.color}
                  strokeWidth={isSelected ? 4 : (waveLine.wave === highlightedWave ? 3 : 1)} // Make selected wave thicker
                  strokeOpacity={isSelected ? 1 : (waveLine.wave === highlightedWave ? 1 : 0.6)} // Make selected wave fully opaque
                  strokeDasharray={waveLine.wave.isImpulse ? "0" : "5 5"}
                  dot={{
                    r: isSelected ? 6 : 4, // Make dots larger for selected wave
                    fill: waveLine.color,
                    stroke: isSelected ? "#fff" : "#fff",
                    strokeWidth: isSelected ? 2 : 1
                  }}
                  activeDot={{
                    r: isSelected ? 8 : 6,
                    fill: waveLine.color,
                    stroke: "#fff",
                    strokeWidth: isSelected ? 2 : 1,
                    onMouseOver: () => setHoveredWave(waveLine.wave),
                    onMouseLeave: () => setHoveredWave(null)
                  }}
                  connectNulls
                  isAnimationActive={false}
                  label={(props) => {
                    // Only show label at end point (index 1 in a 2-point line)
                    const { x, y, index: dataIndex, value, width, height, ...rest } = props;
                    if (dataIndex !== 1) return null; // Only show at end point
                    
                    return (
                      <g>
                        <text
                          x={x}
                          y={y + (isImpulsiveWave ? -15 : 15)}
                          textAnchor="middle"
                          fill={isSelected ? "#FFFF00" : "#FFFFFF"} // Highlight selected wave label in yellow
                          stroke="#000000"
                          strokeWidth={isSelected ? 0.8 : 0.5} // Thicker outline for selected wave
                          fontSize={isSelected ? 14 : 12} // Larger font for selected wave
                          fontWeight="bold"
                        >
                          {waveLine.wave.number}
                        </text>
                      </g>
                    );
                  }}
                />
              );
            })}
            
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
              // Show last 90 data points by default (typically 3 months of daily data)
              // but expand view if we have a wave pattern starting earlier
              startIndex={mostRecentWave1 
                ? Math.min(
                    Math.max(0, processedChartData.findIndex(d => d.timestamp >= mostRecentWave1.startTimestamp) - 10), 
                    Math.max(0, processedChartData.length - 90)
                  )
                : Math.max(0, processedChartData.length - 90)}
              travellerWidth={10}
              gap={1}
              className="mt-4"
              onChange={handleBrushChange}
            />

            {/* Add selection highlight cancel on chart click */}
            <rect
              x={0}
              y={0}
              width="100%"
              height="100%"
              fill="transparent"
              onClick={() => {
                if (selectedWave) {
                  onClearSelection();
                }
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StockDetailChart;


