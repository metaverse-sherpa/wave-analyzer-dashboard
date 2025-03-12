// If this file doesn't exist, create it:
export interface Wave {
  number: number | 'A' | 'B' | 'C';
  startTimestamp: number;
  endTimestamp?: number;
  startPrice: number;
  endPrice?: number;
  type: 'impulse' | 'corrective';
  isComplete: boolean;
  isImpulse: boolean;
}

export interface FibTarget {
  level: number;
  price: number;
  description: string;
}

export interface WaveAnalysisResult {
  waves: Wave[];
  currentWave: Wave;
  fibTargets: FibTarget[];
  trend: 'bullish' | 'bearish' | 'neutral';
  impulsePattern: boolean;
  correctivePattern: boolean;
}