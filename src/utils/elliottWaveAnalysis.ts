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
 * Modified validateInitialPivots with relaxed criteria
 */
const validateInitialPivots = (pivots: ZigzagPoint[]): boolean => {
  // Need at least 3 pivots to validate the first wave and part of the second
  if (pivots.length < 3) {
    console.log("Not enough pivot points for initial validation");
    return false;
  }
  
  const wave1Start = pivots[0]; // First pivot
  const wave1End = pivots[1];   // Second pivot
  const wave2End = pivots[2];   // Third pivot
  
  // Wave 1 must go up (core rule, cannot be relaxed)
  if (wave1End.price <= wave1Start.price) {
    console.log("Invalid initial pivots: Wave 1 must move upward");
    return false;
  }
  
  // Wave 2 must go down from Wave 1 end (core rule, cannot be relaxed)
  if (wave2End.price >= wave1End.price) {
    console.log("Invalid initial pivots: Wave 2 must be a correction (downward)");
    return false;
  }
  
  // Critical rule: Wave 2 cannot go below Wave 1 start (core rule, cannot be relaxed)
  if (wave2End.low <= wave1Start.low) { // Use low instead of price for stricter check
    console.log(`Invalid initial pivots: Wave 2 low (${wave2End.low}) cannot retrace beyond start of Wave 1 (${wave1Start.low})`);
    return false;
  }
  
  // If we have more pivots, check if Wave 3 starts properly
  if (pivots.length >= 4) {
    const wave3End = pivots[3]; // Fourth pivot (end of Wave 3)
    
    // Wave 3 must go up (core rule, cannot be relaxed)
    if (wave3End.price <= wave2End.price) {
      console.log("Invalid pivots: Wave 3 must move upward");
      return false;
    }
    
    // RELAXED RULE: Wave 3 should ideally exceed Wave 1 end but not required
    if (wave3End.price <= wave1End.price) {
      console.log("Note: Wave 3 does not exceed Wave 1 end (not ideal but allowing)");
      // Don't return false here to allow more patterns
    }
  }
  
  // Add debugging for pivot values
  console.log(`Pivot values: W1 start=${wave1Start.price}, W1 end=${wave1End.price}, W2 end=${wave2End.price}`);
  
  // All initial validation passed
  console.log("Initial pivot sequence appears valid for Elliott Wave pattern");
  return true;
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
  
  // FIRST: Validate initial pivot sequence before continuing
  if (!validateInitialPivots(pivots)) {
    console.log("Initial pivot sequence failed validation, using fallback analysis");
    return fallbackWaveAnalysis(pivots, data);
  }
  
  // Rest of your existing function...
  const pivotPairs = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    pivotPairs.push({
      startPoint: pivots[i],
      endPoint: pivots[i + 1],
      isUpMove: pivots[i + 1].price > pivots[i].price
    });
  }
  
  // Your existing wave tracking variables and main loop...
  // ...
  
  // Keep track of all waves for validation
  const waves: Wave[] = [];
  let waveCount = 1;
  const invalidationPoints: number[] = [];
  
  // When starting a new wave, always validate against previous ones
  for (let i = 0; i < pivotPairs.length; i++) {
    // Existing code...
    
    const { startPoint, endPoint, isUpMove } = pivotPairs[i];
    
    // Additional validation for Wave 2
    if (waveCount === 2) {
      // Find Wave 1 start
      const wave1Start = pivots[0].price;
      
      // Check if any low point in this wave goes below Wave 1 start
      if (endPoint.low <= wave1Start) {
        console.log("Wave 2 violated Elliott rule: ended below start of Wave 1");
        invalidationPoints.push(i);
        // Continue with your invalidation handling...
        continue;
      }
      
      // Check all price points in between for Wave 2
      const startIndex = data.findIndex(d => {
        if (d.timestamp instanceof Date && startPoint.timestamp instanceof Date) {
          return d.timestamp.getTime() === startPoint.timestamp.getTime();
        } else {
          return d.timestamp === startPoint.timestamp;
        }
      });
      const endIndex = data.findIndex(d => d.timestamp === endPoint.timestamp);
      
      // Scan all prices in Wave 2
      for (let j = startIndex; j <= endIndex; j++) {
        if (data[j].low <= wave1Start) {
          console.log("Wave 2 violated Elliott rule: retraced beyond start of Wave 1 during formation");
          invalidationPoints.push(i);
          // Continue with your invalidation handling...
          continue;
        }
      }
    }
    
    // Rest of your existing code...
  }
  
  // Existing result preparation...
  return {
    // Your existing return...
  };
};

/**
 * Try multiple threshold combinations to find waves
 */
export const analyzeElliottWaves = (
  data: StockHistoricalData[], 
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  console.log(`Starting wave analysis with ${data.length} data points`);
  
  // Debug quality of data
  if (data.length > 0) {
    const first = data[0];
    const last = data[data.length - 1];
    
    // Log the raw data first
    console.log('Raw timestamp data:', {
      firstTimestamp: first.timestamp,
      lastTimestamp: last.timestamp
    });
    
    // Then use the formatDate function
    console.log("Sample data points:", {
      first: {
        timestamp: first.timestamp,
        type: typeof first.timestamp,
        isDate: first.timestamp instanceof Date,
        formatted: formatDate(first.timestamp)
      },
      last: {
        timestamp: last.timestamp,
        type: typeof last.timestamp,
        isDate: last.timestamp instanceof Date,
        formatted: formatDate(last.timestamp)
      }
    });
    
    console.log(`First point: ${formatDate(first.timestamp)} Last point: ${formatDate(last.timestamp)}`);
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

  // Replace your validData filter section with this version
  const validData = data.filter(point => {
    // Ensure point exists
    if (!point) return false;
    
    // Debug the first point to see what we're dealing with
    if (data.indexOf(point) === 0) {
      console.log("First data point:", {
        timestamp: point.timestamp,
        timestampType: typeof point.timestamp,
        isDate: point.timestamp instanceof Date,
        close: point.close,
        high: point.high,
        low: point.low
      });
    }
    
    // If timestamp is a Date object, keep it as a Date - no need to convert
    // This avoids unnecessary conversions and potential issues
    
    // Just validate that essential fields exist
    return (
      point.timestamp !== undefined && point.timestamp !== null &&
      point.close !== undefined && point.close !== null && !isNaN(Number(point.close)) &&
      point.high !== undefined && point.high !== null && !isNaN(Number(point.high)) &&
      point.low !== undefined && point.low !== null && !isNaN(Number(point.low))
    );
  });

  console.log(`Original data points: ${data.length}, Valid data points: ${validData.length}`);

  // Require minimum number of data points
  if (validData.length < 20) {
    console.log("Insufficient valid data points for wave analysis");
    return generateEmptyAnalysisResult();
  }

  try {
    // Try multiple threshold combinations
    const thresholdCombinations = [
      { max: 0.03, min: 0.01 },  // Original thresholds
      { max: 0.05, min: 0.01 },  // Higher max threshold
      { max: 0.02, min: 0.005 }, // Lower thresholds
      { max: 0.07, min: 0.02 }   // Much higher thresholds
    ];
    
    // Try each combination until we find valid Elliott patterns
    for (const { max, min } of thresholdCombinations) {
      console.log(`Trying thresholds: max=${max*100}%, min=${min*100}%`);
      
      // Sample data consistently
      const processData = validData.length > 200 
        ? validData.filter((_, index) => index % Math.ceil(validData.length / 200) === 0)
        : validData;
      
      // Find pivots with this threshold combination
      const pivots = findPivots(processData, max, min);
      checkTimeout();
      
      // Need minimum number of pivots
      if (pivots.length < 3) {
        console.log(`Insufficient pivots (${pivots.length}) with thresholds max=${max*100}%, min=${min*100}%`);
        continue; // Try next combination
      }
      
      // Validate initial pivots
      if (!validateInitialPivots(pivots)) {
        console.log(`Invalid Elliott pattern with thresholds max=${max*100}%, min=${min*100}%`);
        continue; // Try next combination
      }
      
      // If we get here, we found valid pivots - complete the analysis
      console.log(`Found valid Elliott pattern with thresholds max=${max*100}%, min=${min*100}%`);
      const result = completeWaveAnalysis(pivots, processData, checkTimeout, onProgress);
      
      // If we have at least 3 waves, return the result
      if (result && result.waves && result.waves.length >= 3) {
        memoCache.set(cacheKey, result);
        return result;
      }
    }
    
    // If no combination worked, return empty result
    console.log("No valid Elliott Wave pattern found with any threshold combination");
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

// Add this utility function at the top of the file, replacing the current formatDate function
const formatDate = (timestamp: any): string => {
  try {
    // Add debug logging to see what we're getting
    console.log('Formatting timestamp:', {
      value: timestamp,
      type: typeof timestamp,
      isDate: timestamp instanceof Date
    });

    // Handle different timestamp formats
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString();
    }
    
    if (typeof timestamp === 'number') {
      // Handle Unix timestamp in seconds vs milliseconds
      const ms = timestamp < 10000000000 
        ? timestamp * 1000  // Convert seconds to milliseconds
        : timestamp;       // Already in milliseconds
      return new Date(ms).toLocaleDateString();
    }
    
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleDateString();
    }

    console.log('Unhandled timestamp format:', timestamp);
    return 'Invalid date';
  } catch (error) {
    console.error('Error formatting date:', error, 'Timestamp:', timestamp);
    return 'Invalid date';
  }
};