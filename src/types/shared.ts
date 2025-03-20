// Shared types used across the application
export interface Wave {
  number: string | number;    // Wave number or letter (1, 2, 3, 4, 5, A, B, C)
  startTimestamp: number;     // Timestamp for wave start
  endTimestamp?: number;      // Timestamp for wave end (undefined if wave is in progress)
  startPrice: number;         // Price at start of wave
  endPrice?: number;          // Price at end of wave (undefined if wave is in progress)
  type: 'impulse' | 'corrective';  // Wave type
  isComplete: boolean;        // Whether the wave is complete
  isImpulse?: boolean;        // Whether this is an impulse wave (1,3,5,B are impulse; 2,4,A,C are corrective)
  degree?: string;            // Wave degree (Grand Super Cycle, Super Cycle, Cycle, Primary, etc.)
  isValid?: boolean;          // Whether the wave follows Elliott Wave rules
  isTerminated?: boolean;     // Whether the wave was terminated early due to rule violation
  violationReason?: string;   // Description of the rule violation if any
  
  // Add these new properties for invalidation tracking
  invalidationTimestamp?: number;  // When the wave was invalidated
  invalidationPrice?: number;      // Price at invalidation
  invalidationRule?: string;       // Which rule was violated

  // Add these new properties for more detailed invalidation tracking
  violatedWave?: {
    number: number | string;
    price: number;
    timestamp?: number;
  };
  invalidationDetails?: {
    validationLevel: number;
    currentPrice: number;
    percentViolation: string;
  };

  // For internal use in wave detection algorithm
  restartFromTimestamp?: number;  // Store where to restart pattern detection after invalidation
}

export interface FibTarget {
  level: number;      // Fibonacci ratio (e.g., 0.618, 1.618)
  price: number;      // Price target
  label: string;      // Display label (e.g., "61.8%")
  isExtension: boolean; // True for extensions, false for retracements
  isCritical?: boolean; // Optional flag for critical levels that shouldn't be broken
  isPrimary?: boolean;  // Optional flag for primary Fibonacci levels
  isExtended?: boolean; // Optional flag for extended wave targets
  isFlat?: boolean;     // Optional flag for flat correction targets
  isZigzag?: boolean;   // Optional flag for zigzag correction targets
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
  invalidWaves: Wave[];  // Add this line to include invalidated waves
  currentWave: Wave;
  fibTargets: FibTarget[];
  trend: 'bullish' | 'bearish' | 'neutral'; // Add 'neutral' to the allowed values
  impulsePattern?: boolean;
  correctivePattern?: boolean;
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