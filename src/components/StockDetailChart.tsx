import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StockHistoricalData } from '@/services/yahooFinanceService';
import { Wave, FibTarget } from '@/types/shared';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Skeleton } from '@/components/ui/skeleton';
import {formatTimestamp} from '@/utils/dateUtils';
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
  invalidWaves?: Wave[];  // Add this property
  currentWave: Wave;
  fibTargets: FibTarget[];
  selectedWave?: Wave | null;
  onClearSelection?: () => void;
  livePrice?: number;
}

// Define OHLCDataPoint interface
interface OHLCDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// First update the custom type to include the z property
// Add near the top of file with other type definitions:
interface CustomChartDataset extends ChartDataset<'line', any> {
  z?: number;
  isLivePrice?: boolean;
}

const StockDetailChart: React.FC<StockDetailChartProps> = ({
  symbol,
  data,
  waves,
  currentWave,
  fibTargets,
  selectedWave,
  onClearSelection,
  livePrice, // Use the prop passed from the parent component
  invalidWaves
}) => {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  
  // Add the missing mostRecentWave1 calculation
  const mostRecentWave1 = useMemo(() => {
    const sortedWaves = [...waves]
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp));
    return sortedWaves.find(wave => wave.number === 1);
  }, [waves]);
  
  // Add this variable definition after the mostRecentWave1 useMemo
  const latestWave = useMemo(() => {
    // Find the most recent completed wave
    const completedWaves = waves.filter(w => w.isComplete);
    if (completedWaves.length === 0) return null;
    
    // Sort by end timestamp (most recent first)
    return [...completedWaves].sort((a, b) => {
      const aTime = getTimestampValue(a.endTimestamp || 0);
      const bTime = getTimestampValue(b.endTimestamp || 0);
      return bTime - aTime;
    })[0];
  }, [waves]);
  
  // Fix the ohlcData calculation in the useMemo hook

const { ohlcData, startIndex: historicalStartIndex } = useMemo(() => {
  if (!data || data.length === 0) return { ohlcData: [] as OHLCDataPoint[], startIndex: 0 };
  
  // Use the mostRecentWave1 that we've already calculated
  if (mostRecentWave1) {
    const wave1Start = getTimestampValue(mostRecentWave1.startTimestamp);
    
    // Add this debug in the ohlcData calculation
    if (mostRecentWave1) {
      const wave1Start = getTimestampValue(mostRecentWave1.startTimestamp);
      console.log(`Most recent Wave 1 starts at: ${new Date(wave1Start).toLocaleString()}`);
      
      // Find index of data point 7 days before Wave 1 start
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const targetStartTime = wave1Start - sevenDaysMs;
      console.log(`Target chart start time (7 days earlier): ${new Date(targetStartTime).toLocaleString()}`);
    }
    
    // Find index of data point 7 days before Wave 1 start
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const targetStartTime = wave1Start - sevenDaysMs;
    
    let startIndex = data.findIndex(d => getTimestampValue(d.timestamp) >= targetStartTime);
    if (startIndex === -1) startIndex = 0;
    if (startIndex > 0) startIndex--; // Include one more candle for context
    
    console.log(`Filtering chart data starting from ${new Date(targetStartTime).toLocaleDateString()} (7 days before most recent Wave 1)`);
    
    // Get the filtered historical data
    const filteredData = data.slice(startIndex).map(d => {
      // Numeric conversion with validation
      const close = typeof d.close === 'number' ? d.close : parseFloat(d.close);
      const open = typeof d.open === 'number' ? d.open : parseFloat(d.open);
      const high = typeof d.high === 'number' ? d.high : parseFloat(d.high);
      const low = typeof d.low === 'number' ? d.low : parseFloat(d.low);
      
      return {
        timestamp: getTimestampValue(d.timestamp),
        open: open,
        high: high,
        low: low,
        close: close
      };
    });
    
    // Add 20 days of future data points for projections
    const lastPoint = filteredData[filteredData.length - 1];
    const futurePoints: OHLCDataPoint[] = [];
    
    if (lastPoint) {
      const lastTimestamp = lastPoint.timestamp;
      const lastClose = lastPoint.close;
      
      // Generate 20 future data points at daily intervals
      for (let i = 1; i <= 20; i++) {
        futurePoints.push({
          timestamp: lastTimestamp + (i * 24 * 60 * 60 * 1000),
          open: lastClose,
          high: lastClose,
          low: lastClose,
          close: lastClose
        });
      }
      
      console.log(`Added ${futurePoints.length} future data points for projections`);
    }
    
    // Return combined historical and future data
    return {
      ohlcData: [...filteredData, ...futurePoints],
      startIndex
    };
  }
  
  // If no Wave 1, return all data plus 20 days
  const baseData = data.map(d => ({
    timestamp: getTimestampValue(d.timestamp),
    open: typeof d.open === 'number' ? d.open : parseFloat(d.open),
    high: typeof d.high === 'number' ? d.high : parseFloat(d.high),
    low: typeof d.low === 'number' ? d.low : parseFloat(d.low),
    close: typeof d.close === 'number' ? d.close : parseFloat(d.close)
  }));
  
  // Add future points even if no Wave 1
  if (baseData.length > 0) {
    const lastPoint = baseData[baseData.length - 1];
    const futurePoints: OHLCDataPoint[] = [];
    
    for (let i = 1; i <= 20; i++) {
      futurePoints.push({
        timestamp: lastPoint.timestamp + (i * 24 * 60 * 60 * 1000),
        open: lastPoint.close,
        high: lastPoint.close,
        low: lastPoint.close,
        close: lastPoint.close
      });
    }
    
    return {
      ohlcData: [...baseData, ...futurePoints],
      startIndex: 0
    };
  }
  
  return {
    ohlcData: baseData,
    startIndex: 0
  };
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

// Add this debugging right after receiving data in the component
useEffect(() => {
  if (data && data.length > 0) {
    console.log("Sample data points:", data.slice(0, 3));
  }
}, [data]);

// Add this right after the ohlcData useMemo
const priceStats = useMemo(() => {
  if (ohlcData.length === 0) return { min: 0, max: 100, validData: true };
  
  // Calculate min and max prices
  let minPrice = Number.MAX_VALUE;
  let maxPrice = Number.MIN_VALUE;
  let invalidCount = 0;
  
  ohlcData.forEach(d => {
    if (!isNaN(d.close) && d.close < 1000000) { // Reasonable upper bound for stock prices
      minPrice = Math.min(minPrice, d.close);
      maxPrice = Math.max(maxPrice, d.close);
    } else {
      invalidCount++;
    }
  });
  
  // If too many invalid values or the range is too extreme, something is wrong
  const isValid = invalidCount < ohlcData.length * 0.1 && maxPrice / minPrice < 1000;
  
  if (!isValid) {
    console.error("Detected potentially corrupted price data:", {
      minPrice,
      maxPrice,
      invalidCount,
      totalPoints: ohlcData.length,
      samplePoints: ohlcData.slice(0, 5).map(d => d.close)
    });
  }
  
  return {
    min: minPrice === Number.MAX_VALUE ? 0 : minPrice,
    max: maxPrice === Number.MIN_VALUE ? 100 : maxPrice,
    validData: isValid
  };
}, [ohlcData]);

// Add an effect to alert about bad data
useEffect(() => {
  if (!priceStats.validData) {
    console.error("CRITICAL ERROR: Price data appears to be corrupted. Check data source.");
    
    // You could also show a UI error here
  }
}, [priceStats.validData]);
  
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
      // Price data - with extra validation
      {
        type: 'line' as const,
        label: symbol,
        data: ohlcData.map(d => {
          // Extra validation to ensure we don't render bad values
          if (isNaN(d.close) || d.close > 1000000) {
            return null; // Skip this point rather than showing bad data
          }
          return d.close;
        }),
        borderColor: 'rgba(76, 175, 80, 0.7)', // Brighter green border
        backgroundColor: 'rgba(76, 175, 80, 0.1)', // Much lighter green fill
        borderWidth: 1.5, // Slightly thicker border
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 0,
        z: 0,
        spanGaps: true, // Important: connect across null values
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
          // Only include waves from the current sequence
          if (!mostRecentWave1 || wave.number === 0) return false;
          
          // Check if this wave's start time is after the most recent Wave 1 start time
          const wave1StartTime = getTimestampValue(mostRecentWave1.startTimestamp);
          const waveStartTime = getTimestampValue(wave.startTimestamp);
          
          return waveStartTime >= wave1StartTime;
        })
        .map(wave => {
          // Get wave color based on wave number
          const isCurrentWave = currentWave && wave.number === currentWave.number;
          const color = getWaveColor(wave.number, isCurrentWave, wave.type);
          
          // Start and end timestamps
          const startTimestamp = wave.startTimestamp;
          const endTimestamp = wave.endTimestamp || data[data.length - 1].timestamp;
          
          // Find the data points within this wave's time range
          let dataArray = Array(ohlcData.length).fill(null);
          
          // Find indices with better boundary checking
          const startIndex = ohlcData.findIndex(d => d.timestamp >= startTimestamp);
          let endIndex = ohlcData.findIndex(d => d.timestamp >= endTimestamp);
          
          // Handle case where endTimestamp is beyond our data
          if (endIndex === -1) {
            endIndex = ohlcData.length - 1;
          }
          
          // Handle case where startTimestamp is before our data
          const effectiveStartIndex = startIndex === -1 ? 0 : startIndex;
          
          // Debug output
          console.log(`Drawing Wave ${wave.number}: startIndex=${effectiveStartIndex}, endIndex=${endIndex}, total=${ohlcData.length}`);
          
          // Only proceed if we have valid bounds
          if (effectiveStartIndex <= endIndex && endIndex < ohlcData.length) {
            // Populate data points for the wave duration
            for (let i = effectiveStartIndex; i <= endIndex; i++) {
              dataArray[i] = ohlcData[i].close;
            }
          } else {
            console.warn(`Wave ${wave.number} is completely outside chart bounds:`, 
                        { start: effectiveStartIndex, end: endIndex, total: ohlcData.length });
          }
          
          return {
            type: 'line' as const,
            label: `Wave ${wave.number}`,
            data: dataArray,
            borderColor: color,
            borderWidth: isCurrentWave ? 3 : 2,
            // Add a dashed line pattern if the wave was terminated due to invalidation
            borderDash: wave.isTerminated ? [5, 5] : [],
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: color,
            fill: false,
            tension: 0.1,
            z: 10,
            datalabels: {
              // UPDATED: Only show label at the END of the wave
              display: (ctx: any) => {
                if (!dataArray[ctx.dataIndex]) return false;
                
                // Only show at the end index
                return ctx.dataIndex === endIndex;
              },
              // UPDATED: Only show the wave number, no Start/End text
              formatter: (value: any, ctx: any) => {
                const w = waves.find(w => `Wave ${w.number}` === ctx.dataset.label);
                
                // Just return the wave number with warning symbol if terminated
                return w?.isTerminated 
                  ? `${w.number}⚠️` 
                  : `${w.number}`;
              },
              color: 'white',
              backgroundColor: color,
              borderRadius: 4,
              padding: { left: 6, right: 6, top: 2, bottom: 2 },
              font: {
                weight: 'bold',
                size: 10
              },
              // Position the label at end of wave
              anchor: 'end',
              align: 'bottom',
              offset: 0
            }
          };
        }),
      // Add connection lines between waves - with YELLOW color for visibility
      ...waves
        .filter(wave => {
          // Only include waves from the current sequence
          if (!mostRecentWave1) return false;
          
          // Check if this wave belongs to the current sequence
          const wave1StartTime = getTimestampValue(mostRecentWave1.startTimestamp);
          const waveStartTime = getTimestampValue(wave.startTimestamp);
          
          return waveStartTime >= wave1StartTime && wave.number !== 0;
        })
        .map((wave, index, currentSequenceWaves) => {
          // Skip the first wave since it doesn't need a connection line
          if (wave.number === 1 || wave.number === 'A') {
            console.log(`Skipping connection for first wave: ${wave.number}`);
            return null;
          }
          
          // For each wave, find the previous wave in the sequence
          let prevWave;
          
          // Handle numeric waves (usually impulse waves 1-5)
          if (typeof wave.number === 'number') {
            const targetNumber = wave.number - 1;
            prevWave = currentSequenceWaves.find(w => 
              typeof w.number === 'number' && w.number === targetNumber
            );
            console.log(`Looking for previous wave ${targetNumber}, found: ${prevWave ? 'yes' : 'no'}`);
          } 
          // Handle ABC corrective waves
          else if (wave.number === 'B') {
            prevWave = currentSequenceWaves.find(w => w.number === 'A');
          }
          else if (wave.number === 'C') {
            prevWave = currentSequenceWaves.find(w => w.number === 'B');
          }
          // Handle transition from corrective to impulse
          else if (
            ((typeof wave.number === 'number' && wave.number === 1) || 
             (typeof wave.number === 'string' && wave.number === '1')) && 
            currentSequenceWaves.some(w => w.number === 'C')
          ) {
            prevWave = currentSequenceWaves.find(w => w.number === 'C');
          }
          
          // If we can't find the previous wave or either wave is missing required data, skip
          if (!prevWave || !prevWave.endTimestamp || !prevWave.endPrice || !wave.startTimestamp || !wave.startPrice) {
            console.log("Missing data for connection line: Wave " + wave.number);
            return null;
          }
          
          // Create a straight line connecting the waves
          const startTime = getTimestampValue(prevWave.endTimestamp);
          const endTime = getTimestampValue(wave.startTimestamp);
          const startPrice = prevWave.endPrice;
          const endPrice = wave.startPrice;
          
          // Find indices in the ohlcData array
          const startIndex = ohlcData.findIndex(d => d.timestamp >= startTime);
          const endIndex = ohlcData.findIndex(d => d.timestamp >= endTime);
          
          // If we can't find the indices, skip this connection
          if (startIndex === -1 || endIndex === -1) {
            console.log("Cannot draw connection: indices not found for " + prevWave.number + " to " + wave.number);
            return null;
          }
          
          console.log("Drawing connection from " + prevWave.number + " (" + startIndex + ") to " + wave.number + " (" + endIndex + ")");
          
          // Create data points only at start and end for a direct line
          const dataArray = Array(ohlcData.length).fill(null);
          dataArray[startIndex] = startPrice;
          dataArray[endIndex] = endPrice;
          
          return {
            type: 'line' as const,
            label: "Connection " + prevWave.number + "-" + wave.number,
            data: dataArray,
            borderColor: 'rgba(255, 255, 0, 0.9)', // YELLOW with high opacity for maximum visibility
            borderWidth: 3.5, // Even thicker for visibility
            borderDash: [4, 3], // Short dashed pattern
            pointRadius: 0, // No points along the line
            fill: false,
            tension: 0, // Straight line
            z: 25, // Very high z-index to ensure visibility above everything else
            spanGaps: true, // CRITICAL: Connects across null values
            datalabels: {
              display: false
            }
          };
        })
        .filter(Boolean), // Remove null entries
      // Fibonacci targets
      ...fibTargets
        .filter(target => {
          // Only show targets if the current wave is NOT complete
          if (!currentWave || currentWave.isComplete) return false;
          
          if (currentWave.type === 'impulse') {
            return target.price > currentWave.endPrice || !currentWave.endPrice;
          } else {
            return target.price < currentWave.endPrice || !currentWave.endPrice;
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
          
          // Always extend to the last point (which is now 20 days in the future)
          dataArray[dataArray.length - 1] = target.price;
          
          return {
            type: 'line' as const,
            label: target.label + ": $" + target.price.toFixed(2),
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
            z: 5, // Lower z-index to keep below wave lines
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
                return "$" + target.price.toFixed(2);
              },
              offset: 20,
              clamp: true,
              textStrokeColor: 'black',
              textStrokeWidth: 0.5,
              textShadow: '0px 0px 2px rgba(0,0,0,0.8)'
            }
          };
        }),
      // Add markers for invalid waves
      ...(invalidWaves || []).map(wave => {
        // Only include waves with invalidation information
        if (!wave.invalidationTimestamp || !wave.invalidationPrice) return null;
        
        // Find the index in the data array
        const invalidIdx = ohlcData.findIndex(d => d.timestamp >= wave.invalidationTimestamp);
        if (invalidIdx === -1) return null;
        
        // Create specific highlighting for Wave 4 invalidations
        const isWave4Violation = wave.number === 4 && wave.invalidationRule?.includes("Wave 1");
        
        // Create a dataset that shows an X at the invalidation point
        return {
          type: 'scatter' as const,
          label: `Wave ${wave.number} Invalidated: ${wave.invalidationRule}`,
          data: ohlcData.map((d, i) => {
            if (i === invalidIdx) {
              return { x: i, y: wave.invalidationPrice };
            }
            return null;
          }),
          backgroundColor: isWave4Violation ? 'rgba(255, 0, 0, 0.9)' : 'rgba(255, 0, 0, 0.8)',
          borderColor: isWave4Violation ? 'rgba(255, 0, 0, 1)' : 'rgba(255, 0, 0, 0.8)',
          borderWidth: isWave4Violation ? 3 : 2,
          pointStyle: isWave4Violation ? 'crossRot' : 'crossRot', // X shape
          pointRadius: isWave4Violation ? 12 : 10,
          pointHoverRadius: isWave4Violation ? 14 : 12,
          showLine: false,
          z: 40,
          datalabels: {
            display: true,
            align: 'bottom',
            anchor: 'center',
            backgroundColor: isWave4Violation ? 'rgba(255, 0, 0, 0.9)' : 'rgba(255, 0, 0, 0.8)',
            borderRadius: 4,
            color: 'white',
            font: {
              size: isWave4Violation ? 12 : 11,
              weight: 'bold' as const
            },
            padding: { left: 6, right: 6, top: 3, bottom: 3 },
            formatter: () => isWave4Violation ? 
              `Wave 4 Invalid: Entered Wave 1 Territory` : 
              `Wave ${wave.number} Invalid: ${wave.invalidationRule?.split(' ')[0]}...`,
            offset: 8,
            clamp: true
          }
        };
      }).filter(Boolean),
    ] as ChartDataset<'line', any>[], // Type assertion to fix dataset type issues
  };
  
  // Handle Wave A projection zone
  if (latestWave && latestWave.number === 5 && latestWave.isComplete) {
    const wave4 = waves.find(w => w.number === 4);
    const wave5 = waves.find(w => w.number === 5);
    
    if (wave4 && wave5 && wave4.endPrice && wave5.endPrice) {
      // Calculate the retracement zone for Wave A (38.2% to 61.8%)
      const impulseRange = Math.abs(wave5.endPrice - wave4.endPrice);
      const isUptrend = wave5.endPrice > wave4.endPrice;
      const direction = isUptrend ? -1 : 1;
      
      const wave5EndIdx = ohlcData.findIndex(d => d.timestamp >= wave5.endTimestamp);
      if (wave5EndIdx >= 0) {
        // Create a zone for potential Wave A
        const targetA382 = wave5.endPrice + (impulseRange * 0.382 * direction);
        const targetA618 = wave5.endPrice + (impulseRange * 0.618 * direction);
        
        // Add a shaded zone showing potential Wave A territory
        chartData.datasets.push({
          type: 'line' as const,
          label: 'Potential Wave A Zone (38.2%)',
          data: ohlcData.map((_, i) => {
            if (i >= wave5EndIdx) {
              // Upper bound of retracement zone
              return isUptrend ? targetA382 : targetA618;
            }
            return null;
          }),
          borderColor: 'rgba(255, 90, 90, 0.5)',
          backgroundColor: 'rgba(255, 90, 90, 0.1)',
          fill: '+1', // Fill to the next dataset
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          // Remove z property or use type assertion
          datalabels: {
            display: false
          }
        } as CustomChartDataset);
        
        chartData.datasets.push({
          type: 'line' as const,
          label: 'Potential Wave A Zone (61.8%)',
          data: ohlcData.map((_, i) => {
            if (i >= wave5EndIdx) {
              // Lower bound of retracement zone
              return isUptrend ? targetA618 : targetA382;
            }
            return null;
          }),
          borderColor: 'rgba(255, 90, 90, 0.5)',
          backgroundColor: 'rgba(255, 90, 90, 0.1)',
          fill: '-1', // Fill to the previous dataset
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          // Remove z property or use type assertion
          datalabels: {
            display: false
          }
        } as CustomChartDataset);
        
        // Add price labels for the retracement levels
        chartData.datasets.push({
          type: 'line' as const,
          label: `Wave A 38.2% Target: $${targetA382.toFixed(2)}`,
          data: Array(ohlcData.length).fill(null),
          // Just add a single point at the end for the label
          pointRadius: (ctx: any) => ctx.dataIndex === ohlcData.length - 1 ? 4 : 0,
          pointBackgroundColor: 'rgba(255, 90, 90, 0.8)',
          borderColor: 'rgba(255, 90, 90, 0.5)',
          borderWidth: 0,
          pointBorderColor: 'white',
          pointBorderWidth: 1,
          // Remove z property or use type assertion
          datalabels: {
            display: false
          }
        } as CustomChartDataset);
        
        console.log(`Added Wave A projection zone for ${symbol} after Wave 5 completion`);
        console.log(`Wave A targets: 38.2% at $${targetA382.toFixed(2)}, 61.8% at $${targetA618.toFixed(2)}`);
      }
    }
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0
    },
    scales: {
      x: {
        grid: {
          color: (context: any) => {
            const index = context.tick.value;
            // Calculate the index in the original data array before filtering
            const dataLength = data ? data.length : 0;
            // Check if this point is in the projection area (future data)
            const isProjection = index >= (dataLength - historicalStartIndex);
            return isProjection ? 'rgba(76, 175, 80, 0.1)' : '#2d3748';
          }
        },
        ticks: {
          color: '#d1d5db',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12, // Increased from 10 to show more dates
          callback: function(value: any, index: number) {
            const point = ohlcData[index];
            if (!point) return '';
            
            const date = new Date(point.timestamp);
            const isProjection = index >= data.length;
            
            // Format the date
            const formattedDate = date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            });
            
            // Add a + symbol for future dates
            return isProjection ? "+" + formattedDate : formattedDate;
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
        },
        // Add min/max settings if we detect data issues
        ...(priceStats.validData ? {} : {
          min: priceStats.min * 0.9,
          max: priceStats.max * 1.1
        })
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
          const price = "$" + effectiveCurrentPrice.toFixed(2);
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
  
  // Add this before returning the chart component to help diagnose issues
  useEffect(() => {
    if (waves.length > 0) {
      console.log("Wave data available:", waves.map(w => ({
        number: w.number,
        start: new Date(w.startTimestamp).toLocaleDateString(),
        end: w.endTimestamp ? new Date(w.endTimestamp).toLocaleDateString() : 'ongoing',
        startPrice: w.startPrice,
        endPrice: w.endPrice || 'ongoing'
      })));
      
      // Check if wave timestamps are within the displayed ohlcData range
      const dataStart = ohlcData[0]?.timestamp;
      const dataEnd = ohlcData[ohlcData.length - 1]?.timestamp;
      
      if (dataStart && dataEnd) {
        console.log("Chart data range:", {
          start: new Date(dataStart).toLocaleDateString(),
          end: new Date(dataEnd).toLocaleDateString(),
          points: ohlcData.length
        });
        
        const outOfRangeWaves = waves.filter(w => 
          w.startTimestamp < dataStart || 
          (w.endTimestamp && w.endTimestamp > dataEnd)
        );
        
        if (outOfRangeWaves.length > 0) {
          console.warn("Some waves fall outside chart range:", 
            outOfRangeWaves.map(w => w.number)
          );
        }
      }
    }
  }, [waves, ohlcData]);

  // Fix the out-of-range wave detection
  useEffect(() => {
    if (waves.length > 0 && mostRecentWave1) {
      const wave1Start = getTimestampValue(mostRecentWave1.startTimestamp);
      
      // Only count waves from the current sequence - more strict filtering
      const currentSequenceWaves = waves.filter(wave => {
        // Check if wave is part of the current sequence (starts after Wave 1)
        const waveStart = getTimestampValue(wave.startTimestamp);
        return waveStart >= wave1Start && wave.number !== 0;
      });
      
      // Log the waves we're focusing on
      console.log("Current sequence waves:", currentSequenceWaves.map(w => w.number));
      
      if (currentSequenceWaves.length === 0) {
        console.warn("No waves in current sequence to display");
        return;
      }
      
      // Check data range - exclude future projection points
      const realDataPoints = data.length;
      const dataStart = ohlcData[0]?.timestamp;
      const dataEnd = ohlcData[realDataPoints - 1]?.timestamp;
      
      if (!dataStart || !dataEnd) return;
      
      console.log("Chart data range:", {
        start: new Date(dataStart).toLocaleDateString(),
        end: new Date(dataEnd).toLocaleDateString(),
        actual: realDataPoints,
        withProjections: ohlcData.length
      });
    }
  }, [waves, ohlcData, mostRecentWave1, data.length]);
  
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
      {/* Add warning banner for invalid data */}
      {!priceStats.validData && (
        <div className="bg-red-500/20 border border-red-700 rounded-lg p-3 mb-3 text-red-100">
          <strong>Warning:</strong> Chart data appears corrupted. Price values may be incorrect.
          Please try refreshing the page or contact support if the issue persists.
        </div>
      )}
      
      {/* Chart header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{symbol} - Elliott Wave Chart</h3>
          <p className="text-xs text-muted-foreground">
            {mostRecentWave1 
              ? "Showing Elliott Wave sequence from " + new Date(mostRecentWave1.startTimestamp).toLocaleDateString() + " to present"
              : "No wave patterns detected"
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


