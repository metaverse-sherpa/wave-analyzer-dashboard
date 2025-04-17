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
  currentWave,
  fibTargets,
  selectedWave,
  onClearSelection,
  livePrice,
  viewMode = 'current',
  errorMessage
}) => {
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
      return null;
    }
    
    const sortedWaves = [...filteredWaves].sort((a, b) => {
      const aNum = typeof a.number === 'string' ? parseInt(a.number) : a.number;
      const bNum = typeof b.number === 'string' ? parseInt(b.number) : b.number;
      return aNum - bNum;
    });
    
    const waveIndices: Record<string|number, number> = {};
    
    sortedWaves.forEach(wave => {
      const startIndex = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.startTimestamp));
      if (startIndex !== -1) {
        waveIndices[wave.number] = startIndex;
      }
    });
    
    const dataArray = Array(ohlcData.length).fill(null);
    
    sortedWaves.forEach(wave => {
      if (waveIndices[wave.number] !== undefined) {
        const idx = waveIndices[wave.number];
        dataArray[idx] = createSafeDataPoint(idx, wave.startPrice).y;
        
        if (wave === sortedWaves[sortedWaves.length - 1] && wave.endTimestamp && wave.endPrice) {
          const endIndex = ohlcData.findIndex(d => d.timestamp >= getTimestampValue(wave.endTimestamp));
          if (endIndex !== -1) {
            dataArray[endIndex] = createSafeDataPoint(endIndex, wave.endPrice).y;
          }
        }
      }
    });
    
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
      spanGaps: true,
      datalabels: {
        display: false
      }
    } as CustomChartDataset;
  };

  const chartData: ChartData<keyof ChartTypeRegistry> = {
    labels: ohlcData.map(d => new Date(d.timestamp).toLocaleDateString()),
    datasets: [
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
        return connection ? [connection as unknown as ChartDataset<keyof ChartTypeRegistry>] : [];
      })()),
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
          const isCurrentWave = currentWave && 
                               wave.number === currentWave.number && 
                               getTimestampValue(wave.startTimestamp) === getTimestampValue(currentWave.startTimestamp);
          
          if (isCurrentWave && !currentWave.isComplete) {
            return null;
          }
          
          const startTimestamp = wave.startTimestamp;
          const endTimestamp = wave.endTimestamp || data[data.length - 1].timestamp;
          
          const startIndex = ohlcData.findIndex(d => d.timestamp >= startTimestamp);
          const endIndex = ohlcData.findIndex(d => d.timestamp >= endTimestamp);
          
          const effectiveStartIndex = startIndex === -1 ? 0 : startIndex;
          const effectiveEndIndex = endIndex === -1 ? ohlcData.length - 1 : endIndex;
          
          const dataArray = Array(ohlcData.length).fill(null);
          
          if (effectiveStartIndex < ohlcData.length) {
            dataArray[effectiveStartIndex] = createSafeDataPoint(effectiveStartIndex, 
              wave.startPrice).y;
            
            if (effectiveEndIndex < ohlcData.length && wave.endPrice) {
              dataArray[effectiveEndIndex] = createSafeDataPoint(effectiveEndIndex, 
                wave.endPrice).y;
            }
          }
          
          return {
            type: 'scatter' as const,
            label: `Wave ${wave.number}`,
            data: dataArray,
            backgroundColor: 'white',
            borderColor: 'rgba(0, 0, 0, 0.5)',
            borderWidth: 1,
            pointRadius: (ctx: any) => {
              if (ctx.dataIndex === effectiveStartIndex) {
                return wave.number === 5 && wave.isComplete ? 0 : 4;
              }
              return 0;
            },
            pointHoverRadius: 6,
            pointStyle: 'circle',
            z: 15,
            datalabels: {
              display: (ctx: any) => {
                if (wave.isComplete && wave.endPrice) {
                  return ctx.dataIndex === effectiveEndIndex;
                }
                
                return ctx.dataIndex === effectiveStartIndex;
              },
              formatter: (value: any, ctx: any) => {
                return `${wave.number}`;
              },
              color: 'white',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 4,
              padding: { left: 6, right: 6, top: 2, bottom: 2 },
              font: {
                weight: 'bold',
                size: 10,
              },
              anchor: 'end',
              align: 'bottom',
              offset: 5
            }
          } as unknown as ChartDataset<keyof ChartTypeRegistry>;
        })
        .filter(Boolean),
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
      ...(currentWave && !currentWave.isComplete && fibTargets && fibTargets.length > 0 ? 
        fibTargets
          .filter(target => !target.label.includes("Wave 3 High"))
          .map(target => {
            const startIndex = ohlcData.findIndex(d => 
              d.timestamp >= getTimestampValue(currentWave.startTimestamp)
            );
            
            if (startIndex === -1) return null;
            
            const dataArray = Array(ohlcData.length).fill(null);
            
            dataArray[startIndex] = createSafeDataPoint(startIndex, currentWave.startPrice).y;
            
            const endIndex = Math.min(startIndex + 15, ohlcData.length - 1);
            dataArray[endIndex] = createSafeDataPoint(endIndex, target.price).y;
            
            return {
              type: 'line' as const,
              label: `${target.label}: $${target.price.toFixed(2)}`,
              data: ohlcData.map((_, i) => {
                if (i === startIndex) {
                  return currentWave.startPrice;
                } 
                else if (i === endIndex) {
                  return target.price;
                } 
                else if (i > startIndex && i < endIndex) {
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
                  weight: 'bold', 
                  size: 11 
                },
                align: 'right',
                anchor: 'center',
                offset: 10
              }
            } as unknown as ChartDataset<keyof ChartTypeRegistry>;
          }).filter(Boolean)
      : []),
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
        z: 10,
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
            weight: 'bold',
            size: 10,
          },
          anchor: 'center',
          align: 'center'
        }
      }] : [])
    ]
  } as ChartData<keyof ChartTypeRegistry>;

  const wave4 = waves.find(w => w.number === 4 && w.isComplete);
  const wave5 = waves.find(w => w.number === 5 && w.isComplete);

  if (latestWave && latestWave.number === 5 && latestWave.isComplete) {
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


