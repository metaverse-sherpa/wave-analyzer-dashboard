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
  level: number;
  price: number;
}

// Function to calculate Fibonacci retracement levels
const calculateFibRetracement = (startPrice: number, endPrice: number): FibTarget[] => {
  const diff = endPrice - startPrice;
  
  const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
  
  return levels.map(level => ({
    level,
    price: endPrice - diff * level,
  }));
};

// Function to identify potential wave types (simplified)
const identifyWaveType = (wave: Wave, previousWave?: Wave): 'impulse' | 'corrective' => {
  if (!previousWave) {
    return 'impulse';
  }
  
  const isCorrective = Math.abs(wave.endPrice! - wave.startPrice) < Math.abs(previousWave.endPrice! - previousWave.startPrice);
  
  return isCorrective ? 'corrective' : 'impulse';
};

// Analyze the price data to identify Elliott Waves
export const analyzeElliottWaves = (data: StockHistoricalData[]): WaveAnalysisResult => {
  if (!data || data.length < 20) {
    return { waves: [], currentWave: {} as Wave, fibTargets: [] };
  }

  const waves: Wave[] = [];
  let currentWave: Partial<Wave> = {};
  let fibTargets: FibTarget[] = [];

  // Initial wave setup
  currentWave = {
    number: 1,
    startTimestamp: data[0].timestamp,
    startPrice: data[0].close,
    type: 'impulse',
    isComplete: false,
  };

  for (let i = 1; i < data.length; i++) {
    const price = data[i].close;
    const timestamp = data[i].timestamp;

    // Check for a potential wave end (simplified condition)
    if (
      (currentWave.number === 1 && price > currentWave.startPrice! * 1.1) ||
      (currentWave.number === 2 && price < currentWave.startPrice! * 0.9)
    ) {
      currentWave.endPrice = price;
      currentWave.endTimestamp = timestamp;
      currentWave.isComplete = true;
      waves.push(currentWave as Wave);

      // Start a new wave
      const nextWaveNumber = currentWave.number === 1 ? 2 : 3;
      currentWave = {
        number: nextWaveNumber,
        startTimestamp: timestamp,
        startPrice: price,
        type: 'corrective',
        isComplete: false,
      };

      // Calculate Fibonacci retracement levels after wave 1
      if (nextWaveNumber === 3 && currentWave.endPrice) {
        fibTargets = calculateFibRetracement(currentWave.startPrice!, currentWave.endPrice);
      }
    }
  }

  // If the current wave is still in progress, update its details
  if (!currentWave.isComplete && currentWave.startPrice) {
    currentWave.endPrice = data[data.length - 1].close;
    currentWave.endTimestamp = data[data.length - 1].timestamp;
  }

  return { waves: waves as Wave[], currentWave: currentWave as Wave, fibTargets };
};
