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

function getWaveColor(waveNumber: string | number): string {
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
      ...waves.map(wave => ({
        type: 'line' as const,
        label: `Wave ${wave.number}`,
        data: ohlcData.map(d => {
          const timestamp = d.timestamp;
          const startTime = getTimestampValue(wave.startTimestamp);
          const endTime = getTimestampValue(wave.endTimestamp);
          
          if (timestamp >= startTime && timestamp <= endTime) {
            // Linear interpolation between start and end prices
            const progress = (timestamp - startTime) / (endTime - startTime);
            return wave.startPrice + progress * (wave.endPrice - wave.startPrice);
          }
          return null as any; // No value outside the wave timeframe
        }),
        borderColor: getWaveColor(wave.number),
        pointBackgroundColor: getWaveColor(wave.number),
        pointRadius: (context: any) => {
          const dataIndex = context.dataIndex;
          const timestamp = ohlcData[dataIndex]?.timestamp;
          return timestamp === getTimestampValue(wave.endTimestamp) ? 5 : 0;
        },
        pointHoverRadius: 5,
        borderWidth: 2.5, // Increase from 2 to 2.5
        fill: false,
        tension: 0,
        spanGaps: true,
        z: 10, // Ensure wave lines appear on top
        datalabels: {
          display: (ctx: any) => {
            const dataIndex = ctx.dataIndex;
            const timestamp = ohlcData[dataIndex]?.timestamp;
            return timestamp === getTimestampValue(wave.endTimestamp);
          },
          backgroundColor: getWaveColor(wave.number),
          borderRadius: 10,
          color: 'white',
          font: {
            weight: 'bold' as const
          },
          padding: 4,
          formatter: () => String(wave.number)
        }
      })),
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
          
          const startIndex = ohlcData.findIndex(d => d.timestamp >= startTime);
          
          const dataArray = Array(ohlcData.length).fill(null);
          
          if (startIndex >= 0) {
            dataArray[startIndex] = startPrice;
          }
          
          dataArray[dataArray.length - 1] = target.price;
          
          // Log for debugging
          console.log(`Fibonacci line for ${target.label}: Starting from current wave ${currentWave!.number} at price $${startPrice}`);
          
          // Keep the rest of the code the same
          return {
            type: 'line' as const,
            label: `${target.label}: $${target.price.toFixed(2)}`,
            data: dataArray,
            borderColor: target.isExtension ? "#9C27B0" : "#3F51B5",
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointStyle: 'circle',
            pointBackgroundColor: target.isExtension ? "#9C27B0" : "#3F51B5",
            pointBorderColor: 'white',
            pointBorderWidth: 1,
            // Show point only at the very end
            pointRadius: (ctx: any) => {
              return ctx.dataIndex === dataArray.length - 1 ? 6 : 0;
            },
            fill: false,
            tension: 0,
            spanGaps: true,
            z: 5,
            datalabels: {
              // Keep the existing datalabels configuration
              display: (ctx: any) => {
                return ctx.dataIndex === dataArray.length - 1;
              },
              align: 'right',
              anchor: 'end',
              backgroundColor: target.isExtension ? "#9C27B0" : "#3F51B5",
              borderRadius: 4,
              color: 'white',
              font: {
                size: 11,
                weight: 'bold' as const
              },
              padding: { left: 6, right: 6, top: 3, bottom: 3 },
              // Simplified formatter - just show the price
              formatter: () => `$${target.price.toFixed(2)}`,
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
      }
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
        {Array.from(new Set(waves.map(w => w.number))).map((number: string | number) => (
          <div key={String(number)} className="flex items-center">
            <div 
              className="w-3 h-3 rounded-full mr-1" 
              style={{ backgroundColor: getWaveColor(number) }} 
            />
            <span className="text-xs">Wave {number}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockDetailChart;


