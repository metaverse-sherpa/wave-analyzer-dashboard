
import { StockHistoricalData } from "@/services/yahooFinanceService";

export interface Wave {
  number: number | string; // 1, 2, 3, 4, 5, A, B, C
  startIndex: number;
  endIndex: number | null; // null means ongoing wave
  startPrice: number;
  endPrice: number | null; // null means ongoing wave
  startTimestamp: number;
  endTimestamp: number | null; // null means ongoing wave
  isImpulse: boolean; // true for impulse waves (1, 3, 5), false for corrective waves (2, 4, A, B, C)
}

export interface FibTarget {
  label: string;
  level: number; // e.g., 0.382, 0.618, 1.618
  price: number;
  isExtension: boolean;
}

export interface WaveAnalysisResult {
  waves: Wave[];
  currentWave: Wave;
  fibTargets: FibTarget[];
  impulsePattern: boolean; // true if this looks like a 5-wave impulse
  correctivePattern: boolean; // true if this looks like a 3-wave correction
  trend: 'bullish' | 'bearish' | 'neutral';
}

// Constants for wave analysis
const MIN_SWING_PERCENT = 3; // Minimum price change to qualify as a swing
const MIN_WAVE_BARS = 5; // Minimum number of bars/candles to qualify as a wave
const FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618];

// Perform Elliott Wave analysis on historical data
export const analyzeElliottWaves = (
  historicalData: StockHistoricalData[]
): WaveAnalysisResult => {
  // In a real implementation, this would use advanced technical analysis
  // For this demo, we'll use a simplified approach
  
  if (historicalData.length < 20) {
    return createEmptyAnalysis();
  }
  
  // Find potential swing highs and lows
  const swings = findSwings(historicalData);
  
  // Identify waves based on swings
  const waves = identifyWaves(swings, historicalData);
  
  // Determine current wave
  const currentWave = determineCurrentWave(waves, historicalData);
  
  // Calculate Fibonacci targets for the current wave
  const fibTargets = calculateFibTargets(currentWave, waves, historicalData);
  
  // Determine overall pattern and trend
  const { impulsePattern, correctivePattern, trend } = determinePattern(waves, historicalData);
  
  return {
    waves,
    currentWave,
    fibTargets,
    impulsePattern,
    correctivePattern,
    trend,
  };
};

// Find swing highs and lows in the data
const findSwings = (data: StockHistoricalData[]): { highs: number[], lows: number[] } => {
  const highs: number[] = [];
  const lows: number[] = [];
  
  // Simple implementation to find local highs and lows
  // In a real system, we'd use more advanced algorithms
  for (let i = 2; i < data.length - 2; i++) {
    const current = data[i];
    const prev1 = data[i - 1];
    const prev2 = data[i - 2];
    const next1 = data[i + 1];
    const next2 = data[i + 2];
    
    // Check for swing high
    if (current.high > prev1.high && current.high > prev2.high && 
        current.high > next1.high && current.high > next2.high) {
      highs.push(i);
    }
    
    // Check for swing low
    if (current.low < prev1.low && current.low < prev2.low && 
        current.low < next1.low && current.low < next2.low) {
      lows.push(i);
    }
  }
  
  return { highs, lows };
};

// Identify potential Elliott Waves
const identifyWaves = (
  swings: { highs: number[], lows: number[] },
  data: StockHistoricalData[]
): Wave[] => {
  // Simplified wave identification - in a real implementation, this would be much more sophisticated
  const waves: Wave[] = [];
  const { highs, lows } = swings;
  
  if (highs.length < 3 || lows.length < 2) {
    // Not enough swing points to identify waves
    return simulateWaves(data);
  }
  
  // Identify impulse and corrective waves based on overall price direction
  const overallTrend = data[data.length - 1].close > data[0].close ? 'up' : 'down';
  
  // Merge and sort all swing points
  const allSwings = [...highs.map(idx => ({ idx, type: 'high' })), 
                     ...lows.map(idx => ({ idx, type: 'low' }))];
  allSwings.sort((a, b) => a.idx - b.idx);
  
  // Minimum number of waves to identify
  const targetWaveCount = 5; // aim for 5-wave pattern if possible
  
  // Calculate the total number of swings we have
  const totalSwings = allSwings.length;
  
  // If we don't have enough swings, use simulated waves
  if (totalSwings < 4) {
    return simulateWaves(data);
  }
  
  // Try to identify a 5-wave pattern
  let waveCount = 0;
  let waveNumber = 1;
  let isImpulse = true;
  let lastIdx = 0;
  
  for (let i = 0; i < Math.min(totalSwings, targetWaveCount + 1); i++) {
    if (i === 0) {
      // First point is the start of wave 1
      const startIdx = Math.max(0, allSwings[i].idx - 5); // Start a bit before the first swing
      lastIdx = allSwings[i].idx;
      
      waves.push({
        number: waveNumber,
        startIndex: startIdx,
        endIndex: lastIdx,
        startPrice: data[startIdx].close,
        endPrice: data[lastIdx].close,
        startTimestamp: data[startIdx].timestamp,
        endTimestamp: data[lastIdx].timestamp,
        isImpulse: true
      });
      
      waveCount++;
      waveNumber++;
      isImpulse = !isImpulse;
    } else {
      const currentIdx = allSwings[i].idx;
      
      // Skip if this swing is too close to the last one
      if (currentIdx - lastIdx < MIN_WAVE_BARS) continue;
      
      // Create the wave
      waves.push({
        number: waveNumber > 5 ? String.fromCharCode(64 + (waveNumber - 5)) : waveNumber,
        startIndex: lastIdx,
        endIndex: currentIdx,
        startPrice: data[lastIdx].close,
        endPrice: data[currentIdx].close,
        startTimestamp: data[lastIdx].timestamp,
        endTimestamp: data[currentIdx].timestamp,
        isImpulse: isImpulse
      });
      
      lastIdx = currentIdx;
      waveCount++;
      waveNumber++;
      isImpulse = !isImpulse && waveNumber <= 5;
      
      // Stop if we've identified all waves
      if (waveNumber > 8) break;
    }
  }
  
  // Make sure the last wave extends to the current bar
  if (waves.length > 0) {
    const lastWave = waves[waves.length - 1];
    lastWave.endIndex = data.length - 1;
    lastWave.endPrice = data[data.length - 1].close;
    lastWave.endTimestamp = data[data.length - 1].timestamp;
  }
  
  return waves.length > 0 ? waves : simulateWaves(data);
};

// Simulate waves when we can't properly identify them
const simulateWaves = (data: StockHistoricalData[]): Wave[] => {
  const waves: Wave[] = [];
  const dataLength = data.length;
  
  // Not enough data for proper analysis, create a simulated 5-wave pattern
  const segmentSize = Math.floor(dataLength / 8); // divide into 8 segments
  
  let waveNumber = 1;
  let isImpulse = true;
  
  for (let i = 0; i < 5; i++) {
    const startIndex = i * segmentSize;
    const endIndex = (i + 1) * segmentSize;
    
    waves.push({
      number: waveNumber,
      startIndex,
      endIndex,
      startPrice: data[startIndex].close,
      endPrice: data[endIndex < dataLength ? endIndex : dataLength - 1].close,
      startTimestamp: data[startIndex].timestamp,
      endTimestamp: data[endIndex < dataLength ? endIndex : dataLength - 1].timestamp,
      isImpulse: isImpulse
    });
    
    waveNumber++;
    isImpulse = !isImpulse;
  }
  
  // Add ABC correction if we have enough data
  if (dataLength > 6 * segmentSize) {
    let waveNumber: string = 'A';
    isImpulse = false;
    
    for (let i = 5; i < 8 && (i + 1) * segmentSize < dataLength; i++) {
      const startIndex = i * segmentSize;
      const endIndex = (i + 1) * segmentSize;
      
      waves.push({
        number: waveNumber,
        startIndex,
        endIndex,
        startPrice: data[startIndex].close,
        endPrice: data[endIndex < dataLength ? endIndex : dataLength - 1].close,
        startTimestamp: data[startIndex].timestamp,
        endTimestamp: data[endIndex < dataLength ? endIndex : dataLength - 1].timestamp,
        isImpulse: false
      });
      
      waveNumber = String.fromCharCode(waveNumber.charCodeAt(0) + 1);
    }
  }
  
  // Make sure the last wave extends to the current bar
  if (waves.length > 0) {
    const lastWave = waves[waves.length - 1];
    lastWave.endIndex = dataLength - 1;
    lastWave.endPrice = data[dataLength - 1].close;
    lastWave.endTimestamp = data[dataLength - 1].timestamp;
  }
  
  return waves;
};

// Determine the current wave
const determineCurrentWave = (waves: Wave[], data: StockHistoricalData[]): Wave => {
  if (waves.length === 0) {
    // No waves found, consider everything as one wave
    return {
      number: 1,
      startIndex: 0,
      endIndex: null,
      startPrice: data[0].close,
      endPrice: null,
      startTimestamp: data[0].timestamp,
      endTimestamp: null,
      isImpulse: true
    };
  }
  
  // The last wave is the current one
  const lastWave = waves[waves.length - 1];
  
  // Make it an ongoing wave
  return {
    ...lastWave,
    endIndex: null,
    endPrice: null,
    endTimestamp: null
  };
};

// Calculate Fibonacci targets for the current wave
const calculateFibTargets = (
  currentWave: Wave,
  waves: Wave[],
  data: StockHistoricalData[]
): FibTarget[] => {
  const fibTargets: FibTarget[] = [];
  
  if (!currentWave || waves.length === 0) return fibTargets;
  
  const currentPrice = data[data.length - 1].close;
  const startPrice = currentWave.startPrice;
  
  // Determine if it's an up or down move
  const isUp = currentPrice > startPrice;
  
  // Calculate the base move
  const baseMove = Math.abs(currentPrice - startPrice);
  
  // Generate Fibonacci targets
  FIB_LEVELS.forEach(level => {
    let targetPrice: number;
    let isExtension = level > 1.0;
    
    if (isUp) {
      targetPrice = startPrice + (baseMove * level);
    } else {
      targetPrice = startPrice - (baseMove * level);
    }
    
    fibTargets.push({
      label: level === 1.0 ? '100%' : `${(level * 100).toFixed(1)}%`,
      level,
      price: targetPrice,
      isExtension
    });
  });
  
  return fibTargets;
};

// Determine pattern and trend
const determinePattern = (
  waves: Wave[],
  data: StockHistoricalData[]
): { impulsePattern: boolean, correctivePattern: boolean, trend: 'bullish' | 'bearish' | 'neutral' } => {
  if (waves.length < 3) {
    return {
      impulsePattern: false,
      correctivePattern: false,
      trend: 'neutral'
    };
  }
  
  // Check if we have a 5-wave impulse pattern
  const hasImpulse = waves.length >= 5 && 
    typeof waves[0].number === 'number' && waves[0].number === 1 &&
    typeof waves[4].number === 'number' && waves[4].number === 5;
  
  // Check if we have a 3-wave corrective pattern
  const hasCorrective = waves.length >= 3 && 
    waves[waves.length - 3].number === 'A' &&
    waves[waves.length - 2].number === 'B' &&
    waves[waves.length - 1].number === 'C';
  
  // Determine trend based on recent price action
  const recentBars = Math.min(20, data.length);
  const recentData = data.slice(-recentBars);
  
  let upBars = 0;
  let downBars = 0;
  
  for (const bar of recentData) {
    if (bar.close > bar.open) upBars++;
    else if (bar.close < bar.open) downBars++;
  }
  
  let trend: 'bullish' | 'bearish' | 'neutral';
  
  if (upBars > downBars * 1.5) trend = 'bullish';
  else if (downBars > upBars * 1.5) trend = 'bearish';
  else trend = 'neutral';
  
  return {
    impulsePattern: hasImpulse,
    correctivePattern: hasCorrective,
    trend
  };
};

// Create an empty analysis result for when we don't have enough data
const createEmptyAnalysis = (): WaveAnalysisResult => {
  return {
    waves: [],
    currentWave: {
      number: 1,
      startIndex: 0,
      endIndex: null,
      startPrice: 0,
      endPrice: null,
      startTimestamp: 0,
      endTimestamp: null,
      isImpulse: true
    },
    fibTargets: [],
    impulsePattern: false,
    correctivePattern: false,
    trend: 'neutral'
  };
};
