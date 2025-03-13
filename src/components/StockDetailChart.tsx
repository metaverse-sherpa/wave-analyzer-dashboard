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

// Add this helper function at the top of your file after imports
const getTimestampValue = (timestamp: any): number => {
  if (typeof timestamp === 'number') {
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return 0;
};

const formatDateDisplay = (timestamp: any): string => {
  if (!timestamp) return 'N/A';
  
  try {
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString();
    } else if (typeof timestamp === 'number') {
      const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
      return new Date(ms).toLocaleDateString();
    } else if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleDateString();
    }
    return 'Invalid date';
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

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
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp))
      .find(wave => wave.number === 1),
    [waves]
  );

  // Use all historical data for the base chart
  const baseData = useMemo(() => {
    return data;
  }, [data]);

  // Format the filtered data for the chart
  const processedChartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      // Handle timestamp conversion properly
      timestamp: getTimestampValue(d.timestamp),
      close: d.close,
      open: d.open,
      high: d.high,
      low: d.low,
      value: d.close
    }));
  }, [data]);

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

  // 2. Add a function to calculate the extended domain at the component level
  const extendedDomain = useMemo(() => {
    if (!processedChartData.length) return ['dataMin', 'dataMax'];
    
    // Get the last timestamp (already converted to number)
    const lastTimestamp = processedChartData[processedChartData.length - 1].timestamp;
    
    // Add 30 days in milliseconds
    const extendedTimestamp = lastTimestamp + (30 * 24 * 60 * 60 * 1000);
    
    return ['dataMin', extendedTimestamp];
  }, [processedChartData]);

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
    
    // Find the data point indices for the selected wave using getTimestampValue
    const startIndex = processedChartData.findIndex(
      d => getTimestampValue(d.timestamp) === getTimestampValue(wave.startTimestamp)
    );
    const endIndex = processedChartData.findIndex(
      d => getTimestampValue(d.timestamp) === getTimestampValue(wave.endTimestamp)
    );
    
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
              ? `Showing Elliott Wave sequence starting from Wave 1 (${formatDateDisplay(mostRecentWave1.startTimestamp)})` 
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
              domain={extendedDomain}
              scale="time"
              // Update tickFormatter to handle numeric timestamps
              tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
              stroke="#94a3b8"
              ticks={processedChartData
                .filter((_, index) => index % Math.ceil(processedChartData.length / 6) === 0)
                .map(d => d.timestamp)
                .concat(extendedDomain[1])}
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

            {/* Price data area chart */}
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgba(148,189,255,0.3)" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="rgba(148,189,255,0.1)" stopOpacity={0}/>
              </linearGradient>
            </defs>

            {/* Main price area */}
            <Area
              type="monotone"
              dataKey="close"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={1.5}
              fill="url(#priceGradient)"
              fillOpacity={1}
              isAnimationActive={false}
            />

            {/* Price range area */}
            <Area
              type="monotone"
              dataKey="high"
              stroke="transparent"
              fill="rgba(255,255,255,0.05)"
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="low"
              stroke="transparent"
              baseLine={data => data.high}
              fill="rgba(255,255,255,0.05)"
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            
            {/* First, add a debug statement to check if you have Fibonacci targets */}
            console.log("FibTargets:", fibTargets);
            console.log("Current Wave:", currentWave);

            {/* Then, modify the Fibonacci targets section: */}
            {/* Fibonacci targets */}
            {currentWave && fibTargets && fibTargets.length > 0 ? (
              fibTargets
                .filter(target => {
                  // Make sure we have valid price data
                  if (!target || !target.price || !currentWave || !currentWave.endPrice) return false;
                  
                  const currentPrice = currentWave.endPrice;
                  if (currentWave.type === 'impulse') {
                    // For impulsive waves, show only targets above current price
                    return target.price > currentPrice;
                  } else {
                    // For corrective waves, show only targets below current price
                    return target.price < currentPrice;
                  }
                })
                .map((target, index) => (
                  <ReferenceLine
                    key={`fib-${index}`}
                    y={target.price}
                    stroke={target.isExtension ? "#9c27b0" : "#3f51b5"}
                    strokeDasharray="3 3"
                    strokeOpacity={0.8} // Increased opacity for better visibility
                    label={{
                      position: 'right',
                      value: `${target.label} ${currentWave.type === 'impulse' ? '▲' : '▼'}: $${target.price.toFixed(2)}`,
                      fill: target.isExtension ? "#9c27b0" : "#3f51b8",
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  />
                ))
            ) : (
              // Optional: Show a message when no targets are available
              <text
                x="50%"
                y="50"
                fill="#94a3b8"
                fontSize={12}
                textAnchor="middle"
              >
                No Fibonacci targets available
              </text>
            )}
            
            {/* Render wave lines */}
            {waveLines.map((waveLine, index) => {
              // Use getTimestampValue for comparison
              const isSelected = selectedWave && 
                getTimestampValue(waveLine.wave.startTimestamp) === getTimestampValue(selectedWave.startTimestamp);
              
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
                  strokeWidth={isSelected ? 4 : (waveLine.wave === highlightedWave ? 3 : 1)}
                  strokeOpacity={isSelected ? 1 : (waveLine.wave === highlightedWave ? 1 : 0.6)}
                  strokeDasharray={
                    // Current wave gets dashed line, all others are solid
                    currentWave && waveLine.wave.number === currentWave.number ? "5 5" : "0"
                  }
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
                    Math.max(0, processedChartData.findIndex(d => 
                      getTimestampValue(d.timestamp) >= getTimestampValue(mostRecentWave1.startTimestamp)
                    ) - 10), 
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


