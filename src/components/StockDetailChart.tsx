import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StockHistoricalData } from '@/services/yahooFinanceService';
import { Wave, FibTarget } from '@/utils/elliottWaveAnalysis';
import { formatTimestamp } from '@/utils/dateUtils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions,
  ChartDataset,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Import datalabels
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register basic Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Register DataLabels plugin separately
ChartJS.register(ChartDataLabels);

// Helper functions
function getTimestampValue(timestamp: string | number): number {
  return typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
}

// The getWaveColor function is returning white for non-current waves:
function getWaveColor(waveNumber: string | number, isCurrentWave: boolean = false, currentWaveType?: string): string {
  // Define colors for all waves
  const WAVE_COLORS: Record<string | number, string> = {
    1: '#4CAF50', // Green
    2: '#FF9800', // Orange
    3: '#2196F3', // Blue
    4: '#F44336', // Red
    5: '#9C27B0', // Purple
    'A': '#FFEB3B', // Yellow
    'B': '#795548', // Brown
    'C': '#00BCD4'  // Cyan
  };
  
  // For non-current waves, use the distinct color with reduced opacity
  if (!isCurrentWave) {
    const baseColor = WAVE_COLORS[waveNumber] || '#FFFFFF';
    // Convert hex to rgba with 70% opacity
    if (baseColor.startsWith('#')) {
      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, 0.7)`;
    }
    return baseColor;
  }
  
  // For the current wave, use the color with full opacity
  return WAVE_COLORS[waveNumber] || '#FFFFFF';
}

// Define missing interface
interface StockDetailChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
  currentWave: Wave | null;
  fibTargets: FibTarget[];
  selectedWave: Wave | null;
  onClearSelection: () => void;
}

// Define OHLCDataPoint interface
interface OHLCDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const StockDetailChart: React.FC<StockDetailChartProps> = ({
  symbol,
  data,
  waves,
  currentWave,
  fibTargets,
  selectedWave,
  onClearSelection
}) => {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  
  // Add the missing mostRecentWave1 calculation
  const mostRecentWave1 = useMemo(() => {
    const sortedWaves = [...waves]
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp));
    return sortedWaves.find(wave => wave.number === 1);
  }, [waves]);
  
  // Add the missing ohlcData calculation
  const ohlcData = useMemo(() => {
    if (!data || data.length === 0) return [] as OHLCDataPoint[];
    
    // Filter data starting from most recent Wave 1 (if available)
    let filteredData = [...data];
    if (mostRecentWave1) {
      const startTime = getTimestampValue(mostRecentWave1.startTimestamp);
      // Include some bars before Wave 1 for context
      const wave1Index = data.findIndex(d => getTimestampValue(d.timestamp) >= startTime);
      if (wave1Index > 10) {
        filteredData = data.slice(wave1Index - 10);
      }
    }
    
    return filteredData.map(d => ({
      timestamp: getTimestampValue(d.timestamp),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close
    }));
  }, [data, mostRecentWave1]);
  
  // Add a function to check if a wave belongs to the current sequence
  const isWaveInCurrentSequence = (wave: Wave): boolean => {
    // If no mostRecentWave1 exists, we can't determine the current sequence
    if (!mostRecentWave1) return false;
    
    // Check if this wave starts at or after the most recent Wave 1
    return getTimestampValue(wave.startTimestamp) >= getTimestampValue(mostRecentWave1.startTimestamp);
  };

  // Format chart data for ChartJS with correct typing
  const chartData: ChartData<'line'> = {
    labels: ohlcData.map(d => new Date(d.timestamp).toLocaleDateString()),
    datasets: [
      // Price data
      {
        type: 'line' as const,
        label: symbol,
        data: ohlcData.map(d => d.close),
        borderColor: 'rgba(76, 175, 80, 0.5)', // Make more transparent
        backgroundColor: 'rgba(76, 175, 80, 0.05)', // Make fill very light
        borderWidth: 1, // Reduce from default (3) to 1
        fill: true,
        tension: 0.1,
        pointRadius: 0, // Remove points on the price line
        pointHoverRadius: 0, // No hover effect on points
        z: 0, // Ensure price data stays behind wave lines
        // Add explicit datalabels config to hide all labels for this dataset
        datalabels: {
          display: false
        }
      },
      // Wave lines - one dataset per wave
      ...waves.map(wave => {
        const isCurrentWave = currentWave && wave.number === currentWave.number;
        
        // Instead of calculating points for every timestamp, just add the start and end points
        const dataArray = Array(ohlcData.length).fill(null);
        
        // Find the indexes corresponding to start and end timestamps
        const startIndex = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.startTimestamp));
        let endIndex = -1;
        
        if (wave.endTimestamp) {
          endIndex = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.endTimestamp));
        } else {
          // For the current wave without an end timestamp, use the last data point
          endIndex = ohlcData.length - 1;
        }
        
        // Force valid indexes to ensure lines appear
        if (startIndex === -1 && endIndex !== -1) {
          dataArray[0] = wave.startPrice || 0; // Fallback to beginning of chart
        } else if (startIndex !== -1) {
          dataArray[startIndex] = wave.startPrice;
        }
        
        // Always ensure the end point has data
        if (endIndex !== -1) {
          dataArray[endIndex] = wave.endPrice || (wave.startPrice * 1.1); // Fallback if no end price
          console.log(`Set data point for Wave ${wave.number} at index ${endIndex} to ${dataArray[endIndex]}`);
        } else if (startIndex !== -1) {
          // Fallback to an arbitrary end point if we have a start but no end
          dataArray[Math.min(startIndex + 5, ohlcData.length - 1)] = wave.endPrice || (wave.startPrice * 1.1);
        }
        
        return {
          type: 'line' as const,
          label: `Wave ${wave.number}`,
          data: dataArray,
          borderColor: getWaveColor(wave.number, isCurrentWave, currentWave?.type),
          pointBackgroundColor: getWaveColor(wave.number, isCurrentWave, currentWave?.type),
          pointRadius: (ctx: any) => {
            const dataIndex = ctx.dataIndex;
            const dataValue = ctx.dataset.data[dataIndex];
            return dataValue !== null ? (isCurrentWave ? 6 : 4) : 0;
          },
          pointHoverRadius: 6,
          borderWidth: isCurrentWave ? 3 : 2,
          fill: false,
          tension: 0,
          spanGaps: true,
          stepped: false,
          z: isCurrentWave ? 15 : 5,
          datalabels: {
            // Only display labels at the end of waves in the current sequence
            display: (ctx: any) => {
              const dataIndex = ctx.dataIndex;
              // Check if this wave is part of the current sequence AND this is the end point
              return isWaveInCurrentSequence(wave) && dataIndex === endIndex;
            },
            backgroundColor: getWaveColor(wave.number, isCurrentWave),
            borderRadius: 4,
            color: 'white',
            font: {
              weight: 'bold' as const,
              size: isCurrentWave ? 14 : 11
            },
            padding: { left: 5, right: 5, top: 3, bottom: 3 },
            formatter: () => String(wave.number),
            // Position at the end of the wave line
            anchor: 'end',
            align: 'top',
            // Make sure current wave labels appear on top
            z: isCurrentWave ? 200 : 100,
            // Prevent labels from overlapping
            offset: isCurrentWave ? 8 : 0
          }
        };
      }),
      // Fibonacci targets
      ...fibTargets
        .filter(target => {
          if (!currentWave?.endPrice) return false;
          
          if (currentWave.type === 'impulse') {
            return target.price > currentWave.endPrice;
          } else {
            return target.price < currentWave.endPrice;
          }
        })
        .map(target => {
          // Always use the current wave's start point
          const startTime = getTimestampValue(currentWave!.startTimestamp);
          const startPrice = currentWave!.startPrice;
          
          // Get color based on current wave type
          const fibColor = currentWave!.type === 'impulse' 
            ? 'rgba(59, 130, 246, 0.8)' // Blue for bullish (impulse)
            : 'rgba(239, 68, 68, 0.8)';  // Red for bearish (corrective)
          
          const startIndex = ohlcData.findIndex(d => d.timestamp >= startTime);
          
          const dataArray = Array(ohlcData.length).fill(null);
          
          if (startIndex >= 0) {
            dataArray[startIndex] = startPrice;
          }
          
          dataArray[dataArray.length - 1] = target.price;
          
          return {
            type: 'line' as const,
            label: `${target.label}: $${target.price.toFixed(2)}`,
            data: dataArray,
            borderColor: fibColor,
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointStyle: 'circle',
            pointBackgroundColor: fibColor,
            pointBorderColor: 'white',
            pointBorderWidth: 1,
            // Show point only at the very end
            pointRadius: (ctx: any) => {
              return ctx.dataIndex === dataArray.length - 1 ? 6 : 0;
            },
            fill: false,
            tension: 0,
            spanGaps: true,
            z: 10,
            datalabels: {
              // Keep the existing datalabels configuration
              display: (ctx: any) => {
                return ctx.dataIndex === dataArray.length - 1;
              },
              align: 'right',
              anchor: 'end',
              backgroundColor: fibColor,
              borderRadius: 4,
              color: 'white',
              font: {
                size: 11,
                weight: 'bold' as const
              },
              padding: { left: 6, right: 6, top: 3, bottom: 3 },
              // Simplified formatter - just show the price
              formatter: () => {
                // Return only the price - no percentage
                return `$${target.price.toFixed(2)}`;
              },
              offset: 20,
              clamp: true,
              textStrokeColor: 'black',
              textStrokeWidth: 0.5,
              textShadow: '0px 0px 2px rgba(0,0,0,0.8)'
            }
          };
        }),
    ] as ChartDataset<'line', any>[], // Type assertion to fix dataset type issues
  };
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0
    },
    scales: {
      x: {
        grid: {
          color: '#2d3748'
        },
        ticks: {
          color: '#d1d5db',
        }
      },
      y: {
        grid: {
          color: '#2d3748'
        },
        ticks: {
          color: '#d1d5db',
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
      // Configure datalabels plugin globally
      datalabels: {
        // Set to "false" by default, but let individual datasets override this
        display: false,
        color: 'white',
        font: {
          weight: 'bold' as const
        },
        // Force always display the label regardless of chart area boundaries
        clamp: true,
        // Add some overlap prevention
        overlap: false,
        // Ensure visibility
        clip: false
      },
      // Remove or comment out this entire annotations section
      /*
      annotation: {
        annotations: waves.map((wave, index) => {
          const isCurrentWave = currentWave && wave.number === currentWave.number;
          const endIndex = wave.endTimestamp 
            ? ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.endTimestamp))
            : ohlcData.length - 1;
          
          return {
            type: 'label',
            id: `wave-${wave.number}`,
            content: String(wave.number),
            xValue: endIndex,
            yValue: wave.endPrice || 0,
            backgroundColor: getWaveColor(wave.number, isCurrentWave, currentWave?.type),
            borderRadius: 10,
            color: 'white',
            font: {
              weight: 'bold',
              size: isCurrentWave ? 12 : 10
            },
            padding: { left: 4, right: 4, top: 2, bottom: 2 }
          };
        })
      }
      */
    },
    // Add this to make space for labels on the right side
    layout: {
      padding: {
        right: 80
      }
    }
  } as ChartOptions<'line'>;
  
  // Mark chart as loaded on mount
  useEffect(() => {
    setChartLoaded(true);
  }, []);
  
  // Return early if no data
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }
  
  return (
    <div className="w-full h-[500px] relative">
      {/* Chart header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{symbol} - Elliott Wave Chart</h3>
          <p className="text-xs text-muted-foreground">
            {mostRecentWave1 
              ? `Showing Elliott Wave sequence starting from Wave 1 (${formatTimestamp(mostRecentWave1.startTimestamp)})` 
              : `No wave patterns detected`
            }
          </p>
        </div>
      </div>
      
      {/* Chart container */}
      <div className="relative h-[400px] bg-[#1a1a1a] rounded-md p-4">
        <Line 
          data={chartData}
          options={options}
          ref={chartRef}
        />
        
        {!chartLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <Skeleton className="h-full w-full" />
          </div>
        )}
      </div>
      
      {/* Wave legend */}
      <div className="mt-2 flex flex-wrap gap-2">
        {/* Fix the type issue in the map function */}
        {Array.from(new Set(waves.map(w => w.number))).map((number: string | number) => {
          const isCurrentWaveNumber = currentWave && number === currentWave.number;
          const color = getWaveColor(number, isCurrentWaveNumber, currentWave?.type);
          
          return (
            <div key={String(number)} className="flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-1" 
                style={{ backgroundColor: color }} 
              />
              <span className={`text-xs ${isCurrentWaveNumber ? 'font-bold' : ''}`}>
                Wave {number} {isCurrentWaveNumber ? '(current)' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StockDetailChart;


