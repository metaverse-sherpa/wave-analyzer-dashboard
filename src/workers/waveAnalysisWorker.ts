import { analyzeElliottWaves } from '../utils/elliottWaveAnalysis';
import type { StockHistoricalData } from '../services/yahooFinanceService';
import type { WaveAnalysisResult } from '../types/waves';

// Define the expected message structure
interface WorkerMessage {
  data: StockHistoricalData[];
  id: number;
}

// Define the response structure
interface WorkerResponse {
  result: WaveAnalysisResult;
  id: number;
}

// Define the error response structure
interface WorkerErrorResponse {
  error: string;
  id: number;
}

// Handle incoming messages from the main thread
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { data, id } = event.data;
  
  try {
    console.log(`Worker: Starting analysis for request #${id} with ${data.length} data points`);
    
    // Aggressive data reduction to prevent timeouts
    let processData = data;
    if (data.length > 100) {
      const sampleFactor = Math.ceil(data.length / 100);
      processData = data.filter((_, index) => index % sampleFactor === 0);
      console.log(`Worker: Reduced data from ${data.length} to ${processData.length} points for analysis`);
    }
    
    // Log each step of the analysis for debugging
    console.log(`Worker: Finding pivots...`);
    const pivots = findPivots(processData, 0.03); // Use a lower threshold
    
    console.log(`Worker: Found ${pivots.length} pivots, identifying waves...`);
    const waves = identifyWaves(pivots, processData);
    
    console.log(`Worker: Identified ${waves.length} waves, finalizing analysis...`);
    const result = completeAnalysis(waves, processData);
    
    console.log(`Worker: Analysis complete, found ${result.waves.length} waves`);
    
    // Send the result back to the main thread
    const response: WorkerResponse = { result, id };
    self.postMessage(response);
  } catch (error) {
    console.error(`Worker: Error analyzing data:`, error);
    
    // Send error response back to main thread
    const errorResponse: WorkerErrorResponse = { 
      error: error instanceof Error ? error.message : String(error), 
      id 
    };
    self.postMessage(errorResponse);
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