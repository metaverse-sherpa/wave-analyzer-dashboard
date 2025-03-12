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
}

/**
 * Zigzag point interface - represents a significant pivot point in price data
 * These points form the basis for wave identification
 */
interface ZigzagPoint {
  price: number;       // Standard price (close)
  high: number;        // High price for impulse waves
  low: number;         // Low price for corrective waves
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
  const previousWave = waves[waves.length - 2];

  // Calculate retracements based on the previous wave's move
  if (previousWave.startPrice && previousWave.endPrice) {
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

  return fibTargets;
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
    timestamp: data[0].timestamp,
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
  waves: [],
  currentWave: {} as Wave,
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
 * Core function to analyze Elliott Wave patterns from pivot points
 * Modified to focus exclusively on bullish wave patterns
 */
const completeWaveAnalysis = (
  pivots: ZigzagPoint[], 
  data: StockHistoricalData[],
  checkTimeout?: () => void,
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  console.log(`Identifying waves from ${pivots.length} pivots`);
  
  // REMOVED: We no longer need to detect the overall trend - assuming bullish
  // const overallTrend = data[data.length - 1].close > data[0].close ? 'up' : 'down';
  
  // Create pairs of adjacent pivot points to form waves
  const pivotPairs = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    pivotPairs.push({
      startPoint: pivots[i],
      endPoint: pivots[i + 1],
      isUpMove: pivots[i + 1].price > pivots[i].price // Is price moving up between these points?
    });
  }
  
  // Storage for our identified waves
  const waves: Wave[] = [];
  
  // Counter to keep track of which wave number we're on (1-5, then A-B-C)
  let waveCount = 1;
  
  // Track where the last complete cycle ended
  let lastCompleteCycle = -1;
  
  // Keep track of points where we need to restart wave counting
  const invalidationPoints: number[] = [];
  
  // Main wave identification loop
  for (let i = 0; i < pivotPairs.length; i++) {
    // Check for timeout periodically to prevent hanging
    if (checkTimeout && i % 10 === 0) {
      checkTimeout();
    }
    
    const { startPoint, endPoint, isUpMove } = pivotPairs[i];
    
    // If this is an invalidation point, restart the wave count
    if (invalidationPoints.length > 0 && i === invalidationPoints[invalidationPoints.length - 1]) {
      console.log(`Restarting wave count from invalidation point at index ${i}`);
      waveCount = 1; // Start a new Wave 1
    }
    
    // Variables to determine wave characteristics
    let waveNumber: number | string;
    let shouldBeImpulse: boolean;
    let shouldBeUp: boolean;
    
    // Logic for numbered waves (1-5)
    if (waveCount <= 5) {
      waveNumber = waveCount;
      // Waves 1, 3, 5 are impulse; 2, 4 are corrective
      shouldBeImpulse = waveNumber % 2 === 1;
      
      // SIMPLIFIED: In bullish patterns, impulse goes up, corrective goes down
      shouldBeUp = shouldBeImpulse;
    } 
    // Logic for letter waves (A-B-C)
    else if (waveCount <= 8) {
      const letterIndex = waveCount - 6; // 0 for A, 1 for B, 2 for C
      waveNumber = ['A', 'B', 'C'][letterIndex];
      // Only B is impulse-like; A and C are corrective
      shouldBeImpulse = waveNumber === 'B';
      
      // SIMPLIFIED: In bullish patterns, B goes up, A and C go down
      shouldBeUp = waveNumber === 'B';
    } 
    // After completing a full cycle, restart with wave 1
    else {
      console.log("Completed full cycle (1-5,A-B-C), restarting with wave 1");
      waveCount = 1;
      waveNumber = 1;
      shouldBeImpulse = true;
      shouldBeUp = true; // Wave 1 always goes up in bullish patterns
      lastCompleteCycle = i - 1; // Mark the end of the complete cycle
    }
    
    // Create a wave object with appropriate properties
    const wave: Wave = {
      number: waveNumber,
      startTimestamp: startPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      
      // Impulse waves start from a low point
      startPrice: shouldBeImpulse
        ? startPoint.low
        : startPoint.high,
      
      // Impulse waves end at a high point
      endPrice: shouldBeImpulse
        ? endPoint.high
        : endPoint.low,
        
      type: shouldBeImpulse ? 'impulse' : 'corrective',
      isComplete: i < pivotPairs.length - 1, // Last wave might be incomplete
      isImpulse: shouldBeImpulse
    };
    
    // CHECK FOR WAVE 1 DIRECTION 
    // Wave 1 must move upward in bullish patterns
    if (waveNumber === 1) {
      // Ensure the prices are defined before comparison
      if (wave.endPrice !== undefined && wave.startPrice !== undefined) {
        if (wave.endPrice <= wave.startPrice) {
          console.log("Wave 1 violated Elliott rule: must move upward in bullish patterns");
          // Instead of skipping completely, mark it but still add to provide visualization
          wave.type = 'corrective'; // Mark as invalid impulse
          
          // Add it to waves but don't increment wave count - will try to find another Wave 1
          waves.push(wave);
          // Don't increment waveCount so we look for another Wave 1
          continue; 
        }
      }
    }

    // Check if the actual price movement aligns with what we'd expect
    const isProperDirection = (shouldBeUp === isUpMove);
    
    // Apply Elliott Wave rules for validation
    
    // Rule: Wave 2 cannot go below the start of Wave 1
    if (waveNumber === 2 && wave.endPrice! <= waves[waves.length - 1].startPrice) {
      console.log("Wave 2 violated Elliott rule: retraced beyond start of Wave 1");
      invalidationPoints.push(i); // Mark this as a restart point
      
      // Still add this wave for visualization, but will restart count after
      waves.push(wave);
      waveCount++;
    }
    // Wave C completes a cycle, start a new Wave 1 after it
    else if (waveNumber === 'C') {
      waves.push(wave);
      waveCount = 1; // Reset for new cycle
      console.log("Wave C completed, starting new Wave 1");
    }
    // Normal case for other waves
    else {
      waves.push(wave);
      waveCount++;
    }

    // Report progress if callback provided
    if (onProgress) {
      onProgress(waves);
    }
  }
  
  // If no waves were found, return empty result
  if (waves.length === 0) {
    console.log("No waves found with adaptive approach, using fallback");
    return fallbackWaveAnalysis(pivots, data);
  }
  
  console.log(`Identified ${waves.length} waves with adaptive approach`);
  
  // Prepare the final analysis result
  const currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  const fibTargets = calculateFibTargetsForWaves(waves, data);
  const impulsePattern = waves.some(w => String(w.number) === '5'); // Did we complete an impulse pattern?
  const correctivePattern = waves.some(w => w.number === 'C');     // Did we complete a corrective pattern?
  
  // Determine trend based on current wave - ALWAYS BULLISH for impulse waves
  const trend = currentWave && currentWave.isImpulse ? 'bullish' : 'bearish';

  return {
    waves,
    currentWave,
    fibTargets,
    trend,
    impulsePattern,
    correctivePattern
  };
};

/**
 * Main entry point for Elliott Wave analysis
 * Processes price data to identify wave patterns
 * 
 * @param data - Historical price data to analyze
 * @param onProgress - Optional callback for progress updates
 * @returns Complete wave analysis result
 */
export const analyzeElliottWaves = (
  data: StockHistoricalData[], 
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  console.log(`Starting wave analysis with ${data.length} data points`);
  
  // Debug quality of data
  if (data.length > 0) {
    console.log(`First point: ${new Date(data[0].timestamp).toLocaleDateString()} Last point: ${new Date(data[data.length-1].timestamp).toLocaleDateString()}`);
    console.log(`Price range: ${Math.min(...data.map(d => d.low))} to ${Math.max(...data.map(d => d.high))}`);
  }
  
  // Create a cache key based on first/last timestamps and prices
  // This was missing and causing the reference error
  const cacheKey = data.length > 0 ? 
    `${data[0].timestamp}-${data[data.length-1].timestamp}-${data[0].close}-${data[data.length-1].close}` : 
    'empty';
  
  // Check cache first (optional)
  if (memoCache.has(cacheKey)) {
    console.log("Using cached wave analysis");
    return memoCache.get(cacheKey)!;
  }
  
  // Add timeout mechanism to prevent processing from hanging
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 10000; // 10 seconds timeout
  
  // Define a function to check for timeout
  const checkTimeout = () => {
    if (Date.now() - startTime > MAX_PROCESSING_TIME) {
      console.log("Wave analysis timed out - stopping processing");
      throw new Error("Analysis timeout");
    }
  };
  
  // Basic input validation
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.error("Invalid or empty data provided for analysis");
    return generateEmptyAnalysisResult();
  }

  // Filter out invalid data points
  const validData = data.filter(point => (
    point &&
    typeof point.timestamp === 'number' &&
    typeof point.close === 'number' &&
    typeof point.high === 'number' &&
    typeof point.low === 'number'
  ));

  // Require minimum number of data points
  if (validData.length < 20) {
    console.log("Insufficient valid data points for wave analysis");
    return generateEmptyAnalysisResult();
  }

  try {
    // Sample data if there are too many points (for performance)
    const processData = validData.length > 200 
      ? validData.filter((_, index) => index % Math.ceil(validData.length / 200) === 0)
      : validData;

    // Step 1: Find significant pivot points with adaptive threshold
    const pivots = findPivots(processData, 0.03, 0.01);
    checkTimeout();
    
    // Initialize progress tracking
    if (onProgress) {
      onProgress([]);
    }

    // Need minimum number of pivots to form patterns
    if (pivots.length < 3) {
      console.log("Insufficient pivot points found for wave analysis");
      return generateEmptyAnalysisResult();
    }

    // Step 2: Complete the wave analysis
    const result = completeWaveAnalysis(pivots, processData, checkTimeout);
    
    // Step 3: Make validation more flexible
    if (result.waves.length >= 3) {
      const wave1 = result.waves.find(w => w.number === 1);
      const wave3 = result.waves.find(w => w.number === 3);
      
      // We found waves, let's cache and return them even if not perfect
      memoCache.set(cacheKey, result);
      
      // Log a warning if the pattern doesn't match Elliott Wave rules perfectly
      if (wave1 && wave3 && wave3.endPrice && wave1.endPrice) {
        const isWave3Valid = wave3.endPrice > wave1.endPrice;
        if (!isWave3Valid) {
          console.log('Warning: Wave 3 does not properly extend above Wave 1, but returning waves anyway');
        }
      }
      
      // Return the result regardless of perfect validation
      return result;
    }
    
    // If validation failed, return empty result
    console.log("No valid Elliott Wave pattern found");
    return generateEmptyAnalysisResult();

  } catch (error) {
    console.error("Error in wave analysis:", error);
    // Return empty result on error
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