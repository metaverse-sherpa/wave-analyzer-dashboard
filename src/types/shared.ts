// Import Chart.js types
import { ChartDataset, ChartTypeRegistry, Point, ScatterDataPoint, Chart } from 'chart.js';

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

  isInvalidated?: boolean;  // Add this property
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

// Define the DeepSeek API response interface
export interface DeepSeekWaveAnalysis {
  currentWave: {
    number: string | number;
    startTime: string;
    startPrice: number;
  };
  trend: 'bullish' | 'bearish' | 'neutral';
  fibTargets: {
    level: string;
    price: number;
    label: string;
  }[];
  completedWaves: {
    number: string | number;
    startTime: string;
    startPrice: number;
    endTime: string;
    endPrice: number;
  }[];
  // Additional properties for enhanced analysis
  analysis?: string;               // Text analysis explanation
  stopLoss?: number | null;        // Suggested stop loss price
  confidenceLevel?: 'low' | 'medium' | 'high'; // Confidence in the analysis
  errorDetails?: string;           // Error information if analysis failed
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

export interface OHLCDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// Define the base type for our custom dataset
type ChartType = keyof ChartTypeRegistry;
type DatasetType = 'line' | 'scatter';
type DataPoint = number | ScatterDataPoint | Point | [number, number] | null;

type Anchor = 'center' | 'start' | 'end';
type DataLabelsCallback = (context: any) => boolean | string;

// Define CustomDataLabels interface
interface CustomDataLabels {
  display?: boolean | DataLabelsCallback;
  formatter?: (value: any, ctx: any) => string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  padding?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  font?: {
    weight: string;
    size: number;
  };
  anchor?: Anchor | ((context: any) => Anchor);
  align?: Anchor | ((context: any) => Anchor);
  offset?: number;
}

// Update CustomChartDataset to extend Chart.js types correctly
export interface CustomChartDataset extends Omit<ChartDataset<ChartType, DataPoint[]>, 'type'> {
  type?: DatasetType;
  datalabels?: CustomDataLabels;
  z?: number;
  isLivePrice?: boolean;
  spanGaps?: boolean;
  fill?: boolean | string | number;
  tension?: number;
}