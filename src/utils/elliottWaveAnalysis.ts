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
  price: number;
  timestamp: number;
  index: number;
  type: 'peak' | 'trough';
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
const findPivots = (data: StockHistoricalData[], threshold: number = 0.05): ZigzagPoint[] => {
  if (data.length < 7) return []; // Need at least 7 candles (2 on each side + 1 for peak/trough + 2 for confirmation)
  
  // Enhanced algorithm based on true price swings with minimum candle requirements
  const pivots: ZigzagPoint[] = [];
  let lastHigh = { price: data[0].high, timestamp: data[0].timestamp, index: 0 };
  let lastLow = { price: data[0].low, timestamp: data[0].timestamp, index: 0 };
  let currentDirection: 'up' | 'down' | null = null;
  
  // First determine initial direction - need at least 2 candles in a direction
  let i = 2; // Start from the 3rd candle to ensure we have 2 candles before
  let consecutiveUp = 0;
  let consecutiveDown = 0;
  
  while (i < data.length && currentDirection === null) {
    // Use high price for upward moves and low price for downward moves
    if (data[i].high > lastHigh.price * (1 + threshold)) {
      consecutiveUp++;
      consecutiveDown = 0;
      
      // Update the highest point
      if (data[i].high > lastHigh.price) {
        lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
      }
      
      // Require at least 2 consecutive candles in the direction
      if (consecutiveUp >= 2) {
        currentDirection = 'up';
        
        // Find the lowest point before this uptrend started
        let lowestIndex = i - consecutiveUp;
        let lowestPrice = data[lowestIndex].low;
        
        for (let j = lowestIndex - 2; j >= 0 && j >= lowestIndex - 4; j--) {
          if (data[j].low < lowestPrice) {
            lowestIndex = j;
            lowestPrice = data[j].low;
          }
        }
        
        // Add the lowest point as a trough - using LOW price
        pivots.push({
          price: data[lowestIndex].low, // Use the low price for trough
          timestamp: data[lowestIndex].timestamp,
          index: lowestIndex,
          type: 'trough'
        });
      }
    } else if (data[i].low < lastLow.price * (1 - threshold)) {
      consecutiveDown++;
      consecutiveUp = 0;
      
      // Update the lowest point
      if (data[i].low < lastLow.price) {
        lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
      }
      
      // Require at least 2 consecutive candles in the direction
      if (consecutiveDown >= 2) {
        currentDirection = 'down';
        
        // Find the highest point before this downtrend started
        let highestIndex = i - consecutiveDown;
        let highestPrice = data[highestIndex].high;
        
        for (let j = highestIndex - 2; j >= 0 && j >= highestIndex - 4; j--) {
          if (data[j].high > highestPrice) {
            highestIndex = j;
            highestPrice = data[j].high;
          }
        }
        
        // Add the highest point as a peak - using HIGH price
        pivots.push({
          price: data[highestIndex].high, // Use the high price for peak
          timestamp: data[highestIndex].timestamp,
          index: highestIndex,
          type: 'peak'
        });
      }
    } else {
      // Reset counts if not meeting threshold
      consecutiveUp = 0;
      consecutiveDown = 0;
      
      // Keep track of potential extremes before confirming direction
      if (data[i].high > lastHigh.price) {
        lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
      }
      if (data[i].low < lastLow.price) {
        lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
      }
    }
    i++;
  }
  
  // Continue with the established direction
  let pivotConfirmCount = 0;
  let potentialPivotIndex = -1;
  
  for (; i < data.length; i++) {
    if (currentDirection === 'up') {
      // In uptrend - track new highs and look for reversal
      if (data[i].high > lastHigh.price) {
        // New high, reset reversal confirmation
        lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
        pivotConfirmCount = 0;
        potentialPivotIndex = -1;
      } else if (data[i].low < lastHigh.price * (1 - threshold)) {
        // Potential reversal detected
        if (potentialPivotIndex === -1) {
          // Mark this as the potential pivot point
          potentialPivotIndex = lastHigh.index;
        }
        
        pivotConfirmCount++;
        
        // Require at least 2 candles to confirm the reversal
        if (pivotConfirmCount >= 2) {
          // Confirmed reversal - use HIGH price for peak
          pivots.push({ 
            price: lastHigh.price, // Use the high price for peak
            timestamp: lastHigh.timestamp, 
            index: lastHigh.index,
            type: 'peak' 
          });
          currentDirection = 'down';
          lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
          pivotConfirmCount = 0;
          potentialPivotIndex = -1;
        }
      } else {
        // Not a significant move, reset confirmation if we were tracking one
        if (potentialPivotIndex !== -1 && data[i].low > lastHigh.price * (1 - threshold * 0.5)) {
          pivotConfirmCount = 0;
          potentialPivotIndex = -1;
        }
      }
    } else if (currentDirection === 'down') {
      // In downtrend - track new lows and look for reversal
      if (data[i].low < lastLow.price) {
        // New low, reset reversal confirmation
        lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
        pivotConfirmCount = 0;
        potentialPivotIndex = -1;
      } else if (data[i].high > lastLow.price * (1 + threshold)) {
        // Potential reversal detected
        if (potentialPivotIndex === -1) {
          // Mark this as the potential pivot point
          potentialPivotIndex = lastLow.index;
        }
        
        pivotConfirmCount++;
        
        // Require at least 2 candles to confirm the reversal
        if (pivotConfirmCount >= 2) {
          // Confirmed reversal - use LOW price for trough
          pivots.push({
            price: lastLow.price, // Use the low price for trough
            timestamp: lastLow.timestamp,
            index: lastLow.index,
            type: 'trough'
          });
          currentDirection = 'up';
          lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
          pivotConfirmCount = 0;
          potentialPivotIndex = -1;
        }
      } else {
        // Not a significant move, reset confirmation if we were tracking one
        if (potentialPivotIndex !== -1 && data[i].high < lastLow.price * (1 + threshold * 0.5)) {
          pivotConfirmCount = 0;
          potentialPivotIndex = -1;
        }
      }
    }
  }
  
  // Add the final extreme point if it's significant and confirmed
  // We require at least 2 candles after the extreme for confirmation
  const lastDataIndex = data.length - 1;
  
  if (currentDirection === 'up' && 
      lastHigh.index > pivots[pivots.length-1]?.index && 
      lastHigh.index <= lastDataIndex - 2) {
    // Check if the last 2 candles confirm this high point
    let confirmed = true;
    for (let j = lastHigh.index + 1; j <= Math.min(lastHigh.index + 2, lastDataIndex); j++) {
      if (data[j].high > lastHigh.price) {
        confirmed = false;
        break;
      }
    }
    
    if (confirmed) {
      pivots.push({
        price: lastHigh.price, // Use the high price for peak
        timestamp: lastHigh.timestamp,
        index: lastHigh.index,
        type: 'peak'
      });
    }
  } else if (currentDirection === 'down' && 
             lastLow.index > pivots[pivots.length-1]?.index && 
             lastLow.index <= lastDataIndex - 2) {
    // Check if the last 2 candles confirm this low point
    let confirmed = true;
    for (let j = lastLow.index + 1; j <= Math.min(lastLow.index + 2, lastDataIndex); j++) {
      if (data[j].low < lastLow.price) {
        confirmed = false;
        break;
      }
    }
    
    if (confirmed) {
      pivots.push({
        price: lastLow.price, // Use the low price for trough
        timestamp: lastLow.timestamp,
        index: lastLow.index,
        type: 'trough'
      });
    }
  }
  
  // Validate minimum candle spacing between pivots (at least 2 candles between pivots)
  const validPivots: ZigzagPoint[] = [];
  
  for (let i = 0; i < pivots.length; i++) {
    if (i === 0) {
      validPivots.push(pivots[i]);
    } else {
      const lastIndex = validPivots[validPivots.length - 1].index;
      const currentIndex = pivots[i].index;
      
      // Ensure at least 4 candles between pivots (2 on each side)
      if (currentIndex - lastIndex >= 4) {
        validPivots.push(pivots[i]);
      }
    }
  }
  
  // Make sure we alternate between peaks and troughs
  const finalPivots: ZigzagPoint[] = [];
  
  for (let i = 0; i < validPivots.length; i++) {
    if (i === 0) {
      finalPivots.push(validPivots[i]);
    } else {
      const lastType = finalPivots[finalPivots.length - 1].type;
      const currentType = validPivots[i].type;
      
      // Only add if different from previous pivot type (alternate peak/trough)
      if (currentType !== lastType) {
        finalPivots.push(validPivots[i]);
      }
    }
  }
  
  return finalPivots;
};

/**
 * Applies Elliott Wave rules to validate wave counts and label waves correctly
 * @param pivots - Array of identified pivot points
 * @param data - Historical price data
 */
const identifyWaves = (pivots: ZigzagPoint[], data: StockHistoricalData[]): Wave[] => {
  if (pivots.length < 3) {
    return [];  // Need at least 3 points to identify any waves
  }
  
  // Step 1: Create initial wave segments from pivot points
  const waveSegments: Wave[] = [];
  
  for (let i = 0; i < pivots.length - 1; i++) {
    const startPoint = pivots[i];
    const endPoint = pivots[i + 1];
    
    const segment: Wave = {
      number: '', // Temporary - will be labeled correctly later
      startTimestamp: startPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      startPrice: startPoint.price,
      endPrice: endPoint.price,
      type: 'impulse', // Temporary - will be determined later
      isComplete: i < pivots.length - 2,
      isImpulse: true, // Temporary
    };
    
    waveSegments.push(segment);
  }
  
  // Step 2: Analyze segments to find potential wave patterns
  const waves: Wave[] = [];
  let currentPattern: 'impulse' | 'corrective' = 'impulse';
  let currentWaveNumber = 1;
  let patternStart = 0;
  
  // Attempt to label waves sequentially, following Elliott rules
  for (let i = 0; i < waveSegments.length; i++) {
    const segment = waveSegments[i];
    const isUpMove = segment.endPrice! > segment.startPrice;
    
    if (currentPattern === 'impulse') {
      // In impulse pattern (waves 1-5)
      if (currentWaveNumber === 1) {
        // Wave 1 should be an up move in bull market
        if (isUpMove) {
          segment.number = '1';
          segment.type = 'impulse';
          segment.isImpulse = true;
          waves.push(segment);
          currentWaveNumber = 2;
        } else {
          // If first move is down, it might be part of a corrective pattern
          segment.number = 'A';
          segment.type = 'impulse';
          segment.isImpulse = true;
          waves.push(segment);
          currentPattern = 'corrective';
          currentWaveNumber = 'B';
        }
      } 
      else if (currentWaveNumber === 2) {
        // Wave 2 should be a down move, retracing Wave 1
        if (!isUpMove) {
          // Check if it retraces more than 100% of Wave 1
          if (segment.endPrice! <= waves[waves.length - 1].startPrice) {
            // Rule violation: Wave 2 cannot retrace more than 100% of Wave 1
            // Reset wave count and start over
            resetWaveCount(waves, segment, i, waveSegments);
            currentWaveNumber = 1;
            patternStart = i;
            i--; // Reprocess this segment as part of a new pattern
          } else {
            segment.number = '2';
            segment.type = 'corrective';
            segment.isImpulse = false;
            waves.push(segment);
            currentWaveNumber = 3;
          }
        } else {
          // Not a valid Wave 2, reset and try again
          resetWaveCount(waves, segment, i, waveSegments);
          currentWaveNumber = 1;
          patternStart = i;
          i--; // Reprocess this segment
        }
      }
      else if (currentWaveNumber === 3) {
        // Wave 3 should be an up move
        if (isUpMove) {
          // Wave 3 should typically be the longest of 1, 3, 5
          const wave1 = waves.find(w => w.number === '1')!;
          const wave1Length = Math.abs(wave1.endPrice! - wave1.startPrice);
          const wave3Length = Math.abs(segment.endPrice! - segment.startPrice);
          
          if (wave3Length < wave1Length && i + 2 < waveSegments.length) {
            // Wave 3 might be shorter than Wave 1, let's check future segments
            // to see if there's a longer potential Wave 3 coming
            const nextSegment = waveSegments[i + 1];
            if (nextSegment && !isUpMove) {
              // This might be a complex Wave 3 with internal structure
              // For simplicity, we'll still label it as Wave 3
              segment.number = '3';
              segment.type = 'impulse';
              segment.isImpulse = true;
              waves.push(segment);
              currentWaveNumber = 4;
            } else {
              // Reset and try again, this pattern doesn't fit well
              resetWaveCount(waves, segment, i, waveSegments);
              currentWaveNumber = 1;
              patternStart = i;
              i--; // Reprocess this segment
            }
          } else {
            // Valid Wave 3
            segment.number = '3';
            segment.type = 'impulse';
            segment.isImpulse = true;
            waves.push(segment);
            currentWaveNumber = 4;
          }
        } else {
          // Not a valid Wave 3, reset and try again
          resetWaveCount(waves, segment, i, waveSegments);
          currentWaveNumber = 1;
          patternStart = i;
          i--; // Reprocess this segment
        }
      }
      else if (currentWaveNumber === 4) {
        // Wave 4 should be a down move
        if (!isUpMove) {
          // Check if Wave 4 overlaps with Wave 1 territory
          const wave1 = waves.find(w => w.number === '1')!;
          
          if (segment.endPrice! < wave1.endPrice!) {
            // This violates the non-overlap rule except in diagonal patterns
            // For simplicity, we'll accept it but note it might be a different pattern
            segment.number = '4';
            segment.type = 'corrective';
            segment.isImpulse = false;
            waves.push(segment);
            currentWaveNumber = 5;
          } else {
            // Valid Wave 4
            segment.number = '4';
            segment.type = 'corrective';
            segment.isImpulse = false;
            waves.push(segment);
            currentWaveNumber = 5;
          }
        } else {
          // Not a valid Wave 4, reset and try again
          resetWaveCount(waves, segment, i, waveSegments);
          currentWaveNumber = 1;
          patternStart = i;
          i--; // Reprocess this segment
        }
      }
      else if (currentWaveNumber === 5) {
        // Wave 5 should be an up move
        if (isUpMove) {
          segment.number = '5';
          segment.type = 'impulse';
          segment.isImpulse = true;
          waves.push(segment);
          
          // After Wave 5, we transition to a corrective pattern
          currentPattern = 'corrective';
          currentWaveNumber = 'A';
        } else {
          // Not a valid Wave 5, reset and try again
          resetWaveCount(waves, segment, i, waveSegments);
          currentWaveNumber = 1;
          patternStart = i;
          i--; // Reprocess this segment
        }
      }
    }
    else if (currentPattern === 'corrective') {
      // In corrective pattern (waves A-B-C)
      if (currentWaveNumber === 'A') {
        // Wave A is typically a down move after a bullish impulse
        if (!isUpMove) {
          segment.number = 'A';
          segment.type = 'impulse';  // Within corrective patterns, A and C are "impulse-like"
          segment.isImpulse = true;
          waves.push(segment);
          currentWaveNumber = 'B';
        } else {
          // If first corrective is up, might be irregular - still label as A
          segment.number = 'A';
          segment.type = 'impulse';
          segment.isImpulse = true;
          waves.push(segment);
          currentWaveNumber = 'B';
        }
      }
      else if (currentWaveNumber === 'B') {
        // Wave B typically moves counter to Wave A
        segment.number = 'B';
        segment.type = 'corrective';
        segment.isImpulse = false;
        waves.push(segment);
        currentWaveNumber = 'C';
      }
      else if (currentWaveNumber === 'C') {
        // Wave C typically moves in same direction as A
        segment.number = 'C';
        segment.type = 'impulse';
        segment.isImpulse = true;
        waves.push(segment);
        
        // After ABC, we expect a new impulse pattern
        currentPattern = 'impulse';
        currentWaveNumber = 1;
      }
    }
  }
  
  // Validate the entire wave sequence with additional Elliott Wave principles
  finalizeWaveLabels(waves);
  
  return waves;
};

/**
 * Resets the wave count when a pattern is invalidated
 * @param waves - The current wave array
 * @param segment - The current segment being processed
 * @param currentIndex - Index of current segment in allSegments
 * @param allSegments - All wave segments
 */
const resetWaveCount = (waves: Wave[], segment: Wave, currentIndex: number, allSegments: Wave[]) => {
  // When a pattern is invalidated, completely remove all waves in the current pattern
  
  // Find any waves that could be part of a previous pattern
  const lastValidIndex = findLastValidWaveIndex(waves);
  
  // Remove all waves after the last valid pattern
  if (lastValidIndex >= 0) {
    waves.splice(lastValidIndex + 1);
  } else {
    // If no valid pattern exists, clear all waves
    waves.length = 0;
  }
  
  console.log('Reset wave count. Removed invalid pattern. Waves remaining:', waves.length);
};

/**
 * Find the index of the last wave that completes a valid pattern
 * @param waves - Array of waves
 * @returns Index of the last wave in a valid pattern, or -1 if no valid pattern exists
 */
const findLastValidWaveIndex = (waves: Wave[]): number => {
  // A completed impulse pattern is 1-2-3-4-5
  // A completed corrective pattern is A-B-C
  
  // Search from the end for the last complete pattern
  for (let i = waves.length - 1; i >= 4; i--) {
    // Check for completed impulse pattern ending at this position
    if (typeof waves[i].number === 'number' && waves[i].number === 5 &&
        typeof waves[i-1].number === 'number' && waves[i-1].number === 4 &&
        typeof waves[i-2].number === 'number' && waves[i-2].number === 3 &&
        typeof waves[i-3].number === 'number' && waves[i-3].number === 2 &&
        typeof waves[i-4].number === 'number' && waves[i-4].number === 1) {
      return i; // Return position of wave 5
    }
  }
  
  // Check for completed corrective pattern
  for (let i = waves.length - 1; i >= 2; i--) {
    if (waves[i].number === 'C' &&
        waves[i-1].number === 'B' &&
        waves[i-2].number === 'A') {
      return i; // Return position of wave C
    }
  }
  
  // No complete pattern found
  return -1;
};

/**
 * Applies final validation to the wave sequence and makes any necessary adjustments
 */
const finalizeWaveLabels = (waves: Wave[]) => {
  if (waves.length === 0) return;
  
  // COMPLETELY NEW APPROACH: Start fresh with wave labeling to ensure proper sequence
  
  // Sort waves by timestamp first
  waves.sort((a, b) => a.startTimestamp - b.startTimestamp);
  
  // Start with a clean slate - we'll relabel all waves in sequence
  let direction = determineOverallTrend(waves);
  let isFirstSequence = true;
  
  // Determine whether we should start with impulse or corrective
  let currentMode: 'impulse' | 'corrective';
  
  // If overall trend is up, first sequence is likely impulse
  // If overall trend is down, first sequence is likely corrective
  currentMode = direction === 'up' ? 'impulse' : 'corrective';
  
  let waveIndex = 1;  // For impulse waves (1-5)
  let corrIndex = 0;  // For corrective waves (A-B-C)
  
  // Go through waves in chronological order and assign proper numbers
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const isUpMove = wave.endPrice! > wave.startPrice;
    
    if (currentMode === 'impulse') {
      // In impulse sequence, waves 1, 3, 5 move with the trend, 2 and 4 against it
      const expectUp = (waveIndex % 2 === 1); // Waves 1, 3, 5 should be up moves
      
      // If the direction matches what we expect for this wave number
      if ((expectUp && isUpMove) || (!expectUp && !isUpMove)) {
        // Assign the wave number in sequence
        wave.number = waveIndex;
        wave.type = expectUp ? 'impulse' : 'corrective';
        wave.isImpulse = expectUp;
        
        // Move to next wave
        waveIndex++;
        
        // If we've completed a 5-wave impulse sequence, switch to corrective
        if (waveIndex > 5) {
          currentMode = 'corrective';
          corrIndex = 0;
          isFirstSequence = false;
        }
      } else {
        // Direction doesn't match expectation
        if (isFirstSequence && i === 0) {
          // First wave doesn't match - might be a corrective pattern instead
          currentMode = 'corrective';
          corrIndex = 0;
          i--; // Reprocess this wave as part of corrective
        } else {
          // This is a pattern break in the middle - reset to Wave 1
          waveIndex = 1;
          i--; // Reprocess this segment
        }
      }
    } else { // corrective mode
      // In corrective sequence, A & C move against the main trend, B moves with it
      const corrLabels = ['A', 'B', 'C'];
      const isB = corrIndex === 1;
      const expectUp = (direction === 'down' && !isB) || (direction === 'up' && isB);
      
      // If the direction matches what we expect for this corrective wave
      if ((expectUp && isUpMove) || (!expectUp && !isUpMove)) {
        // Assign the wave letter in sequence
        wave.number = corrLabels[corrIndex];
        wave.type = (corrIndex === 1) ? 'corrective' : 'impulse'; // B is corrective
        wave.isImpulse = (corrIndex !== 1); // A & C are impulse-like
        
        // Move to next wave letter
        corrIndex++;
        
        // If we've completed an A-B-C corrective sequence, switch back to impulse
        if (corrIndex >= 3) {
          currentMode = 'impulse';
          waveIndex = 1;
          isFirstSequence = false;
        }
      } else {
        // Direction doesn't match expectation for corrective waves
        if (isFirstSequence && i === 0) {
          // First wave doesn't match - switch back to impulse
          currentMode = 'impulse';
          waveIndex = 1;
          i--; // Reprocess this wave
        } else {
          // This is a pattern break in the middle - reset to A
          corrIndex = 0; // Start over with A
          i--; // Reprocess this segment
        }
      }
    }
  }
  
  // Final check to make sure there are no duplicate numbers
  // and wave numbers are in proper sequence
  validateAndFixWaveSequence(waves);
};

/**
 * Determines the overall trend of the wave sequence
 */
const determineOverallTrend = (waves: Wave[]): 'up' | 'down' => {
  if (waves.length < 2) return 'up'; // Default to up if not enough data
  
  // Calculate total price change from first to last wave
  const firstWave = waves[0];
  const lastWave = waves[waves.length - 1];
  
  const startPrice = firstWave.startPrice;
  const endPrice = lastWave.endPrice!;
  
  return endPrice > startPrice ? 'up' : 'down';
};

/**
 * Additional validation to fix any remaining sequence issues
 */
const validateAndFixWaveSequence = (waves: Wave[]) => {
  // Keep track of numbers we've seen to detect duplicates
  const seenNumbers = new Set<string | number>();
  const duplicates = new Map<string | number, Wave[]>();
  
  // Collect all waves by their number
  waves.forEach(wave => {
    if (seenNumbers.has(wave.number)) {
      // Found a duplicate
      if (!duplicates.has(wave.number)) {
        duplicates.set(wave.number, []);
      }
      duplicates.get(wave.number)!.push(wave);
    }
    seenNumbers.add(wave.number);
  });
  
  // Handle any remaining duplicates
  duplicates.forEach((dupeWaves, number) => {
    // Sort duplicates by timestamp
    dupeWaves.sort((a, b) => a.startTimestamp - b.startTimestamp);
    
    // Keep only the first occurrence
    for (let i = 1; i < dupeWaves.length; i++) {
      const index = waves.indexOf(dupeWaves[i]);
      if (index > -1) {
        waves.splice(index, 1);
      }
    }
  });
  
  // Final check - make sure numbering is sequential
  let inImpulse = true;
  let expectedNumber = 1; // Start with 1 for impulse
  let corrIndex = 0;     // Start with A for corrective
  
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    
    if (inImpulse && typeof wave.number === 'number') {
      // In impulse sequence
      if (wave.number !== expectedNumber) {
        // There's a gap or out of sequence number
        wave.number = expectedNumber;
      }
      expectedNumber++;
      
      // After Wave 5, transition to corrective
      if (expectedNumber > 5) {
        inImpulse = false;
        corrIndex = 0;
      }
    } else if (!inImpulse && typeof wave.number === 'string') {
      // In corrective sequence
      const expectedLetter = ['A', 'B', 'C'][corrIndex];
      if (wave.number !== expectedLetter) {
        wave.number = expectedLetter;
      }
      corrIndex++;
      
      // After C, back to impulse
      if (corrIndex >= 3) {
        inImpulse = true;
        expectedNumber = 1;
      }
    } else {
      // Mixed sequence or incorrectly labeled wave
      if (inImpulse) {
        // Should be a number but isn't
        wave.number = expectedNumber;
        expectedNumber++;
        
        if (expectedNumber > 5) {
          inImpulse = false;
          corrIndex = 0;
        }
      } else {
        // Should be a letter but isn't
        wave.number = ['A', 'B', 'C'][corrIndex];
        corrIndex++;
        
        if (corrIndex >= 3) {
          inImpulse = true;
          expectedNumber = 1;
        }
      }
    }
  }
};

// In elliottWaveAnalysis.ts, add memoization to prevent recalculations
// At the top of the file:
const memoCache = new Map();

/**
 * Main function to analyze price data and identify Elliott Wave patterns
 * @param data - Historical price data to analyze
 */
export const analyzeElliottWaves = (data: StockHistoricalData[]): WaveAnalysisResult => {
  if (!data || data.length < 50) { // Need sufficient data for reliable analysis
    return { 
      waves: [], 
      currentWave: {} as Wave, 
      fibTargets: [],
      trend: 'neutral',
      impulsePattern: false,
      correctivePattern: false
    };
  }

  // Create a cache key based on the first and last data points
  const cacheKey = `${data[0].timestamp}-${data[data.length-1].timestamp}-${data.length}`;
  
  // Return cached result if available and not older than 10 minutes
  if (memoCache.has(cacheKey)) {
    const cached = memoCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 600000) { // 10 minutes
      return cached.result;
    }
  }
  
  // If data is too large, sample it to reduce computation
  let processData = data;
  if (data.length > 300) {
    const sampleFactor = Math.ceil(data.length / 300);
    processData = data.filter((_, index) => index % sampleFactor === 0);
  }
  
  // Find pivot points with less sensitivity for better performance
  const pivots = findPivots(processData, 0.05);
  
  // Identify waves based on pivot points
  let waves = identifyWaves(pivots, processData);
  
  // Sort waves by timestamp for consistent analysis
  waves.sort((a, b) => a.startTimestamp - b.startTimestamp);
  
  // Determine current wave and other analysis result properties
  let currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  
  // Calculate Fibonacci targets
  let fibTargets: FibTarget[] = [];
  
  if (waves.length >= 2) {
    const lastCompleteWave = waves[waves.length - 1];
    const previousWave = waves[waves.length - 2];
    
    // Calculate retracements and extensions
    const retracements = calculateFibRetracement(previousWave.startPrice, lastCompleteWave.endPrice!);
    const extensions = calculateFibExtension(previousWave.startPrice, lastCompleteWave.endPrice!);
    
    fibTargets = [...retracements, ...extensions];
  }
  
  // Determine trend
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (waves.length > 0) {
    const firstWave = waves[0];
    const lastWave = waves[waves.length - 1];
    
    if (lastWave.endPrice && firstWave.startPrice) {
      if (lastWave.endPrice > firstWave.startPrice) {
        trend = 'bullish';
      } else if (lastWave.endPrice < firstWave.startPrice) {
        trend = 'bearish';
      }
    }
  }
  
  // Determine pattern types
  const impulsePattern = waves.length >= 5 && 
    waves.slice(0, 5).every((w, i) => 
      (typeof w.number === 'number' && w.number === i + 1)
    );
    
  const correctivePattern = waves.length >= 3 && 
    waves[0].number === 'A' && waves[1].number === 'B' && waves[2].number === 'C';

  const result = { 
    waves, 
    currentWave, 
    fibTargets,
    trend,
    impulsePattern,
    correctivePattern
  };
  
  // Cache the result
  memoCache.set(cacheKey, {
    timestamp: Date.now(),
    result
  });
  
  // Limit cache size to prevent memory leaks
  if (memoCache.size > 100) {
    const oldestKey = Array.from(memoCache.keys())[0];
    memoCache.delete(oldestKey);
  }
  
  return result;
};

export default analyzeElliottWaves;
