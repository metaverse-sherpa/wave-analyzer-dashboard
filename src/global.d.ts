// Create or edit src/global.d.ts
interface Window {
  disableWaveAnalysis?: boolean;
  sampleDataHeavily?: boolean;
  gc?: () => void;
  _workerErrorCount?: number; // Add this line
  performance: Performance & {
    memory?: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    }
  };
}