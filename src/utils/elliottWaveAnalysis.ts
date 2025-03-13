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
  for (let i = 0; i < pivotPairs.length; i++) {
    const { startPoint, endPoint, isUpMove } = pivotPairs[i];
    
    // Create the wave
    let wave: Wave = {
      number: phase === 'impulse' ? waveCount : ['A', 'B', 'C'][waveCount - 1],
      startTimestamp: startPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      startPrice: isUpMove ? startPoint.low : startPoint.high,
      endPrice: isUpMove ? endPoint.high : endPoint.low,
      type: isUpMove ? 'impulse' : 'corrective',
      isComplete: true,
      isImpulse: isUpMove
    };

    // Validate wave based on position
    switch (waveCount) {
      case 4:
        if (endPoint.low <= waves[0].endPrice!) {
          console.log("Wave 4 violated Wave 1 territory");
          continue;
        }
        break;
        
      case 5:
        if (phase === 'impulse') {
          phase = 'corrective';
          waveCount = 0; // Will be incremented to 1 for Wave A
        }
        break;
    }

    waves.push(wave);
    waveCount++;

    // Report progress
    if (onProgress) {
      onProgress([...waves]);
    }
  }

  console.log('\n=== Wave Analysis Complete ===');
  console.log(`Found ${waves.length} valid waves:`, 
    waves.map(w => `Wave ${w.number}: ${w.type}`).join(', '));

  // Return complete analysis result
  return {
    waves,
    currentWave: waves[waves.length - 1] || {
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
export const analyzeElliottWaves = (
  data: StockHistoricalData[], 
  onProgress?: (waves: Wave[]) => void
): WaveAnalysisResult => {
  try {
    console.log('\n=== Starting Elliott Wave Analysis ===');
    console.log(`Analyzing ${data.length} data points from:`, {
      start: new Date(data[0].timestamp).toLocaleDateString(),
      end: new Date(data[data.length - 1].timestamp).toLocaleDateString()
    });

    // Basic validation
    if (!data || data.length < 10) {
      console.error(`Insufficient data points: ${data?.length}`);
      return generateEmptyAnalysisResult();
    }

    // Calculate price range
    try {
      const priceRange = {
        low: Math.min(...data.map(d => d.low)),
        high: Math.max(...data.map(d => d.high))
      };
      console.log(`Price range: $${priceRange.low.toFixed(2)} to $${priceRange.high.toFixed(2)}`);
    } catch (err) {
      console.error("Error calculating price range:", err);
    }
    
    // Filter valid data points
    const validData = data.filter(point => {
      return point && 
             point.timestamp &&
             typeof point.close === 'number' &&
             typeof point.high === 'number' &&
             typeof point.low === 'number';
    });
    
    console.log(`Valid data points: ${validData.length} of ${data.length}`);
    
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
        console.log('Found valid wave pattern!');
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