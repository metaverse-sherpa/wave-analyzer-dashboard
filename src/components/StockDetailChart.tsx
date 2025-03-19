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

// Add this code right after the component imports, before the chart registration

// Update the currentPriceLabelPlugin to not reference livePrice directly

// Change this plugin definition
const currentPriceLabelPlugin = {
  id: 'currentPriceLabel',
  afterDatasetsDraw(chart: any) {
    const { ctx, scales } = chart;
    const currentPriceDataset = chart.data.datasets.find((d: any) => d.label === 'Current Price');
    if (!currentPriceDataset) return;
    
    const currentPrice = currentPriceDataset.data[0];
    if (!currentPrice) return;
    
    // Check if this is a live price by looking for a flag in the dataset
    const isLivePrice = currentPriceDataset.isLivePrice;
    
    const x = scales.x.right;
    const y = scales.y.getPixelForValue(currentPrice);
    
    // Draw the price label
    ctx.save();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    
    // Draw a small rectangle as background
    const price = `$${currentPrice.toFixed(2)}`;
    // Make it wider to accommodate the "LIVE" indicator
    const textWidth = ctx.measureText(price).width + (isLivePrice ? 40 : 16);
    
    ctx.fillRect(x, y - 10, textWidth, 20);
    
    // Draw the price text
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(price, x + textWidth - 8, y);
    
    // Add a "LIVE" indicator if we're using live price
    if (isLivePrice) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#4CAF50'; // Green color for "LIVE"
      ctx.fillText('LIVE', x + 8, y);
    }
    
    ctx.restore();
  }
};

// Register the custom plugin
ChartJS.register(currentPriceLabelPlugin);

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
  livePrice?: number; // Add this new prop
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
  onClearSelection,
  livePrice // Use the prop passed from the parent component
}) => {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  
  // Add the missing mostRecentWave1 calculation
  const mostRecentWave1 = useMemo(() => {
    const sortedWaves = [...waves]
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp));
    return sortedWaves.find(wave => wave.number === 1);
  }, [waves]);
  
  // Update the ohlcData calculation in the useMemo hook

const ohlcData = useMemo(() => {
  if (!data || data.length === 0) return [] as OHLCDataPoint[];
  
  // Filter data starting from most recent Wave 1 (if available)
  let filteredData = [...data];
  if (mostRecentWave1) {
    const startTime = getTimestampValue(mostRecentWave1.startTimestamp);
    // Find the exact index of Wave 1 start
    const wave1Index = data.findIndex(d => getTimestampValue(d.timestamp) >= startTime);
    
    if (wave1Index > -1) {
      // Include exactly 5 bars before Wave 1 for minimal context
      const contextIndex = Math.max(0, wave1Index - 5);
      filteredData = data.slice(contextIndex);
      console.log(`Displaying chart from index ${contextIndex} (Wave 1 starts at ${wave1Index})`);
    } else {
      console.warn("Wave 1 start timestamp not found in data");
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

// First, get the current price - add this right after the ohlcData useMemo block
const effectiveCurrentPrice = useMemo(() => {
  // If we have a live price, use that first
  if (livePrice && livePrice > 0) {
    return livePrice;
  }
  
  // Fall back to the last candle price if no live price is available
  if (ohlcData.length > 0) {
    return ohlcData[ohlcData.length - 1].close;
  }
  
  return null;
}, [livePrice, ohlcData]);
  
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
      // Add current price horizontal line
      ...(effectiveCurrentPrice ? [{
        type: 'line' as const,
        label: 'Current Price',
        data: Array(ohlcData.length).fill(effectiveCurrentPrice),
        borderColor: 'rgba(255, 255, 255, 0.6)',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        tension: 0,
        fill: false,
        z: 20,
        isLivePrice: livePrice && livePrice > 0, // Add this flag to indicate if it's a live price
        datalabels: {
          display: false
        }
      }] : []),
      // Wave lines - one dataset per wave
      ...waves
        .filter(wave => {
          // Only show waves that are part of the current sequence (after most recent Wave 1)
          return isWaveInCurrentSequence(wave);
        })
        .map(wave => {
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
          
          // Ensure valid indexes to draw wave lines properly
          if (startIndex !== -1) {
            dataArray[startIndex] = wave.startPrice;
            
            // If we have a valid end index, set that point too
            if (endIndex !== -1) {
              dataArray[endIndex] = wave.endPrice;
            }
            // For waves without end points or out-of-range endpoints
            else if (wave.endPrice) {
              dataArray[ohlcData.length - 1] = wave.endPrice;
            }
            
            // Connect start and end points with a line by filling in intermediate points
            if (startIndex < endIndex && wave.startPrice && wave.endPrice) {
              const priceDiff = wave.endPrice - wave.startPrice;
              const steps = endIndex - startIndex;
              for (let i = 1; i < steps; i++) {
                const interpolatedIndex = startIndex + i;
                const ratio = i / steps;
                dataArray[interpolatedIndex] = wave.startPrice + (priceDiff * ratio);
              }
            }
          }
      
          return {
            type: 'line' as const,
            label: `Wave ${wave.number}`,
            data: dataArray,
            borderColor: getWaveColor(wave.number, isCurrentWave, currentWave?.type),
            // Remove pointBackgroundColor as we won't show points except at specific locations
            
            // Only show points at the start and end of waves, not along the line
            pointRadius: (ctx: any) => {
              const dataIndex = ctx.dataIndex;
              // Show points only at start and end positions
              if (dataIndex === startIndex || dataIndex === endIndex) {
                return isCurrentWave ? 6 : 4;
              }
              return 0; // No dots for intermediate points
            },
            
            // Reduce hover effect for cleaner look
            pointHoverRadius: 4,
            
            // Solid line styling
            borderWidth: isCurrentWave ? 3 : 2,
            fill: false,
            tension: 0.1, // Slight curve for better visual
            spanGaps: true,
            stepped: false,
            z: isCurrentWave ? 15 : 5,
            
            // Only show labels at the end points
            datalabels: {
              display: (ctx: any) => {
                const dataIndex = ctx.dataIndex;
                // Only show label at the end point
                return dataIndex === endIndex;
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
              anchor: 'end',
              align: 'top',
              z: isCurrentWave ? 200 : 100,
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
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10, // Limit the number of x-axis labels
          callback: function(value: any, index: number) {
            // Show fewer date labels for better readability
            const date = new Date(ohlcData[index]?.timestamp);
            return date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            });
          }
        }
      },
      y: {
        grid: {
          color: '#2d3748'
        },
        ticks: {
          color: '#d1d5db',
        },
        // Add a bit of padding to the y-axis so the labels don't get cut off
        afterFit: (scaleInstance: any) => {
          scaleInstance.width = scaleInstance.width + 20;
        }
      }
    },
    plugins: {
      // Disable the legend entirely
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        titleFont: {
          size: 14,
          weight: 'bold' 
        },
        bodyFont: {
          size: 13
        },
        padding: 12,
        borderColor: '#475569',
        borderWidth: 1,
        cornerRadius: 6,
        caretSize: 6
      },
      datalabels: {
        // Global datalabels options
      },
      
      // Add custom plugin for current price label
      currentPriceLabel: {
        afterDatasetsDraw(chart: any) {
          const { ctx, scales } = chart;
          if (!effectiveCurrentPrice) return;
          
          const x = scales.x.right;
          const y = scales.y.getPixelForValue(effectiveCurrentPrice);
          
          // Draw the price label
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          
          // Draw a small rectangle as background
          const price = `$${effectiveCurrentPrice.toFixed(2)}`;
          const textWidth = ctx.measureText(price).width + 10;
          
          ctx.fillRect(x - 5, y - 10, textWidth, 20);
          
          // Draw text
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.font = '11px sans-serif';
          ctx.fillStyle = 'black';
          ctx.fillText(price, x - 10, y);
          
          ctx.restore();
        }
      }
    },
    
    // ...existing layout config
    layout: {
      padding: {
        right: 80,
        left: 10,
        top: 20,
        bottom: 10
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
              ? `Showing Elliott Wave sequence from ${new Date(mostRecentWave1.startTimestamp).toLocaleDateString()} to present` 
              : `No wave patterns detected`
            }
          </p>
          {mostRecentWave1 && (
            <p className="text-xs text-primary mt-1">
              <span className="font-medium">Wave 1 Start:</span> ${mostRecentWave1.startPrice?.toFixed(2)} on {formatTimestamp(mostRecentWave1.startTimestamp)}
            </p>
          )}
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
    </div>
  );
};

export default StockDetailChart;


