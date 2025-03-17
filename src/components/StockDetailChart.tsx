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
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        tension: 0.1,
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
        borderWidth: 2,
        fill: false,
        tension: 0,
        spanGaps: true,
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
        .map(target => ({
          type: 'line' as const,
          label: `${target.label}: $${target.price.toFixed(2)}`,
          data: ohlcData.map(() => target.price),
          borderColor: target.isExtension ? "#9C27B0" : "#3F51B5",
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        })),
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
      // Configure datalabels plugin
      datalabels: {
        align: 'center',
        anchor: 'center',
      }
    },
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


