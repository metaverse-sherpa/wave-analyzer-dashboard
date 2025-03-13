import type { Wave, StockHistoricalData, WaveAnalysisResult, FibTarget } from '@/types/shared';
// Import functions from our utility file
import { 
  analyzeWaves, 
  calculateFibTargets,
  determineTrend,
  hasImpulsePattern,
  hasCorrectivePattern
} from '@/utils/waveAnalysis';

// Define the expected message structure
interface WorkerMessage {
  data: StockHistoricalData[];
  id: number;
  symbol: string;
  isSampled?: boolean;
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

// Add memory monitoring and chunked processing
let heartbeatInterval: ReturnType<typeof setInterval>;
const CHUNK_SIZE = 500;
const HEARTBEAT_INTERVAL = 1000; // 1 second

const startHeartbeat = () => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    // Include memory usage if available
    const memoryInfo = (performance as any).memory 
      ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
        }
      : null;

    self.postMessage({ 
      type: 'heartbeat', 
      timestamp: Date.now(),
      status: 'working',
      memoryInfo
    });
  }, HEARTBEAT_INTERVAL);
};

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { data, id, symbol } = event.data;
  
  try {
    console.log(`Worker: Starting analysis for ${symbol} with ${data.length} points`);
    startHeartbeat();
    
    // Send initial progress
    self.postMessage({
      type: 'progress',
      id,
      symbol,
      progress: 0,
      waves: []
    });

    // Process data in chunks
    const processDataChunks = async () => {
      const chunks = [];
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        chunks.push(chunk);
        
        // Send progress update
        self.postMessage({
          type: 'progress',
          id,
          symbol,
          progress: Math.round((i / data.length) * 100),
          status: 'processing'
        });

        // Allow other messages to be processed
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return chunks;
    };

    // Process chunks and analyze
    processDataChunks().then(chunks => {
      const result = analyzeWaves(data, (waves) => {
        // Report wave progress
        self.postMessage({
          type: 'progress',
          id,
          symbol,
          waves,
          status: 'analyzing'
        });
      });
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      self.postMessage({ 
        type: 'complete', 
        result, 
        id, 
        symbol 
      });
    });

  } catch (error) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    console.error(`Worker: Error analyzing ${symbol}:`, error);
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
  const currentWave = waves.length > 0 ? waves[waves.length - 1] : null;
  let fibTargets: FibTarget[] = [];
  
  // Calculate Fibonacci targets if we have a completed wave 1 and 2
  if (waves.length >= 2) {
    const wave1 = waves[0];
    const wave2 = waves[1];
    fibTargets = calculateFibTargets(wave1, wave2);
  }
  
  return {
    waves,
    currentWave,
    fibTargets,
    trend: determineTrend(waves),
    impulsePattern: hasImpulsePattern(waves),
    correctivePattern: hasCorrectivePattern(waves)
  };
}

// Signal that the worker is ready
console.log('Elliott Wave Analysis worker initialized');

const MAX_EXECUTION_TIME = 100000; // 100 seconds max for wave identification

// Send ready message when worker starts
self.postMessage({ 
  type: 'ready', 
  timestamp: Date.now() 
});