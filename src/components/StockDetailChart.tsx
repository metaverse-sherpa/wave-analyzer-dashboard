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
  ReferenceArea,
  Line,
  Area,
  Bar,
  Brush,
  Label,
  ReferenceDot
} from 'recharts';

// Make sure to include these imports
import { tooltipFormatter } from './chart/chartConstants';
import { formatChartData } from './chart/chartUtils';
import WaveLegend from './chart/WaveLegend';
import { getWaveColor, prepareWaveLines, getWavePatternDescription } from './chart/waveChartUtils';
import WaveSequencePagination from './WaveSequencePagination'; // Add this import

// Update the getTimestampValue function at the top of your file to be more robust
const getTimestampValue = (timestamp: any): number => {
  if (timestamp === null || timestamp === undefined) return 0;
  
  // If it's already a number
  if (typeof timestamp === 'number') {
    // If it looks like seconds (Unix timestamp),
    // ALWAYS convert to milliseconds
    if (timestamp < 10000000000) {
      return timestamp * 1000; 
    }
    // Otherwise assume it's already in milliseconds
    return timestamp;
  }
  
  // If it's a Date object
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  
  // If it's a string, parse it
  if (typeof timestamp === 'string') {
    // Try parsing as ISO date
    const parsedDate = new Date(timestamp);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.getTime();
    }
    
    // Try parsing as number
    const numericValue = parseFloat(timestamp);
    if (!isNaN(numericValue)) {
      // If it looks like seconds (Unix timestamp)
      if (numericValue < 10000000000) {
        return numericValue * 1000;
      }
      return numericValue;
    }
  }
  
  console.warn("Invalid timestamp format:", timestamp);
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

  // Apply a direct fix to all data points
  const fixedData = useMemo(() => {
    // First check if we need to fix by examining the first data point
    if (data.length > 0) {
      const firstPoint = data[0];
      const timestamp = firstPoint.timestamp;
      const needsFix = typeof timestamp === 'number' && timestamp < 10000000000;
      
      if (needsFix) {
        console.log("APPLYING EMERGENCY TIMESTAMP FIX");
        
        // Deep clone the data and fix all timestamps
        return data.map(point => ({
          ...point,
          // Replace the timestamp directly with milliseconds
          timestamp: getTimestampValue(point.timestamp)
        }));
      }
    }
    
    // No fix needed
    return data;
  }, [data]);

  // Move the inner useMemo outside as a separate hook
  const wave1 = useMemo(() => 
    [...waves]
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp))
      .find(wave => wave.number === 1),
    [waves]
  );

  // Then use it in your processedChartData useMemo
  const processedChartData = useMemo(() => {
    if (!fixedData || fixedData.length === 0) return [];
    
    const wave1StartTimestamp = wave1 ? getTimestampValue(wave1.startTimestamp) : null;
    
    // First normalize all data points to ensure timestamp consistency
    const formattedData = fixedData.map(d => {
      // Ensure timestamp is a number in milliseconds
      const timestampMs = getTimestampValue(d.timestamp);
      
      // Return with all numeric values and properly formatted timestamp
      return {
        ...d,
        timestamp: timestampMs, // Store as milliseconds
        originalTimestamp: d.timestamp, // Keep original for reference
        date: new Date(timestampMs), // Add a date object for debugging
        close: Number(d.close),
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        value: Number(d.close)
      };
    });
    
    // Sort data by timestamp to ensure proper ordering
    formattedData.sort((a, b) => a.timestamp - b.timestamp);
    
    // Filter to start from MOST RECENT Wave 1 if available
    if (wave1StartTimestamp) {
      // Find index of first data point after wave1 start
      const wave1Index = formattedData.findIndex(d => d.timestamp >= wave1StartTimestamp);
      
      if (wave1Index !== -1) {
        // Include 10 extra data points before Wave 1 for context
        const startIndex = Math.max(0, wave1Index - 10);
        console.log(`Focusing chart on most recent Wave 1 starting at ${new Date(wave1StartTimestamp).toISOString()}`);
        return formattedData.slice(startIndex);
      }
    }
    
    return formattedData;
  }, [fixedData, waves, wave1]);

  // Add this right after your processedChartData definition
  React.useEffect(() => {
    // Debug date display - add this to find the issue
    if (processedChartData.length > 0) {
      const first = processedChartData[0];
      const last = processedChartData[processedChartData.length - 1];
      
      console.log("Chart date range:", {
        firstPoint: {
          timestamp: first.timestamp,
          date: new Date(first.timestamp).toISOString(),
          formatted: formatDateDisplay(first.timestamp)
        },
        lastPoint: {
          timestamp: last.timestamp,
          date: new Date(last.timestamp).toISOString(),
          formatted: formatDateDisplay(last.timestamp)
        }
      });
      
      // Check a wave timestamp
      if (waves.length > 0) {
        const wave = waves.find(w => w.number === 1);
        if (wave) {
          const waveTimestamp = getTimestampValue(wave.startTimestamp);
          console.log("Wave 1 timestamp:", {
            original: wave.startTimestamp,
            converted: waveTimestamp,
            date: new Date(waveTimestamp).toISOString(),
            formatted: formatDateDisplay(waveTimestamp)
          });
        }
      }
    }
  }, [processedChartData, waves]);

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
    if (!processedChartData.length) return [0, 0];
    
    // Get the last timestamp (already converted to number)
    const lastTimestamp = processedChartData[processedChartData.length - 1].timestamp;
    
    // Add 30 days in milliseconds
    const extendedTimestamp = lastTimestamp + (30 * 24 * 60 * 60 * 1000);
    
    return [processedChartData[0].timestamp, extendedTimestamp];
  }, [processedChartData]);

  // Fix the domain type error
  const domain = [
    Math.min(...processedChartData.map(d => d.timestamp)),
    Math.max(...processedChartData.map(d => d.timestamp))
  ];

  // Create a fixed data set with timestamps explicitly converted
  const fixedChartData = useMemo(() => {
    // Take the processed data and explicitly force all timestamps to be in milliseconds
    return processedChartData.map(point => ({
      ...point,
      // Create a dedicated field for the XAxis to use
      timestampMs: getTimestampValue(point.timestamp)
    }));
  }, [processedChartData]);

  // Return early if no data available
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }

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

  React.useEffect(() => {
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log("FibTargets:", fibTargets);
      console.log("Current Wave:", currentWave);
    }
  }, [fibTargets, currentWave]);

  React.useEffect(() => {
    // Debug timestamp formats
    if (process.env.NODE_ENV === 'development') {
      if (data.length > 0) {
        console.log("Sample data point:", {
          original: data[0],
          timestamp: data[0].timestamp,
          timestampType: typeof data[0].timestamp,
          normalized: getTimestampValue(data[0].timestamp),
          date: new Date(getTimestampValue(data[0].timestamp)).toISOString()
        });
      }
      
      if (waves.length > 0) {
        console.log("Sample wave:", {
          original: waves[0],
          startTimestamp: waves[0].startTimestamp,
          startTimestampType: typeof waves[0].startTimestamp,
          normalized: getTimestampValue(waves[0].startTimestamp),
          date: new Date(getTimestampValue(waves[0].startTimestamp)).toISOString()
        });
      }
    }
  }, [data, waves]);

  // Add this right before your return statement
  React.useEffect(() => {
    // Super-detailed timestamp validation
    if (processedChartData.length > 0) {
      const checkPoint = processedChartData[0];
      
      // Check for timestamp inconsistencies
      console.log("TIMESTAMP VALIDATION:", {
        firstPoint: {
          timestamp: checkPoint.timestamp,
          isNumber: typeof checkPoint.timestamp === 'number',
          isCorrectRange: checkPoint.timestamp > 10000000000, // Should be true for milliseconds
          date: new Date(checkPoint.timestamp).toISOString(),
          year: new Date(checkPoint.timestamp).getFullYear(),
          
          // Check if we'd get a different result by multiplying by 1000
          altDate: new Date(checkPoint.timestamp * 1000).toISOString(),
          altYear: new Date(checkPoint.timestamp * 1000).getFullYear(),
          
          // Also try the date object we stored
          dateObj: checkPoint.date,
          dateObjISO: checkPoint.date?.toISOString(),
        }
      });
      
      // Fix all timestamps by ensuring they're at least year 2000+
      if (new Date(checkPoint.timestamp).getFullYear() < 2000) {
        console.warn("FIXING BAD TIMESTAMPS - all points will be converted");
        
        // Add an emergency fix - use type assertion to add property
        processedChartData.forEach(point => {
          // Use type assertion to avoid TypeScript error
          (point as any)._fixedTimestamp = point.timestamp * 1000;
        });
      }
    }
    // Rest of the effect...
  }, [processedChartData, waves]);

  // Update your waveLines useMemo to filter for recent waves
  const waveLines = useMemo(() => {
    // Find the most recent wave 1 timestamp 
    const mostRecentWave1 = [...waves]
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp))
      .find(wave => wave.number === 1);
      
    const mostRecentWave1Timestamp = mostRecentWave1 
      ? getTimestampValue(mostRecentWave1.startTimestamp)
      : 0;
    
    console.log(`Most recent Wave 1 starts at: ${new Date(mostRecentWave1Timestamp).toISOString()}`);
      
    // Filter waves to only include those that start after the most recent Wave 1
    const recentWaves = mostRecentWave1Timestamp > 0
      ? waves.filter(wave => getTimestampValue(wave.startTimestamp) >= mostRecentWave1Timestamp)
      : waves;
      
    console.log(`Found ${recentWaves.length} waves in the most recent sequence`);
    
    // Now create the wave lines as before, but using only the recent waves
    return recentWaves
      .map(wave => {
        try {
          const startTimeMs = getTimestampValue(wave.startTimestamp);
          const endTimeMs = getTimestampValue(wave.endTimestamp);
          
          // Generate a unique ID if one doesn't exist on the wave
          const waveId = (wave as any).id || `wave-${wave.number}-${startTimeMs}`;
          
          return {
            id: waveId,
            wave: wave,
            color: getWaveColor(wave.number),
            data: [
              { 
                timestamp: wave.startTimestamp, 
                timestampMs: startTimeMs,  // Explicitly in milliseconds
                value: Number(wave.startPrice) 
              },
              { 
                timestamp: wave.endTimestamp, 
                timestampMs: endTimeMs,    // Explicitly in milliseconds
                value: Number(wave.endPrice) 
              }
            ]
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  }, [waves]);

  // Extract unique wave numbers for the legend
  const waveNumbers = useMemo(() => {
    // Get all unique wave numbers from the waves array
    return Array.from(new Set(waves.map(wave => wave.number)));
  }, [waves]);

  // Add this custom component inside your StockDetailChart component:
  const CustomWaveLabel = (props: any) => {
    const { x, y, value, fill, fontSize = 12, fontWeight = "bold" } = props;
    
    return (
      <g>
        <text
          x={x}
          y={y - 15} // Position above the point
          textAnchor="middle"
          fill={fill}
          fontSize={fontSize}
          fontWeight={fontWeight}
        >
          {value}
        </text>
      </g>
    );
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
              // IMPORTANT: Use the dedicated milliseconds field instead of timestamp
              dataKey="timestampMs"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={(tick) => {
                return new Date(tick).toLocaleDateString('en-US', {
                  month: 'short', 
                  day: 'numeric',
                  year: '2-digit'
                });
              }}
              stroke="#94a3b8"
              interval="preserveStart"
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
              baseLine={0}
              fill="rgba(255,255,255,0.05)"
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            
            {/* Fibonacci targets */}
            {fibTargets && fibTargets.length > 0 && currentWave && (
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
                    strokeOpacity={0.8}
                    label={{
                      position: 'right',
                      value: `${target.label} ${currentWave.type === 'impulse' ? '▲' : '▼'}: $${target.price.toFixed(2)}`,
                      fill: target.isExtension ? "#9c27b0" : "#3f51b8",
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  />
                ))
            )}
            
            {/* Render wave lines */}
            {waveLines.map(waveLine => (
              <Line
                key={waveLine.id}
                data={waveLine.data}
                type="monotone"
                dataKey="value"
                stroke={waveLine.color}
                strokeWidth={2}
                dot={{ r: 4, fill: waveLine.color, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: waveLine.color }}
                isAnimationActive={false}
                connectNulls={true}
              >
                {/* Add the label as a child of the Line */}
                <Label
                  position="end"
                  offset={5}
                  content={(props) => {
                    const { x, y, value } = props;
                    return (
                      <text
                        x={Number(x) + 5}
                        y={Number(y) - 5}
                        textAnchor="start"
                        fill={waveLine.color}
                        fontSize={12}
                        fontWeight="bold"
                      >
                        {waveLine.wave.number}
                      </text>
                    );
                  }}
                />
              </Line>
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
              dataKey="timestampMs"
              height={40}
              stroke="#8884d8"
              fill="rgba(136, 132, 216, 0.1)"
              tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
              // Focus on the most recent waves by default
              startIndex={Math.max(0, processedChartData.length - 90)}
              endIndex={processedChartData.length - 1}
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


