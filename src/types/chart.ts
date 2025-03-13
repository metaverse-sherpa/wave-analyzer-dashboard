import type { Wave, FibTarget, StockHistoricalData } from './shared';

export interface TooltipProps {
  value: number;
  name: string;
  payload: {
    waveNumber?: number | string;
    timestamp?: number;
    [key: string]: any;
  };
}

export interface ChartDataPoint extends StockHistoricalData {
  value: number;
  waveNumber?: number | string;
}

export interface WaveLineData {
  timestamp: number;
  value: number;
  waveNumber: number | string;
}

export interface ChartPoint {
  timestamp: number;
  value: number;
  waveNumber?: number | string;
}

export interface WaveLine {
  id: string;
  wave: Wave;
  data: WaveLineData[];
  color: string;
}

export interface StockDetailChartProps {
  symbol: string;
  data: StockHistoricalData[];
  waves: Wave[];
  currentWave: Wave | null;
  fibTargets: FibTarget[];
  selectedWave: Wave | null;
  onClearSelection: () => void;
}

export const WAVE_COLORS: Record<string | number, string> = {
  1: '#4CAF50',
  2: '#FF9800',
  3: '#2196F3',
  4: '#F44336',
  5: '#9C27B0',
  'A': '#FFEB3B',
  'B': '#795548',
  'C': '#00BCD4'
};