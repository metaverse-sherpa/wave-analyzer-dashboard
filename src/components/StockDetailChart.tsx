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
  ChartDataset,
  Filler,
  ChartType,
  ChartData,    // Add this import
  ChartOptions,  // Add this import,
  ScatterController,  // Add this import
  LineController,
  BarController   // Add any other controllers you might use
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Import datalabels
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Add to StockDetailChart.tsx at the imports section
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAdminSettings } from '@/context/AdminSettingsContext';

// Add this code right after the component imports, before the chart registration

// Update the currentPriceLabelPlugin to handle the new data format
const currentPriceLabelPlugin = {
  id: 'currentPriceLabel',
  afterDatasetsDraw(chart: any) {
    const { ctx, scales } = chart;
    const currentPriceDataset = chart.data.datasets.find((d: any) => d.label === 'Current Price');
    if (!currentPriceDataset) return;
    
    // Access the first non-null data point to get the price
    const dataPoint = currentPriceDataset.data.find((d: any) => d !== null);
    if (!dataPoint) return;
    
    // Extract the y value which is the actual price
    const currentPrice = typeof dataPoint === 'object' ? dataPoint.y : dataPoint;
    if (currentPrice === null || currentPrice === undefined) return;
    
    // Check if this is a live price by looking for a flag in the dataset
    const isLivePrice = currentPriceDataset.isLivePrice;
    
    const x = scales.x.right;
    const y = scales.y.getPixelForValue(currentPrice);
    
    // Draw the price label
    ctx.save();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    
    // Draw a small rectangle as background
    // Add a safety check before attempting to use toFixed
    const priceText = typeof currentPrice === 'number' 
      ? `$${currentPrice.toFixed(2)}`
      : 'Unknown';
    // Make it wider to accommodate the "LIVE" indicator
    const textWidth = ctx.measureText(priceText).width + (isLivePrice ? 40 : 16);
    
    ctx.fillRect(x, y - 10, textWidth, 20);
    
    // Draw the price text
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(priceText, x + textWidth - 8, y);
    
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
  Filler,
  ChartDataLabels,
  ScatterController,  // Add this registration
  LineController,
  BarController   // Add any other controllers you might use
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

// Replace the CustomChartDataset interface with this simplified version
type CustomChartDataset = {
  type: 'line' | 'scatter';
  label: string;
  data: any[];
  z?: number;
  isLivePrice?: boolean;
  [key: string]: any; // Allow any other ChartJS properties
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
  const { settings } = useAdminSettings();
  const chartPaddingDays = settings.chartPaddingDays;
  
  const [viewMode, setViewMode] = useState<'all' | 'current'>('current');
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
  
  // For "current wave" view, focus only on data since the most recent Wave 1
  if (viewMode === 'current' && mostRecentWave1) {
    // Get timestamp for the most recent Wave 1
    const wave1Start = getTimestampValue(mostRecentWave1.startTimestamp);
    
    // Add 7 days padding before Wave 1 for context
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const targetStartTime = wave1Start - sevenDaysMs;
    
    let startIndex = data.findIndex(d => getTimestampValue(d.timestamp) >= targetStartTime);
    if (startIndex === -1) startIndex = 0;
    if (startIndex > 0) startIndex--; // Include one more candle for context
    
    console.log(`Filtering chart data to current wave sequence starting from ${new Date(targetStartTime).toLocaleDateString()}`);
    
    // Get the filtered historical data
    const filteredData = data.slice(startIndex).map(d => ({
      timestamp: getTimestampValue(d.timestamp),
      open: typeof d.open === 'number' ? d.open : parseFloat(d.open),
      high: typeof d.high === 'number' ? d.high : parseFloat(d.high),
      low: typeof d.low === 'number' ? d.low : parseFloat(d.low),
      close: typeof d.close === 'number' ? d.close : parseFloat(d.close)
    }));
    
    // Add future data points for projections
    const lastPoint = filteredData[filteredData.length - 1];
    const futurePoints: OHLCDataPoint[] = [];
    
    if (lastPoint) {
      // Use the live price if available, otherwise fall back to the last close price
      const projectionPrice = livePrice && livePrice > 0 ? livePrice : lastPoint.close;
      
      // Generate future points
      for (let i = 1; i <= chartPaddingDays; i++) {
        futurePoints.push({
          timestamp: lastPoint.timestamp + (i * 24 * 60 * 60 * 1000),
          open: projectionPrice,
          high: projectionPrice,
          low: projectionPrice,
          close: projectionPrice
        });
      }
      
      // Log the projection for debugging
      console.log(`Using ${livePrice && livePrice > 0 ? 'live price' : 'last close'} for projections: $${projectionPrice.toFixed(4)}`);
    }
    
    return {
      ohlcData: [...filteredData, ...futurePoints],
      startIndex
    };
  } 
  else {
    // For "all waves" view, show all waves but ensure we can see the earliest one
    const allWaves = waves || [];
    let earliestWaveTimestamp = Number.MAX_SAFE_INTEGER;
    
    // Find the earliest timestamp across all waves
    allWaves.forEach(wave => {
      if (wave.startTimestamp && getTimestampValue(wave.startTimestamp) < earliestWaveTimestamp) {
        earliestWaveTimestamp = getTimestampValue(wave.startTimestamp);
      }
    });
    
    // If there are no waves, use the default behavior with mostRecentWave1
    if (earliestWaveTimestamp === Number.MAX_SAFE_INTEGER && mostRecentWave1) {
      earliestWaveTimestamp = getTimestampValue(mostRecentWave1.startTimestamp);
    }
    
    // If we have a timestamp, use that to filter data
    if (earliestWaveTimestamp !== Number.MAX_SAFE_INTEGER) {
      // Add 7 days padding before the earliest wave for context
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const targetStartTime = earliestWaveTimestamp - sevenDaysMs;
      
      let startIndex = data.findIndex(d => getTimestampValue(d.timestamp) >= targetStartTime);
      if (startIndex === -1) startIndex = 0;
      if (startIndex > 0) startIndex--; // Include one more candle for context
      
      console.log(`Filtering chart data starting from ${new Date(targetStartTime).toLocaleDateString()} (showing all waves)`);
      
      // Get the filtered historical data
      const filteredData = data.slice(startIndex).map(d => ({
        timestamp: getTimestampValue(d.timestamp),
        open: typeof d.open === 'number' ? d.open : parseFloat(d.open),
        high: typeof d.high === 'number' ? d.high : parseFloat(d.high),
        low: typeof d.low === 'number' ? d.low : parseFloat(d.low),
        close: typeof d.close === 'number' ? d.close : parseFloat(d.close)
      }));
      
      // Add future data points for projections
      const lastPoint = filteredData[filteredData.length - 1];
      const futurePoints: OHLCDataPoint[] = [];
      
      if (lastPoint) {
        // Generate future points
        for (let i = 1; i <= chartPaddingDays; i++) {
          futurePoints.push({
            timestamp: lastPoint.timestamp + (i * 24 * 60 * 60 * 1000),
            open: lastPoint.close,
            high: lastPoint.close,
            low: lastPoint.close,
            close: lastPoint.close
          });
        }
      }
      
      return {
        ohlcData: [...filteredData, ...futurePoints],
        startIndex
      };
    }
    
    // Fall back to using all data if no waves are found
    return {
      ohlcData: data.map(d => ({
        timestamp: getTimestampValue(d.timestamp),
        open: typeof d.open === 'number' ? d.open : parseFloat(d.open),
        high: typeof d.high === 'number' ? d.high : parseFloat(d.high),
        low: typeof d.low === 'number' ? d.low : parseFloat(d.low),
        close: typeof d.close === 'number' ? d.close : parseFloat(d.close)
      })),
      startIndex: 0
    };
  }
}, [data, waves, mostRecentWave1, viewMode]); // Add viewMode to dependencies

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

// Add this function to safely map chart data
const createSafeDataPoint = (index: number, value: number | null): { x: number, y: number | null } => {
  // Always return an object with x and y properties, even if y is null
  return { x: index, y: value };
};

// Add this function to generate the full wave connection data
const generateWaveConnectionData = (filteredWaves: Wave[]): CustomChartDataset | null => {
  // Only create connections if we have at least 2 waves
  if (!filteredWaves || filteredWaves.length < 2) {
    return null;
  }
  
  // Sort waves by number to ensure correct sequence
  const sortedWaves = [...filteredWaves].sort((a, b) => {
    // Convert to numbers if they're strings, or compare as is
    const aNum = typeof a.number === 'string' ? parseInt(a.number) : a.number;
    const bNum = typeof b.number === 'string' ? parseInt(b.number) : b.number;
    return aNum - bNum;
  });
  
  // Create a map of indices for each wave
  const waveIndices: Record<string|number, number> = {};
  
  // Find index in ohlcData for each wave's start point
  sortedWaves.forEach(wave => {
    const startIndex = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.startTimestamp));
    if (startIndex !== -1) {
      waveIndices[wave.number] = startIndex;
    }
  });
  
  // Generate data array with nulls
  const dataArray = Array(ohlcData.length).fill(null);
  
  // Fill in the data points for wave connections
  sortedWaves.forEach(wave => {
    if (waveIndices[wave.number] !== undefined) {
      // Get the index for this wave
      const idx = waveIndices[wave.number];
      
      // Use the wave's price at this point
      dataArray[idx] = createSafeDataPoint(idx, wave.startPrice).y;
      
      // If this is the last wave and it has an end point, add that too
      if (wave === sortedWaves[sortedWaves.length - 1] && wave.endTimestamp && wave.endPrice) {
        const endIndex = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.endTimestamp));
        if (endIndex !== -1) {
          dataArray[endIndex] = createSafeDataPoint(endIndex, wave.endPrice).y;
        }
      }
    }
  });
  
  // Create the dataset for wave connections
  return {
    type: 'line',
    label: 'Wave Connections',
    data: dataArray,
    borderColor: 'rgba(255, 255, 255, 0.9)', // White line
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 0,
    fill: false,
    tension: 0, // Straight lines
    z: 5, // Render below individual wave lines
    spanGaps: true, // Connect across gaps
    datalabels: {
      display: false // No labels on connection lines
    }
  } as CustomChartDataset;
};

// Update your chartData definition to use a more flexible type
const chartData = {
  labels: ohlcData.map(d => new Date(d.timestamp).toLocaleDateString()),
  datasets: [
    // Price data as an area chart
    {
      type: 'line',
      label: symbol,
      data: ohlcData.map((d, index) => createSafeDataPoint(index, d.close)),
      borderColor: 'rgba(76, 175, 80, 0.5)',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      borderWidth: 1,
      fill: true,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 0,
      z: 0,
      spanGaps: true,
      datalabels: {
        display: false
      }
    } as CustomChartDataset,
    
    // Add wave connections as a single white line
    // Filter waves according to current view mode
    ...((() => {
      const filteredWaves = waves.filter(wave => {
        if (!wave || wave.number === 0) return false;
        
        if (viewMode === 'current' && mostRecentWave1) {
          const wave1StartTime = getTimestampValue(mostRecentWave1.startTimestamp);
          const waveStartTime = getTimestampValue(wave.startTimestamp);
          return waveStartTime >= wave1StartTime;
        }
        
        return true;
      });
      
      const connection = generateWaveConnectionData(filteredWaves);
      return connection ? [connection] : [];
    })()),
    
    // Wave lines - individual points with labels
    ...waves
      .filter(wave => {
        // Filter logic remains the same
        if (!wave || wave.number === 0) return false;
        
        if (viewMode === 'current' && mostRecentWave1) {
          const wave1StartTime = getTimestampValue(mostRecentWave1.startTimestamp);
          const waveStartTime = getTimestampValue(wave.startTimestamp);
          return waveStartTime >= wave1StartTime;
        }
        
        return true;
      })
      .map(wave => {
        const startTimestamp = wave.startTimestamp;
        const endTimestamp = wave.endTimestamp || data[data.length - 1].timestamp;
        
        // Find BOTH start and end indices
        const startIndex = ohlcData.findIndex(d => d.timestamp >= startTimestamp);
        const endIndex = ohlcData.findIndex(d => d.timestamp >= endTimestamp);
        
        const effectiveStartIndex = startIndex === -1 ? 0 : startIndex;
        const effectiveEndIndex = endIndex === -1 ? ohlcData.length - 1 : endIndex;
        
        // Check invalidation
        const isInvalidated = invalidWaves?.some(invalidWave => 
          invalidWave.number === wave.number && 
          Math.abs(getTimestampValue(invalidWave.startTimestamp) - 
                   getTimestampValue(wave.startTimestamp)) < 86400000
        );
        
        // Create data array with nulls except at start AND end points
        const dataArray = Array(ohlcData.length).fill(null);
        
        if (effectiveStartIndex < ohlcData.length) {
          // Add the point at wave start
          dataArray[effectiveStartIndex] = createSafeDataPoint(effectiveStartIndex, 
            wave.startPrice).y;
          
          // Add the point at wave end (for label placement)
          if (effectiveEndIndex < ohlcData.length && wave.endPrice) {
            dataArray[effectiveEndIndex] = createSafeDataPoint(effectiveEndIndex, 
              wave.endPrice).y;
          }
        }
        
        return {
          type: 'scatter',
          label: `Wave ${wave.number}${isInvalidated ? ' (Invalidated)' : ''}`,
          data: dataArray,
          backgroundColor: isInvalidated ? 'rgba(255, 0, 0, 0.7)' : 'white',
          borderColor: isInvalidated ? 'rgba(255, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.5)',
          borderWidth: isInvalidated ? 2 : 1,
          pointRadius: (ctx: any) => {
            // Only show points at start of wave
            return ctx.dataIndex === effectiveStartIndex ? 
              (isInvalidated ? 6 : 4) : 0;
          },
          pointHoverRadius: isInvalidated ? 8 : 6,
          pointStyle: isInvalidated ? 'crossRot' : 'circle',
          z: 15,
          datalabels: {
            // The issue is with your display condition - it's too restrictive
            display: (ctx: any) => {
              // Always show labels for invalidated waves, regardless of end point
              if (isInvalidated) return true;
              
              // For valid waves, only show at the end point if it exists
              return wave.endPrice && ctx.dataIndex === effectiveEndIndex;
            },
            formatter: (value: any, ctx: any) => {
              // Only show X for invalidated waves and only at the start point
              if (isInvalidated && ctx.dataIndex === effectiveStartIndex) {
                return '❌';
              }
              // For normal waves, show the wave number
              return `${wave.number}`;
            },
            color: 'white',
            backgroundColor: isInvalidated ? 'rgba(255, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.7)',
            borderRadius: 4,
            padding: { left: 6, right: 6, top: 2, bottom: 2 },
            font: {
              weight: 'bold',
              size: isInvalidated ? 14 : 10,
            },
            // Position the label directly over the point for invalidated waves
            anchor: isInvalidated ? 'center' : 'end',
            align: isInvalidated ? 'center' : 'bottom',
            offset: isInvalidated ? 0 : 5
          }
        } as CustomChartDataset;
      }),
    // Add current price line with dashed style
    ...(effectiveCurrentPrice ? [{
      type: 'line',
      label: 'Current Price',
      data: ohlcData.map((_, index) => createSafeDataPoint(index, effectiveCurrentPrice)),
      borderColor: 'rgba(255, 255, 255, 0.6)',
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      tension: 0,
      fill: false,
      z: 20,
      isLivePrice: livePrice && livePrice > 0,
      datalabels: {
        display: false
      }
    }] : []) as CustomChartDataset[],
    // Add Fibonacci targets for incomplete waves
    ...(currentWave && !currentWave.isComplete && fibTargets && fibTargets.length > 0 ? 
      fibTargets
        // Filter out "Wave 3 High" targets
        .filter(target => !target.label.includes("Wave 3 High"))
        .map(target => {
          // Find the start point index for the current wave
          const startIndex = ohlcData.findIndex(d => 
            d.timestamp >= getTimestampValue(currentWave.startTimestamp)
          );
          
          if (startIndex === -1) return null;
          
          // Create diagonal lines from start of wave to each fib target
          const dataArray = Array(ohlcData.length).fill(null);
          
          // Add the start point
          dataArray[startIndex] = createSafeDataPoint(startIndex, currentWave.startPrice).y;
          
          // Add the target point - draw to the projection area
          const endIndex = Math.min(startIndex + 15, ohlcData.length - 1);
          dataArray[endIndex] = createSafeDataPoint(endIndex, target.price).y;
          
          // Create the fib target dataset
          return {
            type: 'line',
            label: `${target.label}: $${target.price.toFixed(2)}`,
            data: ohlcData.map((_, i) => {
              // Create a straight line from start point to end point
              if (i === startIndex) {
                // Starting point - must return a number, not an object
                return currentWave.startPrice;
              } 
              else if (i === endIndex) {
                // End point - must return a number, not an object
                return target.price;
              } 
              else if (i > startIndex && i < endIndex) {
                // Calculate points along the line for intermediate points
                const progress = (i - startIndex) / (endIndex - startIndex);
                return currentWave.startPrice + (target.price - currentWave.startPrice) * progress;
              }
              return null;
            }),
            borderColor: target.isExtension ? 'rgba(255, 152, 0, 0.9)' : 'rgba(33, 150, 243, 0.9)',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0, // Straight line
            pointRadius: [0], // No points except at the end
            pointHoverRadius: 4,
            pointBackgroundColor: target.isExtension ? 'rgba(255, 152, 0, 1.0)' : 'rgba(33, 150, 243, 1.0)',
            pointBorderColor: 'white',
            pointBorderWidth: 1,
            order: 0, // Draw on top
            datalabels: {
              // Only show at the end point
              display: (ctx: any) => ctx.dataIndex === endIndex,
              // Simplified label - show only the rounded price with 4 decimal places
              formatter: () => `$${target.price.toFixed(4)}`,
              color: target.isExtension ? 'rgba(255, 152, 0, 1.0)' : 'rgba(33, 150, 243, 1.0)', // Match the line color
              backgroundColor: 'transparent', // Make background transparent
              borderRadius: 4,
              padding: { left: 4, right: 4, top: 2, bottom: 2 }, // Reduce padding
              font: { 
                weight: 'bold', 
                size: 11 
              },
              align: 'right',
              anchor: 'center',
              offset: 10
            }
          } as CustomChartDataset;
        }).filter(Boolean)
    : [])
  ]
} as unknown as ChartData;

// Handle Wave A projection zone
const wave4 = waves.find(w => w.number === 4 && w.isComplete);
const wave5 = waves.find(w => w.number === 5 && w.isComplete);

if (latestWave && latestWave.number === 5 && latestWave.isComplete) {
  
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
        type: 'line',
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
        type: 'line',
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
        type: 'line',
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
    duration: 0 // No animations
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(45, 55, 72, 0.3)', // Lighter grid
        drawBorder: false
      },
      ticks: {
        color: '#d1d5db',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 8, // Fewer date labels
        callback: function(value: any, index: number) {
          const point = ohlcData[index];
          if (!point) return '';
          
          // Format the date (just month/day)
          return new Date(point.timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
          });
        }
      }
    },
    y: {
      grid: {
        color: 'rgba(45, 55, 72, 0.3)', // Lighter grid
        drawBorder: false
      },
      ticks: {
        color: '#d1d5db',
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
      callbacks: {
        // Simplified tooltip showing only essential info
        label: function(context: any) {
          const label = context.dataset.label || '';
          
          // For price data, show price
          if (label === symbol) {
            return `Price: $${context.parsed.y.toFixed(2)}`;
          }
          
          // For wave lines, show wave number
          if (label.startsWith('Wave')) {
            return label;
          }
          
          return label;
        }
      }
    },
    datalabels: {
      // Global datalabels options - minimal and clean
      font: {
        weight: 'bold'
      }
    },
    // Remove all custom plugins
    currentPriceLabel: false
  },
  // Simple padding
  layout: {
    padding: {
      right: 20,
      left: 10,
      top: 10,
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
    const dataEnd = ohlcData[realDataPoints - 1]?.timestamp; // Exclude future projection points
    
    if (!dataStart || !dataEnd) return;
    
    console.log("Chart data range:", {
      start: new Date(dataStart).toLocaleDateString(),
      end: new Date(dataEnd).toLocaleDateString(),
      actual: realDataPoints,
      withProjections: ohlcData.length
    });
  }
}, [waves, ohlcData, mostRecentWave1, data.length]);

useEffect(() => {
  if (waves.length > 0) {
    // Only calculate data range if there's data
    if (ohlcData.length > 0) {
      const dataStart = ohlcData[0]?.timestamp;
      const dataEnd = ohlcData[ohlcData.length - (chartPaddingDays + 1)]?.timestamp; // Exclude future projection points
      
      if (dataStart && dataEnd) {
        console.log("Chart data range:", {
          start: new Date(dataStart).toLocaleDateString(),
          end: new Date(dataEnd).toLocaleDateString(),
          points: ohlcData.length - chartPaddingDays // Exclude projection points
        });
        
        // Now check if waves are in range, but only warn about it
        const outOfRangeWaves = waves.filter(w => 
          (w.startTimestamp && getTimestampValue(w.startTimestamp) < dataStart) || 
          (w.endTimestamp && getTimestampValue(w.endTimestamp) > dataEnd)
        );
        
        if (outOfRangeWaves.length > 0) {
          // Don't trigger state changes here, just log information for debugging
          console.info("Some waves might be outside optimal chart range:", 
            outOfRangeWaves.map(w => w.number)
          );
        }
      }
    }
  }
}, [waves, ohlcData]);

useEffect(() => {
  if (invalidWaves && invalidWaves.length > 0) {
    console.log(`Chart received ${invalidWaves.length} invalid waves`);
    console.log("Sample invalid wave:", invalidWaves[0]);
    
    // Check for wave 2 invalidations specifically
    const wave2Invalidations = invalidWaves.filter(w => w.number === 2);
    if (wave2Invalidations.length > 0) {
      console.log(`Found ${wave2Invalidations.length} Wave 2 invalidations`);
    }
  } else {
    console.log("Chart received no invalid waves!");
  }
}, [invalidWaves]);

useEffect(() => {
  console.log("Chart data prepared:", {
    datasets: chartData.datasets.length,
    dataPoints: ohlcData.length,
    hasInvalidWaves: invalidWaves && invalidWaves.length > 0
  });
  
  if (invalidWaves?.length > 0) {
    console.log("Sample invalidation point:", invalidWaves[0]);
  }
}, [chartData, ohlcData, invalidWaves]);

// Add this defensive check before returning the chart component
// Return early if no data or ohlcData is empty
if (!data || data.length === 0 || !ohlcData || ohlcData.length === 0) {
  return (
    <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
      <p className="text-muted-foreground">No chart data available</p>
    </div>
  );
}

// Also, make sure the chart datasets have valid data before rendering
const safeChartData = {
  ...chartData,
  datasets: chartData.datasets.filter(dataset => 
    dataset && dataset.data && 
    Array.isArray(dataset.data) && 
    dataset.data.length > 0
  )
};

// Return early if no data
if (!data || data.length === 0) {
  return (
    <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
      <p className="text-muted-foreground">No chart data available</p>
    </div>
  );
}

useEffect(() => {
  if (chartRef.current && ohlcData.length > 0) {
    setChartLoaded(true);
    
    // Optional: You can also manually update the chart if needed
    // chartRef.current.update();
  }
}, [chartRef, ohlcData]);

return (
  <div className="w-full h-[500px] relative">
    {/* Minimal header */}
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-semibold">{symbol} - Elliott Wave Analysis</h3>
      
      {/* Keep the view mode toggle */}
      <RadioGroup 
        value={viewMode} 
        onValueChange={(value) => setViewMode(value as 'all' | 'current')}
        className="flex space-x-4 items-center"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="current" id="current-wave" />
          <Label htmlFor="current-wave" className="cursor-pointer">Current</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="all" id="all-waves" />
          <Label htmlFor="all-waves" className="cursor-pointer">All</Label>
        </div>
      </RadioGroup>
    </div>
    
    {/* Clean chart container */}
    <div className="relative h-[400px] bg-[#1a1a1a] rounded-md p-4">
      <Line 
        data={safeChartData as any} // Use 'as any' to bypass type checking
        options={options}
        ref={chartRef}
      />
      
      {!chartLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Skeleton className="h-full w-full" />
        </div>
      )}
    </div>
    
    {/* Keep the invalidation details section for reference but make it minimal */}
    {invalidWaves && invalidWaves.length > 0 && (
      <div className="mt-4 p-3 border border-red-500/20 rounded-lg bg-red-500/5">
        <h4 className="text-sm font-medium text-red-400">Wave Invalidations</h4>
        <div className="text-xs text-muted-foreground mt-1">
          {invalidWaves.length} invalidation point{invalidWaves.length !== 1 ? 's' : ''} detected
        </div>
      </div>
    )}
  </div>
);
};

export default StockDetailChart;


