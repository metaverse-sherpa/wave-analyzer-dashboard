/**
 * ELLIOTT WAVE THEORY IMPLEMENTATION
 * 
 * Elliott Wave Theory is a method to analyze market cycles by identifying recurring fractal wave patterns.
 * This file implements automatic detection of Elliott Wave patterns in stock price data.
 * 
 * Basic Elliott Wave pattern consists of:
 * - Five waves in the direction of the main trend (numbered 1-5)
 * - Three waves in the correction (labeled A-B-C)
 * 
 * Key rules that must be followed:
 * - Wave 2 never retraces beyond the start of Wave 1
 * - Wave 3 must extend beyond the end of Wave 1
 * - Wave 4 should not overlap with Wave 1's price territory (but can be relaxed in some cases)
 */

import { StockHistoricalData } from "@/services/yahooFinanceService";

// Add this at the top level of your file, outside any function
const thresholdCombinations = [
  { max: 0.03, min: 0.01 },
  { max: 0.05, min: 0.02 },
  { max: 0.02, min: 0.005 },
  { max: 0.07, min: 0.03 }
];

// Define the Wave interface - represents a single Elliott Wave
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
}

// Define the WaveAnalysisResult interface - the complete analysis output
export interface WaveAnalysisResult {
  waves: Wave[];                             // All detected waves in sequence
  currentWave: Wave;                         // Most recent/current wave
  fibTargets: FibTarget[];                   // Fibonacci price targets
  trend: 'bullish' | 'bearish' | 'neutral';  // Overall trend direction
  impulsePattern?: boolean;                  // True if we've identified a complete impulse pattern (waves 1-5)
  correctivePattern?: boolean;               // True if we've identified a complete corrective pattern (waves A-B-C)
}

// Define the Fibonacci target interface - price levels for potential reversals
export interface FibTarget {
  level: number;      // Fibonacci ratio (e.g., 0.618, 1.618)
  price: number;      // Price target
  label: string;      // Display label (e.g., "61.8%")
  isExtension: boolean; // True for extensions, false for retracements
  isCritical?: boolean; // Optional flag for critical levels that shouldn't be broken
}

/**
 * Zigzag point interface - represents a significant pivot point in price data
 * These points form the basis for wave identification
 */
interface ZigzagPoint {
  price: number;       // Standard price (close)
  high: number;        // High price for impulse waves
  low: number;        // Low price for corrective waves
  timestamp: number;   // Time of the pivot point
  index: number;       // Index in the original data array
  type: 'peak' | 'trough' | 'start' | 'end';  // Type of pivot point
}

// Use memoization to prevent recalculating the same analysis multiple times
const memoCache = new Map<string, WaveAnalysisResult>();

/**
 * Calculate Fibonacci retracement levels based on a price move
 * Retracements predict where price might reverse after retracing part of the previous move
 * 
 * @param startPrice - Starting price of the move
 * @param endPrice - Ending price of the move
 * @returns Array of Fibonacci retracement price targets
 */
const calculateFibRetracement = (startPrice: number, endPrice: number): FibTarget[] => {
  // Calculate the price difference of the move
  const diff = endPrice - startPrice;
  
  // Common Fibonacci retracement levels (23.6%, 38.2%, 50%, 61.8%, 78.6%)
  const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
  
  // Calculate price targets for each level
  return levels.map(level => ({
    level,
    price: endPrice - diff * level, // Subtract from end price for retracements
    label: `${(level * 100).toFixed(1)}%`,
    isExtension: false
  }));
};

/**
 * Calculate Fibonacci extension levels based on a price move
 * Extensions predict where price might go beyond the previous move
 * 
 * @param startPrice - Starting price of the move
 * @param endPrice - Ending price of the move
 * @returns Array of Fibonacci extension price targets
 */
const calculateFibExtension = (startPrice: number, endPrice: number): FibTarget[] => {
  const diff = endPrice - startPrice;
  const direction = endPrice > startPrice ? 1 : -1;  // Determine if we're in an uptrend or downtrend
  
  // Common Fibonacci extension levels (123.6%, 161.8%, 200%, 261.8%)
  const levels = [1.236, 1.618, 2.0, 2.618];
  
  // Calculate price targets for each level
  return levels.map(level => ({
    level,
    price: endPrice + (diff * level * direction), // Add to end price for extensions
    label: `${(level * 100).toFixed(1)}%`,
    isExtension: true
  }));
};

/**
 * Combine retracements and extensions for the current wave sequence
 * 
 * @param waves - Detected waves
 * @param data - Historical price data
 * @returns Combined array of all Fibonacci price targets
 */
const calculateFibTargetsForWaves = (waves: Wave[], data: StockHistoricalData[]): FibTarget[] => {
  // Need at least 2 waves to calculate targets
  if (waves.length < 2) return [];

  const fibTargets: FibTarget[] = [];
  const lastWave = waves[waves.length - 1];
  const lastWaveNumber = lastWave.number;
  
  // Find Wave 1 and Wave 2 if they exist
  const wave1 = waves.find(w => w.number === 1);
  const wave2 = waves.find(w => w.number === 2);
  
  // Handle specific wave scenarios
  if (lastWaveNumber === 3 && wave1 && wave1.startPrice && wave1.endPrice && lastWave.startPrice) {
    // For Wave 3: calculate projections based on Wave 1's length
    const wave1Length = Math.abs(wave1.endPrice! - wave1.startPrice);
    const isUptrend = wave1.endPrice! > wave1.startPrice;
    const direction = isUptrend ? 1 : -1;
    
    // Wave 3 projections from the end of Wave 2 (start of Wave 3)
    const projectionLevels = [
      { level: 1.618, label: "161.8%" },
      { level: 2.618, label: "261.8%" },
      { level: 3.618, label: "361.8%" }
    ];
    
    // Calculate each projection target
    const wave3Targets = projectionLevels.map(({ level, label }) => ({
      level,
      price: lastWave.startPrice! + (wave1Length * level * direction),
      label,
      isExtension: true
    }));
    
    fibTargets.push(...wave3Targets);
    
    // For ongoing Wave 3, also add the "minimum" requirement (exceeding Wave 1 end)
    if (!lastWave.isComplete && wave1.endPrice) {
      fibTargets.push({
        level: 1.0,
        price: wave1.endPrice,
        label: "100% (min)",
        isExtension: true
      });
    }
  } 
  // Update the Wave 4 Fibonacci targets section

else if (lastWaveNumber === 4 && wave1) {
  // For Wave 4: calculate key retracement levels of Wave 3
  // Wave 4 typically retraces 38.2% or 50% of Wave 3
  const wave3 = waves.find(w => w.number === 3);
  const wave2 = waves.find(w => w.number === 2);
  
  if (wave3 && wave3.startPrice && wave3.endPrice && wave2 && wave2.endPrice) {
    // Create standard retracement levels
    const retracementLevels = calculateFibRetracement(
      wave3.startPrice,
      wave3.endPrice
    );
    
    // Filter out any retracement levels that would go below Wave 2's end
    const validRetracements = retracementLevels.filter(level => level.price > wave2.endPrice);
    
    // Add Wave 2 end as an absolute barrier that shouldn't be crossed
    fibTargets.push({
      level: 0,
      price: wave2.endPrice,
      label: "Wave 2 End (Limit)",
      isExtension: false,
      isCritical: true // Mark as a critical level that shouldn't be broken
    });
    
    // Only add the valid retracements to our targets
    fibTargets.push(...validRetracements);
    
    // Also add the popular 38.2% and 50% retracement levels if they're valid
    const wave3Range = wave3.endPrice - wave3.startPrice;
    const target382 = wave3.endPrice - (wave3Range * 0.382);
    const target50 = wave3.endPrice - (wave3Range * 0.5);
    
    // Ensure these key levels are included if they're valid (above Wave 2 end)
    if (target382 > wave2.endPrice && !validRetracements.some(t => Math.abs(t.price - target382) < 0.01)) {
      fibTargets.push({
        level: 0.382,
        price: target382,
        label: "38.2%",
        isExtension: false
      });
    }
    
    if (target50 > wave2.endPrice && !validRetracements.some(t => Math.abs(t.price - target50) < 0.01)) {
      fibTargets.push({
        level: 0.5,
        price: target50,
        label: "50.0%",
        isExtension: false
      });
    }
    
    // If we add the Wave 1 end check as well, it should be this:
    if (wave1.endPrice) {
      // Add Wave 1 end as another important level
      fibTargets.push({
        level: 0,
        price: wave1.endPrice,
        label: "Wave 1 End",
        isExtension: false,
        isCritical: true // Secondary critical level
      });
    }
  }
}
  else if (lastWaveNumber === 5) {
    // For Wave 5: calculate extensions from Wave 4 end
    // Wave 5 is often 0.618, 1.0, or 1.618 × Wave 1
    const wave1 = waves.find(w => w.number === 1);
    
    if (wave1 && wave1.startPrice && wave1.endPrice && lastWave.startPrice) {
      const wave1Length = Math.abs(wave1.endPrice - wave1.startPrice);
      const isUptrend = wave1.endPrice > wave1.startPrice;
      const direction = isUptrend ? 1 : -1;
      
      const projectionLevels = [
        { level: 0.618, label: "61.8%" },
        { level: 1.0, label: "100%" },
        { level: 1.618, label: "161.8%" }
      ];
      
      const wave5Targets = projectionLevels.map(({ level, label }) => ({
        level,
        price: lastWave.startPrice! + (wave1Length * level * direction),
        label,
        isExtension: true
      }));
      
      fibTargets.push(...wave5Targets);
    }
  }
  else {
    // Default behavior for other waves
    // Calculate retracements based on the previous wave's move
    const previousWave = waves[waves.length - 2];
    
    if (previousWave && previousWave.startPrice && previousWave.endPrice) {
      const retracementLevels = calculateFibRetracement(
        previousWave.startPrice,
        previousWave.endPrice
      );
      fibTargets.push(...retracementLevels);
    }
    
    // Add extensions for impulse waves
    if (lastWave.isImpulse && lastWave.startPrice) {
      const extensionLevels = calculateFibExtension(
        lastWave.startPrice,
        lastWave.endPrice || data[data.length - 1].close // Use current price if wave is incomplete
      );
      fibTargets.push(...extensionLevels);
    }
  }

  // Add a validation function for Fibonacci targets

const validateFibTargets = (fibTargets: FibTarget[], waves: Wave[]): FibTarget[] => {
  // If we don't have enough waves for validation, return as-is
  if (waves.length < 2) return fibTargets;
  
  const wave1 = waves.find(w => w.number === 1);
  const wave2 = waves.find(w => w.number === 2);
  const wave3 = waves.find(w => w.number === 3);
  const wave4 = waves.find(w => w.number === 4);
  
  // Filter targets based on Elliott Wave rules
  return fibTargets.filter(target => {
    // For Wave 4, ensure targets don't go below Wave 2 end
    if (wave4 && wave2 && target.label.includes('4')) {
      return target.price >= wave2.endPrice!;
    }
    
    // For Wave 2, targets shouldn't go below Wave 1 start
    if (wave2 && wave1 && target.label.includes('2')) {
      return target.price >= wave1.startPrice;
    }
    
    // For Wave 3, ensure targets are beyond Wave 1 end
    if (wave3 && wave1 && target.label.includes('3') && target.isExtension) {
      return target.price >= wave1.endPrice!;
    }
    
    return true;
  });
}

// Call this validator before returning targets in calculateFibTargetsForWaves
return validateFibTargets(fibTargets, waves);
};

/**
 * Find significant pivot points in price data with adaptive threshold
 * Starts with the higher threshold and progressively lowers it if needed
 * 
 * @param data - Historical price data
 * @param maxThreshold - Maximum percentage change threshold (default: 3%)
 * @param minThreshold - Minimum percentage change threshold (default: 1%)
 * @returns Array of significant pivot points
 */
export const findPivots = (
  data: StockHistoricalData[], 
  maxThreshold: number = 0.03,
  minThreshold: number = 0.01
): ZigzagPoint[] => {
  // Need at least 3 data points to find pivots
  if (data.length < 3) return []; 
  
  // Start with the higher threshold and progressively lower if needed
  let currentThreshold = maxThreshold;
  let pivots: ZigzagPoint[] = [];
  
  // Try progressively lower thresholds until we find enough pivots
  while (currentThreshold >= minThreshold) {
    pivots = findPivotsWithThreshold(data, currentThreshold);
    
    // Need at least 4 points to form 3 waves (minimum for Elliott Wave analysis)
    if (pivots.length >= 4) {
      console.log(`Found ${pivots.length} pivots with ${currentThreshold * 100}% threshold`);
      break;
    }
    
    // Lower the threshold and try again
    currentThreshold -= 0.005; // Decrease by 0.5%
  }
  
  // If we still don't have enough pivots, use minimum threshold
  if (pivots.length < 4) {
    pivots = findPivotsWithThreshold(data, minThreshold);
    console.log(`Using minimum threshold ${minThreshold * 100}%: found ${pivots.length} pivots`);
  }
  
  return pivots;
};

/**
 * Helper function that finds pivots using a specific threshold
 */
const findPivotsWithThreshold = (data: StockHistoricalData[], threshold: number): ZigzagPoint[] => {
  const pivots: ZigzagPoint[] = [];
  
  // Always include the first point
  pivots.push({
    price: data[0].close,
    high: data[0].high,
    low: data[0].low,
    timestamp: data[0].timestamp, // Keep as Date object if that's what it is
    index: 0,
    type: 'start'
  });

  // Initialize tracking variables
  let lastDirection: 'up' | 'down' | null = null;
  let lastExtreme = data[0];
  let lastExtremeIndex = 0;

  // Scan through the price data to find significant turning points
  for (let i = 1; i < data.length; i++) {
    const candle = data[i];
    const currentDirection = candle.close > lastExtreme.close ? 'up' : 'down';
    
    if (lastDirection !== null && currentDirection !== lastDirection) {
      // Calculate percentage change from last extreme
      const change = Math.abs(lastExtreme.close - candle.close) / lastExtreme.close;
      
      // Now use the provided threshold parameter
      if (change >= threshold) {
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
      // Continue in the same direction, update extremes
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

  return pivots;
};

/**
 * Determine the trend direction for a given wave number
 * This helps us identify whether we expect the market to move up or down
 * 
 * @param waveNumber - The wave number/letter to analyze
 * @returns Trend direction ('bullish', 'bearish', or 'neutral')
 */
const getWaveTrend = (waveNumber: string | number): 'bullish' | 'bearish' | 'neutral' => {
  if (typeof waveNumber === 'number') {
    // In bullish patterns: 1, 3, 5 are bullish; 2, 4 are bearish
    return waveNumber % 2 === 1 ? 'bullish' : 'bearish';
  } else {
    // In bullish patterns: B is bullish; A and C are bearish
    return waveNumber === 'B' ? 'bullish' : 'bearish';
  }
};

/**
 * Generate an empty analysis result when no valid patterns are found
 * This ensures we always return a consistent structure even when analysis fails
 */
const generateEmptyAnalysisResult = (): WaveAnalysisResult => ({
  waves: [],  // Empty array, not undefined
  currentWave: {  // Properly initialized Wave object
    number: 0,
    startTimestamp: 0,
    startPrice: 0,
    type: 'corrective',
    isComplete: false
  },
  fibTargets: [],
  trend: 'neutral',
  impulsePattern: false,
  correctivePattern: false
});

/**
 * Find the lowest price point within a range of data
 * Used for validating certain Elliott Wave rules
 * 
 * @param data - Historical price data
 * @param startIndex - Start index of the range
 * @param endIndex - End index of the range
 * @returns Index of the lowest price point
 */
const findLowestPoint = (data: StockHistoricalData[], startIndex: number, endIndex: number): number => {
  let lowestIdx = startIndex;
  let lowestPrice = data[startIndex].low;

  // Scan the range for the lowest price
  for (let i = startIndex + 1; i <= endIndex; i++) {
    if (data[i].low < lowestPrice) {
      lowestPrice = data[i].low;
      lowestIdx = i;
    }
  }

  console.log(`Found lowest point: ${lowestPrice} at index ${lowestIdx}`);
  return lowestIdx;
};

/**
 * Fallback analysis when the main algorithm can't find valid patterns
 * Currently set to return empty results (no "fake" waves)
 */
const fallbackWaveAnalysis = (pivots: ZigzagPoint[], data: StockHistoricalData[]): WaveAnalysisResult => {
  console.log("Fallback analysis requested, but simple patterns are disabled");
  return generateEmptyAnalysisResult();
};

/**
 * Search through pivots to find valid Elliott Wave patterns
 * Returns the index of the first pivot in a valid sequence, or -1 if none found
 */
const findValidPivotSequence = (pivots: ZigzagPoint[]): number => {
  console.log(`Searching for valid pivot sequence in ${pivots.length} pivots`);
  
  // Need at least 3 pivots to form Wave 1 and 2
  if (pivots.length < 3) {
    console.log("Not enough pivot points for pattern search");
    return -1;
  }
  
  // Look for patterns starting at each pivot
  for (let i = 0; i < pivots.length - 2; i++) {
    const wave1Start = pivots[i];     // First pivot
    const wave1End = pivots[i + 1];   // Second pivot
    const wave2End = pivots[i + 2];   // Third pivot
    
    // Log the sequence we're checking
    console.log(`Checking sequence starting at index ${i}:`, {
      wave1Start: wave1Start.low,
      wave1End: wave1End.high,
      wave2End: wave2End.low
    });
    
    // Wave 1 must go up
    if (wave1End.high <= wave1Start.low) {
      console.log("Skipping: Wave 1 must move upward");
      continue;
    }
    
    // Wave 2 must go down from Wave 1 end
    if (wave2End.low >= wave1End.high) {
      console.log("Skipping: Wave 2 must be a correction (downward)");
      continue;
    }
    
    // Wave 2 cannot go below Wave 1 start
    if (wave2End.low <= wave1Start.low) {
      console.log("Skipping: Wave 2 retraced beyond start of Wave 1");
      continue;
    }
    
    // If we have a fourth pivot, check Wave 3
    if (i + 3 < pivots.length) {
      const wave3End = pivots[i + 3];
      
      // Wave 3 must go up
      if (wave3End.high <= wave2End.low) {
        console.log("Skipping: Wave 3 must move upward");
        continue;
      }
      
      // CHANGED RULE: Wave 3 must ALWAYS exceed Wave 1 end
      if (wave3End.high <= wave1End.high) {
        console.log("Skipping: Wave 3 must exceed Wave 1 end");
        continue;
      }
    }
    
    // We found a valid sequence!
    console.log(`Found valid Elliott Wave sequence starting at index ${i}`);
    return i;
  }
  
  console.log("No valid Elliott Wave sequences found");
  return -1;
};

/**
 * Modified validateInitialPivots to use the new search function
 */
const validateInitialPivots = (pivots: ZigzagPoint[]): boolean => {
  const validSequenceStart = findValidPivotSequence(pivots);
  
  if (validSequenceStart === -1) {
    return false;
  }
  
  // If we found a valid sequence but it doesn't start at index 0,
  // we should truncate the pivots array to start at the valid sequence
  if (validSequenceStart > 0) {
    console.log(`Truncating ${validSequenceStart} invalid pivots from start`);
    pivots.splice(0, validSequenceStart);
  }
  
  return true;
};

/**
 * Find the highest pivot point after the start point, before a significant reversal
 * Used specifically for extending wave 3 to its full length
 */
const findWave3Peak = (pivots: ZigzagPoint[], startIndex: number): number => {
  let highestIdx = startIndex;
  let highestPrice = pivots[startIndex].high;
  let found = false;
  
  // Look forward from the start index to find the highest point before reversal
  for (let i = startIndex + 1; i < pivots.length; i++) {
    // If this pivot is higher, it's a new candidate for the wave 3 peak
    if (pivots[i].high > highestPrice) {
      highestPrice = pivots[i].high;
      highestIdx = i;
      found = true;
    } 
    // If price is reversing significantly (found a lower low), stop looking
    else if (pivots[i].low < pivots[highestIdx].low * 0.97) { // 3% reversal
      break;
    }
  }
  
  console.log(`Wave 3 peak search: found=${found}, index=${highestIdx}, price=${highestPrice}`);
  return highestIdx;
};

/**
 * Core function to analyze Elliott Wave patterns from pivot points
 * Modified to focus exclusively on bullish wave patterns
 */
const completeWaveAnalysis = (
  pivots: ZigzagPoint[], 
  data: StockHistoricalData[],
  checkTimeout?: () => void,
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  console.log('\n=== Complete Wave Analysis ===');
  console.log(`Starting analysis with ${pivots.length} pivots`);
  
  if (!validateInitialPivots(pivots)) {
    console.log('❌ Initial pivot sequence failed validation');
    return fallbackWaveAnalysis(pivots, data);
  }
  
  console.log('✅ Initial pivot sequence validated');
  
  const waves: Wave[] = [];
  let pendingWaves: Wave[] = []; // Store potential waves here until validated
  let waveCount = 1;
  let phase: 'impulse' | 'corrective' = 'impulse';
  
  // Create pivot pairs
  const pivotPairs = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    pivotPairs.push({
      startPoint: pivots[i],
      endPoint: pivots[i + 1],
      isUpMove: pivots[i + 1].price > pivots[i].price
    });
  }

  // Analyze waves
  let previousWave: Wave | null = null;
  let skipToIndex = -1;
  let patternInvalidated = false;

  for (let i = 0; i < pivotPairs.length; i++) {
    // Skip indices that were consumed by wave 3 extension
    if (skipToIndex >= 0 && i <= skipToIndex) {
      continue;
    }

    // Reset pattern if prior wave was invalidated
    if (patternInvalidated) {
      console.log('Pattern invalidated, looking for new Wave 1');
      phase = 'impulse';
      waveCount = 1;
      patternInvalidated = false;
      pendingWaves = []; // Clear pending waves when pattern is invalidated
      
      // Start a new pattern only at a low pivot point (trough)
      if (pivotPairs[i].startPoint.type !== 'trough' && i < pivotPairs.length - 1) {
        continue;
      }
    }

    const { startPoint, isUpMove } = pivotPairs[i];
    let { endPoint } = pivotPairs[i];
    
    // Special handling for Wave 3
    if (waveCount === 3 && phase === 'impulse') {
      // Look ahead to find the highest pivot before a significant reversal
      const wave3PeakIndex = findWave3Peak(pivots, i + 1);
      
      // If we found a higher peak, use that instead
      if (wave3PeakIndex > i + 1) {
        console.log(`Extending Wave 3 to pivot ${wave3PeakIndex} for higher peak`);
        endPoint = pivots[wave3PeakIndex];
        skipToIndex = wave3PeakIndex - 1; // Skip the intermediate pivots we consumed
      }
    }
    
    // Create the wave - with proper type assignment based on Elliott Wave rules
    let waveNumber = phase === 'impulse' ? waveCount : ['A', 'B', 'C'][waveCount - 1];
    
    // Determine wave's start attributes from previous wave when available
    const startPrice = previousWave ? previousWave.endPrice : (isUpMove ? startPoint.low : startPoint.high);
    const startTimestamp = previousWave ? previousWave.endTimestamp : startPoint.timestamp;
    
    // Determine if this is the last wave in our analysis by checking if it ends at the last data point
    const isLastWave = (i === pivotPairs.length - 1);
    const isLastDataPoint = endPoint.timestamp === data[data.length - 1].timestamp;
    
    // Set isComplete based on whether this is the last wave ending at the last data point
    const isComplete = !(isLastWave && isLastDataPoint);
    
    let wave: Wave = {
      number: waveNumber,
      startTimestamp: startTimestamp,
      endTimestamp: endPoint.timestamp,
      startPrice: startPrice,
      endPrice: isUpMove ? endPoint.high : endPoint.low,
      type: determineWaveType(waveNumber),
      isComplete: isComplete,  // Set based on our determination
      isImpulse: isImpulseWave(waveNumber)
    };

    // Validate wave based on position
    let waveValid = true;
    let confirmPattern = false;
    
    switch (phase) {
      case 'impulse':
        switch (waveCount) {
          case 1:
            // Wave 1 must be upward
            if (!isUpMove) {
              console.log("Wave 1 invalidated - must be upward");
              patternInvalidated = true;
              waveValid = false;
            }
            break;
            
          case 2:
            // Wave 2 cannot go below Wave 1 start
            if (pendingWaves.length === 0) {
              console.log("Wave 2 invalidated - no Wave 1 in pending waves");
              patternInvalidated = true;
              waveValid = false;
            } else if (endPoint.low <= pendingWaves[0].startPrice!) {
              console.log("Wave 2 invalidated - retraced beyond Wave 1 start");
              patternInvalidated = true;
              waveValid = false;
            }
            break;
            
          case 3:
            // Wave 3 must exceed Wave 1 end
            if (pendingWaves.length === 0) {
              console.log("Wave 3 invalidated - no Wave 1 in pending waves");
              patternInvalidated = true;
              waveValid = false;
            } else if (endPoint.high <= pendingWaves[0].endPrice!) {
              console.log("Wave 3 invalidated - didn't exceed Wave 1 end");
              patternInvalidated = true;
              waveValid = false;
            } else {
              // Wave 3 confirms the pattern! Commit pending waves to results
              console.log("✅ Wave 3 confirmed - committing pattern to results");
              confirmPattern = true;
            }
            break;
            
          case 4:
            if (pendingWaves.length === 0 && waves.length === 0) {
              console.log("Wave 4 invalidated - no prior waves");
              patternInvalidated = true;
              waveValid = false;
            } 
            // Check for overlap with Wave 1's end price (stricter rule)
            else if (waves.length > 0) {
              const wave1 = waves.find(w => w.number === 1);
              if (wave1 && endPoint.low <= wave1.endPrice!) {
                console.log("Wave 4 invalidated - overlaps Wave 1 END territory");
                patternInvalidated = true;
                waveValid = false;
              }
            } 
            // Check if there's a Wave 1 in pending waves
            else if (pendingWaves.length > 0) {
              const wave1 = pendingWaves.find(w => w.number === 1);
              if (wave1 && endPoint.low <= wave1.endPrice!) {
                console.log("Wave 4 invalidated - overlaps Wave 1 END territory (from pending)");
                patternInvalidated = true;
                waveValid = false;
              }
            }
            break;
            
          case 5:
            // ALWAYS transition to corrective pattern after Wave 5, regardless of amplitude
            console.log("Completed impulse pattern 1-5, transitioning to corrective A-B-C pattern");
            phase = 'corrective';
            waveCount = 0; // Will increment to 1 for Wave A
            break;
        }
        break;

      case 'corrective':
        switch (waveCount) {
          case 3: // Wave C
            // After completing Wave C, reset to look for new impulse pattern
            console.log("Completed corrective pattern A-B-C, looking for new impulse pattern");
            phase = 'impulse';
            waveCount = 0; // Will increment to 1 for new Wave 1
            break;
        }
        break;
    }

    if (waveValid) {
      // If this is wave 3 and it's valid, commit all pending waves
      if (confirmPattern) {
        console.log(`Committing ${pendingWaves.length} pending waves plus current wave to results`);
        waves.push(...pendingWaves, wave);
        pendingWaves = []; // Clear pending now that we've committed them
      } 
      // For waves >= 3, add directly to results as we're already in a confirmed pattern
      else if (waveCount >= 3) {
        waves.push(wave);
      } 
      // For waves 1-2, add to pending until wave 3 confirms the pattern
      else {
        pendingWaves.push(wave);
        console.log(`Added wave ${waveNumber} to pending (${pendingWaves.length} pending waves)`);
      }
      
      previousWave = wave;
    } else if (patternInvalidated) {
      pendingWaves = []; // Clear pending waves if pattern is invalidated
    }
    
    waveCount++;

    // Report progress but include both confirmed and pending waves
    if (onProgress) {
      // Show both confirmed and pending waves in progress updates
      onProgress([...waves, ...pendingWaves.map(w => ({...w, isPending: true}))]);
    }

    if (!checkCurrentPrice(waves, data)) {
      console.log("Current price invalidates the pattern, resetting analysis");
      waves.length = 0; // Clear all waves to restart pattern detection
      pendingWaves.length = 0;
      phase = 'impulse';
      waveCount = 1;
      patternInvalidated = false;
    }
  }

  console.log('\n=== Wave Analysis Complete ===');
  console.log(`Found ${waves.length} valid waves:`, 
    waves.map(w => `Wave ${w.number}: ${w.type}`).join(', '));

  // Return complete analysis result with only confirmed waves
  return {
    waves,
    currentWave: waves.length > 0 ? 
      // If the last wave ends at the latest price point, it might be ongoing
      (waves[waves.length - 1].endTimestamp === data[data.length - 1].timestamp ?
        { ...waves[waves.length - 1], isComplete: false } :  // Mark as ongoing
        waves[waves.length - 1]  // Keep as is (likely complete)
      ) : 
      {  // Fallback if no waves
        number: 0,
        startTimestamp: 0,
        startPrice: 0,
        type: 'corrective',
        isComplete: false
      },
    fibTargets: calculateFibTargetsForWaves(waves, data),
    trend: data[data.length - 1].close > data[0].close ? 'bullish' : 'bearish',
    impulsePattern: waves.some(w => w.number === 5),
    correctivePattern: waves.some(w => w.number === 'C')
  };
};

/**
 * Try multiple threshold combinations to find waves
 */
export const analyzeElliottWaves = async (
  symbol: string,
  priceData: StockHistoricalData[],
  isCancelled: () => boolean = () => false,
  onProgress?: (waves: Wave[]) => void  // Add this parameter
): Promise<WaveAnalysisResult> => {
  // Add validation at the beginning
  const MIN_REQUIRED_POINTS = 50;
  if (!priceData || priceData.length < MIN_REQUIRED_POINTS) {
    throw new Error(`Insufficient data points: ${priceData?.length || 0} (minimum ${MIN_REQUIRED_POINTS} required)`);
  }

  try {
    console.log('\n=== Starting Elliott Wave Analysis ===');
    console.log(`Analyzing ${priceData.length} data points from:`, {
      start: new Date(priceData[0].timestamp).toLocaleDateString(),
      end: new Date(priceData[priceData.length - 1].timestamp).toLocaleDateString()
    });

    // Basic validation
    if (!priceData || priceData.length < 10) {
      console.error(`Insufficient data points: ${priceData?.length}`);
      return generateEmptyAnalysisResult();
    }

    // Calculate price range
    try {
      const priceRange = {
        low: Math.min(...priceData.map(d => d.low)),
        high: Math.max(...priceData.map(d => d.high))  // Fixed arrow function syntax
      };
      console.log(`Price range: $${priceRange.low.toFixed(2)} to $${priceRange.high.toFixed(2)}`);
    } catch (err) {
      console.error("Error calculating price range:", err);
    }
    
    // Filter valid data points
    const validData = priceData.filter(point => {
      return point && 
             point.timestamp &&
             typeof point.close === 'number' &&
             typeof point.high === 'number' &&
             typeof point.low === 'number';
    });
    
    console.log(`Valid data points: ${validData.length} of ${priceData.length}`);
    
    // MOVE THIS CODE INSIDE THE FUNCTION
    // Reduce data size for performance if needed
    const processData = validData.length > 250 
      ? validData.filter((_, i) => i % Math.ceil(validData.length / 250) === 0) 
      : validData;
      
    console.log(`Using ${processData.length} data points for analysis after sampling`);
    
    // Try each threshold combination
    for (const { max, min } of thresholdCombinations) {
      console.log(`\n--- Trying threshold combination: ${(max*100).toFixed(1)}% - ${(min*100).toFixed(1)}%`);
      
      const pivots = findPivots(processData, max, min);
      console.log(`Found ${pivots.length} pivot points`);
      
      if (pivots.length < 3) {
        console.log('Not enough pivots, trying next threshold...');
        continue;
      }
      
      // Log first few pivots
      console.log('First 3 pivots:', pivots.slice(0, Math.min(3, pivots.length)).map(p => ({
        price: p.price.toFixed(2),
        date: formatDate(p.timestamp)
      })));
      
      // Complete the wave analysis with these pivots
      const result = completeWaveAnalysis(pivots, processData, undefined, onProgress);
      
      if (result.waves.length >= 3) {
        console.log('Found wave pattern, validating integrity...');
        
        // Get current price
        const currentPrice = processData[processData.length - 1].close;
        const latestTimestamp = processData[processData.length - 1].timestamp;
        
        // Modify the returned result to correctly set isComplete on the current wave
        if (result.waves.length > 0) {
          const latestWave = result.waves[result.waves.length - 1];
          
          // Check if this is potentially an ongoing wave by comparing timestamps
          const timeDiff = Math.abs(latestTimestamp - latestWave.endTimestamp!);
          const isRecentEnd = timeDiff < 86400000; // Within 24 hours
          
          // Also check if price is still moving in the direction of the wave 
          const isContinuingTrend = (latestWave.isImpulse && currentPrice > latestWave.endPrice!) || 
                                 (!latestWave.isImpulse && currentPrice < latestWave.endPrice!);
          
          // Check if the pattern validation still holds
          const isStillValid = validateWaveSequence(result.waves, currentPrice);
          
          // If the wave ended very recently AND is continuing its trend AND doesn't violate patterns
          // Consider it incomplete (still in progress)
          if (isRecentEnd && isContinuingTrend && isStillValid) {
            console.log('Wave appears to be ongoing - marking as incomplete');
            
            // Create a modified copy of the current wave with isComplete = false
            const modifiedCurrentWave = {
              ...latestWave,
              isComplete: false  // Mark as incomplete/in progress
            };
            
            // Return the modified result with the incomplete current wave
            return {
              ...result,
              currentWave: modifiedCurrentWave
            };
          } else if (!isStillValid) {
            console.log('Current price pattern violates wave rules - wave may be complete or invalidated');
          }
        }
        
        return result;
      }
    }
    
    console.log('No valid Elliott Wave patterns found');
    return generateEmptyAnalysisResult();
    
  } catch (error) {
    console.error("❌ Error in Elliott Wave analysis:", error);
    return generateEmptyAnalysisResult();
  }
};

/**
 * Validate if a wave follows Elliott Wave rules
 * 
 * @param wave - The wave to validate
 * @param previousWaves - Waves that came before this one
 * @param data - Historical price data
 * @returns Boolean indicating if the wave is valid
 */
const isValidWave = (wave: Wave, previousWaves: Wave[], data: StockHistoricalData[]): boolean => {
  if (!wave.startPrice || !wave.endPrice) return false;

  // Wave 1 validation
  if (wave.number === 1) {
    // Wave 1 must start from a low point
    const startIdx = data.findIndex(d => d.timestamp === wave.startTimestamp);
    const endIdx = data.findIndex(d => d.timestamp === wave.endTimestamp);
    
    // Check if there's a lower point in this range
    const lowestIdx = findLowestPoint(data, startIdx, endIdx);
    if (data[lowestIdx].low < wave.startPrice) {
      console.log('Found lower point during Wave 1 - invalidating');
      return false;
    }
    
    // Wave 1 must move up from start to end
    return wave.endPrice > wave.startPrice;
  }

  // Validate subsequent waves
  if (previousWaves.length > 0) {
    const wave1 = previousWaves.find(w => w.number === 1);
    if (wave1) {
      // If price goes below Wave 1 start, invalidate the pattern
      if (wave.endPrice < wave1.startPrice) {
        console.log('Price moved below Wave 1 start - invalidating pattern');
        return false;
      }
    }
  }

  // Wave passed all validation checks
  return true;
};

// Note: The validateWaveSequence function appears to be referenced but not implemented
// This is likely one source of bugs in the current code

// Export a function to clear the memo cache
export const clearMemoCache = (): void => {
  memoCache.clear();
  console.log("In-memory wave analysis cache cleared");
};

// Move formatDate function to the module level (outside any function)
const formatDate = (timestamp: any): string => {
  try {
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString();
    }
    
    if (typeof timestamp === 'number') {
      const ms = timestamp < 10000000000 
        ? timestamp * 1000
        : timestamp;
      return new Date(ms).toLocaleDateString();
    }
    
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleDateString();
    }

    return 'Invalid date';
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

/**
 * Determine if a wave is impulse or corrective based on Elliott Wave rules
 */
const isImpulseWave = (waveNumber: string | number): boolean => {
  if (typeof waveNumber === 'number') {
    // Waves 1, 3, 5 are impulse; Waves 2, 4 are corrective
    return waveNumber % 2 === 1;
  } else {
    // Wave B is the only corrective wave that's impulsive in direction
    return waveNumber === 'B';
  }
};

/**
 * Determine the wave type based on Elliott Wave rules
 */
const determineWaveType = (waveNumber: string | number): 'impulse' | 'corrective' => {
  return isImpulseWave(waveNumber) ? 'impulse' : 'corrective';
};

// Add a function to detect alternation between Wave 2 and 4
const hasAlternation = (wave2: Wave, wave4: Wave, data: StockHistoricalData[]): boolean => {
  // Calculate time duration of each wave
  const wave2Duration = wave2.endTimestamp! - wave2.startTimestamp;
  const wave4Duration = wave4.endTimestamp! - wave4.startTimestamp;
  
  // Calculate price ranges
  const wave2Range = Math.abs(wave2.endPrice! - wave2.startPrice);
  const wave4Range = Math.abs(wave4.endPrice! - wave4.startPrice);
  
  // Compare characteristics
  const hasDifferentDuration = Math.abs(wave4Duration / wave2Duration - 1) > 0.3; // >30% difference
  const hasDifferentRange = Math.abs(wave4Range / wave2Range - 1) > 0.3; // >30% difference
  
  return hasDifferentDuration || hasDifferentRange;
};

// Add to wave validation
const validateFibonacciRelationships = (waves: Wave[]): boolean => {
  if (waves.length < 5) return true; // Not enough waves to check
  
  const wave1Length = waves[0].endPrice! - waves[0].startPrice;
  const wave3Length = waves[2].endPrice! - waves[2].startPrice;
  const wave5Length = waves[4].endPrice! - waves[4].startPrice;
  
  // Wave 3 is often 1.618 times the length of Wave 1
  const wave3Ratio = wave3Length / wave1Length;
  const isWave3Valid = Math.abs(wave3Ratio - 1.618) < 0.3 || Math.abs(wave3Ratio - 2.618) < 0.3;
  
  // Wave 5 is often 0.618 times Wave 1 or equal to Wave 1
  const wave5Ratio = wave5Length / wave1Length;
  const isWave5Valid = Math.abs(wave5Ratio - 0.618) < 0.3 || Math.abs(wave5Ratio - 1.0) < 0.3;
  
  console.log(`Fibonacci relationships: Wave3/Wave1 = ${wave3Ratio.toFixed(2)}, Wave5/Wave1 = ${wave5Ratio.toFixed(2)}`);
  
  return isWave3Valid && isWave5Valid;
};

// Add volume validation for Wave 3
const hasVolumeConfirmation = (wave: Wave, data: StockHistoricalData[]): boolean => {
  // Find data points corresponding to this wave
  const startIdx = data.findIndex(d => d.timestamp === wave.startTimestamp);
  const endIdx = data.findIndex(d => d.timestamp === wave.endTimestamp);
  
  if (startIdx === -1 || endIdx === -1) return true;
  
  // Calculate average volume before the wave
  const beforeIdx = Math.max(0, startIdx - 10);
  const beforeVolume = data.slice(beforeIdx, startIdx)
    .reduce((sum, d) => sum + (d.volume || 0), 0) / (startIdx - beforeIdx);
  
  // Calculate average volume during the wave
  const waveVolume = data.slice(startIdx, endIdx + 1)
    .reduce((sum, d) => sum + (d.volume || 0), 0) / (endIdx - startIdx + 1);
  
  // Wave 3 should typically have higher volume
  const volumeRatio = waveVolume / beforeVolume;
  console.log(`Volume ratio for wave ${wave.number}: ${volumeRatio.toFixed(2)}`);
  
  return wave.number === 3 ? volumeRatio > 1.2 : true;
};

type WaveWithConfidence = Wave & { confidence: number };

// Add confidence scoring
const calculateWaveConfidence = (wave: Wave, waves: Wave[], data: StockHistoricalData[]): number => {
  let confidence = 100;
  
  // Rules-based deductions with safety checks
  if (wave.number === 2 && wave.endPrice && wave.startPrice && wave.endPrice < wave.startPrice * 0.9) 
    confidence -= 10; // Deep Wave 2
  
  if (wave.number === 3 && wave.endPrice && waves.length > 0 && waves[0].endPrice && 
      wave.endPrice < waves[0].endPrice * 1.5) 
    confidence -= 10; // Weak Wave 3
  
  if (wave.number === 4 && wave.endPrice && waves.length > 0 && waves[0].endPrice && 
      wave.endPrice < waves[0].endPrice) 
    confidence -= 25; // Wave 4 overlap
  
  return Math.max(0, Math.min(100, confidence));
};

// Add this function to validate wave sequence integrity
const validateWaveSequence = (waves: Wave[], currentPrice: number): boolean => {
  // Skip empty wave arrays
  if (waves.length === 0) return true;
  
  // Check for wave 3 violations specifically
  const wave3 = waves.find(w => w.number === 3);
  if (wave3 && currentPrice < wave3.startPrice) {
    console.log(`⚠️ Current price ${currentPrice} invalidates Wave 3 (started at ${wave3.startPrice})`);
    return false;
  }

  // Find wave 1 and wave 4
  const wave1 = waves.find(w => w.number === 1);
  const wave4 = waves.find(w => w.number === 4);
  
  // Implement strict Wave 4 non-overlap rule with Wave 1
  if (wave1 && wave4) {
    // Wave 4 cannot retrace below the end of Wave 1
    if (wave4.endPrice && wave1.endPrice && wave4.endPrice < wave1.endPrice) {
      console.log(`⚠️ Wave 4 invalidated - retraced below Wave 1 end (${wave4.endPrice} < ${wave1.endPrice})`);
      return false;
    }
    
    // For ongoing Wave 4, check if current price violates the rule
    if (!wave4.endPrice && currentPrice < wave1.endPrice) {
      console.log(`⚠️ Current price ${currentPrice} invalidates Wave 4 - below Wave 1 end (${wave1.endPrice})`);
      return false;
    }
  }

  // Check for consistency in wave sequence
  for (let i = 1; i < waves.length; i++) {
    const prevWave = waves[i-1];
    const currentWave = waves[i];
    
    // Ensure wave continuity - end of one wave should be start of next
    if (prevWave.endPrice !== currentWave.startPrice) {
      console.log(`⚠️ Wave continuity broken between Wave ${prevWave.number} and Wave ${currentWave.number}`);
      return false;
    }
  }
  
  return true;
};

// Also update the completeWaveAnalysis function to validate wave continuity
// Add this at an appropriate point inside the function:
const checkCurrentPrice = (waves: Wave[], data: StockHistoricalData[]): boolean => {
  if (waves.length === 0) return true;
  const currentPrice = data[data.length - 1].close;
  
  // Check specific wave rule violations using current price
  const wave3 = waves.find(w => w.number === 3);
  if (wave3 && currentPrice < wave3.startPrice) {
    console.log(`Current price invalidates Wave 3 pattern - price fell below where Wave 3 started`);
    return false;
  }
  
  // Add Wave 4 violation check
  const wave4 = waves.find(w => w.number === 4);
  const wave1 = waves.find(w => w.number === 1);
  if (wave4 && wave1 && currentPrice < wave1.endPrice!) {
    console.log(`Current price invalidates Wave 4 pattern - price fell below where Wave 1 ended`);
    return false;
  }
  
  return true;
};