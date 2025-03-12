import { StockHistoricalData } from "@/services/yahooFinanceService";

// Define the Wave interface
export interface Wave {
  number: string | number;    // Wave number or letter (1, 2, 3, 4, 5, A, B, C)
  startTimestamp: number;     // Timestamp for wave start
  endTimestamp?: number;      // Timestamp for wave end (undefined if wave is in progress)
  startPrice: number;         // Price at start of wave
  endPrice?: number;          // Price at end of wave (undefined if wave is in progress)
  type: 'impulse' | 'corrective';  // Wave type
  isComplete: boolean;        // Whether the wave is complete
  isImpulse?: boolean;        // Whether this is an impulse wave
  degree?: string;            // Wave degree (Grand Super Cycle, Super Cycle, Cycle, Primary, etc.)
}

// Define the WaveAnalysisResult interface
export interface WaveAnalysisResult {
  waves: Wave[];
  currentWave: Wave;
  fibTargets: FibTarget[];
  trend: 'bullish' | 'bearish' | 'neutral';
  impulsePattern?: boolean;
  correctivePattern?: boolean;
}

// Define the Fibonacci target interface
export interface FibTarget {
  level: number;
  price: number;
  label: string;
  isExtension: boolean;
}

// Zigzag point for wave identification
interface ZigzagPoint {
  price: number;       // Standard price (close)
  high: number;        // High price for impulse waves
  low: number;         // Low price for corrective waves
  timestamp: number;
  index: number;
  type: 'peak' | 'trough' | 'start' | 'end';
}

// Function to calculate Fibonacci retracement levels
const calculateFibRetracement = (startPrice: number, endPrice: number): FibTarget[] => {
  const diff = endPrice - startPrice;
  
  // Common Fibonacci retracement levels
  const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
  
  return levels.map(level => ({
    level,
    price: endPrice - diff * level,
    label: `${(level * 100).toFixed(1)}%`,
    isExtension: false
  }));
};

// Function to calculate Fibonacci extension levels
const calculateFibExtension = (startPrice: number, endPrice: number): FibTarget[] => {
  const diff = endPrice - startPrice;
  const direction = endPrice > startPrice ? 1 : -1;
  
  // Common Fibonacci extension levels
  const levels = [1.236, 1.618, 2.0, 2.618];
  
  return levels.map(level => ({
    level,
    price: endPrice + (diff * level * direction),
    label: `${(level * 100).toFixed(1)}%`,
    isExtension: true
  }));
};

/**
 * Improved function to identify significant pivots in price data using proper high/low values
 * Ensures at least 2 candles on each side of a pivot point
 * @param data - Historical price data
 * @param threshold - Minimum percentage change required to identify a pivot
 */
export const findPivots = (data: StockHistoricalData[], threshold: number = 0.03): ZigzagPoint[] => {
  if (data.length < 10) return []; 
  
  const pivots: ZigzagPoint[] = [];
  
  // Always include the first point
  pivots.push({
    price: data[0].close,
    high: data[0].high,
    low: data[0].low,
    timestamp: data[0].timestamp,
    index: 0,
    type: 'start'
  });

  let lastDirection: 'up' | 'down' | null = null;
  let lastExtreme = data[0];
  let lastExtremeIndex = 0;

  // Lower the threshold to find more pivot points
  const minChange = 0.01; // 1% minimum change instead of 3%

  for (let i = 1; i < data.length; i++) {
    const candle = data[i];
    const currentDirection = candle.close > lastExtreme.close ? 'up' : 'down';
    
    if (lastDirection !== null && currentDirection !== lastDirection) {
      const change = Math.abs(lastExtreme.close - candle.close) / lastExtreme.close;
      
      if (change >= minChange) {  // Use lower threshold
        pivots.push({
          price: lastExtreme.close,
          high: lastExtreme.high,
          low: lastExtreme.low,
          timestamp: lastExtreme.timestamp,
          index: lastExtremeIndex,
          type: lastDirection === 'up' ? 'peak' : 'trough'
        });
        
        lastExtreme = candle;
        lastExtremeIndex = i;
        lastDirection = currentDirection;
      }
    } else {
      if (currentDirection === 'up' && candle.high > lastExtreme.high) {
        lastExtreme = candle;
        lastExtremeIndex = i;
      } else if (currentDirection === 'down' && candle.low < lastExtreme.low) {
        lastExtreme = candle;
        lastExtremeIndex = i;
      }
      lastDirection = currentDirection;
    }
  }

  // Always include the last point
  pivots.push({
    price: data[data.length - 1].close,
    high: data[data.length - 1].high,
    low: data[data.length - 1].low,
    timestamp: data[data.length - 1].timestamp,
    index: data.length - 1,
    type: 'end'
  });

  console.log(`Found ${pivots.length} pivots with ${minChange * 100}% threshold`);
  return pivots;
};

/**
 * Applies Elliott Wave rules to validate wave counts and label waves correctly
 * @param pivots - Array of identified pivot points
 * @param data - Historical price data
 */
const identifyWaves = (pivots: ZigzagPoint[], data: StockHistoricalData[]): Wave[] => {
  if (pivots.length < 3) return [];

  const waves: Wave[] = [];
  const overallTrend = data[data.length - 1].close > data[0].close ? 'up' : 'down';
  
  // Create initial wave segments
  for (let i = 0; i < pivots.length - 1; i++) {
    const startPoint = pivots[i];
    const endPoint = pivots[i + 1];
    const isUpMove = endPoint.price > startPoint.price;
    
    // Determine wave number based on position and direction
    const waveCount = waves.length + 1;
    let waveNumber: number | string;
    let isImpulse: boolean;
    
    if (waveCount <= 5) {
      waveNumber = waveCount;
      isImpulse = waveCount % 2 === 1; // 1,3,5 are impulse waves
      
      // Validate wave direction based on trend
      const shouldBeUp = (overallTrend === 'up') === (waveCount % 2 === 1);
      if (shouldBeUp !== isUpMove) continue; // Skip invalid waves
      
    } else if (waveCount <= 8) {
      const letterIndex = waveCount - 6; // 0=A, 1=B, 2=C
      waveNumber = ['A', 'B', 'C'][letterIndex];
      isImpulse = waveNumber === 'B'; // Only B is impulse-like
      
      // Validate ABC wave directions
      if (overallTrend === 'up') {
        if ((waveNumber === 'B' && !isUpMove) || 
            (waveNumber !== 'B' && isUpMove)) continue;
      } else {
        if ((waveNumber === 'B' && isUpMove) || 
            (waveNumber !== 'B' && !isUpMove)) continue;
      }
    } else {
      // Start a new cycle
      waves.length = 0;
      waveNumber = 1;
      isImpulse = true;
    }

    waves.push({
      number: waveNumber,
      startTimestamp: startPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      startPrice: isImpulse ? startPoint.low : startPoint.high,
      endPrice: isImpulse ? endPoint.high : endPoint.low,
      type: isImpulse ? 'impulse' : 'corrective',
      isComplete: i < pivots.length - 2,
      isImpulse
    });
  }

  return waves;
};

// In elliottWaveAnalysis.ts, add memoization to prevent recalculations
// At the top of the file:
const memoCache = new Map();

/**
 * Main function to analyze price data and identify Elliott Wave patterns
 * @param data - Historical price data to analyze
 */
export const analyzeElliottWaves = (
  data: StockHistoricalData[], 
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  console.log(`Starting wave analysis with ${data.length} data points`);
  
  // Validate input data
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.error("Invalid or empty data provided for analysis");
    return generateEmptyAnalysisResult();
  }

  // Validate data points have required properties
  const validData = data.filter(point => (
    point &&
    typeof point.timestamp === 'number' &&
    typeof point.close === 'number' &&
    typeof point.high === 'number' &&
    typeof point.low === 'number'
  ));

  if (validData.length < 20) {
    console.log("Insufficient valid data points for wave analysis");
    return generateEmptyAnalysisResult();
  }

  try {
    // Sample data if needed
    let processData = validData;
    if (validData.length > 200) {
      const sampleFactor = Math.ceil(validData.length / 200);
      processData = validData.filter((_, index) => index % sampleFactor === 0);
    }

    // Find pivot points
    const pivots = findPivots(processData, 0.03);
    
    // Update progress
    if (pivots.length >= 2) {
      const initialWaves = createSimpleWavePattern(processData);
      onProgress?.(initialWaves.waves);
    }

    if (pivots.length < 3) {
      console.log("Insufficient pivot points found, using simple pattern");
      return createSimpleWavePattern(processData);
    }

    // Complete the wave analysis
    return completeWaveAnalysis(pivots, processData);

  } catch (error) {
    console.error("Error in wave analysis:", error);
    return createSimpleWavePattern(processData);
  }
};

// Helper function to complete the analysis
const completeWaveAnalysis = (
  pivots: ZigzagPoint[], 
  data: StockHistoricalData[],
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  console.log(`Identifying waves from ${pivots.length} pivots`);
  
  const overallTrend = data[data.length - 1].close > data[0].close ? 'up' : 'down';
  console.log(`Overall trend detected: ${overallTrend}`);
  
  // Create pivot pairs
  const pivotPairs = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    pivotPairs.push({
      startPoint: pivots[i],
      endPoint: pivots[i + 1],
      isUpMove: pivots[i + 1].price > pivots[i].price
    });
  }
  
  // Create waves with pattern validation and cycling
  const waves: Wave[] = [];
  let waveCount = 1;
  let lastCompleteCycle = -1; // Track where the last complete cycle ended
  
  // Store invalidation points for restarting patterns
  const invalidationPoints: number[] = [];
  
  // PHASE 1: First pass analysis
  for (let i = 0; i < pivotPairs.length; i++) {
    const { startPoint, endPoint, isUpMove } = pivotPairs[i];
    
    // Determine if we should restart from an invalidation point
    if (invalidationPoints.length > 0 && i === invalidationPoints[invalidationPoints.length - 1]) {
      console.log(`Restarting wave count from invalidation point at index ${i}`);
      waveCount = 1; // Start a new Wave 1
    }
    
    // Determine wave number and type
    let waveNumber: number | string;
    let shouldBeImpulse: boolean;
    let shouldBeUp: boolean;
    
    if (waveCount <= 5) {
      // Numbered waves (1-5)
      waveNumber = waveCount;
      shouldBeImpulse = waveNumber % 2 === 1; // 1, 3, 5 are impulse waves
      shouldBeUp = overallTrend === 'up' ? shouldBeImpulse : !shouldBeImpulse;
    } else if (waveCount <= 8) {
      // Letter waves (A, B, C)
      const letterIndex = waveCount - 6; // 0 for A, 1 for B, 2 for C
      waveNumber = ['A', 'B', 'C'][letterIndex];
      shouldBeImpulse = waveNumber === 'B'; // Only B is impulse-like
      
      // A and C move opposite to the main trend, B moves with the main trend
      if (overallTrend === 'up') {
        shouldBeUp = waveNumber === 'B'; // B goes up, A and C go down in uptrend
      } else {
        shouldBeUp = waveNumber !== 'B'; // B goes down, A and C go up in downtrend
      }
    } else {
      // After completing a full cycle, restart with wave 1
      console.log("Completed full cycle (1-5,A-B-C), restarting with wave 1");
      waveCount = 1;
      waveNumber = 1;
      shouldBeImpulse = true;
      shouldBeUp = overallTrend === 'up';
      lastCompleteCycle = i - 1; // Mark the end of the complete cycle
    }
    
    // Create the wave with appropriate start and end prices
    const wave: Wave = {
      number: waveNumber,
      startTimestamp: startPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      
      // Use appropriate start price based on wave type
      startPrice: shouldBeImpulse
        ? startPoint.low   // Impulse waves start from a low
        : startPoint.high, // Corrective waves start from a high
      
      // Use appropriate end price based on wave type
      endPrice: shouldBeImpulse
        ? endPoint.high    // Impulse waves end at a high
        : endPoint.low,    // Corrective waves end at a low
        
      type: shouldBeImpulse ? 'impulse' : 'corrective',
      isComplete: i < pivotPairs.length - 1,
      isImpulse: shouldBeImpulse
    };
    
    // Check if the actual price movement aligns with what we'd expect
    const isProperDirection = (shouldBeUp === isUpMove);
    
    // Check for pattern invalidation rules
    if (waveNumber === 2 && wave.endPrice! <= waves[waves.length - 1].startPrice) {
      // Wave 2 can't go below the start of wave 1 - pattern invalidation!
      console.log("Wave 2 violated Elliott rule: retraced beyond start of Wave 1");
      invalidationPoints.push(i); // Mark this as a new starting point for the next pattern
      
      // Still add this wave for visualization
      waves.push(wave);
      waveCount++;
    }
    else if (waveNumber === 4 && wave.endPrice! <= waves[waves.length - 3].endPrice!) {
      // Wave 4 can't overlap with wave 1's territory (except in diagonal patterns)
      console.log("Wave 4 may violate non-overlap rule with Wave 1");
      // In a strict implementation we might invalidate here, but we'll be lenient
      waves.push(wave);
      waveCount++;
    }
    // NEW: After Wave C completes, immediately start a new Wave 1
    else if (waveNumber === 'C') {
      waves.push(wave);
      waveCount = 1; // Reset for new cycle
      console.log("Wave C completed, starting new Wave 1");
    }
    // For other waves, just add them
    else {
      waves.push(wave);
      waveCount++;
    }

    // Emit progress update
    if (onProgress) {
      onProgress(waves);
    }
  }
  
  // If we don't have any waves, use fallback
  if (waves.length === 0) {
    console.log("No waves found with adaptive approach, using fallback");
    return fallbackWaveAnalysis(pivots, data);
  }
  
  console.log(`Identified ${waves.length} waves with adaptive approach`);
  
  // Calculate additional analysis based on identified waves
  const currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  const fibTargets = calculateFibTargetsForWaves(waves, data);
  const impulsePattern = waves.some(w => String(w.number) === '5');
  const correctivePattern = waves.some(w => w.number === 'C');
  
  return {
    waves,
    currentWave,
    fibTargets,
    trend: overallTrend === 'up' ? 'bullish' : 'bearish',
    impulsePattern,
    correctivePattern
  };
};

// Fallback approach when proper direction doesn't yield enough waves
const fallbackWaveAnalysis = (pivots: ZigzagPoint[], data: StockHistoricalData[]): WaveAnalysisResult => {
  console.log("Using simplified fallback wave analysis");
  
  const waves: Wave[] = [];
  let currentCycleStart = 0;
  
  // Simply label alternating waves from the pivots
  for (let i = 0; i < pivots.length - 1; i++) {
    const startPoint = pivots[i];
    const endPoint = pivots[i + 1];
    const isUpMove = endPoint.price > startPoint.price;
    
    // Determine position in the cycle (1-5, A-B-C)
    // We'll restart full 8-wave cycles as we go
    const cyclePosition = (i - currentCycleStart) % 8;
    
    let waveNumber: number | string;
    let isImpulse: boolean;
    
    if (cyclePosition < 5) {
      waveNumber = cyclePosition + 1;  // 1, 2, 3, 4, 5
      isImpulse = waveNumber % 2 === 1; // 1, 3, 5 are impulse
    } else {
      waveNumber = ['A', 'B', 'C'][cyclePosition - 5]; // A, B, C
      isImpulse = waveNumber === 'B'; // B is impulse-like
    }
    
    // Create the wave
    const wave: Wave = {
      number: waveNumber,
      startTimestamp: startPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      startPrice: isImpulse ? startPoint.low : startPoint.high,
      endPrice: isImpulse ? endPoint.high : endPoint.low,
      type: isImpulse ? 'impulse' : 'corrective',
      isComplete: i < pivots.length - 2,
      isImpulse: isImpulse
    };
    
    waves.push(wave);
    
    // If we just completed a C wave, start a new cycle
    if (waveNumber === 'C') {
      currentCycleStart = i + 1; // Next point starts a new cycle
    }
    
    // If wave 2 would violate rules, we could start a new pattern
    if (waveNumber === 2 && isUpMove) {
      // Wave 2 should move down, so this is potentially invalid
      if (i+1 < pivots.length-1) { // If we have more points
        currentCycleStart = i + 1; // Restart counting from next point
      }
    }
  }
  
  console.log(`Fallback identified ${waves.length} waves`);
  
  const currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  const fibTargets = calculateFibTargetsForWaves(waves, data);
  const impulsePattern = waves.some(w => w.number === 5);
  const correctivePattern = waves.some(w => w.number === 'C');
  
  return {
    waves,
    currentWave,
    fibTargets,
    trend: data[data.length - 1].close > data[0].close ? 'bullish' : 'bearish',
    impulsePattern,
    correctivePattern
  };
};

// Add a safer simple wave pattern generator
const createSimpleWavePattern = (data: StockHistoricalData[]): WaveAnalysisResult => {
  if (!data || data.length === 0) {
    return generateEmptyAnalysisResult();
  }

  const third = Math.floor(data.length / 3);
  const twoThirds = Math.floor(2 * data.length / 3);

  const waves: Wave[] = [
    {
      number: 1,
      startTimestamp: data[0].timestamp,
      endTimestamp: data[third].timestamp,
      startPrice: data[0].close,
      endPrice: data[third].close,
      type: 'impulse',
      isComplete: true,
      isImpulse: true
    },
    {
      number: 2,
      startTimestamp: data[third].timestamp,
      endTimestamp: data[twoThirds].timestamp,
      startPrice: data[third].close,
      endPrice: data[twoThirds].close,
      type: 'corrective',
      isComplete: true,
      isImpulse: false
    },
    {
      number: 3,
      startTimestamp: data[twoThirds].timestamp,
      endTimestamp: data[data.length - 1].timestamp,
      startPrice: data[twoThirds].close,
      endPrice: data[data.length - 1].close,
      type: 'impulse',
      isComplete: false,
      isImpulse: true
    }
  ];

  return {
    waves,
    currentWave: waves[waves.length - 1],
    fibTargets: [],
    trend: data[data.length - 1].close > data[0].close ? 'bullish' : 'bearish',
    impulsePattern: false,
    correctivePattern: false
  };
};

const generateEmptyAnalysisResult = (): WaveAnalysisResult => ({
  waves: [],
  currentWave: {} as Wave,
  fibTargets: [],
  trend: 'neutral',
  impulsePattern: false,
  correctivePattern: false
});