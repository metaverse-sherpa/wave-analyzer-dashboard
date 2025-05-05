import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { StockHistoricalData } from '@/services/yahooFinanceService';
import { Wave, FibTarget, OHLCDataPoint, CustomChartDataset, WaveAnalysis } from '@/types/shared';
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
  ChartData,
  ChartOptions,
  ScatterController,
  LineController,
  BarController,
  ChartTypeRegistry
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCachedWaveAnalysis } from '@/utils/wave-analysis';
import { Badge } from '@/components/ui/badge';

// Import datalabels
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Add to StockDetailChart.tsx at the imports section
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAdminSettings } from '@/context/AdminSettingsContext';

// Update the currentPriceLabelPlugin to handle the new data format
const currentPriceLabelPlugin = {
  id: 'currentPriceLabel',
  afterDatasetsDraw(chart: any) {
    const { ctx, scales } = chart;
    const currentPriceDataset = chart.data.datasets.find((d: any) => d.label === 'Current Price');
    if (!currentPriceDataset) return;
    
    const dataPoint = currentPriceDataset.data.find((d: any) => d !== null);
    if (!dataPoint) return;
    
    const currentPrice = typeof dataPoint === 'object' ? dataPoint.y : dataPoint;
    if (currentPrice === null || currentPrice === undefined) return;
    
    const isLivePrice = currentPriceDataset.isLivePrice;
    
    const x = scales.x.right;
    const y = scales.y.getPixelForValue(currentPrice);
    
    ctx.save();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    
    const priceText = typeof currentPrice === 'number' 
      ? `$${currentPrice.toFixed(2)}`
      : 'Unknown';
    const textWidth = ctx.measureText(priceText).width + (isLivePrice ? 40 : 16);
    
    ctx.fillRect(x, y - 10, textWidth, 20);
    
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(priceText, x + textWidth - 8, y);
    
    if (isLivePrice) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#4CAF50';
      ctx.fillText('LIVE', x + 8, y);
    }
    
    ctx.restore();
  }
};

ChartJS.register(currentPriceLabelPlugin);

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
  ScatterController,
  LineController,
  BarController
);

ChartJS.register(ChartDataLabels);

function getTimestampValue(timestamp: string | number | undefined): number {
  if (timestamp === undefined || timestamp === null) {
    console.warn('Undefined timestamp detected');
    return Date.now();
  }
  
  try {
    if (typeof timestamp === 'number') {
      if (timestamp < 4000000000) {
        timestamp = timestamp * 1000;
      }
      
      const date = new Date(timestamp);
      if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
        return timestamp;
      } else {
        console.warn(`Invalid numeric timestamp: ${timestamp}, using current time`);
        return Date.now();
      }
    } else if (typeof timestamp === 'string') {
      const parsedTime = new Date(timestamp).getTime();
      if (!isNaN(parsedTime) && parsedTime > 0) {
        return parsedTime;
      } else {
        console.warn(`Invalid string timestamp: ${timestamp}, using current time`);
        return Date.now();
      }
    }
    
    return Date.now();
  } catch (err) {
    console.warn(`Error processing timestamp ${timestamp}:`, err);
    return Date.now();
  }
}

function safeGetTimestampValue(timestamp: string | number | undefined): number {
  if (timestamp === undefined || timestamp === null) {
    console.warn('Missing timestamp in wave data, using fallback');
    return Date.now();
  }
  return getTimestampValue(timestamp);
}

function getWaveColor(waveNumber: string | number, isCurrentWave: boolean = false, currentWaveType?: string): string {
  const WAVE_COLORS: Record<string | number, string> = {
    1: '#4CAF50',
    2: '#FF9800',
    3: '#2196F3',
    4: '#F44336',
    5: '#9C27B0',
    'A': '#FFEB3B',
    'B': '#795548',
    'C': '#00BCD4'
  };
  
  if (!isCurrentWave) {
    const baseColor = WAVE_COLORS[waveNumber] || '#FFFFFF';
    if (baseColor.startsWith('#')) {
      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, 0.7)`;
    }
    return baseColor;
  }
  
  return WAVE_COLORS[waveNumber] || '#FFFFFF';
}

interface StockDetailChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
  invalidWaves?: Wave[]; // Add this line to include invalidWaves in the props
  currentWave: Wave;
  fibTargets: FibTarget[];
  selectedWave?: Wave | null;
  onClearSelection?: () => void;
  livePrice?: number;
  viewMode?: 'all' | 'current';
  errorMessage?: string | null;
}

const StockDetailChart: React.FC<StockDetailChartProps> = ({
  symbol,
  data,
  waves,
  invalidWaves = [], // Add this to destructure the prop with a default empty array
  currentWave,
  fibTargets,
  selectedWave,
  onClearSelection,
  livePrice,
  viewMode = 'current',
  errorMessage
}) => {
  // --- Add detailed logging at the start ---
  console.log('[WaveChart:Props] Received props:', {
    symbol,
    dataLength: data?.length,
    wavesLength: waves?.length,
    currentWave: currentWave ? { number: currentWave.number, start: currentWave.startTimestamp, end: currentWave.endTimestamp } : null,
    fibTargetsLength: fibTargets?.length,
    selectedWave: selectedWave ? { number: selectedWave.number, start: selectedWave.startTimestamp } : null,
    livePrice,
    viewMode,
    errorMessage
  });
  if (waves && waves.length > 0) {
    console.log('[WaveChart:Props] Sample wave data:', waves.slice(0, 3));
  }
  // --- End detailed logging ---

  const { settings } = useAdminSettings();
  const chartPaddingDays = settings.chartPaddingDays;
  
  const chartRef = useRef<ChartJS<'line'>>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waveAnalysis, setWaveAnalysis] = useState<WaveAnalysis | null>(null);

  const MIN_CHART_DATA_POINTS = 5;
  const MIN_WAVE_DATA_POINTS = 50;

  const fetchWaveAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      const analysis = await getCachedWaveAnalysis(symbol);
      if (analysis) {
        setWaveAnalysis(analysis);
      }
    } catch (error) {
      console.error('Error fetching wave analysis:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (!data || data.length < MIN_CHART_DATA_POINTS) {
      setHasError(true);
      setLocalErrorMessage(`Insufficient data for ${symbol}: Only ${data?.length || 0} data points available (minimum ${MIN_CHART_DATA_POINTS} required for chart rendering)`);
      console.error(`Insufficient data for chart rendering: ${data?.length || 0} points`);
    } else if (data.length < MIN_WAVE_DATA_POINTS) {
      setHasError(false);
      setLocalErrorMessage(`Insufficient data for Elliott Wave analysis: Only ${data?.length} data points (minimum ${MIN_WAVE_DATA_POINTS} required for wave analysis)`);
      console.warn(`Insufficient data for wave analysis: ${data?.length || 0} points`);
    } else {
      setHasError(false);
      setLocalErrorMessage(null);
    }
  }, [data, symbol]);

  if (data && data.length >= MIN_CHART_DATA_POINTS && data.length < MIN_WAVE_DATA_POINTS) {
    return (
      <div className="w-full h-[500px] relative">
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Limited data available</AlertTitle>
          <AlertDescription>
            {errorMessage || localErrorMessage || `Only ${data.length} data points available for ${symbol}. Elliott Wave analysis requires at least ${MIN_WAVE_DATA_POINTS} data points.`}
          </AlertDescription>
        </Alert>
        
        <div className="relative h-[420px] bg-[#1a1a1a] rounded-md p-4">
          <Line 
            data={{
              labels: data.map(d => new Date(getTimestampValue(d.timestamp)).toLocaleDateString()),
              datasets: [
                {
                  type: 'line',
                  label: symbol,
                  data: data.map((d, index) => ({ x: index, y: typeof d.close === 'number' ? d.close : parseFloat(d.close) })),
                  borderColor: 'rgba(76, 175, 80, 0.8)',
                  backgroundColor: 'rgba(76, 175, 80, 0.1)',
                  borderWidth: 2,
                  fill: true,
                  tension: 0.1,
                  pointRadius: 2,
                  pointHoverRadius: 4
                }
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
                datalabels: { display: false }
              }
            }}
          />
        </div>
      </div>
    );
  }

  if (hasError || !data || data.length < MIN_CHART_DATA_POINTS) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center bg-card rounded-lg">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive font-medium">Chart data unavailable</p>
        <p className="text-muted-foreground text-sm mt-2">
          {errorMessage || localErrorMessage || `Insufficient data for ${symbol} chart`}
        </p>
      </div>
    );
  }

  const mostRecentWave1 = useMemo(() => {
    const sortedWaves = [...waves]
      .sort((a, b) => getTimestampValue(b.startTimestamp) - getTimestampValue(a.startTimestamp));
    return sortedWaves.find(wave => wave.number === 1);
  }, [waves]);

  const latestWave = useMemo(() => {
    const completedWaves = waves.filter(w => w.isComplete);
    if (completedWaves.length === 0) return null;
    
    return [...completedWaves].sort((a, b) => {
      const aTime = getTimestampValue(a.endTimestamp || 0);
      const bTime = getTimestampValue(b.endTimestamp || 0);
      return bTime - aTime;
    })[0];
  }, [waves]);

  const { ohlcData, startIndex: historicalStartIndex } = useMemo(() => {
    if (!data || data.length === 0) return { ohlcData: [] as OHLCDataPoint[], startIndex: 0 };
    
    if (viewMode === 'current' && mostRecentWave1) {
      const wave1Start = getTimestampValue(mostRecentWave1.startTimestamp);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const targetStartTime = wave1Start - sevenDaysMs;
      
      let startIndex = data.findIndex(d => getTimestampValue(d.timestamp) >= targetStartTime);
      if (startIndex === -1) startIndex = 0;
      if (startIndex > 0) startIndex--;
      
      const filteredData = data.slice(startIndex).map(d => ({
        timestamp: getTimestampValue(d.timestamp),
        open: typeof d.open === 'number' ? d.open : parseFloat(d.open),
        high: typeof d.high === 'number' ? d.high : parseFloat(d.high),
        low: typeof d.low === 'number' ? d.low : parseFloat(d.low),
        close: typeof d.close === 'number' ? d.close : parseFloat(d.close)
      }));
      
      const lastPoint = filteredData[filteredData.length - 1];
      const futurePoints: OHLCDataPoint[] = [];
      
      if (lastPoint) {
        const projectionPrice = livePrice && livePrice > 0 ? livePrice : lastPoint.close;
        
        for (let i = 1; i <= chartPaddingDays; i++) {
          futurePoints.push({
            timestamp: lastPoint.timestamp + (i * 24 * 60 * 60 * 1000),
            open: projectionPrice,
            high: projectionPrice,
            low: projectionPrice,
            close: projectionPrice
          });
        }
      }
      
      return {
        ohlcData: [...filteredData, ...futurePoints],
        startIndex
      };
    } else {
      const allWaves = waves || [];
      let earliestWaveTimestamp = Number.MAX_SAFE_INTEGER;
      
      allWaves.forEach(wave => {
        if (wave.startTimestamp && getTimestampValue(wave.startTimestamp) < earliestWaveTimestamp) {
          earliestWaveTimestamp = getTimestampValue(wave.startTimestamp);
        }
      });
      
      if (earliestWaveTimestamp === Number.MAX_SAFE_INTEGER && mostRecentWave1) {
        earliestWaveTimestamp = getTimestampValue(mostRecentWave1.startTimestamp);
      }
      
      if (earliestWaveTimestamp !== Number.MAX_SAFE_INTEGER) {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const targetStartTime = earliestWaveTimestamp - sevenDaysMs;
        
        let startIndex = data.findIndex(d => getTimestampValue(d.timestamp) >= targetStartTime);
        if (startIndex === -1) startIndex = 0;
        if (startIndex > 0) startIndex--;
        
        const filteredData = data.slice(startIndex).map(d => ({
          timestamp: getTimestampValue(d.timestamp),
          open: typeof d.open === 'number' ? d.open : parseFloat(d.open),
          high: typeof d.high === 'number' ? d.high : parseFloat(d.high),
          low: typeof d.low === 'number' ? d.low : parseFloat(d.low),
          close: typeof d.close === 'number' ? d.close : parseFloat(d.close)
        }));
        
        const lastPoint = filteredData[filteredData.length - 1];
        const futurePoints: OHLCDataPoint[] = [];
        
        if (lastPoint) {
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
  }, [data, waves, mostRecentWave1, viewMode]);

  const effectiveCurrentPrice = useMemo(() => {
    if (livePrice && livePrice > 0) {
      return livePrice;
    }
    
    if (ohlcData.length > 0) {
      return ohlcData[ohlcData.length - 1].close;
    }
    
    return null;
  }, [livePrice, ohlcData]);

  useEffect(() => {
    if (data && data.length > 0) {
      console.log("Sample data points:", data.slice(0, 3));
    }
  }, [data]);

  const priceStats = useMemo(() => {
    if (ohlcData.length === 0) return { min: 0, max: 100, validData: true };
    
    let minPrice = Number.MAX_VALUE;
    let maxPrice = Number.MIN_VALUE;
    let invalidCount = 0;
    
    ohlcData.forEach(d => {
      if (!isNaN(d.close) && d.close < 1000000) {
        minPrice = Math.min(minPrice, d.close);
        maxPrice = Math.max(maxPrice, d.close);
      } else {
        invalidCount++;
      }
    });
    
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

  useEffect(() => {
    if (!priceStats.validData) {
      console.error("CRITICAL ERROR: Price data appears to be corrupted. Check data source.");
    }
  }, [priceStats.validData]);

  const isWaveInCurrentSequence = (wave: Wave): boolean => {
    if (!mostRecentWave1) return false;
    return getTimestampValue(wave.startTimestamp) >= getTimestampValue(mostRecentWave1.startTimestamp);
  };

  const createSafeDataPoint = (index: number, value: number | null): { x: number, y: number | null } => {
    return { x: index, y: value };
  };

  const generateWaveConnectionData = (filteredWaves: Wave[]): CustomChartDataset | null => {
    if (!filteredWaves || filteredWaves.length < 2) {
      console.log('[WaveConnection] Not enough waves to generate connections');
      return null;
    }
    
    // Log the waves we're connecting to help debug
    console.log('[WaveConnection] Generating connection line for waves:', 
      filteredWaves.map(w => ({ 
        num: w.number, 
        start: w.startTimestamp ? new Date(getTimestampValue(w.startTimestamp)).toISOString() : 'unknown', 
        end: w.endTimestamp ? new Date(getTimestampValue(w.endTimestamp)).toISOString() : 'ongoing',
        startPrice: w.startPrice,
        endPrice: w.endPrice || 'unknown'
      }))
    );
    
    // Sort waves by their sequence 
    const sortedWaves = [...filteredWaves].sort((a, b) => {
      // First sort by wave numbers properly
      const aNum = typeof a.number === 'string' ? parseInt(a.number) : a.number;
      const bNum = typeof b.number === 'string' ? parseInt(b.number) : b.number;
      
      if (aNum !== bNum) return aNum - bNum;
      
      // If wave numbers are the same, sort by timestamp
      return getTimestampValue(a.startTimestamp) - getTimestampValue(b.startTimestamp);
    });
    
    console.log('[WaveConnection] Sorted waves:', sortedWaves.map(w => w.number));
    
    // Create a data array with null values (no points)
    const dataArray = Array(ohlcData.length).fill(null);
    
    // For each wave, add both its start and end points (if available)
    for (let i = 0; i < sortedWaves.length; i++) {
      const wave = sortedWaves[i];
      
      // Find index for wave start time
      const startTimestamp = getTimestampValue(wave.startTimestamp);
      let startIndex = -1;
      for (let j = 0; j < ohlcData.length; j++) {
        if (ohlcData[j].timestamp >= startTimestamp) {
          startIndex = j;
          break;
        }
      }
      
      // Find index for wave end time (if wave is complete)
      let endIndex = -1;
      if (wave.endTimestamp && wave.isComplete) {
        const endTimestamp = getTimestampValue(wave.endTimestamp);
        for (let j = 0; j < ohlcData.length; j++) {
          if (ohlcData[j].timestamp >= endTimestamp) {
            endIndex = j;
            break;
          }
        }
      }
      
      // Add start point
      if (startIndex >= 0 && startIndex < ohlcData.length) {
        dataArray[startIndex] = wave.startPrice;
      }
      
      // Add end point for completed waves
      if (wave.isComplete && endIndex >= 0 && endIndex < ohlcData.length && wave.endPrice) {
        dataArray[endIndex] = wave.endPrice;
        
        // Log each connection we're creating
        console.log(`[WaveConnection] Adding connection for wave ${wave.number}: index ${startIndex} (${wave.startPrice}) -> ${endIndex} (${wave.endPrice})`);
      }
    }
    
    return {
      type: 'line',
      label: 'Wave Connections',
      data: dataArray,
      borderColor: 'rgba(255, 255, 255, 0.9)',
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      z: 5,
      spanGaps: true, // This is important - it connects points across gaps
      datalabels: {
        display: false
      }
    } as CustomChartDataset;
  };

  // --- Trend badge logic ---
  const trend = useMemo(() => {
    if (currentWave && currentWave.type) {
      if (typeof currentWave.number === 'number') {
        if ([1, 3, 5].includes(currentWave.number)) return 'bullish';
        if ([2, 4].includes(currentWave.number)) return 'bearish';
      }
      if (typeof currentWave.number === 'string') {
        if (currentWave.number === 'B') return 'bullish';
        if (['A', 'C'].includes(currentWave.number)) return 'bearish';
      }
    }
    return 'neutral';
  }, [currentWave]);

  // --- Invalid waves logic ---
  const detectedInvalidWaves = useMemo(() => waves.filter(w => w.isValid === false || w.isInvalidated || w.isTerminated), [waves]);
  
  // Combine passed-in invalidWaves with those detected from waves array
  const allInvalidWaves = useMemo(() => {
    const combinedWaves = [...invalidWaves];
    
    // Add detected invalid waves that aren't already in the passed invalidWaves
    detectedInvalidWaves.forEach(detectedWave => {
      const alreadyIncluded = invalidWaves.some(w => 
        w.number === detectedWave.number && 
        getTimestampValue(w.startTimestamp) === getTimestampValue(detectedWave.startTimestamp)
      );
      
      if (!alreadyIncluded) {
        combinedWaves.push(detectedWave);
      }
    });
    
    return combinedWaves;
  }, [invalidWaves, detectedInvalidWaves]);

  const chartData: ChartData<keyof ChartTypeRegistry> = {
    labels: ohlcData.map(d => new Date(d.timestamp).toLocaleDateString()),
    datasets: [
      // Base price chart dataset
      {
        type: 'line' as const,
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
      } as unknown as ChartDataset<keyof ChartTypeRegistry>,
      
      // Wave connection lines
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
        console.log('[WaveChart:Datasets] Filtered waves for connection line:', filteredWaves.map(w => w.number));
        const connection = generateWaveConnectionData(filteredWaves);
        console.log('[WaveChart:Datasets] Generated connection dataset:', connection ? 'Yes' : 'No');
        return connection ? [connection as unknown as ChartDataset<keyof ChartTypeRegistry>] : [];
      })()),
      
      // Invalid wave markers
      ...allInvalidWaves.map(wave => {
        console.log(`[WaveChart:Datasets] Processing invalid wave marker for wave ${wave.number}`);
        const idx = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.invalidationTimestamp || wave.endTimestamp));
        if (idx === -1) {
          console.warn(`[WaveChart:Datasets] Could not find index for invalid wave ${wave.number}`);
          return null;
        }
        return {
          type: 'scatter' as const,
          label: `Invalid Wave ${wave.number}`,
          data: ohlcData.map((_, i) => i === idx ? wave.invalidationPrice || wave.endPrice : null),
          backgroundColor: 'rgba(255, 0, 0, 0.8)',
          borderColor: 'rgba(255, 0, 0, 1)',
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointStyle: 'cross',
          z: 30,
          datalabels: {
            display: (ctx: any) => ctx.dataIndex === idx,
            formatter: () => `✖`,
            color: 'white',
            backgroundColor: 'rgba(255,0,0,0.8)',
            borderRadius: 4,
            font: { 
              weight: 'bold' as const, 
              size: 11 
            },
            anchor: 'center' as const,
            align: 'center' as const
          }
        } as ChartDataset<keyof ChartTypeRegistry>;
      }).filter(Boolean),
      
      // Individual wave scatter points
      ...waves
        .filter(wave => {
          if (!wave || wave.number === 0) return false;
          if (viewMode === 'current' && mostRecentWave1) {
            const wave1StartTime = getTimestampValue(mostRecentWave1.startTimestamp);
            const waveStartTime = getTimestampValue(wave.startTimestamp);
            return waveStartTime >= wave1StartTime;
          }
          return true;
        })
        .map(wave => {
          console.log(`[WaveChart:Datasets] Processing scatter point for wave ${wave.number}`);
          const isCurrentWave = currentWave && 
                               wave.number === currentWave.number && 
                               getTimestampValue(wave.startTimestamp) === getTimestampValue(currentWave.startTimestamp);
          if (isCurrentWave && !currentWave.isComplete) {
            console.log(`[WaveChart:Datasets] Skipping current incomplete wave ${wave.number}`);
            return null;
          }
          
          // --- Robust index finding ---
          const startTimestamp = getTimestampValue(wave.startTimestamp);
          const endTimestamp = wave.endTimestamp ? getTimestampValue(wave.endTimestamp) : getTimestampValue(data[data.length - 1].timestamp);
          
          // CRITICAL DEBUG LOGGING FOR WAVE 4
          if (wave.number === 4) {
            console.log(`[WAVE-4-DEBUG] Processing Wave 4:`);
            console.log(`[WAVE-4-DEBUG] startTimestamp: ${new Date(startTimestamp).toISOString()}`);
            console.log(`[WAVE-4-DEBUG] endTimestamp: ${wave.endTimestamp ? new Date(endTimestamp).toISOString() : 'N/A'}`);
            console.log(`[WAVE-4-DEBUG] startPrice: ${wave.startPrice}, endPrice: ${wave.endPrice}`);
            console.log(`[WAVE-4-DEBUG] isComplete: ${wave.isComplete}`);
          }
          
          // Find index for start timestamp
          let startIndex = -1;
          for (let i = 0; i < ohlcData.length; i++) {
            if (ohlcData[i].timestamp >= startTimestamp) {
              startIndex = i;
              break;
            }
          }
          
          // If exact match not found, find closest
          if (startIndex === -1) {
            startIndex = ohlcData.reduce((bestIdx, d, idx) => 
              Math.abs(d.timestamp - startTimestamp) < Math.abs(ohlcData[bestIdx].timestamp - startTimestamp) ? idx : bestIdx, 0);
            
            if (wave.number === 4) {
              console.log(`[WAVE-4-DEBUG] No exact start index, using closest: ${startIndex}`);
              console.log(`[WAVE-4-DEBUG] Timestamp at start index: ${new Date(ohlcData[startIndex].timestamp).toISOString()}`);
            }
          }
          
          // Find index for end timestamp
          let endIndex = -1;
          if (wave.endTimestamp) {
            // First try direct comparison
            for (let i = 0; i < ohlcData.length; i++) {
              if (ohlcData[i].timestamp >= endTimestamp) {
                endIndex = i;
                break;
              }
            }
            
            // If exact match not found, find closest
            if (endIndex === -1) {
              endIndex = ohlcData.reduce((bestIdx, d, idx) => 
                Math.abs(d.timestamp - endTimestamp) < Math.abs(ohlcData[bestIdx].timestamp - endTimestamp) ? idx : bestIdx, 0);
              
              if (wave.number === 4) {
                console.log(`[WAVE-4-DEBUG] No exact end index, using closest: ${endIndex}`);
                console.log(`[WAVE-4-DEBUG] Timestamp at end index: ${new Date(ohlcData[endIndex].timestamp).toISOString()}`);
              }
            }
          } else {
            // For incomplete waves, default to last data point
            endIndex = ohlcData.length - 1 - chartPaddingDays; // Exclude projection days
          }
          
          if (wave.number === 4) {
            console.log(`[WAVE-4-DEBUG] Final indices - startIndex: ${startIndex}, endIndex: ${endIndex}`);
            if (startIndex >= 0 && startIndex < ohlcData.length) {
              console.log(`[WAVE-4-DEBUG] Start data point: ${new Date(ohlcData[startIndex].timestamp).toISOString()} - $${ohlcData[startIndex].close}`);
            }
            if (endIndex >= 0 && endIndex < ohlcData.length) {
              console.log(`[WAVE-4-DEBUG] End data point: ${new Date(ohlcData[endIndex].timestamp).toISOString()} - $${ohlcData[endIndex].close}`);
            }
          }
          
          // Prepare data array for chart points - enhanced approach
          const dataArray = Array(ohlcData.length).fill(null);
          
          // For completed waves, ensure both start and end points are plotted
          if (wave.isComplete && wave.endPrice) {
            if (startIndex >= 0 && startIndex < ohlcData.length) {
              dataArray[startIndex] = wave.startPrice;
            }
            
            if (endIndex >= 0 && endIndex < ohlcData.length) {
              dataArray[endIndex] = wave.endPrice;
            }
          } 
          // For incomplete waves, just plot the start point
          else {
            if (startIndex >= 0 && startIndex < ohlcData.length) {
              dataArray[startIndex] = wave.startPrice;
            }
          }
          
          // Skip empty datasets
          if (dataArray.every(d => d === null)) {
            console.warn(`[WaveChart:Datasets] Wave ${wave.number} resulted in empty data array, skipping dataset.`);
            return null;
          }
          
          return {
            type: 'scatter' as const,
            label: `Wave ${wave.number}`,
            data: dataArray,
            backgroundColor: getWaveColor(wave.number, false),
            borderColor: 'rgba(0, 0, 0, 0.5)',
            borderWidth: 1.5,
            pointRadius: (ctx: any) => {
              // Start points for all waves
              if (ctx.dataIndex === startIndex) {
                return 5;
              }
              // End points for completed waves
              if (wave.isComplete && wave.endPrice && ctx.dataIndex === endIndex) {
                return 5;
              }
              return 0;
            },
            pointHoverRadius: 7,
            pointStyle: 'circle',
            z: 15,
            datalabels: {
              display: (ctx: any) => {
                // For completed waves, show label at the end point
                if (wave.isComplete && wave.endPrice) {
                  return ctx.dataIndex === endIndex;
                }
                // For incomplete waves, show label at the start point
                return ctx.dataIndex === startIndex;
              },
              formatter: (value: any, ctx: any) => {
                return `${wave.number}`;
              },
              color: 'white',
              backgroundColor: getWaveColor(wave.number, false),
              borderRadius: 4,
              padding: { left: 6, right: 6, top: 2, bottom: 2 },
              font: { 
                weight: 'bold' as const, 
                size: 11 
              },
              anchor: 'center' as const,
              align: 'center' as const
            }
          } as unknown as ChartDataset<keyof ChartTypeRegistry>;
        })
        .filter(Boolean),
      
      // Current price line
      ...(effectiveCurrentPrice ? [{
        type: 'line' as const,
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
      }] : []) as unknown as ChartDataset<keyof ChartTypeRegistry>[],
      
      // Fibonacci targets for current wave (modified to always show targets regardless of completion status)
      ...(currentWave && fibTargets && fibTargets.length > 0 ? 
        fibTargets
          .filter(target => !target.label.includes("Wave 3 High"))
          .map(target => {
            // Find the index in the chart data corresponding to the current wave's start time
            const waveStartTimestamp = getTimestampValue(currentWave.startTimestamp);
            const startIndex = ohlcData.findIndex(d => d.timestamp >= waveStartTimestamp);

            // --- Add Debug Logging ---
            console.log(`[FibTarget] Wave ${currentWave.number} Start: ${new Date(waveStartTimestamp).toISOString()}`);
            console.log(`[FibTarget] ohlcData Start: ${ohlcData.length > 0 ? new Date(ohlcData[0].timestamp).toISOString() : 'N/A'}`);
            console.log(`[FibTarget] Calculated startIndex: ${startIndex}`);
            if (startIndex !== -1 && ohlcData[startIndex]) {
                console.log(`[FibTarget] Timestamp at startIndex (${startIndex}): ${new Date(ohlcData[startIndex].timestamp).toISOString()}`);
            } else if (startIndex === -1) {
                 console.warn(`[FibTarget] Could not find index for timestamp ${new Date(waveStartTimestamp).toISOString()} in ohlcData`);
            }
            // --- End Debug Logging ---

            // Ensure we have a valid start index AND a valid start price for the current wave
            if (startIndex === -1 || currentWave.startPrice == null) {
                console.warn(`[FibTarget] Skipping target ${target.label} due to missing startIndex (${startIndex}) or startPrice (${currentWave.startPrice}) for wave ${currentWave.number}`);
                return null;
            }

            const waveStartPrice = currentWave.startPrice; // Use a validated variable

            // Define where the target line should visually end
            const endIndex = Math.min(startIndex + 15, ohlcData.length - 1);

            // Ensure endIndex is valid and after startIndex
            if (endIndex <= startIndex) {
                console.warn(`[FibTarget] Skipping target ${target.label} due to invalid endIndex (${endIndex}) relative to startIndex (${startIndex})`);
                return null;
            }

            // Generate the data points for the line
            return {
              type: 'line' as const,
              label: `${target.label}: $${target.price.toFixed(2)}`,
              data: ohlcData.map((_, i) => {
                if (i === startIndex) {
                  return waveStartPrice; // Use validated price
                }
                else if (i === endIndex) {
                  return target.price;
                }
                else if (i > startIndex && i < endIndex) {
                  const progress = (i - startIndex) / (endIndex - startIndex);
                  // Interpolate using validated price
                  return waveStartPrice + (target.price - waveStartPrice) * progress;
                }
                return null;
              }),
              borderColor: target.isExtension ? 'rgba(255, 152, 0, 0.9)' : 'rgba(33, 150, 243, 0.9)',
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [5, 5],
              fill: false,
              tension: 0,
              pointRadius: [0],
              pointHoverRadius: 4,
              pointBackgroundColor: target.isExtension ? 'rgba(255, 152, 0, 1.0)' : 'rgba(33, 150, 243, 1.0)',
              pointBorderColor: 'white',
              pointBorderWidth: 1,
              order: 0,
              datalabels: {
                display: (ctx: any) => ctx.dataIndex === endIndex,
                formatter: () => `$${target.price.toFixed(4)}`,
                color: target.isExtension ? 'rgba(255, 152, 0, 1.0)' : 'rgba(33, 150, 243, 1.0)',
                backgroundColor: 'transparent',
                borderRadius: 4,
                padding: { left: 4, right: 4, top: 2, bottom: 2 },
                font: { 
                  weight: 'bold' as const, 
                  size: 11 
                },
                anchor: 'center' as const,
                align: 'center' as const,
                offset: 10
              }
            } as unknown as ChartDataset<keyof ChartTypeRegistry>;
          }).filter(Boolean)
      : []),
      
      // Current incomplete wave visualization
      ...(currentWave && !currentWave.isComplete ? [{
        type: 'line' as const,
        label: `Current Wave ${currentWave.number} (In Progress)`,
        data: ohlcData.map((d, index) => {
          const startIndex = ohlcData.findIndex(d => 
            d.timestamp >= getTimestampValue(currentWave.startTimestamp)
          );
          
          if (index === startIndex) {
            return currentWave.startPrice;
          } else if (index > startIndex) {
            if (index === ohlcData.length - chartPaddingDays) {
              return effectiveCurrentPrice;
            }
            
            if (startIndex < 0 || startIndex >= ohlcData.length || 
                index < 0 || index >= ohlcData.length ||
                ohlcData.length - chartPaddingDays < 0 || 
                ohlcData.length - chartPaddingDays >= ohlcData.length) {
              return null;
            }
            
            const endPointIndex = ohlcData.length - chartPaddingDays;
            if (!ohlcData[startIndex] || !ohlcData[startIndex].timestamp || 
                !ohlcData[endPointIndex] || !ohlcData[endPointIndex].timestamp ||
                !d.timestamp) {
              return null;
            }
            
            const totalTimespan = ohlcData[endPointIndex].timestamp - 
                                 ohlcData[startIndex].timestamp;
            const currentProgress = d.timestamp - ohlcData[startIndex].timestamp;
            const progress = totalTimespan > 0 ? (currentProgress / totalTimespan) : 0;
            
            if (progress >= 0 && progress <= 1) {
              return currentWave.startPrice + 
                     (effectiveCurrentPrice - currentWave.startPrice) * progress;
            }
          }
          return null;
        }),
        borderColor: getWaveColor(currentWave.number, true),
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: [0],
        pointHoverRadius: 4,
        fill: false,
        tension: 0,
        datalabels: {
          display: (ctx: any) => {
            const startIndex = ohlcData.findIndex(d => 
              d.timestamp >= getTimestampValue(currentWave.startTimestamp)
            );
            
            if (ctx.dataIndex === startIndex) return false;
            
            if (ctx.dataIndex === ohlcData.length - chartPaddingDays) return true;
            
            return false;
          },
          formatter: (value: any, ctx: any) => {
            return `${currentWave.number}`;
          },
          color: 'white',
          backgroundColor: getWaveColor(currentWave.number, true),
          borderRadius: 4,
          padding: { left: 6, right: 6, top: 2, bottom: 2 },
          font: { 
            weight: 'bold' as const, 
            size: 11 
          },
          anchor: 'center' as const,
          align: 'center' as const
        }
      }] : [])
    ]
  };

  // --- Log final dataset count ---
  useEffect(() => {
    console.log("[WaveChart:Final] Final number of datasets prepared:", chartData.datasets.length);
    console.log("[WaveChart:Final] Dataset labels:", chartData.datasets.map(d => d.label));
  }, [chartData]);
  // --- End final dataset count log ---

  const wave4 = waves.find(w => w.number === 4 && w.isComplete);
  const wave5 = waves.find(w => w.number === 5);

  // MODIFIED: Only show Wave A projection if Wave 5 is specifically marked as complete AND has endTimestamp and endPrice
  // This ensures we still show Wave 5 Fibonacci targets when the wave is programmatically kept as incomplete
  if (latestWave && latestWave.number === 5 && 
      latestWave.isComplete && latestWave.endTimestamp && latestWave.endPrice &&
      !fibTargets.some(target => target.isExtension)) {  // Don't show Wave A targets if we have Wave 5 extension targets
    if (wave4 && wave5 && wave4.endPrice && wave5.endPrice) {
      const impulseRange = Math.abs(wave5.endPrice - wave4.endPrice);
      const isUptrend = wave5.endPrice > wave4.endPrice;
      const direction = isUptrend ? -1 : 1;
      
      const wave5EndIdx = ohlcData.findIndex(d => d.timestamp >= wave5.endTimestamp);
      if (wave5EndIdx >= 0) {
        const targetA382 = wave5.endPrice + (impulseRange * 0.382 * direction);
        const targetA618 = wave5.endPrice + (impulseRange * 0.618 * direction);
        
        chartData.datasets.push({
          type: 'line' as const,
          label: 'Potential Wave A Zone (38.2%)',
          data: ohlcData.map((_, i) => {
            if (i >= wave5EndIdx) {
              return isUptrend ? targetA382 : targetA618;
            }
            return null;
          }),
          borderColor: 'rgba(255, 90, 90, 0.5)',
          backgroundColor: 'rgba(255, 90, 90, 0.1)',
          fill: '+1',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          datalabels: {
            display: false
          }
        } as unknown as ChartDataset<keyof ChartTypeRegistry>);
        
        chartData.datasets.push({
          type: 'line' as const,
          label: 'Potential Wave A Zone (61.8%)',
          data: ohlcData.map((_, i) => {
            if (i >= wave5EndIdx) {
              return isUptrend ? targetA618 : targetA382;
            }
            return null;
          }),
          borderColor: 'rgba(255, 90, 90, 0.5)',
          backgroundColor: 'rgba(255, 90, 90, 0.1)',
          fill: '-1',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0,
          datalabels: {
            display: false
          }
        } as unknown as ChartDataset<keyof ChartTypeRegistry>);
        
        chartData.datasets.push({
          type: 'line' as const,
          label: `Wave A 38.2% Target: $${targetA382.toFixed(2)}`,
          data: Array(ohlcData.length).fill(null),
          pointRadius: (ctx: any) => ctx.dataIndex === ohlcData.length - 1 ? 4 : 0,
          pointBackgroundColor: 'rgba(255, 90, 90, 0.8)',
          borderColor: 'rgba(255, 90, 90, 0.5)',
          borderWidth: 0,
          pointBorderColor: 'white',
          pointBorderWidth: 1,
          datalabels: {
            display: false
          }
        } as unknown as ChartDataset<keyof ChartTypeRegistry>);
        
        console.log(`Added Wave A projection zone for ${symbol} after Wave 5 completion`);
        console.log(`Wave A targets: 38.2% at $${targetA382.toFixed(2)}, 61.8% at $${targetA618.toFixed(2)}`);
      }
    }
  } 
  // ADDED: When we have Wave 5 but no Wave A targets, ensure we add Wave 5 Fibonacci extension targets
  else if (wave5 && !wave5.isComplete && wave4 && wave4.endPrice && wave5.startPrice) {
    // Calculate extension targets for Wave 5
    const wave3 = waves.find(w => w.number === 3 && w.isComplete);
    const wave1 = waves.find(w => w.number === 1 && w.isComplete);
    
    if (wave3 && wave3.startPrice && wave3.endPrice && 
        wave1 && wave1.startPrice && wave1.endPrice) {
      
      // Calculate wave lengths
      const wave1Length = Math.abs(wave1.endPrice - wave1.startPrice);
      const wave3Length = Math.abs(wave3.endPrice - wave3.startPrice);
      const isUptrend = wave3.endPrice > wave3.startPrice;
      const direction = isUptrend ? 1 : -1;
      
      // Find the index corresponding to Wave 5 start
      const wave5StartIdx = ohlcData.findIndex(d => d.timestamp >= wave5.startTimestamp);
      if (wave5StartIdx >= 0) {
        // Target 1: 0.618 of Wave 3 measured from Wave 4 low (Wave 5 start)
        const target618of3 = wave5.startPrice + (wave3Length * 0.618 * direction);
        
        // Target 2: 1.0 of Wave 1 measured from Wave 4 low
        const target100of1 = wave5.startPrice + (wave1Length * 1.0 * direction);
        
        // Target 3: 1.618 of Wave 1 measured from Wave 4 low
        const target1618of1 = wave5.startPrice + (wave1Length * 1.618 * direction);
        
        // Add these targets to the chart as extension lines
        const labelColor = 'rgba(255, 152, 0, 0.9)';  // Orange for extensions
        
        // Helper function to add extension target lines
        const addExtensionTarget = (targetPrice: number, label: string) => {
          chartData.datasets.push({
            type: 'line' as const,
            label: `Wave 5 ${label}: $${targetPrice.toFixed(2)}`,
            data: ohlcData.map((_, i) => {
              if (i >= wave5StartIdx) {
                return targetPrice;
              }
              return null;
            }),
            borderColor: labelColor,
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            borderWidth: 1.5,
            tension: 0,
            pointRadius: 0,
            datalabels: {
              display: false
            }
          } as unknown as ChartDataset<keyof ChartTypeRegistry>);
        };
        
        // Add extension targets for Wave 5
        addExtensionTarget(target618of3, "61.8% of Wave 3");
        addExtensionTarget(target100of1, "100% of Wave 1");
        addExtensionTarget(target1618of1, "161.8% of Wave 1");
        
        console.log(`Added Wave 5 Fibonacci extension targets for ${symbol}`);
        console.log(`Wave 5 targets: 61.8% of W3 at $${target618of3.toFixed(2)}, 100% of W1 at $${target100of1.toFixed(2)}, 161.8% of W1 at $${target1618of1.toFixed(2)}`);
      }
    }
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(45, 55, 72, 0.3)',
          drawBorder: false
        },
        ticks: {
          color: '#d1d5db',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          callback: function(value: any, index: number) {
            const point = ohlcData[index];
            if (!point) return '';
            
            return new Date(point.timestamp).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            });
          }
        }
      },
      y: {
        grid: {
          color: 'rgba(45, 55, 72, 0.3)',
          drawBorder: false
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
        enabled: true,
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function(context: any) {
            const label = context.dataset.label || '';
            
            if (label === symbol) {
              return `Price: $${context.parsed.y.toFixed(2)}`;
            }
            
            if (label.startsWith('Wave')) {
              return label;
            }
            
            return label;
          }
        }
      },
      datalabels: {
        font: {
          weight: 'bold'
        }
      },
      currentPriceLabel: false
    },
    layout: {
      padding: {
        right: 20,
        left: 10,
        top: 10,
        bottom: 10
      }
    }
  } as ChartOptions<'line'>;

  useEffect(() => {
    setChartLoaded(true);
  }, []);

  useEffect(() => {
    if (waves.length > 0) {
      console.log("Wave data available:", waves.map(w => ({
        number: w.number,
        start: new Date(w.startTimestamp).toLocaleDateString(),
        end: w.endTimestamp ? new Date(w.endTimestamp).toLocaleDateString() : 'ongoing',
        startPrice: w.startPrice,
        endPrice: w.endPrice || 'ongoing'
      })));
      
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
      }
    }
  }, [waves, ohlcData]);

  useEffect(() => {
    if (waves.length > 0 && mostRecentWave1) {
      const wave1Start = getTimestampValue(mostRecentWave1.startTimestamp);
      
      const currentSequenceWaves = waves.filter(wave => {
        const waveStart = getTimestampValue(wave.startTimestamp);
        return waveStart >= wave1Start && wave.number !== 0;
      });
      
      console.log("Current sequence waves:", currentSequenceWaves.map(w => w.number));
      
      if (currentSequenceWaves.length === 0) {
        console.warn("No waves in current sequence to display");
        return;
      }
      
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

  useEffect(() => {
    if (waves.length > 0) {
      if (ohlcData.length > 0) {
        const dataStart = ohlcData[0]?.timestamp;
        const dataEnd = ohlcData[ohlcData.length - (chartPaddingDays + 1)]?.timestamp;
        
        if (dataStart && dataEnd) {
          const outOfRangeWaves = waves.filter(w => 
            (w.startTimestamp && getTimestampValue(w.startTimestamp) < dataStart) || 
            (w.endTimestamp && getTimestampValue(w.endTimestamp) > dataEnd)
          );
        }
      }
    }
  }, [waves, ohlcData]);

  useEffect(() => {
    console.log("Chart data prepared:", {
      datasets: chartData.datasets.length,
      dataPoints: ohlcData.length,
      hasInvalidWaves: false
    });
  }, [chartData, ohlcData]);

  if (!data || data.length === 0 || !ohlcData || ohlcData.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card rounded-lg">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }

  const safeChartData = {
    ...chartData,
    datasets: chartData.datasets.filter(dataset => 
      dataset && dataset.data && 
      Array.isArray(dataset.data) && 
      dataset.data.length > 0
    )
  };

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
    }
  }, [chartRef, ohlcData]);

  return (
    <div className="w-full h-[500px] relative">
      {/* Trend badge at the top left */}
      <div className="absolute left-4 top-4 z-20">
        <Badge
          className={
            trend === 'bullish' ? 'bg-green-600 text-white' :
            trend === 'bearish' ? 'bg-red-600 text-white' :
            'bg-gray-400 text-white'
          }
        >
          {trend.charAt(0).toUpperCase() + trend.slice(1)} Trend
        </Badge>
      </div>
      {/* Invalid waves legend */}
      {allInvalidWaves.length > 0 && (
        <div className="absolute right-4 top-4 z-20 flex items-center space-x-2 bg-background/80 px-3 py-1 rounded shadow">
          <span className="text-xs text-red-600 font-semibold">✖ Invalidated Wave(s):</span>
          {allInvalidWaves.map((w, i) => (
            <span key={i} className="text-xs text-red-600">{w.number}</span>
          ))}
        </div>
      )}
      <div className="relative h-[500px] bg-[#1a1a1a] rounded-md p-4">
        <Line 
          data={safeChartData as any}
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


