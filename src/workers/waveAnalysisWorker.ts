import { analyzeElliottWaves } from '../utils/elliottWaveAnalysis';
import type { StockHistoricalData } from '../services/yahooFinanceService';
import type { WaveAnalysisResult } from '../types/waves';

// Define the expected message structure
interface WorkerMessage {
  data: StockHistoricalData[];
  id: number;
  symbol: string;
}

// Define the response structure
interface WorkerResponse {
  result: WaveAnalysisResult;
  id: number;
  symbol: string;
}

// Define the error response structure
interface WorkerErrorResponse {
  error: string;
  id: number;
  symbol: string;
}

// Handle incoming messages from the main thread
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { data, id, symbol } = event.data;
  
  try {
    console.log(`Worker: Starting analysis for ${symbol} (request #${id}) with ${data.length} data points`);
    
    // Add progress handler that posts back to main thread
    const handleProgress = (waves: Wave[]) => {
      self.postMessage({
        type: 'progress',
        id,
        symbol,
        waves
      });
    };

    const result = analyzeElliottWaves(data, handleProgress);
    
    // Send final result
    self.postMessage({ type: 'complete', result, id, symbol });
  } catch (error) {
    console.error(`Worker: Error analyzing data for ${symbol}:`, error);
    self.postMessage({ 
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      id,
      symbol
    });
  }
});

// Helper function to finalize analysis
function completeAnalysis(waves: Wave[], data: StockHistoricalData[]): WaveAnalysisResult {
  // Determine trend based on overall price movement
  const trend = data[data.length - 1].close > data[0].close ? 'bullish' : 'bearish';
  
  // Determine current wave
  const currentWave = waves.length > 0 ? waves[waves.length - 1] : ({} as Wave);
  
  // Calculate Fibonacci targets
  let fibTargets: FibTarget[] = [];
  
  if (waves.length >= 2) {
    const wave1 = waves.find(w => w.number === 1);
    const wave2 = waves.find(w => w.number === 2);
    
    if (wave1 && wave2) {
      fibTargets = calculateFibonacciTargets(wave1, wave2);
    }
  }
  
  // Determine if we have an impulse or corrective pattern
  const impulsePattern = waves.some(w => typeof w.number === 'number' && w.number === 5);
  const correctivePattern = waves.some(w => w.number === 'C');
  
  return {
    waves,
    currentWave,
    fibTargets,
    trend,
    impulsePattern,
    correctivePattern
  };
}

// Signal that the worker is ready
console.log('Elliott Wave Analysis worker initialized');

const MAX_EXECUTION_TIME = 100000; // 100 seconds max for wave identification