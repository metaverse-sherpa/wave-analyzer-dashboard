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
    
    // Use a more efficient approach for large datasets
    let processData = data;
    if (data.length > 300) {
      const sampleFactor = Math.ceil(data.length / 300);
      processData = data.filter((_, index) => index % sampleFactor === 0);
      console.log(`Worker: Sampled data to ${processData.length} points`);
    }
    
    // Perform the analysis
    const result = analyzeElliottWaves(processData);
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

// Signal that the worker is ready
console.log('Elliott Wave Analysis worker initialized');