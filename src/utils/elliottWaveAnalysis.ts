import { StockHistoricalData } from "@/services/yahooFinanceService";

// Define the Wave interface
export interface Wave {
  number: number | string;   // Wave number (1-5) or letter (A, B, C)
  startTimestamp: number;    // Unix timestamp for wave start
  endTimestamp?: number;     // Unix timestamp for wave end (undefined if wave is in progress)
  startPrice: number;        // Price at start of wave
  endPrice?: number;         // Price at end of wave (undefined if wave is in progress)
  type: 'impulse' | 'corrective';  // Wave type
  isComplete: boolean;       // Whether the wave is complete
}

// Define the WaveAnalysisResult interface that was missing
export interface WaveAnalysisResult {
  waves: Wave[];
  currentWave: Wave;
  fibTargets: FibTarget[];
  trend?: 'bullish' | 'bearish' | 'neutral';
  impulsePattern?: boolean;
  correctivePattern?: boolean;
}

// Define the Fibonacci target interface
export interface FibTarget {
  label: string;             // Label for the target (e.g., "0.618")
  price: number;             // Target price
  isExtension: boolean;      // Whether this is an extension (> 100%) or retracement (<= 100%)
}

// Function to get Fibonacci retracement and extension levels
export const calculateFibonacciLevels = (
  wave: Wave,
  nextWave: Wave | null = null
): FibTarget[] => {
  if (!wave || !wave.startPrice || !wave.endPrice) return [];
  
  // Get start and end prices
  const startPrice = wave.startPrice;
  const endPrice = wave.endPrice;
  
  // Calculate price change
  const change = endPrice - startPrice;
  const isUptrend = change > 0;
  
  // Define Fibonacci ratios for retracements
  const fibRetracements = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  
  // Define Fibonacci ratios for extensions
  const fibExtensions = [1.272, 1.618, 2.618];
  
  // Calculate retracement levels
  const retracements = fibRetracements.map(ratio => {
    const price = isUptrend 
      ? endPrice - (change * ratio)
      : endPrice + (change * ratio);
    
    return {
      label: `${ratio * 100}%`,
      price,
      isExtension: false
    };
  });
  
  // Calculate extension levels
  const extensions = fibExtensions.map(ratio => {
    const price = isUptrend
      ? endPrice + (change * (ratio - 1))
      : endPrice - (change * (ratio - 1));
    
    return {
      label: `${ratio * 100}%`,
      price,
      isExtension: true
    };
  });
  
  // Combine retracements and extensions
  return [...retracements, ...extensions];
};

// Analyze the price data to identify Elliott Waves
export const analyzeElliottWaves = (data: StockHistoricalData[]): WaveAnalysisResult => {
  if (!data || data.length < 20) {
    return { waves: [], currentWave: {} as Wave, fibTargets: [] };
  }
  
  // In a real application, this would implement a sophisticated algorithm
  // For our demo, we'll create a simplified implementation
  
  // Find significant price swings
  const waves: Wave[] = [];
  
  // Create first wave (usually starts at a significant low or high)
  const firstWaveStart = data[0];
  let currentIndex = Math.floor(data.length * 0.2); // 20% into the data
  const firstWaveEnd = data[currentIndex];
  
  waves.push({
    number: 1,
    startTimestamp: firstWaveStart.timestamp,
    endTimestamp: firstWaveEnd.timestamp,
    startPrice: firstWaveStart.close,
    endPrice: firstWaveEnd.close,
    type: 'impulse',
    isComplete: true
  });
  
  // Create second wave (retracement)
  const secondWaveStart = firstWaveEnd;
  currentIndex = Math.floor(data.length * 0.3); // 30% into the data
  const secondWaveEnd = data[currentIndex];
  
  waves.push({
    number: 2,
    startTimestamp: secondWaveStart.timestamp,
    endTimestamp: secondWaveEnd.timestamp,
    startPrice: secondWaveStart.close,
    endPrice: secondWaveEnd.close,
    type: 'corrective',
    isComplete: true
  });
  
  // Create third wave (usually the longest)
  const thirdWaveStart = secondWaveEnd;
  currentIndex = Math.floor(data.length * 0.6); // 60% into the data
  const thirdWaveEnd = data[currentIndex];
  
  waves.push({
    number: 3,
    startTimestamp: thirdWaveStart.timestamp,
    endTimestamp: thirdWaveEnd.timestamp,
    startPrice: thirdWaveStart.close,
    endPrice: thirdWaveEnd.close,
    type: 'impulse',
    isComplete: true
  });
  
  // Create fourth wave (retracement)
  const fourthWaveStart = thirdWaveEnd;
  currentIndex = Math.floor(data.length * 0.7); // 70% into the data
  const fourthWaveEnd = data[currentIndex];
  
  waves.push({
    number: 4,
    startTimestamp: fourthWaveStart.timestamp,
    endTimestamp: fourthWaveEnd.timestamp,
    startPrice: fourthWaveStart.close,
    endPrice: fourthWaveEnd.close,
    type: 'corrective',
    isComplete: true
  });
  
  // Create fifth wave (final impulse)
  const fifthWaveStart = fourthWaveEnd;
  currentIndex = Math.floor(data.length * 0.85); // 85% into the data
  let fifthWaveEnd = null;
  
  // Decide if the fifth wave is complete based on where we are in the data
  const isFifthComplete = Math.random() > 0.5; // Randomly complete or not
  
  if (isFifthComplete) {
    fifthWaveEnd = data[Math.floor(data.length * 0.95)]; // 95% into the data
  }
  
  const fifthWave: Wave = {
    number: 5,
    startTimestamp: fifthWaveStart.timestamp,
    startPrice: fifthWaveStart.close,
    type: 'impulse',
    isComplete: isFifthComplete
  };
  
  if (isFifthComplete && fifthWaveEnd) {
    fifthWave.endTimestamp = fifthWaveEnd.timestamp;
    fifthWave.endPrice = fifthWaveEnd.close;
  }
  
  waves.push(fifthWave);
  
  // Current wave is the last one, either complete or in progress
  const currentWave = waves[waves.length - 1];
  
  // Calculate Fibonacci targets for the current wave
  const fibTargets = calculateFibonacciLevels(currentWave);
  
  return {
    waves,
    currentWave,
    fibTargets
  };
};
