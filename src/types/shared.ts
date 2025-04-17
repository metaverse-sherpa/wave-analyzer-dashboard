// Import Chart.js types
import { ChartDataset, ChartTypeRegistry, Point, ScatterDataPoint, Chart } from 'chart.js';

// Shared types used across the application
export interface HistoricalDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Stock data types
export interface StockData {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageVolume?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
}

export interface StockHistoricalData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Wave analysis types
export interface FibTarget {
  price: number;
  timestamp?: number;
  level: number;
  label?: string;
  isExtension?: boolean;
  isCritical?: boolean;
  isPrimary?: boolean;
  isExtended?: boolean;
  isFlat?: boolean;
  isZigzag?: boolean;
}

export interface Wave {
  number: number | string;
  startPrice: number;
  endPrice?: number;
  startTimestamp: number;
  endTimestamp?: number;
  type: 'impulse' | 'corrective';
  subwaves?: Wave[];
  isComplete: boolean;
  isInvalid?: boolean;
  isInvalidated?: boolean;
  invalidationReason?: string;
  alternateSubwaves?: Wave[];
  isImpulse?: boolean;
  isValid?: boolean;
  isTerminated?: boolean;
  invalidationTimestamp?: number;
  invalidationPrice?: number;
  invalidationRule?: string;
  restartFromTimestamp?: number;
}

export interface WaveAnalysis {
  waves: Wave[];
  currentWave: Wave | null;
  fibTargets: FibTarget[];
  trend: 'bullish' | 'bearish' | 'neutral';
  impulsePattern: boolean;
  correctivePattern: boolean;
  invalidWaves: Wave[];
  symbol?: string;
  analysis?: string;
  stopLoss?: number;
  confidenceLevel?: string;
}

// DeepSeek AI related types
export interface DeepSeekAnalysis {
  symbol: string;
  analysis: string;
  timestamp?: number;
}

export interface DeepSeekWaveAnalysis {
  symbol: string;
  currentWave?: Wave | null;
  waves: Wave[];
  completedWaves?: Wave[];
  analysis?: string;
  trend?: 'bullish' | 'bearish' | 'neutral';
  fibTargets?: FibTarget[];
  stopLoss?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  timestamp?: number;
  invalidWaves?: Wave[];
  impulsePattern?: boolean;
  correctivePattern?: boolean;
}

export type WaveAnalysisResult = WaveAnalysis;

export interface WaveAnalysisEntry {
  symbol: string;
  timestamp: number;
  data: WaveAnalysis;
}

// Chart related types
export interface ChartPoint {
  x: number;
  y: number;
}

// Backend related types
export interface BackendHealthCheck {
  status: 'ok' | 'error';
  message: string;
  endpoints?: Record<string, boolean>;
  version?: string;
  timestamp?: Date;
}

// Color constants
export const WAVE_COLORS = {
  IMPULSE: "rgba(0, 128, 0, 1)",
  CORRECTION: "rgba(255, 0, 0, 1)",
  INVALIDATED: "rgba(128, 128, 128, 0.5)"
};

export interface OHLCDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CustomChartDataset extends Omit<ChartDataset<keyof ChartTypeRegistry, (Point | ScatterDataPoint)[]>, 'data'> {
  data: (Point | ScatterDataPoint)[];
  z?: number;
}