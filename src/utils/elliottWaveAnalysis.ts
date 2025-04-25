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
import { Wave, FibTarget } from '@/types/shared';

export type { Wave, FibTarget };

// Add this at the top level of your file, outside any function
const thresholdCombinations = [
  { max: 0.03, min: 0.01 },
  { max: 0.05, min: 0.02 },
  { max: 0.02, min: 0.005 },
  { max: 0.07, min: 0.03 }
 ];



// Define the WaveAnalysisResult interface - the complete analysis output
export interface WaveAnalysisResult {
  waves: Wave[];                             // All detected waves in sequence
  invalidWaves: Wave[];                      // All invalidated waves for visualization
  currentWave: Wave;                         // Most recent/current wave
  fibTargets: FibTarget[];                   // Fibonacci price targets
  trend: 'bullish' | 'bearish' | 'neutral';  // Overall trend direction
  impulsePattern?: boolean;                  // True if we've identified a complete impulse pattern (waves 1-5)
  correctivePattern?: boolean;               // True if we've identified a complete corrective pattern (waves A-B-C)
}


/**
 * Determine whether a wave is impulse or corrective based on its number/letter
 */
function determineWaveType(waveNumber: string | number): 'impulse' | 'corrective' {
  if (typeof waveNumber === 'number' || !isNaN(parseInt(waveNumber as string))) {
    // Waves 1, 3, 5 are impulse; 2, 4 are corrective
    const num = typeof waveNumber === 'number' ? waveNumber : parseInt(waveNumber);
    return num % 2 === 1 ? 'impulse' : 'corrective';
  } else {
    // Waves A, C are corrective; B is impulse
    return waveNumber === 'B' ? 'impulse' : 'corrective';
  }
}

/**
 * Check if a wave is an impulse wave based on its number/letter
 */
function isImpulseWave(waveNumber: string | number): boolean {
  if (typeof waveNumber === 'number' || !isNaN(parseInt(waveNumber as string))) {
    // Waves 1, 3, 5 are impulse
    const num = typeof waveNumber === 'number' ? waveNumber : parseInt(waveNumber);
    return num % 2 === 1;
  } else {
    // Wave B is impulse, A and C are not
    return waveNumber === 'B';
  }
}

/**
 * Format a timestamp as a readable date string
 */
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

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

// Helper function to find the most recent wave of a specific number
const findMostRecentWave = (waves: Wave[], waveNumber: number | string): Wave | undefined => {
  // Create a reverse copy so we search from the end (most recent) first
  return [...waves].reverse().find(w => w.number === waveNumber);
};

/**
 * Combine retracements and extensions for the current wave sequence
 * 
 * @param waves - Detected waves
 * @param data - Historical price data
 * @returns Combined array of all Fibonacci price targets
 */
const calculateFibTargetsForWaves = (waves: Wave[], data: StockHistoricalData[], verbose: boolean = false): FibTarget[] => {
  // Need at least 2 waves to calculate targets
  if (waves.length < 2) return [];

  const fibTargets: FibTarget[] = [];
  const lastWave = waves[waves.length - 1];
  const lastWaveNumber = lastWave.number;
  
  // Only log critical information
  if (verbose) console.log(`Calculating Fibonacci targets for Wave ${lastWaveNumber}`);
  
  // Find Wave 1 and Wave 2 if they exist
  const wave1 = findMostRecentWave(waves, 1);
  const wave2 = findMostRecentWave(waves, 2);
  
  // Handle specific wave scenarios
  if (lastWaveNumber === 3 && wave1 && wave1.startPrice && wave1.endPrice && lastWave.startPrice) {
    // For Wave 3: calculate projections based on Wave 1's length with expanded targets
    if (verbose) console.log("Calculating enhanced Wave 3 targets based on Elliott Wave principles:");
    if (verbose) console.log(`- Wave 1 range: ${wave1.startPrice.toFixed(2)} to ${wave1.endPrice.toFixed(2)}`);
    
    const wave1Length = Math.abs(wave1.endPrice - wave1.startPrice);
    const isUptrend = wave1.endPrice > wave1.startPrice;
    const direction = isUptrend ? 1 : -1;
    
    // Expanded set of Wave 3 projection levels based on Elliott Wave theory
    const projectionLevels = [
      { level: 1.618, label: "161.8% of Wave 1", isPrimary: true },
      { level: 2.0, label: "200% of Wave 1", isPrimary: true },
      { level: 2.618, label: "261.8% of Wave 1", isPrimary: true },
      { level: 3.618, label: "361.8% of Wave 1", isPrimary: false },
      { level: 4.236, label: "423.6% of Wave 1", isPrimary: false }
    ];
    
    // Calculate targets from Wave 2 end (Wave 3 start)
    const wave3Targets = projectionLevels.map(({ level, label, isPrimary }) => {
      const targetPrice = lastWave.startPrice + (wave1Length * level * direction);
      
      return {
        level,
        price: targetPrice,
        label,
        isExtension: true,
        isPrimary: isPrimary // Flag for primary targets
      };
    });
    
    // Add targets to the result
    fibTargets.push(...wave3Targets);
    
    // For ongoing Wave 3, add the "minimum" requirement (exceeding Wave 1 end)
    if (!lastWave.isComplete && wave1.endPrice) {
      fibTargets.push({
        level: 1.0,
        price: wave1.endPrice,
        label: "Wave 1 End (min)",
        isExtension: true,
        isCritical: true // This is a critical level that must be exceeded
      });
    }
    
    // Add psychological level - Wave 3 should not end below 1.236 of Wave 1
    fibTargets.push({
      level: 1.236,
      price: lastWave.startPrice + (wave1Length * 1.236 * direction),
      label: "Minimum typical Wave 3",
      isExtension: true,
      isCritical: true
    });
    
    // Log all targets for debugging
    if (verbose) console.log(`Generated ${wave3Targets.length} targets for Wave 3:`, 
                wave3Targets.map(t => `${t.label}: $${t.price.toFixed(2)}`).join(', '));
    
    // Additional check - if we detect an extended Wave 3 already in progress
    if (lastWave.endPrice) {
      const currentExtension = Math.abs(lastWave.endPrice - lastWave.startPrice) / wave1Length;
      
      // If Wave 3 has already extended beyond 2.618, it may indicate a 1-2/1-2 structure
      if (currentExtension > 2.618) {
        if (verbose) console.log(`Detected potential extended Wave 3 (${currentExtension.toFixed(2)}x Wave 1)`);
        
        // Add higher extension targets for extended Wave 3
        const extendedTargets = [
          { level: 4.236, label: "423.6% Extended Wave 3" },
          { level: 6.854, label: "685.4% Extended Wave 3" }
        ];
        
        extendedTargets.forEach(({ level, label }) => {
          const targetPrice = lastWave.startPrice + (wave1Length * level * direction);
          
          fibTargets.push({
            level,
            price: targetPrice,
            label,
            isExtension: true,
            isExtended: true // Flag as extended target
          });
        });
      }
    }
  } 
  // Update the Wave 4 Fibonacci targets section in calculateFibTargetsForWaves function

else if (lastWaveNumber === 4) {
  // For Wave 4: calculate key retracement levels of Wave 3
  // Wave 4 typically retraces 23.6%, 38.2%, or 50% of Wave 3
  
  // Find the MOST RECENT waves by working backwards from the current wave
  //const recentWaves = [...waves].reverse();
  
  // Find the most recent Wave 3 that occurred just before this Wave 4
  //const wave3 = recentWaves.find(w => w.number === 3);
  const wave3 = findMostRecentWave(waves, 3);
  
  
  // Find the most recent Wave 1 that came before Wave 3
  //const wave1 = wave3 
  //  ? waves.slice(0, waves.indexOf(wave3)).reverse().find(w => w.number === 1)
  //  : recentWaves.find(w => w.number === 1);
  const wave1 = findMostRecentWave(waves, 1);

  // Add debug logging to confirm we're getting the correct waves
  if (verbose) console.log("Found waves for Wave 4 Fibonacci calculations:");
  if (wave1) if (verbose) console.log(`Wave 1: ${wave1.startPrice} to ${wave1.endPrice}`);
  if (wave3) if (verbose) console.log(`Wave 3: ${wave3.startPrice} to ${wave3.endPrice}`);
  if (verbose) console.log(`Current Wave 4: ${lastWave.startPrice} to ${lastWave.endPrice || "ongoing"}`);
  
  if (wave3 && wave3.startPrice && wave3.endPrice && wave1 && wave1.endPrice) {
    if (verbose) console.log("Calculating Wave 4 targets based on Elliott Wave principles:");
    if (verbose) console.log(`- Wave 1 end: ${wave1.endPrice}`);
    if (verbose) console.log(`- Wave 3 range: ${wave3.startPrice} to ${wave3.endPrice}`);
    
    // Calculate Wave 3's height
    const wave3Height = Math.abs(wave3.endPrice - wave3.startPrice);
    const isUptrend = wave3.endPrice > wave3.startPrice;
    const direction = isUptrend ? -1 : 1; // For retracements, we move in opposite direction
    
    // Specific Fibonacci levels for Wave 4 retracements
    const fibLevels = [
      { level: 0.236, label: "23.6% of Wave 3" },
      { level: 0.382, label: "38.2% of Wave 3" },
      { level: 0.5, label: "50% of Wave 3" },
    ];
    
    // Calculate each retracement level as potential target for Wave 4
    const retraceTargets = fibLevels.map(({ level, label }) => {
      // Calculate the price target based on Wave 3's high and retracement level
      const targetPrice = wave3.endPrice + (wave3Height * level * direction);
      
      // Check if this target would violate the Wave 1 territory rule
      const violatesWave1 = isUptrend ? 
        targetPrice < wave1.endPrice : 
        targetPrice > wave1.endPrice;
      
      // Only include valid targets that respect Wave 1's territory
      if (violatesWave1) {
        if (verbose) console.log(`${label} target (${targetPrice.toFixed(2)}) violates Wave 1 territory - discarding`);
        return null;
      }
      
      return {
        level,
        price: targetPrice,
        label,
        isExtension: false
      };
    }).filter(target => target !== null) as FibTarget[];
    
    // Add all valid retracement targets
    fibTargets.push(...retraceTargets);
    
    // Add Wave 1 end as an absolute barrier that shouldn't be crossed (critical level)
    fibTargets.push({
      level: 0,
      price: wave1.endPrice,
      label: "Wave 1 End (Critical)",
      isExtension: false,
      isCritical: true // Important boundary that shouldn't be crossed
    });
    
    // Log all generated targets
    if (verbose) console.log(`Generated ${fibTargets.length} valid targets for Wave 4:`, 
                fibTargets.map(t => `${t.label}: $${t.price.toFixed(2)}`).join(', '));
  }
}
else if (lastWaveNumber === 5) {
  // For Wave 5: calculate projections based on Wave relationships
  
  // Find the MOST RECENT waves by working backwards from the current wave
  //const recentWaves = [...waves].reverse();
  
  // Find Wave 4 and then Wave 3 that occurred just before this Wave 5
  //const wave4 = recentWaves.find(w => w.number === 4);
  const wave4 = findMostRecentWave(waves, 4);

  //const wave3 = wave4 
  //  ? waves.slice(0, waves.indexOf(wave4)).reverse().find(w => w.number === 3)
  // : recentWaves.find(w => w.number === 3);
  const wave3 = findMostRecentWave(waves, 3);
  
  // Find Wave 1 from the same sequence
  //const wave1 = wave3
  //  ? waves.slice(0, waves.indexOf(wave3)).reverse().find(w => w.number === 1)
  //  : recentWaves.find(w => w.number === 1);
  const wave1 = findMostRecentWave(waves, 1);
  
  // Add debug logging to confirm we're getting the correct waves
  if (verbose) console.log("Found waves for Fibonacci calculations:");
  if (wave1) if (verbose) console.log(`Wave 1: ${wave1.startPrice} to ${wave1.endPrice}`);
  if (wave3) if (verbose) console.log(`Wave 3: ${wave3.startPrice} to ${wave3.endPrice}`);
  if (wave4) if (verbose) console.log(`Wave 4: ${wave4.startPrice} to ${wave4.endPrice}`);
  if (verbose) console.log(`Current Wave 5: ${lastWave.startPrice} to ${lastWave.endPrice || "ongoing"}`);
  
  if (wave1 && wave1.startPrice && wave1.endPrice && 
      wave3 && wave3.startPrice && wave3.endPrice && 
      wave4 && wave4.startPrice && lastWave.startPrice) {
    
    // Calculate wave lengths
    const wave1Length = Math.abs(wave1.endPrice - wave1.startPrice);
    const wave3Length = Math.abs(wave3.endPrice - wave3.startPrice);
    const isUptrend = wave3.endPrice > wave3.startPrice;
    const direction = isUptrend ? 1 : -1;
    
    // Calculate targets based on the different Elliott Wave relationships
    
    // Target 1: 0.618 of Wave 3 measured from Wave 4 low
    const target618of3 = lastWave.startPrice + (wave3Length * 0.618 * direction);
    fibTargets.push({
      level: 0.618,
      price: target618of3,
      label: "61.8% of Wave 3",
      isExtension: true
    });
    
    // Target 2: 1.0 of Wave 3 measured from Wave 4 low
    const target100of3 = lastWave.startPrice + (wave3Length * 1.0 * direction);
    fibTargets.push({
      level: 1.0,
      price: target100of3,
      label: "100% of Wave 3",
      isExtension: true
    });
    
    // Target 3: 1.618 of Wave 3 measured from Wave 4 low
    const target1618of3 = lastWave.startPrice + (wave3Length * 1.618 * direction);
    fibTargets.push({
      level: 1.618,
      price: target1618of3,
      label: "161.8% of Wave 3",
      isExtension: true
    });
    
    // Target 4: Equal to Wave 1 measured from Wave 4 low (common when Wave 3 is extended)
    const targetEqualW1 = lastWave.startPrice + (wave1Length * 1.0 * direction);
    fibTargets.push({
      level: 1.0,
      price: targetEqualW1,
      label: "100% of Wave 1",
      isExtension: true
    });
    
    // Target 5: 1.618 of Wave 1 measured from Wave 4 low
    const target1618ofW1 = lastWave.startPrice + (wave1Length * 1.618 * direction);
    fibTargets.push({
      level: 1.618,
      price: target1618ofW1,
      label: "161.8% of Wave 1",
      isExtension: true
    });
    
    // Target 6: 1.618 of (Wave 1 + Wave 3) measured from Wave 4 low
    const combinedLength = wave1Length + wave3Length;
    const target1618Combined = lastWave.startPrice + (combinedLength * 1.618 * direction);
    fibTargets.push({
      level: 1.618,
      price: target1618Combined,
      label: "161.8% of (W1+W3)",
      isExtension: true
    });
    
    // Target 7: 0.618 of (Wave 1 + Wave 3) measured from Wave 4 low (conservative target)
    const target618Combined = lastWave.startPrice + (combinedLength * 0.618 * direction);
    fibTargets.push({
      level: 0.618,
      price: target618Combined,
      label: "61.8% of (W1+W3)",
      isExtension: true
    });
    
    // Log all the targets for debugging
    if (verbose) console.log(`Generated ${fibTargets.length} targets for Wave 5:`, 
                fibTargets.map(t => `${t.label}: $${t.price.toFixed(2)}`).join(', '));
                
    // Also add any important existing targets that are still applicable
    const wave3End = wave3.endPrice;
    fibTargets.push({
      level: 0,
      price: wave3End,
      label: `Wave 3 High (${formatPrice(wave3End)})`,
      isExtension: false,
      isCritical: true // Important psychological level
    });
    
    // Add the Wave 3 timestamp to the label for better clarity
    function formatPrice(price: number): string {
      return "$" + price.toFixed(2);
    }
    
    // Add logging to help diagnose any future issues
    if (verbose) console.log(`Added Wave 3 High target: ${formatPrice(wave3End)}`);
  } else {
    if (verbose) console.log("Could not find all required waves for Wave 5 Fibonacci targets");
    
    // Add fallback in case we can't find the proper waves
    if (wave3 && wave3.endPrice) {
      if (verbose) console.log(`Using available Wave 3 (${wave3.endPrice.toFixed(2)}) as reference level`);
      fibTargets.push({
        level: 0,
        price: wave3.endPrice,
        label: `Wave 3 High (${wave3.endPrice.toFixed(2)})`,
        isExtension: false,
        isCritical: true
      });
    }
  }
}
// Add to calculateFibTargetsForWaves function:

// Handle Wave A targets after a completed impulse pattern
else if (lastWaveNumber === 'A') {
  // Calculate Wave A targets based on the preceding impulse pattern
  const wave4 = findMostRecentWave(waves, 4);
  const wave5 = findMostRecentWave(waves, 5);
  
  if (wave4 && wave4.endPrice && wave5 && wave5.endPrice && lastWave.startPrice) {
    if (verbose) console.log("Calculating Wave A targets based on Elliott Wave principles:");
    if (verbose) console.log(`- Wave 5 completed at: ${wave5.endPrice}`);
    
    // Calculate the entire impulse range (using Wave 4 high and Wave 5 end)
    const impulseRange = Math.abs(wave5.endPrice - wave4.endPrice);
    // Determine if we're in an uptrend or downtrend from the impulse
    const isUptrend = wave5.endPrice > wave4.endPrice;
    // For Wave A, we move opposite to the impulse
    const direction = isUptrend ? -1 : 1;
    
    // Fibonacci retracement levels for Wave A
    const fibLevels = [
      { level: 0.382, label: "38.2% Retracement of Wave 5" },
      { level: 0.5, label: "50% Retracement of Wave 5" },
      { level: 0.618, label: "61.8% Retracement of Wave 5" },
      { level: 0.786, label: "78.6% Retracement of Wave 5" }
    ];
    
    // Calculate retracement targets for Wave A
    fibLevels.forEach(({ level, label }) => {
      const targetPrice = wave5.endPrice + (impulseRange * level * direction);
      
      fibTargets.push({
        level,
        price: targetPrice,
        label,
        isExtension: false
      });
    });
    
    // Also include key structural levels as potential targets
    
    // Wave 4 low is often a target for Wave A
    fibTargets.push({
      level: 0,
      price: wave4.startPrice,
      label: "Wave 4 Low",
      isExtension: false,
      isCritical: true
    });
    
    // Wave 3 end can also be a target in deeper corrections
    const wave3 = findMostRecentWave(waves, 3);
    if (wave3 && wave3.endPrice) {
      fibTargets.push({
        level: 0,
        price: wave3.endPrice,
        label: "Wave 3 High",
        isExtension: false
      });
    }
    
    if (verbose) console.log(`Generated ${fibTargets.length} targets for Wave A:`, 
                fibTargets.map(t => `${t.label}: $${t.price.toFixed(2)}`).join(', '));
  }
}
// Add to the calculateFibTargetsForWaves function in elliottWaveAnalysis.ts

// Handle Wave B targets after Wave A
else if (lastWaveNumber === 'B') {
  // Calculate Wave B targets based on Wave A's retracement
  const waveA = findMostRecentWave(waves, 'A');
  
  if (waveA && waveA.startPrice && waveA.endPrice && lastWave.startPrice) {
    if (verbose) console.log("Calculating Wave B targets based on Elliott Wave principles:");
    if (verbose) console.log(`- Wave A range: ${waveA.startPrice.toFixed(2)} to ${waveA.endPrice.toFixed(2)}`);
    
    // Calculate the Wave A's height
    const waveAHeight = Math.abs(waveA.endPrice - waveA.startPrice);
    // Determine if Wave A was up or down
    const isWaveADown = waveA.endPrice < waveA.startPrice;
    // For Wave B, we move opposite to Wave A
    const direction = isWaveADown ? 1 : -1;
    
    // Fibonacci retracement levels for Wave B
    const fibLevels = [
      { level: 0.382, label: "38.2% Retracement of Wave A", isZigzag: true, isFlat: false },
      { level: 0.5, label: "50% Retracement of Wave A", isZigzag: true, isFlat: false },
      { level: 0.618, label: "61.8% Retracement of Wave A", isZigzag: true, isFlat: false },
      { level: 0.786, label: "78.6% Retracement of Wave A", isZigzag: false, isFlat: true },
      { level: 0.9, label: "90% Retracement of Wave A", isZigzag: false, isFlat: true },
      { level: 1.0, label: "100% Retracement of Wave A (Flat)", isZigzag: false, isFlat: true },
      { level: 1.236, label: "123.6% of Wave A (Expanded Flat)", isZigzag: false, isFlat: true, isExpanded: true },
      { level: 1.382, label: "138.2% of Wave A (Expanded Flat)", isZigzag: false, isFlat: true, isExpanded: true }
    ];
    
    // Calculate retracement targets for Wave B
    fibLevels.forEach(({ level, label, isZigzag, isFlat, isExpanded }) => {
      const targetPrice = waveA.endPrice + (waveAHeight * level * direction);
      
      // Determine pattern type for better labeling
      let patternType = "";
      if (isZigzag && isFlat) {
        patternType = ""; // Could be either pattern
      } else if (isZigzag) {
        patternType = " (Zigzag)";
      } else if (isFlat) {
        patternType = isExpanded ? " (Expanded Flat)" : " (Flat)";
      }
      
      fibTargets.push({
        level,
        price: targetPrice,
        label: label + patternType,
        isExtension: level > 1.0,
        isCritical: level === 0.618 || level === 1.0, // These are particularly important levels
        isFlat: isFlat,
        isZigzag: isZigzag
      });
    });
    
    // Add Wave A start as an important reference level
    fibTargets.push({
      level: 0,
      price: waveA.startPrice,
      label: "Wave A Start (Important Level)",
      isExtension: false,
      isCritical: true
    });
    
    if (verbose) console.log(`Generated ${fibTargets.length} targets for Wave B`);
    if (verbose) console.log(fibTargets.map(t => `${t.label}: $${t.price.toFixed(2)}`).join(', '));
    
    // Add forward-looking information for potential Wave C patterns
    if (verbose) console.log("Wave C projections will be available after Wave B completes");
    if (verbose) console.log("Wave C is typically equal to Wave A, or extends to 1.618 of Wave A");
  }
}

// Handle Wave C targets after Wave B completes
else if (lastWaveNumber === 'C') {
  // Calculate Wave C targets based on Wave A
  const waveA = findMostRecentWave(waves, 'A');
  const waveB = findMostRecentWave(waves, 'B');
  
  if (waveA && waveA.startPrice && waveA.endPrice && 
      waveB && waveB.endPrice && lastWave.startPrice) {
    if (verbose) console.log("Calculating Wave C targets based on Elliott Wave principles:");
    
    // Calculate the Wave A's height
    const waveAHeight = Math.abs(waveA.endPrice - waveA.startPrice);
    // Determine the pattern type based on Wave B's retracement
    const waveBretracement = Math.abs(waveB.endPrice - waveA.endPrice) / waveAHeight;
    
    // Determine the correction pattern type
    let patternType = "Unknown";
    if (waveBretracement <= 0.618) {
      patternType = "Zigzag";
    } else if (waveBretracement >= 0.9 && waveBretracement <= 1.0) {
      patternType = "Flat";
    } else if (waveBretracement > 1.0) {
      patternType = "Expanded Flat";
    }
    
    if (verbose) console.log(`- Detected ${patternType} pattern (Wave B retraced ${(waveBretracement * 100).toFixed(1)}% of Wave A)`);
    
    // Direction is the same as Wave A for Wave C
    const isWaveADown = waveA.endPrice < waveA.startPrice;
    const direction = isWaveADown ? -1 : 1;
    
    // Common targets for Wave C
    const fibLevels = [
      { level: 1.0, label: "100% of Wave A" },
      { level: 1.618, label: "161.8% of Wave A" },
      { level: 2.0, label: "200% of Wave A" },
      { level: 2.618, label: "261.8% of Wave A" }
    ];
    
    // Calculate projection targets for Wave C from the end of Wave B
    fibLevels.forEach(({ level, label }) => {
      const projectionLength = waveAHeight * level;
      const targetPrice = waveB.endPrice + (projectionLength * direction);
      
      fibTargets.push({
        level,
        price: targetPrice,
        label: `${label} (${patternType})`,
        isExtension: level > 1.0,
        isCritical: level === 1.0 || level === 1.618 // These are particularly important levels
      });
    });
    
    // In a zigzag, Wave C often terminates beyond the end of Wave A
    if (patternType === "Zigzag") {
      const waveAEndTarget = {
        level: 0,
        price: waveA.endPrice,
        label: "Wave A End (Minimum Target)",
        isExtension: false,
        isCritical: true
      };
      fibTargets.push(waveAEndTarget);
    }
    
    if (verbose) console.log(`Generated ${fibTargets.length} targets for Wave C`);
    if (verbose) console.log(fibTargets.map(t => `${t.label}: $${t.price.toFixed(2)}`).join(', '));
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

const validateFibTargets = (fibTargets: FibTarget[], waves: Wave[], verbose: boolean = false): FibTarget[] => {
  // If we don't have enough waves for validation, return as-is
  if (waves.length < 2) return fibTargets;
  
  // Find each required wave (using find to get the most recent instance if multiple exist)
  const wave1 = findMostRecentWave(waves, 1);
  const wave2 = findMostRecentWave(waves, 2);
  const wave3 = findMostRecentWave(waves, 3);
  const wave4 = findMostRecentWave(waves, 4);
  
  // Check which wave is the current/last one
  const lastWave = waves[waves.length - 1];
  
  if (verbose) console.log(`Validating ${fibTargets.length} targets for current wave ${lastWave?.number}`);
  
  // Filter targets based on Elliott Wave rules - add stricter filtering
  return fibTargets.filter(target => {
    // CRITICAL FIX: For all targets when in Wave 4, enforce Wave 1 end boundary
    if (lastWave?.number === 4 && wave1?.endPrice) {
      const isValid = target.price >= wave1.endPrice;
      if (!isValid) {
        if (verbose) console.log(`REMOVED invalid Wave 4 target: ${target.label} at ${target.price.toFixed(2)} (violates Wave 1 end at ${wave1.endPrice.toFixed(2)})`);
        return false; // Remove invalid targets
      }
    }
    
    // For Wave 2, targets shouldn't go below Wave 1 start
    if (lastWave?.number === 2 && wave1?.startPrice && target.price < wave1.startPrice) {
      if (verbose) console.log(`REMOVED invalid Wave 2 target: ${target.label} at ${target.price.toFixed(2)} (below Wave 1 start)`);
      return false;
    }
    
    // For Wave 3, ensure extension targets are beyond Wave 1 end
    if (lastWave?.number === 3 && wave1?.endPrice && target.isExtension && target.price <= wave1.endPrice) {
      if (verbose) console.log(`REMOVED invalid Wave 3 target: ${target.label} at ${target.price.toFixed(2)} (not beyond Wave 1 end)`);
      return false;
    }
    
    return true;
  });
}

// Call this validator before returning targets in calculateFibTargetsForWaves
// At the end of calculateFibTargetsForWaves, apply the validation

// Apply validation to all targets as a final check
const validatedTargets = validateFibTargets(fibTargets, waves, verbose);
  
// Add additional debug logging
if (validatedTargets.length !== fibTargets.length) {
  if (verbose) console.log(`Validation removed ${fibTargets.length - validatedTargets.length} invalid targets`);
}
  
return validatedTargets;
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
  minThreshold: number = 0.01,
  verbose: boolean = false  // Add verbose parameter
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
      if (verbose) console.log(`Found ${pivots.length} pivots with ${currentThreshold * 100}% threshold`);
      break;
    }
    
    // Lower the threshold and try again
    currentThreshold -= 0.005; // Decrease by 0.5%
  }
  
  // If we still don't have enough pivots, use minimum threshold
  if (pivots.length < 4) {
    pivots = findPivotsWithThreshold(data, minThreshold);
    if (verbose) console.log(`Using minimum threshold ${minThreshold * 100}%: found ${pivots.length} pivots`);
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
  invalidWaves: [],  // Empty array for invalidated waves
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
const findLowestPoint = (data: StockHistoricalData[], startIndex: number, endIndex: number, verbose: boolean = false): number => {
  let lowestIdx = startIndex;
  let lowestPrice = data[startIndex].low;

  // Scan the range for the lowest price
  for (let i = startIndex + 1; i <= endIndex; i++) {
    if (data[i].low < lowestPrice) {
      lowestPrice = data[i].low;
      lowestIdx = i;
    }
  }

  if (verbose) console.log(`Found lowest point: ${lowestPrice} at index ${lowestIdx}`);
  return lowestIdx;
};

/**
 * Fallback analysis when the main algorithm can't find valid patterns
 * Generate basic wave analysis when ideal patterns aren't found
 */
const fallbackWaveAnalysis = (pivots: ZigzagPoint[], data: StockHistoricalData[], verbose: boolean = false): WaveAnalysisResult => {
  if (verbose) console.log("Using fallback wave analysis to generate basic results");
  
  // We still need to provide something useful even if we can't find ideal Elliott Wave patterns
  const waves: Wave[] = [];
  const invalidWaves: Wave[] = [];
  
  // We need at least 3 pivots to form a minimal wave pattern
  if (pivots.length < 3) {
    if (verbose) console.log("Not enough pivot points for even basic analysis");
    return generateEmptyAnalysisResult();
  }
  
  // Determine the overall trend
  const overallTrend = data[data.length - 1].close > data[0].close ? 'bullish' : 'bearish';
  
  // Try to identify some basic waves using available pivot points
  // Start from most recent pivots which are more relevant for current analysis
  const recentPivots = pivots.slice(-Math.min(5, pivots.length));
  
  if (verbose) console.log(`Using ${recentPivots.length} most recent pivot points for basic analysis`);
  
  // Create at least one wave from the most recent pivot movement
  if (recentPivots.length >= 2) {
    const lastPivot = recentPivots[recentPivots.length - 1];
    const prevPivot = recentPivots[recentPivots.length - 2];
    
    // Determine if this looks like an impulse or corrective wave
    const isUpMove = lastPivot.price > prevPivot.price;
    const waveType = isUpMove ? 'impulse' : 'corrective';
    
    // Create a basic wave
    const currentWave: Wave = {
      number: isUpMove ? 1 : 'A', // If up, call it Wave 1, if down, call it Wave A
      startTimestamp: prevPivot.timestamp,
      endTimestamp: lastPivot.timestamp,
      startPrice: prevPivot.price,
      endPrice: lastPivot.price,
      type: waveType,
      isComplete: lastPivot.timestamp < data[data.length - 1].timestamp, // Complete only if not at current candle
      isImpulse: isUpMove
    };
    
    waves.push(currentWave);
    
    // If we have 3 or more pivots, we can try to identify a previous wave
    if (recentPivots.length >= 3) {
      const prevPrevPivot = recentPivots[recentPivots.length - 3];
      const prevIsUpMove = prevPivot.price > prevPrevPivot.price;
      
      // Previous wave should be the opposite type
      const prevWaveType = prevIsUpMove ? 'impulse' : 'corrective';
      const prevWaveNumber = prevIsUpMove ? 
        (currentWave.number === 'A' ? 5 : 
         (typeof currentWave.number === 'number' ? currentWave.number - 1 : 'C')) : 
        (currentWave.number === 1 ? 'C' : 'B');
        
      const previousWave: Wave = {
        number: prevWaveNumber,
        startTimestamp: prevPrevPivot.timestamp,
        endTimestamp: prevPivot.timestamp,
        startPrice: prevPrevPivot.price,
        endPrice: prevPivot.price,
        type: prevWaveType,
        isComplete: true,
        isImpulse: prevIsUpMove
      };
      
      // Insert at the beginning so the waves are in chronological order
      waves.unshift(previousWave);
    }
  }
  
  // Create fibonacci targets based on these basic waves
  const fibTargets = calculateFibTargetsForWaves(waves, data, verbose);
  
  // Return what we've got - at least it's something more useful than empty arrays
  return {
    waves,
    invalidWaves,
    currentWave: waves.length > 0 ? waves[waves.length - 1] : {
      number: 0,
      startTimestamp: data[data.length - 1].timestamp,
      startPrice: data[data.length - 1].close,
      type: 'corrective',
      isComplete: false
    },
    fibTargets,
    trend: overallTrend,
    impulsePattern: waves.some(w => w.number === 5),
    correctivePattern: waves.some(w => w.number === 'C')
  };
};

/**
 * Search through pivots to find valid Elliott Wave patterns
 * Returns the index of the first pivot in a valid sequence, or -1 if none found
 */
const findValidPivotSequence = (pivots: ZigzagPoint[], verbose: boolean = false): number => {
  if (verbose) console.log(`Searching for valid pivot sequence in ${pivots.length} pivots`);
  
  // Need at least 3 pivots to form Wave 1 and 2
  if (pivots.length < 3) {
    if (verbose) console.log("Not enough pivot points for pattern search");
    return -1;
  }
  
  // Look for patterns starting at each pivot
  for (let i = 0; i < pivots.length - 2; i++) {
    const wave1Start = pivots[i];     // First pivot
    const wave1End = pivots[i + 1];   // Second pivot
    const wave2End = pivots[i + 2];   // Third pivot
    
    // Log the sequence we're checking
    if (verbose) console.log(`Checking sequence starting at index ${i}:`, {
      wave1Start: wave1Start.low,
      wave1End: wave1End.high,
      wave2End: wave2End.low
    });
    
    // Wave 1 must go up
    if (wave1End.high <= wave1Start.low) {
      if (verbose) console.log("Skipping: Wave 1 must move upward");
      continue;
    }
    
    // Wave 2 must go down from Wave 1 end
    if (wave2End.low >= wave1End.high) {
      if (verbose) console.log("Skipping: Wave 2 must be a correction (downward)");
      continue;
    }
    
    // Wave 2 cannot go below Wave 1 start
    if (wave2End.low <= wave1Start.low) {
      if (verbose) console.log("Skipping: Wave 2 retraced beyond start of Wave 1");
      continue;
    }
    
    // If we have a fourth pivot, check Wave 3
    if (i + 3 < pivots.length) {
      const wave3End = pivots[i + 3];
      
      // Wave 3 must go up
      if (wave3End.high <= wave2End.low) {
        if (verbose) console.log("Skipping: Wave 3 must move upward");
        continue;
      }
      
      // CHANGED RULE: Wave 3 must ALWAYS exceed Wave 1 end
      if (wave3End.high <= wave1End.high) {
        if (verbose) console.log("Skipping: Wave 3 must exceed Wave 1 end");
        continue;
      }
    }
    
    // We found a valid sequence!
    if (verbose) console.log(`Found valid Elliott Wave sequence starting at index ${i}`);
    return i;
  }
  
  if (verbose) console.log("No valid Elliott Wave sequences found");
  return -1;
};

/**
 * Modified validateInitialPivots to use the new search function
 */
const validateInitialPivots = (pivots: ZigzagPoint[], verbose: boolean = false): boolean => {
  const validSequenceStart = findValidPivotSequence(pivots, verbose);
  
  if (validSequenceStart === -1) {
    return false;
  }
  
  // If we found a valid sequence but it doesn't start at index 0,
  // we should truncate the pivots array to start at the valid sequence
  if (validSequenceStart > 0) {
    if (verbose) console.log(`Truncating ${validSequenceStart} invalid pivots from start`);
    pivots.splice(0, validSequenceStart);
  }
  
  return true;
};

/**
 * Find the highest pivot point after the start point, before a significant reversal
 * Used specifically for extending wave 3 to its full length
 */
const findWave3Peak = (pivots: ZigzagPoint[], startIndex: number, verbose: boolean = false): number => {
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
  
  if (verbose) console.log(`Wave 3 peak search: found=${found}, index=${highestIdx}, price=${highestPrice}`);
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
  onProgress?: (waves: Wave[]) => void,
  verbose: boolean = false,
  direction: 'bullish' | 'bearish' = 'bullish'
): WaveAnalysisResult => {
  if (verbose) console.log(`\n=== Complete Wave Analysis (${direction}) ===`);
  if (verbose) console.log(`Starting analysis with ${pivots.length} pivots`);

  // Direction-aware validation
  const validateInitialPivotsDir = (pivots: ZigzagPoint[], verbose: boolean = false): boolean => {
    // For bullish, use original logic; for bearish, invert all up/down checks
    const validSequenceStart = (() => {
      if (direction === 'bullish') return findValidPivotSequence(pivots, verbose);
      // Bearish: invert logic
      if (pivots.length < 3) return -1;
      for (let i = 0; i < pivots.length - 2; i++) {
        const wave1Start = pivots[i];
        const wave1End = pivots[i + 1];
        const wave2End = pivots[i + 2];
        if (verbose) console.log(`(Bearish) Checking sequence at ${i}:`, { wave1Start: wave1Start.high, wave1End: wave1End.low, wave2End: wave2End.high });
        // Wave 1 must go down
        if (wave1End.low >= wave1Start.high) continue;
        // Wave 2 must go up from Wave 1 end
        if (wave2End.high <= wave1End.low) continue;
        // Wave 2 cannot go above Wave 1 start
        if (wave2End.high >= wave1Start.high) continue;
        // Wave 3 must go down and exceed Wave 1 end
        if (i + 3 < pivots.length) {
          const wave3End = pivots[i + 3];
          if (wave3End.low >= wave2End.high) continue;
          if (wave3End.low >= wave1End.low) continue;
        }
        return i;
      }
      return -1;
    })();
    if (validSequenceStart === -1) return false;
    if (validSequenceStart > 0) pivots.splice(0, validSequenceStart);
    return true;
  };

  if (!validateInitialPivotsDir(pivots, verbose)) {
    if (verbose) console.log('❌ Initial pivot sequence failed validation');
    return fallbackWaveAnalysis(pivots, data, verbose);
  }
  if (verbose) console.log('✅ Initial pivot sequence validated');

  const waves: Wave[] = [];
  const invalidWaves: Wave[] = []; // Store invalidated waves for visualization
  let pendingWaves: Wave[] = []; // Store potential waves here until validated
  let waveCount = 1;
  let phase: 'impulse' | 'corrective' = 'impulse';
  const pivotPairs = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    const isUpMove = pivots[i + 1].price > pivots[i].price;
    pivotPairs.push({
      startPoint: pivots[i],
      endPoint: pivots[i + 1],
      isUpMove
    });
  }
  let previousWave: Wave | null = null;
  let skipToIndex = -1;
  let patternInvalidated = false;
  for (let i = 0; i < pivotPairs.length; i++) {
    if (skipToIndex >= 0 && i <= skipToIndex) continue;
    if (patternInvalidated) {
      phase = 'impulse';
      waveCount = 1;
      patternInvalidated = false;
      pendingWaves = [];
      if ((direction === 'bullish' && pivotPairs[i].startPoint.type !== 'trough') ||
          (direction === 'bearish' && pivotPairs[i].startPoint.type !== 'peak')) {
        if (i < pivotPairs.length - 1) continue;
      }
    }
    const { startPoint, isUpMove } = pivotPairs[i];
    let { endPoint } = pivotPairs[i];
    // For bearish, invert isUpMove
    const move = direction === 'bullish' ? isUpMove : !isUpMove;
    let waveNumber = phase === 'impulse' ? waveCount : ['A', 'B', 'C'][waveCount - 1];
    const startPrice = previousWave ? previousWave.endPrice : (move ? startPoint.low : startPoint.high);
    const startTimestamp = previousWave ? previousWave.endTimestamp : startPoint.timestamp;
    // Determine if this is the last wave in our analysis by checking if it ends at the last data point
    const isLastWave = (i === pivotPairs.length - 1);
    const isLastDataPoint = endPoint.timestamp === data[data.length - 1].timestamp;
    // Set isComplete based on whether this is the last wave ending at the last data point
    // Changed from true to false for the default case - this is the key change
    const isComplete = !(isLastWave && isLastDataPoint);
    
    let wave: Wave = {
      number: waveNumber,
      startTimestamp: startTimestamp,
      endTimestamp: endPoint.timestamp,
      startPrice: startPrice,
      endPrice: move ? endPoint.high : endPoint.low,
      type: determineWaveType(waveNumber),
      isComplete: false,  // Always set to false by default
      isImpulse: isImpulseWave(waveNumber)
    };
    
    // Now, only set to true if we can verify the wave is complete
    if (i < pivotPairs.length - 1) {
      // If this is not the last pivot pair, the wave is definitely complete
      wave.isComplete = true;
    } else if (endPoint.timestamp < data[data.length - 1].timestamp) {
      // If this wave's end timestamp is earlier than the last data point,
      // it's also considered complete
      wave.isComplete = true;
    }

    // Validate wave based on position
    let waveValid = true;
    let confirmPattern = false;
    
    switch (phase) {
      case 'impulse':
        switch (waveCount) {
          case 1:
            // Wave 1 must be upward
            if ((direction === 'bullish' && !isUpMove) || (direction === 'bearish' && isUpMove)) {
              if (verbose) console.log("Wave 1 invalidated - must be in the direction of the trend");
              patternInvalidated = true;
              waveValid = false;
            }
            break;
            
          case 2:
            // Wave 2 cannot go below Wave 1 start
            if (pendingWaves.length === 0) {
              if (verbose) console.log("Wave 2 invalidated - no Wave 1 in pending waves");
              patternInvalidated = true;
              waveValid = false;
              
              // Mark invalidation point with current timestamp and price
              wave.isValid = false;
              wave.isTerminated = true;
              wave.invalidationTimestamp = endPoint.timestamp;
              wave.invalidationPrice = endPoint.low;
              wave.invalidationRule = "No preceding Wave 1";
              
              // Store this invalid wave for display purposes
              invalidWaves.push(wave);
              
              // Immediately restart search for Wave 1
              phase = 'impulse';
              waveCount = 1;
            } else if (move && endPoint.low <= pendingWaves[0].startPrice!) {
              if (verbose) console.log("Wave 2 invalidated - retraced beyond Wave 1 start");
              patternInvalidated = true;
              waveValid = false;
              
              // Mark invalidation point with current timestamp and price
              wave.isValid = false;
              wave.isTerminated = true;
              wave.invalidationTimestamp = endPoint.timestamp;
              wave.invalidationPrice = endPoint.low;
              wave.invalidationRule = "Retraced beyond Wave 1 start";
              
              // Store this invalid wave for display purposes
              invalidWaves.push(wave);
              
              // Immediately restart search for Wave 1
              phase = 'impulse';
              waveCount = 1;
            }
            break;
            
          case 3:
            // Wave 3 must exceed Wave 1 end
            if (pendingWaves.length === 0) {
              if (verbose) console.log("Wave 3 invalidated - no Wave 1 in pending waves");
              patternInvalidated = true;
              waveValid = false;
            } else if (move && endPoint.high <= pendingWaves[0].endPrice!) {
              if (verbose) console.log("Wave 3 invalidated - didn't exceed Wave 1 end");
              patternInvalidated = true;
              waveValid = false;
            } else {
              // Wave 3 confirms the pattern! Commit pending waves to results
              if (verbose) console.log("✅ Wave 3 confirmed - committing pattern to results");
              confirmPattern = true;
            }
            break;
            
          case 4:
            if (pendingWaves.length === 0 && waves.length === 0) {
              if (verbose) console.log("Wave 4 invalidated - no prior waves");
              patternInvalidated = true;
              waveValid = false;
            } 
            // Enhance the Wave 4 overlap checking
            else {
              //const wave1 = waves.find(w => w.number === 1) || pendingWaves.find(w => w.number === 1);
              const wave1 = findMostRecentWave(waves, 1) || findMostRecentWave(pendingWaves, 1);

              if (wave1 && wave1.endPrice) {
                // Strict Wave 4 validation for both completed and in-progress waves
                const isBullish = wave1.endPrice > wave1.startPrice;
                
                // For a completed Wave 4, check its lowest/highest point
                const isInvalidated = isBullish ? 
                  endPoint.low <= wave1.endPrice : 
                  endPoint.high >= wave1.endPrice;
                
                if (isInvalidated) {
                  if (verbose) console.log(`Wave 4 invalidated - overlaps Wave 1 price territory`);
                  if (verbose) console.log(`Wave 4 ${isBullish ? 'low' : 'high'}: ${isBullish ? endPoint.low.toFixed(2) : endPoint.high.toFixed(2)}`);
                  if (verbose) console.log(`Wave 1 ${isBullish ? 'high' : 'low'}: ${wave1.endPrice.toFixed(2)}`);
                  
                  patternInvalidated = true;
                  waveValid = false;
                  
                  // Mark invalidation point with current timestamp and price
                  wave.isValid = false;
                  wave.isTerminated = true;
                  wave.invalidationTimestamp = endPoint.timestamp;
                  wave.invalidationPrice = isBullish ? endPoint.low : endPoint.high;
                  wave.invalidationRule = "Wave 4 entered Wave 1 price territory";
                  
                  // Store this invalid wave for display purposes
                  invalidWaves.push({...wave});
                  
                  // Immediately restart search for Wave 1
                  phase = 'impulse';
                  waveCount = 1;
                } else {
                  // Wave 4 is valid, next pivot should be considered for Wave 5
                  if (verbose) console.log("Wave 4 confirmed - does not overlap Wave 1 price territory");
                  if (verbose) console.log("Expecting Wave 5 next");
                }
              }
            } 
            break;
            
          case 5:
            // Make Wave 5 detection more lenient
            // Simple rule: After Wave 4, if price moves in the direction of Wave 1 & 3, it's Wave 5
            if (waves.length > 0 || pendingWaves.length > 0) {
              //const wave3 = waves.find(w => w.number === 3) || pendingWaves.find(w => w.number === 3);
              const wave3 = findMostRecentWave(waves, 3) || findMostRecentWave(pendingWaves, 3);
              const wave1 = findMostRecentWave(waves, 1) || findMostRecentWave(pendingWaves, 1);
              //const wave1 = waves.find(w => w.number === 1) || pendingWaves.find(w => w.number === 1);
              
              // If Wave 3 exists, Wave 5 should move in the same direction
              if (wave3) {
                const wave3Direction = direction === 'bullish' ? wave3.endPrice! > wave3.startPrice : wave3.endPrice! < wave3.startPrice;
                const wave5Direction = direction === 'bullish' ? endPoint.high > startPoint.low : endPoint.low < startPoint.high;
                
                if (wave3Direction !== wave5Direction) {
                  if (verbose) console.log("Wave 5 invalidated - wrong direction compared to Wave 3");
                  patternInvalidated = true;
                  waveValid = false;
                } else {
                  if (verbose) console.log("Wave 5 confirmed - moving in correct direction");
                  confirmPattern = true; // Force confirmation of the entire pattern
                }
              }
              // If only Wave 1 exists, use that for direction
              else if (wave1) {
                const wave1Direction = direction === 'bullish' ? wave1.endPrice! > wave1.startPrice : wave1.endPrice! < wave1.startPrice;
                const wave5Direction = direction === 'bullish' ? endPoint.high > startPoint.low : endPoint.low < startPoint.high;
                
                if (wave1Direction !== wave5Direction) {
                  if (verbose) console.log("Wave 5 invalidated - wrong direction compared to Wave 1");
                  patternInvalidated = true;
                  waveValid = false;
                } else {
                  if (verbose) console.log("Wave 5 confirmed - moving in correct direction");
                  confirmPattern = true; // Force confirmation of the entire pattern
                }
              }
            }
            
            // After Wave 5 is completed, look for corrective waves
            if (waveValid && wave.number === 5) {
              if (verbose) console.log("Completed impulse pattern 1-5, transitioning to corrective A-B-C pattern");
              phase = 'corrective';
              waveCount = 0; // Will increment to 1 for Wave A
              
              // Look ahead for potential Wave A starting
              if (i + 1 < pivotPairs.length) {
                const nextPair = pivotPairs[i + 1];
                // Wave A should move in the opposite direction of Wave 5
                if ((wave.endPrice > wave.startPrice && nextPair.endPoint.price < nextPair.startPoint.price) ||
                    (wave.endPrice < wave.startPrice && nextPair.endPoint.price > nextPair.startPoint.price)) {
                  if (verbose) console.log("Potential Wave A detected after Wave 5");
                }
              }
            }
            break;
        }
        break;

      case 'corrective':
        switch (waveCount) {
          case 1: // Wave A
            // Code for Wave A completion
            if (wave.isComplete) {
              if (verbose) console.log("Wave A completed, looking for Wave B reversal");
              
              // Look ahead for potential Wave B starting
              if (i + 1 < pivotPairs.length) {
                const nextPair = pivotPairs[i + 1];
                
                // Wave B should move in the opposite direction of Wave A
                const isWaveADown = wave.endPrice! < wave.startPrice;
                const isNextUp = nextPair.endPoint.price > nextPair.startPoint.price;
                
                if (isWaveADown === !isNextUp) {
                  if (verbose) console.log("Potential Wave B detected moving in correct direction");
                  
                  // Calculate how much Wave B has retraced so far
                  const waveAHeight = Math.abs(wave.endPrice! - wave.startPrice);
                  const currentRetracement = Math.abs(nextPair.endPoint.price - wave.endPrice!) / waveAHeight;
                  
                  if (verbose) console.log(`Current Wave B retracement: ${(currentRetracement * 100).toFixed(1)}%`);
                  
                  // Classify the potential pattern
                  if (currentRetracement <= 0.618) {
                    if (verbose) console.log("Pattern forming appears to be a Zigzag");
                  } else if (currentRetracement > 0.618 && currentRetracement <= 0.9) {
                    if (verbose) console.log("Pattern forming could be a Running Flat");
                  } else if (currentRetracement > 0.9 && currentRetracement <= 1.1) {
                    if (verbose) console.log("Pattern forming appears to be a Regular Flat");
                  } else if (currentRetracement > 1.1) {
                    if (verbose) console.log("Pattern forming appears to be an Expanded Flat");
                  }
                } else {
                  if (verbose) console.log("Next pivot doesn't match Wave B direction requirements");
                }
              }
            }
            break;
          
          case 2: // Wave B
            // Code for Wave B completion
            if (wave.isComplete) {
              if (verbose) console.log("Wave B completed, looking for Wave C");
              
              // Find Wave A to determine the overall correction pattern
              //const waveA = waves.find(w => w.number === 'A') || pendingWaves.find(w => w.number === 'A');
              const waveA = findMostRecentWave(waves, 'A') || findMostRecentWave(pendingWaves, 'A');

              if (waveA && waveA.startPrice && waveA.endPrice) {
                // Calculate Wave B's retracement of Wave A
                const waveAHeight = Math.abs(waveA.endPrice - waveA.startPrice);
                const waveBRetracement = Math.abs(wave.endPrice! - waveA.endPrice) / waveAHeight;
                
                if (verbose) console.log(`Wave B retraced ${(waveBRetracement * 100).toFixed(1)}% of Wave A`);
                
                // Determine pattern type and expected Wave C behavior
                if (waveBRetracement <= 0.5) {
                  if (verbose) console.log("Wave C expected to extend beyond Wave A end (Zigzag pattern)");
                } else if (waveBRetracement >= 0.9 && waveBRetracement <= 1.1) {
                  if (verbose) console.log("Wave C expected to be approximately equal to Wave A (Regular Flat)");
                } else if (waveBRetracement > 1.1) {
                  if (verbose) console.log("Wave C expected to be shorter than Wave A (Expanded Flat)");
                }
                
                // Look ahead for potential Wave C
                if (i + 1 < pivotPairs.length) {
                  const nextPair = pivotPairs[i + 1];
                  
                  // Wave C should move in the same direction as Wave A
                  const isWaveADown = waveA.endPrice < waveA.startPrice;
                  const isNextDown = nextPair.endPoint.price < nextPair.startPoint.price;
                  
                  if (isWaveADown === isNextDown) {
                    if (verbose) console.log("Potential Wave C detected moving in correct direction");
                  }
                }
              }
            }
            break;
            
          case 3: // Wave C
            // After completing Wave C, reset to look for new impulse pattern
            if (verbose) console.log("Completed corrective pattern A-B-C, looking for new impulse pattern");
            phase = 'impulse';
            waveCount = 0; // Will increment to 1 for new Wave 1
            break;
        }
        break;
    }

    if (waveValid) {
      // If this is wave 3 and it's valid, commit all pending waves
      if (confirmPattern) {
        if (verbose) console.log(`Committing ${pendingWaves.length} pending waves plus current wave to results`);
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
        if (verbose) console.log(`Added wave ${waveNumber} to pending (${pendingWaves.length} pending waves)`);
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
  }

  return {
    waves,
    invalidWaves,
    currentWave: waves.length > 0 ? 
      // Create a completely new object to avoid shared reference issues
      (() => {
        const lastWave = waves[waves.length - 1];
        const isLastDataPoint = lastWave.endTimestamp === data[data.length - 1].timestamp;
        
        // For the last detected wave, if it's at the most recent data point,
        // consider it ongoing (incomplete) unless explicitly invalidated
        const shouldBeIncomplete = isLastDataPoint && !lastWave.isInvalidated && !lastWave.isTerminated;
        
        // Create a new currentWave object with correct is        // Create a new currentWave object with correct isComplete status
        let currentWave = {
          ...lastWave,
          isComplete: shouldBeIncomplete ? false : lastWave.isComplete
        };
        
        // Also update the actual wave in thewaves array to maintain consistency
        if (shouldBeIncomplete && lastWave.isComplete) {
          waves[waves.length - 1] = {
            ...lastWave,
            isComplete: false
          };
        }
        
        // For any wave marked as incomplete, remove endTimestamp and endPrice
        if (!currentWave.isComplete) {
          // Create a new object without the end properties
          const { endTimestamp, endPrice, ...waveWithoutEndProperties } = currentWave;
          currentWave = waveWithoutEndProperties;
          
          // Also remove from the main waves array for consistency
          if (waves.length > 0 && !waves[waves.length - 1].isComplete) {
            const { endTimestamp, endPrice, ...cleanWave } = waves[waves.length - 1];
            waves[waves.length - 1] = cleanWave;
          }
          
          if (verbose) console.log(`Removed end properties from incomplete wave ${currentWave.number}`);
        }
        
        return currentWave;
      })() : 
      {  // Fallback if no waves
        number: 0,
        startTimestamp: 0,
        startPrice: 0,
        type: 'corrective',
        isComplete: false
      },
    fibTargets: calculateFibTargetsForWaves(waves, data, verbose),
    trend: direction,
    impulsePattern: waves.some(w => w.number === 5),
    correctivePattern: waves.some(w => w.number === 'C')
  };
};

/**
 * Heuristically determine the most probable current wave and its fib targets
 * Always returns a currentWave and fibTargets, even if the full pattern is not found
 */
function getCurrentWaveAndTargets(pivots: ZigzagPoint[], data: StockHistoricalData[], verbose = false) {
  // If we have a valid full pattern, use the last wave
  // Otherwise, heuristically label the current move
  let currentWave: Partial<Wave> = {};
  let fibTargets: FibTarget[] = [];
  let confidence = 0.5;
  let patternStatus = 'unknown';

  if (pivots.length < 2) {
    return {
      currentWave: {
        number: 0,
        type: 'corrective',
        isComplete: false,
        confidence: 0,
      },
      fibTargets: [],
      patternStatus: 'insufficient data',
    };
  }

  // Use the last two pivots to define the current move
  const lastPivot = pivots[pivots.length - 1];
  const prevPivot = pivots[pivots.length - 2];
  const isUpMove = lastPivot.price > prevPivot.price;
  const moveType = isUpMove ? 'impulse' : 'corrective';
  const moveLength = Math.abs(lastPivot.price - prevPivot.price);

  // Try to find a valid Wave 2 and confirm Wave 3
  if (pivots.length >= 5) {
    // Look for a possible Wave 2 and 3
    const wave1Start = pivots[pivots.length - 5];
    const wave1End = pivots[pivots.length - 4];
    const wave2End = pivots[pivots.length - 3];
    const wave3End = pivots[pivots.length - 2];
    const wave4End = pivots[pivots.length - 1];
    // Check for impulse up, correction, then new impulse up
    if (
      wave1End.price > wave1Start.price && // Wave 1 up
      wave2End.price < wave1End.price &&   // Wave 2 down
      wave3End.price > wave2End.price      // Wave 3 up
    ) {
      // Confirm Wave 3 only if price exceeds start of Wave 2
      if (wave3End.price > wave2End.price) {
        return {
          currentWave: {
            number: 3,
            type: 'impulse',
            isComplete: false,
            startTimestamp: wave2End.timestamp,
            startPrice: wave2End.price,
            endTimestamp: wave3End.timestamp,
            endPrice: wave3End.price,
            isImpulse: true
          },
          fibTargets: calculateFibExtension(wave2End.price, wave3End.price)
        };
      }
    }
  }

  // Heuristic: Only report 3, 4, 5, B, or C as current wave
  if (pivots.length >= 4) {
    const prevPrevPivot = pivots[pivots.length - 3];
    const prevPrevMoveUp = prevPivot.price > prevPrevPivot.price;
    if (!prevPrevMoveUp && isUpMove) {
      // Correction then impulse up
      if (lastPivot.price > prevPrevPivot.price) {
        return {
          currentWave: {
            number: 3,
            type: 'impulse',
            isComplete: false,
            startTimestamp: prevPivot.timestamp,
            startPrice: prevPivot.price,
            endTimestamp: lastPivot.timestamp,
            endPrice: lastPivot.price,
            isImpulse: true
          },
          fibTargets: calculateFibExtension(prevPivot.price, lastPivot.price)
        };
      }
    } else if (prevPrevMoveUp && !isUpMove) {
      // Impulse then correction down
      if (lastPivot.price < prevPrevPivot.price) {
        return {
          currentWave: {
            number: 'C',
            type: 'corrective',
            isComplete: false,
            startTimestamp: prevPivot.timestamp,
            startPrice: prevPivot.price,
            endTimestamp: lastPivot.timestamp,
            endPrice: lastPivot.price,
            isImpulse: false
          },
          fibTargets: calculateFibRetracement(prevPivot.price, lastPivot.price)
        };
      }
    }
  }

  // Never report wave 1 or 2 as current wave (or fallback A)
  return {
    currentWave: undefined,
    fibTargets: []
  };
}

// ...existing code...

// In analyzeElliottWaves, after all pattern detection, always provide currentWave and fibTargets for user focus
export const analyzeElliottWaves = async (
  symbol: string,
  priceData: StockHistoricalData[],
  isCancelled: () => boolean = () => false,
  onProgress?: (waves: Wave[]) => void,
  verbose: boolean = false
): Promise<WaveAnalysisResult> => {
  // Add validation at the beginning
  const MIN_REQUIRED_POINTS = 50;
  if (!priceData || priceData.length < MIN_REQUIRED_POINTS) {
    throw new Error(`Insufficient data points: ${priceData?.length || 0} (minimum ${MIN_REQUIRED_POINTS} required)`);
  }

  try {
    logIf(verbose, '\n=== Starting Elliott Wave Analysis ===');
    logIf(verbose, `Analyzing ${priceData.length} data points from:`, {
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
        high: Math.max(...priceData.map(d => d.high))
      };
      if (verbose) console.log(`Price range: $${priceRange.low.toFixed(2)} to $${priceRange.high.toFixed(2)}`);
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
    
    if (verbose) console.log(`Valid data points: ${validData.length} of ${priceData.length}`);
    
    // Reduce data size for performance if needed
    const processData = validData.length > 250 
      ? validData.filter((_, i) => i % Math.ceil(validData.length / 250) === 0) 
      : validData;
      
    if (verbose) console.log(`Using ${processData.length} data points for analysis after sampling`);
    
    // Find pivot points using all threshold combinations
    const allPivots = [];
    
    // Try each threshold combination
    for (const { max, min } of thresholdCombinations) {
      if (verbose) console.log(`\n--- Trying threshold combination: ${(max*100).toFixed(1)}% - ${(min*100).toFixed(1)}%`);
      const pivots = findPivots(processData, max, min, verbose);
      if (verbose) console.log(`Found ${pivots.length} pivot points`);
      allPivots.push(pivots);
      if (pivots.length < 3) {
        if (verbose) console.log('Not enough pivots, trying next threshold...');
        continue;
      }
      // Complete the wave analysis with these pivots
      const result = completeWaveAnalysis(pivots, processData, undefined, onProgress, verbose);
      // Always attach currentWave and fibTargets for user focus
      const { currentWave, fibTargets } = getCurrentWaveAndTargets(pivots, processData, verbose);
      // If we found a good pattern (at least 3 waves) and currentWave is 3, 4, 5, B, or C, return it
      if (
        result.waves.length >= 3 &&
        currentWave &&
        (currentWave.number === 3 || currentWave.number === 4 || currentWave.number === 5 || currentWave.number === 'B' || currentWave.number === 'C')
      ) {
        if (verbose) console.log(`Found valid Elliott Wave pattern with ${result.waves.length} waves and currentWave ${currentWave.number}`);
        return {
          ...result,
          currentWave: { ...currentWave, ...result.currentWave },
          fibTargets
        };
      } else {
        if (verbose) console.log('Current wave is 1 or 2, retrying with next threshold...');
      }
    }
    
    if (verbose) console.log('No valid Elliott Wave patterns found with any threshold, using fallback analysis');
    
    // Find the best pivot set (the one with the most points)
    const bestPivots = allPivots.reduce((best, current) => 
      current.length > best.length ? current : best, allPivots[0] || []);
    
    // Use our fallback analysis instead of returning an empty result
    const fallback = fallbackWaveAnalysis(bestPivots || findPivots(processData, 0.01, 0.005, verbose), processData, verbose);
    // Always attach currentWave and fibTargets for user focus
    const { currentWave, fibTargets, patternStatus } = getCurrentWaveAndTargets(bestPivots, processData, verbose);
    return {
      ...fallback,
      currentWave: { ...currentWave, ...fallback.currentWave },
      fibTargets
    };
  } catch (error) {
    console.error('Error analyzing Elliott Waves:', error);
    return generateEmptyAnalysisResult();
  }
};


type WaveWithConfidence = Wave & { confidence: number };


// Add this function to validate wave sequence integrity
const validateWaveSequence = (waves: Wave[], currentPrice: number, verbose: boolean = false): boolean => {
  // Skip empty wave arrays
  if (waves.length === 0) return true;
  
  // Check for wave 3 violations specifically
  const wave3 = findMostRecentWave(waves, 3);
  if (wave3 && currentPrice < wave3.startPrice) {
    if (verbose) console.log(`⚠️ Current price ${currentPrice} invalidates Wave 3 (started at ${wave3.startPrice})`);
    return false;
  }

  // Find wave 1 and wave 4
  const wave1 = findMostRecentWave(waves, 1);
  const wave4 = findMostRecentWave(waves, 4);
  
  // Implement strict Wave 4 non-overlap rule with Wave 1
  if (wave1 && wave4) {
    // Wave 4 cannot retrace below the end of Wave 1
    if (wave4.endPrice && wave1.endPrice && wave4.endPrice < wave1.endPrice) {
      if (verbose) console.log(`⚠️ Wave 4 invalidated - retraced below Wave 1 end (${wave4.endPrice} < ${wave1.endPrice})`);
      return false;
    }
    
    // For ongoing Wave 4, check if current price violates the rule
    if (!wave4.endPrice && currentPrice < wave1.endPrice) {
      if (verbose) console.log(`⚠️ Current price ${currentPrice} invalidates Wave 4 - below Wave 1 end (${wave1.endPrice})`);
      return false;
    }
  }

  // Check for consistency in wave sequence
  for (let i = 1; i < waves.length; i++) {
    const prevWave = waves[i-1];
    const currentWave = waves[i];
    
    // Ensure wave continuity - end of one wave should be start of next
    if (prevWave.endPrice !== currentWave.startPrice) {
      if (verbose) console.log(`⚠️ Wave continuity broken between Wave ${prevWave.number} and Wave ${currentWave.number}`);
      return false;
    }
  }
  
  return true;
};

// Also update the completeWaveAnalysis function to validate wave continuity
// Add this at an appropriate point inside the function:

// Enhance the checkCurrentPrice function to restart pattern detection more intelligently


// Add this function around line 1800
/**
 * Checks if a wave should be marked as complete based on subsequent price action
 * @param wave - The wave to check
 * @param nextPivot - The next pivot point after this wave
 * @returns boolean - True if the wave is complete
 */
const checkWaveCompletion = (wave: Wave, nextPivot?: ZigzagPoint): boolean => {
  if (!nextPivot) return false; // No next pivot = wave is still ongoing
  
  // If we have a significant move in the opposite direction, the wave is complete
  if (wave.isImpulse) {
    // For impulse waves, a significant downward move marks completion
    return nextPivot.low < wave.endPrice! - (wave.endPrice! - wave.startPrice) * 0.236;
  } else {
    // For corrective waves, a significant upward move marks completion
    return nextPivot.high > wave.endPrice! + (wave.startPrice - wave.endPrice!) * 0.236;
  }
};

// Add to checkCurrentPrice function around line 1750
// Add this to detect wave invalidation
const isWaveInvalidated = (wave: Wave, currentPrice: number, allWaves: Wave[]): boolean => {
  // Wave 1 is invalidated if price returns to its start
  if (wave.number === 1) {
    return currentPrice <= wave.startPrice;
  }
  
  // Wave 3 must not retrace below wave 1's end 
  if (wave.number === 3) {
    const wave1 = findMostRecentWave(allWaves, 1);
    if (wave1 && wave1.endPrice) {
      return currentPrice < wave1.endPrice;
    }
  }
  
  // Wave 5 shouldn't retrace below Wave 4's start
  if (wave.number === 5) {
    const wave4 = findMostRecentWave(allWaves, 4);
    
    if (wave4 && wave4.startPrice) {
      return currentPrice < wave4.startPrice;
    }
  }
  
  return false;
};

// Fix 6-10: Move the invalidation check inside the checkCurrentPrice function
const checkCurrentPrice = (waves: Wave[], data: StockHistoricalData[], invalidWaves: Wave[] = [], verbose: boolean = false): boolean => {
  if (waves.length === 0) return true;
  
  const currentPrice = data[data.length - 1].close;
  const currentTimestamp = data[data.length - 1].timestamp;
  
  // Find the current wave (last one in the array)
  const currentWave = waves[waves.length - 1];
  
  // --- CONSISTENT INVALIDATION LOGIC FOR ALL WAVES ---
  
  // Check if the wave is invalidated using our helper function
  if (isWaveInvalidated(currentWave, currentPrice, waves)) {
    if (verbose) console.log(`Wave ${currentWave.number} has been invalidated by current price movement`);
    
    // Update main wave in waves array with complete invalidation info
    currentWave.isComplete = true;
    currentWave.isValid = false;
    currentWave.isInvalidated = true;
    currentWave.endPrice = currentPrice;
    currentWave.endTimestamp = currentTimestamp;
    currentWave.invalidationPrice = currentPrice;
    currentWave.invalidationTimestamp = currentTimestamp;
    currentWave.invalidationRule = `Wave ${currentWave.number} invalidated by price movement`;
    currentWave.isTerminated = true;
    
    // Add to invalidWaves for visualization with the same complete information
    invalidWaves.push({
      ...currentWave  // This includes all fields we just updated above
    });
    
    return false; // Wave invalidated, restart pattern detection
  }
  
  // SPECIFIC WAVE VALIDATIONS (already includes Wave 4)
  
  // Wave 2 validation - cannot go below Wave 1 start
  if (currentWave.number === 2) {
    const wave1 = findMostRecentWave(waves, 1);
    
    if (wave1 && wave1.startPrice) {
      if (currentPrice < wave1.startPrice) {
        if (verbose) console.log(`❌ CRITICAL VIOLATION: Wave 2 retraced beyond Wave 1 start`);
        
        // Use consistent invalidation pattern for Wave 2
        currentWave.isComplete = true;
        currentWave.isValid = false;
        currentWave.isTerminated = true;
        currentWave.isInvalidated = true;
        currentWave.endPrice = currentPrice;
        currentWave.endTimestamp = currentTimestamp;
        currentWave.invalidationTimestamp = currentTimestamp;
        currentWave.invalidationPrice = currentPrice;
        currentWave.invalidationRule = "Wave 2 retraced beyond Wave 1 start";
        
        invalidWaves.push(currentWave);
        
        return false; // Trigger pattern reset
      }
    }
  }
  
  // Wave 3 validation - cannot retrace below Wave 1 end
  if (currentWave.number === 3) {
    const wave1 = findMostRecentWave(waves, 1);
    
    if (wave1 && wave1.endPrice) {
      if (currentPrice < wave1.endPrice) {
        if (verbose) console.log(`❌ CRITICAL VIOLATION: Wave 3 retraced below Wave 1 end`);
        
        // Use consistent invalidation pattern for Wave 3
        currentWave.isComplete = true;
        currentWave.isValid = false;
        currentWave.isTerminated = true;
        currentWave.isInvalidated = true;
        currentWave.endPrice = currentPrice;
        currentWave.endTimestamp = currentTimestamp;
        currentWave.invalidationTimestamp = currentTimestamp;
        currentWave.invalidationPrice = currentPrice;
        currentWave.invalidationRule = "Wave 3 retraced below Wave 1 end";
        
        invalidWaves.push(currentWave);
        
        return false; // Trigger pattern reset
      }
    }
  }
  
  // Wave 4 validation (existing code)
  if (currentWave.number === 4) {
    const wave1 = findMostRecentWave(waves, 1);
    
    if (wave1 && wave1.endPrice) {
      if (currentPrice < wave1.endPrice) {
        if (verbose) console.log(`❌ CRITICAL VIOLATION: Wave 4 entered Wave 1 price territory`);
        
        // Use consistent invalidation pattern for Wave 4
        currentWave.isComplete = true;
        currentWave.isValid = false;
        currentWave.isTerminated = true;
        currentWave.isInvalidated = true;
        currentWave.endPrice = currentPrice;
        currentWave.endTimestamp = currentTimestamp;
        currentWave.invalidationTimestamp = currentTimestamp;
        currentWave.invalidationPrice = currentPrice;
        currentWave.invalidationRule = "Wave 4 entered Wave 1 price territory";
        
        invalidWaves.push(currentWave);
        
        return false; // Trigger pattern reset
      }
    }
  }
  
  // Wave 5 validation - cannot retrace below Wave 4 start
  if (currentWave.number === 5) {
    const wave4 = findMostRecentWave(waves, 4);
    
    if (wave4 && wave4.startPrice) {
      if (currentPrice < wave4.startPrice) {
        if (verbose) console.log(`❌ CRITICAL VIOLATION: Wave 5 retraced below Wave 4 start`);
        
        // Use consistent invalidation pattern for Wave 5
        currentWave.isComplete = true;
        currentWave.isValid = false;
        currentWave.isTerminated = true;
        currentWave.isInvalidated = true;
        currentWave.endPrice = currentPrice;
        currentWave.endTimestamp = currentTimestamp;
        currentWave.invalidationTimestamp = currentTimestamp;
        currentWave.invalidationPrice = currentPrice;
        currentWave.invalidationRule = "Wave 5 retraced below Wave 4 start";
        
        invalidWaves.push(currentWave);
        
        return false; // Trigger pattern reset
      }
    }
  }
  
  return true;
};

// Update the wave selection logic in calculateFibTargetsForWaves
// This code should be added/modified where each wave is found

// Helper function to conditionally log based on verbosity
const logIf = (verbose: boolean, message: string, ...args: any[]) => {
  if (verbose) {
    console.log(message, ...args);
  }
};







