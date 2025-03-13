// Shared types used across the application
export interface Wave {
  number: string | number;
  startTimestamp: number;  // Use number for all timestamps for compatibility
  endTimestamp?: number;   // Optional for incomplete waves
  startPrice: number;
  endPrice?: number;       // Optional for incomplete waves
  type: 'impulse' | 'corrective';
  isComplete: boolean;
  isImpulse?: boolean;
}

export interface FibTarget {
  price: number;
  label: string;
  isExtension: boolean; // Make this required (not optional)
  level: number;
}

export interface StockHistoricalData {
  timestamp: number;  // Use number consistently for timestamps
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WaveAnalysisResult {
  waves: Wave[];
  currentWave: Wave | null;
  fibTargets: FibTarget[];
  trend: 'bullish' | 'bearish' | 'neutral';
  impulsePattern: boolean;
  correctivePattern: boolean;
}

export interface StockData {
  symbol: string;
  name: string;
  shortName?: string;
  price: number;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  change: number;
  changePercent: number;
  marketCap: number;
  volume: number;
  averageVolume: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  dividendYield?: number;
  trailingPE?: number;
  forwardPE?: number;
}

export interface ChartPoint {
  timestamp: number;
  value: number;
  waveNumber: number | string;  // Make this non-optional to match WaveLineData
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

// Add the BackendHealthCheck type
export interface BackendHealthCheck {
  status: 'ok' | 'error';
  message: string;
  version?: string;
  timestamp?: Date; // Add the missing timestamp property
}