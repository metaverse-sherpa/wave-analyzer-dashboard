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
  
  const levels = [1.236, 1.618, 2.0, 2.618];
  
  return levels.map(level => ({
    level,
    price: endPrice + (diff * level * direction),
    label: `${(level * 100).toFixed(1)}%`,
    isExtension: true
  }));
};

// Find zigzag points in the price series to identify potential waves
const findZigzagPoints = (data: StockHistoricalData[], threshold: number = 0.03): ZigzagPoint[] => {
  if (data.length < 3) return [];
  
  const points: ZigzagPoint[] = [];
  let isUptrend = data[1].close > data[0].close;
  let currentExtreme = isUptrend ? 
    { price: data[0].low, timestamp: data[0].timestamp, index: 0, type: 'trough' as const } : 
    { price: data[0].high, timestamp: data[0].timestamp, index: 0, type: 'peak' as const };
  
  points.push(currentExtreme);
  
  for (let i = 1; i < data.length; i++) {
    if (isUptrend) {
      // In uptrend, looking for new highs
      if (data[i].high > currentExtreme.price) {
        currentExtreme = { 
          price: data[i].high, 
          timestamp: data[i].timestamp, 
          index: i, 
          type: 'peak' 
        };
      } 
      // Check for reversal to downtrend
      else if (data[i].close < currentExtreme.price * (1 - threshold)) {
        points.push(currentExtreme);
        isUptrend = false;
        currentExtreme = { 
          price: data[i].low, 
          timestamp: data[i].timestamp, 
          index: i, 
          type: 'trough' 
        };
      }
    } else {
      // In downtrend, looking for new lows
      if (data[i].low < currentExtreme.price) {
        currentExtreme = { 
          price: data[i].low, 
          timestamp: data[i].timestamp, 
          index: i, 
          type: 'trough' 
        };
      } 
      // Check for reversal to uptrend
      else if (data[i].close > currentExtreme.price * (1 + threshold)) {
        points.push(currentExtreme);
        isUptrend = true;
        currentExtreme = { 
          price: data[i].high, 
          timestamp: data[i].timestamp, 
          index: i, 
          type: 'peak' 
        };
      }
    }
  }
  
  // Add the final extreme point
  points.push(currentExtreme);
  
  return points;
};

// Analyze points to identify Elliott Waves
const identifyWaves = (points: ZigzagPoint[], data: StockHistoricalData[]): Wave[] => {
  if (points.length < 5) {
    return [];  // Need at least 5 points to identify waves
  }
  
  const waves: Wave[] = [];
  
  // Check if overall trend is bullish or bearish
  const isBullish = points[points.length - 1].price > points[0].price;
  
  // Minimum 5-wave impulse pattern
  if (isBullish) {
    // Impulse wave in bullish trend (5 waves)
    for (let i = 0; i < Math.min(5, points.length - 1); i++) {
      const startPoint = points[i];
      const endPoint = points[i + 1];
      
      const wave: Wave = {
        number: i % 2 === 0 ? i/2 + 1 : i === 1 ? 2 : i === 3 ? 4 : "Error",
        startTimestamp: startPoint.timestamp,
        endTimestamp: endPoint.timestamp,
        startPrice: startPoint.price,
        endPrice: endPoint.price,
        type: i % 2 === 0 ? 'impulse' : 'corrective',
        isComplete: i < Math.min(4, points.length - 2),
        isImpulse: i % 2 === 0
      };
      
      waves.push(wave);
    }
  } else {
    // Corrective wave in bearish trend (typically ABC)
    const waveLabels = ['A', 'B', 'C', 'D', 'E']; // For corrective patterns
    for (let i = 0; i < Math.min(5, points.length - 1); i++) {
      const startPoint = points[i];
      const endPoint = points[i + 1];
      
      const wave: Wave = {
        number: waveLabels[i],
        startTimestamp: startPoint.timestamp,
        endTimestamp: endPoint.timestamp,
        startPrice: startPoint.price,
        endPrice: endPoint.price,
        type: i % 2 === 0 ? 'impulse' : 'corrective',
        isComplete: i < Math.min(4, points.length - 2),
        isImpulse: i % 2 === 0
      };
      
      waves.push(wave);
    }
  }
  
  // Apply Elliott Wave rules
  if (waves.length >= 5) {
    const wave1 = waves[0];
    const wave2 = waves[1];
    const wave3 = waves[2];
    const wave4 = waves[3];
    const wave5 = waves[4];
    
    // Rule 1: Wave 2 cannot retrace more than 100% of Wave 1
    if (wave2.endPrice! <= wave1.startPrice) {
      // Adjustment needed
      waves[1].type = 'corrective';
      waves[1].isImpulse = false;
    }
    
    // Rule 2: Wave 3 cannot be the shortest among 1, 3, 5
    const length1 = Math.abs(wave1.endPrice! - wave1.startPrice);
    const length3 = Math.abs(wave3.endPrice! - wave3.startPrice);
    const length5 = waves.length > 4 ? Math.abs(wave5.endPrice! - wave5.startPrice) : Infinity;
    
    if (length3 < length1 && length3 < length5) {
      // This violates Elliott Wave rules, adjust wave labeling
      // In a real implementation, this would be more sophisticated
      waves[2].type = 'corrective';
      waves[2].isImpulse = false;
    }
    
    // Rule 3: Wave 4 cannot overlap Wave 1's territory in most cases
    if (isBullish && wave4.endPrice! < wave1.endPrice!) {
      // Violates non-overlap rule
      waves[3].type = 'corrective';
      waves[3].isImpulse = false;
    }
  }
  
  return waves;
};

// Analyze the price data to identify Elliott Waves
export const analyzeElliottWaves = (data: StockHistoricalData[]): WaveAnalysisResult => {
  if (!data || data.length < 20) {
    return { 
      waves: [], 
      currentWave: {} as Wave, 
      fibTargets: [],
      trend: 'neutral'
    };
  }

  // Find zigzag points in the price data
  const zigzagPoints = findZigzagPoints(data);
  
  // Identify waves based on zigzag points
  const waves = identifyWaves(zigzagPoints, data);
  
  // Determine current wave
  let currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  
  // Calculate Fibonacci targets
  let fibTargets: FibTarget[] = [];
  
  if (waves.length >= 2) {
    const lastCompleteWave = waves[waves.length - 2];
    const previousWave = waves[waves.length - 3] || waves[0];
    
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
  const impulsePattern = waves.length >= 5;
  const correctivePattern = waves.length > 0 && waves.length < 5 && 
                           (waves[0].number === 'A' || waves[0].type === 'corrective');

  return { 
    waves, 
    currentWave, 
    fibTargets,
    trend,
    impulsePattern,
    correctivePattern
  };
};
