import React, { useEffect, useRef, useState } from 'react';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { toast } from '@/lib/toast';

interface DataInitializerProps {
  onDataLoaded: () => void;
  onError: (message: string) => void;
}

const DataInitializer: React.FC<DataInitializerProps> = ({ onDataLoaded, onError }) => {
  const { getAnalysis, preloadAnalyses, analyses } = useWaveAnalysis();
  const [initialized, setInitialized] = useState(false);
  const initializationInProgress = useRef(false);
  const safetyCalled = useRef(false);
  
  // Check if we already have analysis data in the context
  const hasExistingAnalyses = Object.keys(analyses).length > 0;
  
  useEffect(() => {
    // If we already have analyses, we can skip initialization
    if (hasExistingAnalyses && !initialized) {
      console.log("DataInitializer: Already have analyses in context, skipping initialization");
      setInitialized(true);
      onDataLoaded();
      return;
    }
  }, [hasExistingAnalyses, initialized, onDataLoaded]);
  
  useEffect(() => {
    const checkApiAndInitialize = async () => {
      // Prevent multiple simultaneous initializations
      if (initializationInProgress.current || initialized) {
        console.log("DataInitializer: Initialization already in progress or completed, skipping");
        return;
      }
      
      initializationInProgress.current = true;
      
      // Add a safety timeout to prevent infinite loading
      const safetyTimeout = setTimeout(() => {
        if (!safetyCalled.current) {
          safetyCalled.current = true;
          console.log("DataInitializer: Safety timeout triggered - forcing data loaded state");
          onDataLoaded();
        }
      }, 10000); // 10 seconds max wait
      
      try {
        // Check API health first
        //console.log("DataInitializer: Checking API health");
        const healthResponse = await fetch('/api/health');
        const apiWorking = healthResponse.ok;
        
        if (!apiWorking) {
          console.warn("DataInitializer: API health check failed - API may be unavailable");
          toast.warning('API server may be unavailable. Using limited functionality.');
          clearTimeout(safetyTimeout);
          setInitialized(true);
          onDataLoaded(); // Continue anyway
          return;
        }
        
        //console.log("DataInitializer: API health check passed, initializing...");
        
        // Try to load data from cache first
        const cachedAnalysis = localStorage.getItem('wave_analysis_AAPL_1d');
        if (cachedAnalysis) {
          console.log("DataInitializer: Found cached analysis data");
          clearTimeout(safetyTimeout);
          setInitialized(true);
          onDataLoaded();
          return;
        }
        
        // First try to load AAPL as a test
        console.log("DataInitializer: Attempting to load AAPL analysis");
        const result = await getAnalysis('AAPL', '1d');
        
        if (result && result.waves && result.waves.length > 0) {
          console.log("DataInitializer: Successfully loaded AAPL analysis");
          clearTimeout(safetyTimeout);
          setInitialized(true);
          onDataLoaded();
        } else {
          console.log("DataInitializer: AAPL analysis missing waves, trying preload");
          // If that didn't work, try to preload some key stocks
          await preloadAnalyses(['AAPL', 'MSFT', 'GOOGL']);
          console.log("DataInitializer: Completed preloading analyses");
          clearTimeout(safetyTimeout);
          setInitialized(true);
          onDataLoaded();
        }
      } catch (err) {
        console.error("DataInitializer: Error during initialization:", err);
        clearTimeout(safetyTimeout);
        setInitialized(true);
        onError(`Error initializing data: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        initializationInProgress.current = false;
      }
    };
    
    // Only run initialization once
    if (!initialized && !initializationInProgress.current) {
      checkApiAndInitialize();
    }
    
    // Cleanup
    return () => {
      //console.log("DataInitializer: Component unmounting");
      // No need to clean up initialization state as that's handled by refs
    };
  }, [getAnalysis, initialized, onDataLoaded, onError, preloadAnalyses]);
  
  return null; // This is a non-visual component
};

export default DataInitializer;