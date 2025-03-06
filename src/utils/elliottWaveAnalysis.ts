
// Interfaces for Elliott Wave Analysis
export interface Wave {
  number: number | string; // 1, 2, 3, 4, 5, A, B, C
  startTimestamp: number;
  endTimestamp?: number; // Undefined for the current wave
  startPrice: number;
  endPrice?: number; // Undefined for the current wave
  isImpulse: boolean; // true for impulse waves (1, 3, 5), false for corrective (2, 4, A, B, C)
}

export interface FibTarget {
  label: string;
  price: number;
  isExtension: boolean;
}

export interface WaveAnalysisResult {
  waves: Wave[];
  currentWave: Wave;
  trend: 'bullish' | 'bearish' | 'neutral';
  impulsePattern: boolean;
  correctivePattern: boolean;
  fibTargets: FibTarget[];
}

// Elliott Wave Analysis Functions
export const analyzeElliottWaves = (historicalData: any[]): WaveAnalysisResult => {
  if (!historicalData || historicalData.length === 0) {
    return createEmptyAnalysis();
  }
  
  // Sort data by timestamp
  const sortedData = [...historicalData].sort((a, b) => a.timestamp - b.timestamp);
  
  // Find significant pivots to identify wave patterns
  const pivots = findSignificantPivots(sortedData);
  
  // Identify wave patterns from pivots
  const waves = identifyWaves(pivots, sortedData);
  
  // Determine the current wave
  const currentWave = waves[waves.length - 1];
  
  // Determine overall trend
  const trend = determineTrend(waves, sortedData);
  
  // Calculate Fibonacci targets
  const fibTargets = calculateFibonacciTargets(currentWave, waves);
  
  // Determine if we have impulse or corrective patterns
  const impulsePattern = identifyImpulsePattern(waves);
  const correctivePattern = identifyCorrectivePattern(waves);
  
  return {
    waves,
    currentWave,
    trend,
    impulsePattern,
    correctivePattern,
    fibTargets
  };
};

// Helper function to create an empty analysis
const createEmptyAnalysis = (): WaveAnalysisResult => {
  const now = Math.floor(Date.now() / 1000);
  return {
    waves: [],
    currentWave: {
      number: 1,
      startTimestamp: now,
      startPrice: 0,
      isImpulse: true
    },
    trend: 'neutral',
    impulsePattern: false,
    correctivePattern: false,
    fibTargets: []
  };
};

// Find significant pivot points in the price data
const findSignificantPivots = (data: any[]): number[] => {
  // For this demo, we'll use a simplified approach to find pivots
  // In a real implementation, this would be more sophisticated
  
  const pivots: number[] = [];
  const lookbackPeriod = Math.max(10, Math.floor(data.length * 0.05)); // 5% of data points
  
  // Always include the first point
  pivots.push(0);
  
  // Find local highs and lows
  for (let i = lookbackPeriod; i < data.length - lookbackPeriod; i++) {
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - lookbackPeriod; j <= i + lookbackPeriod; j++) {
      if (data[j].high > data[i].high) {
        isHigh = false;
      }
      if (data[j].low < data[i].low) {
        isLow = false;
      }
    }
    
    if (isHigh || isLow) {
      pivots.push(i);
    }
  }
  
  // Always include the last point
  if (pivots[pivots.length - 1] !== data.length - 1) {
    pivots.push(data.length - 1);
  }
  
  // If we don't have enough pivots, create some based on time intervals
  if (pivots.length < 5) {
    pivots.length = 0;
    const step = Math.floor(data.length / 5);
    for (let i = 0; i < data.length; i += step) {
      pivots.push(Math.min(i, data.length - 1));
    }
    if (pivots[pivots.length - 1] !== data.length - 1) {
      pivots.push(data.length - 1);
    }
  }
  
  return pivots.sort((a, b) => a - b);
};

// Identify Elliott Waves from pivot points
const identifyWaves = (pivots: number[], data: any[]): Wave[] => {
  // For this demo, we'll use a simplified approach to identify waves
  // In a real implementation, this would follow stricter Elliott Wave rules
  
  const waves: Wave[] = [];
  const seed = data[0].timestamp;
  
  // Use the seed to determine wave pattern (simplified for demo)
  const patternSeed = seed % 3;
  
  // 0: Classic 5-wave impulse + 3-wave correction
  // 1: Partial 5-wave impulse (in progress)
  // 2: Completed impulse + partial correction (in progress)
  
  let waveCount = 0;
  let waveLabels: (number | string)[] = [];
  
  if (patternSeed === 0) {
    waveLabels = [1, 2, 3, 4, 5, 'A', 'B', 'C'];
    waveCount = Math.min(8, pivots.length - 1);
  } else if (patternSeed === 1) {
    waveLabels = [1, 2, 3, 4, 5];
    waveCount = Math.min(5, pivots.length - 1);
  } else {
    waveLabels = [1, 2, 3, 4, 5, 'A', 'B'];
    waveCount = Math.min(7, pivots.length - 1);
  }
  
  for (let i = 0; i < waveCount; i++) {
    const startIndex = pivots[i];
    const endIndex = pivots[i + 1];
    
    // Ignore waves that are too short
    if (endIndex - startIndex < 3) continue;
    
    const wave: Wave = {
      number: waveLabels[i],
      startTimestamp: data[startIndex].timestamp,
      endTimestamp: i < waveCount - 1 ? data[endIndex].timestamp : undefined,
      startPrice: data[startIndex].close,
      endPrice: i < waveCount - 1 ? data[endIndex].close : undefined,
      isImpulse: typeof waveLabels[i] === 'number' && [1, 3, 5].includes(waveLabels[i] as number)
    };
    
    waves.push(wave);
  }
  
  return waves;
};

// Determine the overall trend
const determineTrend = (waves: Wave[], data: any[]): 'bullish' | 'bearish' | 'neutral' => {
  if (waves.length === 0) return 'neutral';
  
  // Look at the most recent data to determine the trend
  const recentDataCount = Math.min(20, Math.floor(data.length * 0.2)); // 20% of data points
  const recentData = data.slice(-recentDataCount);
  
  const first = recentData[0].close;
  const last = recentData[recentData.length - 1].close;
  const percentChange = ((last - first) / first) * 100;
  
  if (percentChange > 3) return 'bullish';
  if (percentChange < -3) return 'bearish';
  return 'neutral';
};

// Calculate Fibonacci targets based on the current wave
const calculateFibonacciTargets = (currentWave: Wave, waves: Wave[]): FibTarget[] => {
  const targets: FibTarget[] = [];
  
  // Find the previous completed wave for reference
  let referenceWave: Wave | null = null;
  for (let i = waves.length - 2; i >= 0; i--) {
    if (waves[i].endPrice) {
      referenceWave = waves[i];
      break;
    }
  }
  
  if (!referenceWave) {
    if (waves.length > 1) {
      referenceWave = waves[waves.length - 2];
    } else {
      referenceWave = currentWave;
    }
  }
  
  const startPrice = currentWave.startPrice;
  
  // If we're in an impulse wave (1, 3, 5)
  if (currentWave.isImpulse) {
    // Retracement levels for impulse waves are typically projections
    const moveDistance = referenceWave.endPrice 
      ? Math.abs(referenceWave.endPrice - referenceWave.startPrice) 
      : Math.abs(startPrice * 0.1); // Default to 10% if no reference
    
    // Fibonacci extension levels
    targets.push({ label: '1.0', price: startPrice + moveDistance, isExtension: false });
    targets.push({ label: '1.618', price: startPrice + moveDistance * 1.618, isExtension: true });
    targets.push({ label: '2.0', price: startPrice + moveDistance * 2, isExtension: true });
    targets.push({ label: '2.618', price: startPrice + moveDistance * 2.618, isExtension: true });
    targets.push({ label: '3.0', price: startPrice + moveDistance * 3, isExtension: true });
  } 
  // If we're in a corrective wave (2, 4, A, B, C)
  else {
    // Previous impulse wave height for retracement
    const prevHeight = referenceWave.endPrice 
      ? Math.abs(referenceWave.endPrice - referenceWave.startPrice) 
      : Math.abs(startPrice * 0.1); // Default to 10% if no reference
    
    const direction = referenceWave.endPrice && referenceWave.endPrice > referenceWave.startPrice ? -1 : 1;
    
    // Common Fibonacci retracement levels
    targets.push({ label: '0.236', price: startPrice + direction * prevHeight * 0.236, isExtension: false });
    targets.push({ label: '0.382', price: startPrice + direction * prevHeight * 0.382, isExtension: false });
    targets.push({ label: '0.5', price: startPrice + direction * prevHeight * 0.5, isExtension: false });
    targets.push({ label: '0.618', price: startPrice + direction * prevHeight * 0.618, isExtension: false });
    targets.push({ label: '0.786', price: startPrice + direction * prevHeight * 0.786, isExtension: false });
    targets.push({ label: '1.0', price: startPrice + direction * prevHeight, isExtension: false });
  }
  
  return targets;
};

// Identify if we have a valid impulse pattern (5 waves)
const identifyImpulsePattern = (waves: Wave[]): boolean => {
  if (waves.length < 5) return false;
  
  // Check if we have waves 1-5
  const impulseCounts = waves.filter(w => typeof w.number === 'number' && [1, 2, 3, 4, 5].includes(w.number as number)).length;
  return impulseCounts >= 5;
};

// Identify if we have a valid corrective pattern (ABC)
const identifyCorrectivePattern = (waves: Wave[]): boolean => {
  if (waves.length < 3) return false;
  
  // Check if we have waves A, B, C
  const correctiveCounts = waves.filter(w => ['A', 'B', 'C'].includes(w.number as string)).length;
  return correctiveCounts >= 3;
};
