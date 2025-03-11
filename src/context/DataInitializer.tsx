import React, { useEffect } from 'react';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { toast } from '@/lib/toast';

interface DataInitializerProps {
  onDataLoaded: () => void;
  onError: (error: string) => void;
}

const DataInitializer: React.FC<DataInitializerProps> = ({ onDataLoaded, onError }) => {
  const { getAnalysis, preloadAnalyses } = useWaveAnalysis();
  
  useEffect(() => {
    const checkApiAndInitialize = async () => {
      // Add a safety timeout to prevent infinite loading
      const safetyTimeout = setTimeout(() => {
        console.log("Safety timeout triggered - forcing data loaded state");
        onDataLoaded();
      }, 10000); // 10 seconds max wait
      
      try {
        // Check API health first
        const healthResponse = await fetch('/api/health');
        const apiWorking = healthResponse.ok;
        
        if (!apiWorking) {
          console.warn("API health check failed - API may be unavailable");
          toast.warning('API server may be unavailable. Using limited functionality.');
          onDataLoaded(); // Continue anyway
          return;
        }
        
        console.log("DataInitializer: API health check passed, initializing...");
        
        // Try to load data from cache first
        const cachedAnalysis = localStorage.getItem('wave_analysis_AAPL_1d');
        if (cachedAnalysis) {
          console.log("DataInitializer: Found cached analysis data");
          onDataLoaded();
          return;
        }
        
        // First try to load AAPL as a test
        console.log("DataInitializer: Attempting to load AAPL analysis");
        const result = await getAnalysis('AAPL', '1d');
        
        if (result && result.waves && result.waves.length > 0) {
          console.log("DataInitializer: Successfully loaded AAPL analysis");
          onDataLoaded();
        } else {
          console.log("DataInitializer: AAPL analysis missing waves, trying preload");
          // If that didn't work, try to preload some key stocks
          await preloadAnalyses(['AAPL', 'MSFT', 'GOOGL']);
          console.log("DataInitializer: Completed preloading analyses");
          onDataLoaded();
        }
      } catch (err) {
        console.error('DataInitializer: Error initializing data:', err);
        // Don't block the app completely, still let user in with an error toast
        toast.error('Error loading some data. Charts may be incomplete.');
        onDataLoaded(); // Still allow the app to load
        onError('Failed to initialize application data');
      }
    };
    
    checkApiAndInitialize();
  }, [getAnalysis, preloadAnalyses, onDataLoaded, onError]);
  
  return null;
};

export default DataInitializer;