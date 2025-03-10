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
 * Improved function to identify significant pivots in price data using a modified zigzag algorithm
 * @param data - Historical price data
 * @param threshold - Minimum percentage change required to identify a pivot
 */
const findPivots = (data: StockHistoricalData[], threshold: number = 0.05): ZigzagPoint[] => {
  if (data.length < 5) return [];
  
  // Enhanced algorithm based on true price swings, not just alternating extremes
  const pivots: ZigzagPoint[] = [];
  let lastHigh = { price: data[0].high, timestamp: data[0].timestamp, index: 0 };
  let lastLow = { price: data[0].low, timestamp: data[0].timestamp, index: 0 };
  let currentDirection: 'up' | 'down' | null = null;
  
  // First determine initial direction
  let i = 1;
  while (i < data.length && currentDirection === null) {
    if (data[i].high > lastHigh.price * (1 + threshold)) {
      currentDirection = 'up';
      lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
      pivots.push({ ...lastLow, type: 'trough' });
    } else if (data[i].low < lastLow.price * (1 - threshold)) {
      currentDirection = 'down';
      lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
      pivots.push({ ...lastHigh, type: 'peak' });
    } else {
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
  for (; i < data.length; i++) {
    if (currentDirection === 'up') {
      // In uptrend - track new highs and look for reversal
      if (data[i].high > lastHigh.price) {
        lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
      } else if (data[i].low < lastHigh.price * (1 - threshold)) {
        // Confirmed reversal
        pivots.push({ 
          price: lastHigh.price, 
          timestamp: lastHigh.timestamp, 
          index: lastHigh.index,
          type: 'peak' 
        });
        currentDirection = 'down';
        lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
      }
    } else if (currentDirection === 'down') {
      // In downtrend - track new lows and look for reversal
      if (data[i].low < lastLow.price) {
        lastLow = { price: data[i].low, timestamp: data[i].timestamp, index: i };
      } else if (data[i].high > lastLow.price * (1 + threshold)) {
        // Confirmed reversal
        pivots.push({
          price: lastLow.price,
          timestamp: lastLow.timestamp,
          index: lastLow.index,
          type: 'trough'
        });
        currentDirection = 'up';
        lastHigh = { price: data[i].high, timestamp: data[i].timestamp, index: i };
      }
    }
  }
  
  // Add the final extreme point if it's significant
  if (currentDirection === 'up' && lastHigh.index > pivots[pivots.length-1]?.index) {
    pivots.push({
      price: lastHigh.price,
      timestamp: lastHigh.timestamp,
      index: lastHigh.index,
      type: 'peak'
    });
  } else if (currentDirection === 'down' && lastLow.index > pivots[pivots.length-1]?.index) {
    pivots.push({
      price: lastLow.price,
      timestamp: lastLow.timestamp,
      index: lastLow.index,
      type: 'trough'
    });
  }
  
  return pivots;
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
  
  const waves: Wave[] = [];
  let isBullishStructure: boolean;
  
  // Step 1: Determine dominant trend direction
  // In Elliott Wave theory, impulse waves move with the trend, corrective waves against it
  isBullishStructure = pivots[pivots.length - 1].price > pivots[0].price;

  // Step 2: Build initial wave structure
  // For an impulse pattern (waves 1-5), we need at least 9 pivot points
  // For a corrective pattern (waves A-B-C), we need at least 5 pivot points
  
  if (pivots.length >= 9 && isBullishStructure) {
    // Attempt to identify a complete 5-wave impulse structure
    let waveIndex = 1;
    let wavePattern = ['1', '2', '3', '4', '5'];
    let waveTypes = ['impulse', 'corrective', 'impulse', 'corrective', 'impulse'];
    
    // Build the structure
    for (let i = 0; i < Math.min(9, pivots.length - 1); i += 2) {
      if (i >= wavePattern.length * 2) break;
      
      const patternIndex = Math.floor(i / 2);
      const startPoint = pivots[i];
      const endPoint = pivots[i + 1];
      
      const wave: Wave = {
        number: wavePattern[patternIndex],
        startTimestamp: startPoint.timestamp,
        endTimestamp: endPoint.timestamp,
        startPrice: startPoint.price,
        endPrice: endPoint.price,
        type: waveTypes[patternIndex] as 'impulse' | 'corrective',
        isComplete: i < pivots.length - 2,
        isImpulse: waveTypes[patternIndex] === 'impulse'
      };
      
      waves.push(wave);
    }
    
    // Check if we have a potential A-B-C correction after the impulse
    if (pivots.length >= 12) {
      let wavePattern = ['A', 'B', 'C'];
      let waveTypes = ['impulse', 'corrective', 'impulse']; // In correction, A and C move against trend
      
      for (let i = 10; i < Math.min(15, pivots.length - 1); i += 2) {
        const patternIndex = Math.floor((i - 10) / 2);
        if (patternIndex >= wavePattern.length) break;
        
        const startPoint = pivots[i];
        const endPoint = pivots[i + 1];
        
        const wave: Wave = {
          number: wavePattern[patternIndex],
          startTimestamp: startPoint.timestamp,
          endTimestamp: endPoint.timestamp,
          startPrice: startPoint.price,
          endPrice: endPoint.price,
          type: waveTypes[patternIndex] as 'impulse' | 'corrective',
          isComplete: i < pivots.length - 2,
          isImpulse: waveTypes[patternIndex] === 'impulse'
        };
        
        waves.push(wave);
      }
    }
  } else if (pivots.length >= 5 && !isBullishStructure) {
    // This might be a corrective structure (A-B-C)
    let wavePattern = ['A', 'B', 'C'];
    let waveTypes = ['impulse', 'corrective', 'impulse'];
    
    for (let i = 0; i < Math.min(5, pivots.length - 1); i += 2) {
      const patternIndex = Math.floor(i / 2);
      if (patternIndex >= wavePattern.length) break;
      
      const startPoint = pivots[i];
      const endPoint = pivots[i + 1];
      
      const wave: Wave = {
        number: wavePattern[patternIndex],
        startTimestamp: startPoint.timestamp,
        endTimestamp: endPoint.timestamp,
        startPrice: startPoint.price,
        endPrice: endPoint.price,
        type: waveTypes[patternIndex] as 'impulse' | 'corrective',
        isComplete: i < pivots.length - 2,
        isImpulse: waveTypes[patternIndex] === 'impulse'
      };
      
      waves.push(wave);
    }
  } else {
    // Not enough points for a proper pattern, just label sequential waves
    // In real Elliott Wave analysis, this would require more sophisticated rules
    for (let i = 0; i < pivots.length - 1; i++) {
      const startPoint = pivots[i];
      const endPoint = pivots[i + 1];
      
      const isEvenIndex = i % 2 === 0;
      const waveType = isEvenIndex ? 'impulse' : 'corrective';
      
      const wave: Wave = {
        number: i + 1, // Simple sequential numbering
        startTimestamp: startPoint.timestamp,
        endTimestamp: endPoint.timestamp,
        startPrice: startPoint.price,
        endPrice: endPoint.price,
        type: waveType,
        isComplete: i < pivots.length - 2,
        isImpulse: waveType === 'impulse'
      };
      
      waves.push(wave);
    }
  }

  // Step 3: Apply Elliott Wave validation rules
  validateWaveRules(waves);
  
  return waves;
};

/**
 * Validates wave structure according to Elliott Wave rules and makes adjustments if necessary
 * @param waves - Array of identified waves
 */
const validateWaveRules = (waves: Wave[]): void => {
  if (waves.length < 5) return; // Need at least a complete 5-wave structure
  
  // Check for 5-wave impulse structure
  if (waves[0].number === '1' && 
      waves[1].number === '2' && 
      waves[2].number === '3' && 
      waves[3].number === '4' && 
      waves[4].number === '5') {
    
    // Rule 1: Wave 2 cannot retrace more than 100% of Wave 1
    if (waves[1].endPrice! <= waves[0].startPrice) {
      // This violates Elliott Wave rules - reclassify
      waves[0].number = 'A';
      waves[1].number = 'B';
      waves[2].number = 'C';
      waves[3].number = '1';
      waves[4].number = '2';
    }
    
    // Rule 2: Wave 3 cannot be the shortest among 1, 3, 5
    const length1 = Math.abs(waves[0].endPrice! - waves[0].startPrice);
    const length3 = Math.abs(waves[2].endPrice! - waves[2].startPrice);
    const length5 = Math.abs(waves[4].endPrice! - waves[4].startPrice);
    
    if (length3 < length1 && length3 < length5) {
      // This violates Elliott Wave rules - consider reinterpreting
      // In a complex implementation, this could involve reclassifying the structure
    }
    
    // Rule 3: Wave 4 cannot overlap Wave 1's territory in most cases
    // In an uptrend, the low of Wave 4 should not go below the high of Wave 1
    if (waves[0].endPrice! > waves[0].startPrice && // Uptrend for Wave 1
        waves[3].endPrice! < waves[0].endPrice!) {
      // Violates non-overlap rule, could be a different pattern
      // In real analysis, this might be a diagonal or another structure
    }
  }
  
  // Check for A-B-C corrective structure
  if (waves.length >= 3 &&
      waves[0].number === 'A' && 
      waves[1].number === 'B' && 
      waves[2].number === 'C') {
    
    // Rule: Wave B should not exceed the starting point of wave A
    if (waves[1].endPrice! > waves[0].startPrice) {
      // This could be an irregular correction or another pattern
    }
  }
};

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

  // Find significant pivots in the price data with a dynamic threshold
  // Higher threshold (0.05-0.08) for long-term charts, lower (0.03-0.05) for shorter timeframes
  const threshold = data.length > 500 ? 0.05 : 0.03;
  const pivots = findPivots(data, threshold);
  
  // Identify waves based on pivot points
  const waves = identifyWaves(pivots, data);
  
  // Determine current wave
  let currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  
  // Calculate Fibonacci targets
  let fibTargets: FibTarget[] = [];
  
  if (waves.length >= 2) {
    const lastCompleteWave = waves[waves.length - 1];
    const previousWave = waves[waves.length - 2];
    
    // Calculate retracements based on the last complete wave
    const retracements = calculateFibRetracement(
      previousWave.startPrice, 
      lastCompleteWave.endPrice!
    );
    
    // Calculate extensions for potential next wave
    const extensions = calculateFibExtension(
      previousWave.startPrice, 
      lastCompleteWave.endPrice!
    );
    
    fibTargets = [...retracements, ...extensions];
  }
  
  // Determine trend based on overall wave structure
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
  
  // Determine if we have impulse or corrective patterns
  const impulsePattern = waves.length >= 5 && 
    waves.slice(0, 5).every((w, i) => w.number === String(i + 1));
    
  const correctivePattern = waves.length >= 3 && 
    waves[0].number === 'A' && waves[1].number === 'B' && waves[2].number === 'C';

  return { 
    waves, 
    currentWave, 
    fibTargets,
    trend,
    impulsePattern,
    correctivePattern
  };
};
