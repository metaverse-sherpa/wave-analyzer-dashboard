import { FC, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useWaveAnalysis } from './WaveAnalysisContext';

interface DataInitializerProps {
  onDataLoaded: () => void;
  onError: (message: string) => void;
}

const DataInitializer: FC<DataInitializerProps> = ({ onDataLoaded, onError }) => {
  const { toast } = useToast();
  const { loadAllAnalysesFromSupabase, allAnalyses, isDataLoaded, loadCacheTableData } = useWaveAnalysis();
  const hasCalledOnDataLoaded = useRef(false);
  const previousAnalysesCount = useRef(0);
  const loadAttempts = useRef(0);
  const maxLoadAttempts = 3;
  const initStarted = useRef(false);
  const alreadyRunningInitRef = useRef(false);
  
  // Once per page session tracker to prevent multiple initializations across navigation
  useEffect(() => {
    // Check if we've already initialized in this session
    try {
      const isInitialized = sessionStorage.getItem('data_initializer_ran') === 'true';
      if (isInitialized && !hasCalledOnDataLoaded.current) {
        hasCalledOnDataLoaded.current = true;
        onDataLoaded();
        console.log("DataInitializer already ran in this session, skipping initialization");
      }
    } catch (e) {
      // Ignore storage errors
    }

    return () => {
      // Cleanup - mark as initialized on unmount
      try {
        if (hasCalledOnDataLoaded.current) {
          sessionStorage.setItem('data_initializer_ran', 'true');
        }
      } catch (e) {
        // Ignore storage errors
      }
    };
  }, [onDataLoaded]);

  useEffect(() => {
    const analysesCount = Object.keys(allAnalyses).length;
    
    // If we have analyses and count has changed, mark as loaded
    if (analysesCount > 0 && analysesCount !== previousAnalysesCount.current) {
      previousAnalysesCount.current = analysesCount;
      console.log("Data loaded successfully", {
        analysesCount,
        sampleKeys: Object.keys(allAnalyses).slice(0, 3),
        sampleData: Object.values(allAnalyses).slice(0, 1)
      });

      if (!hasCalledOnDataLoaded.current) {
        hasCalledOnDataLoaded.current = true;
        console.log("Data successfully loaded from DataInitializer");
        onDataLoaded();
        
        // Mark initialization as complete for this session
        try {
          sessionStorage.setItem('data_initializer_ran', 'true');
        } catch (e) {
          // Ignore storage errors
        }
      }
    }
    // Only retry loading if we've never loaded any data before
    else if (isDataLoaded && analysesCount === 0 && previousAnalysesCount.current === 0) {
      console.warn("Data marked as loaded but no analyses found", {
        attempts: loadAttempts.current,
        maxAttempts: maxLoadAttempts
      });

      if (loadAttempts.current < maxLoadAttempts) {
        // Try loading again
        loadAttempts.current++;
        loadCacheTableData(true).catch(error => {
          console.error('Retry attempt failed:', error);
        });
      } else if (!hasCalledOnDataLoaded.current) {
        console.error("Max load attempts reached with no data");
        onError("Failed to load analysis data after multiple attempts");
        hasCalledOnDataLoaded.current = true;
      }
    }
  }, [allAnalyses, isDataLoaded, loadCacheTableData, onDataLoaded, onError]);

  useEffect(() => {
    // Skip if we've already called onDataLoaded
    if (hasCalledOnDataLoaded.current) {
      return;
    }
    
    // If data is already loaded or we're already initializing, skip initialization
    if (isDataLoaded) {
      console.log("Skipping DataInitializer init - data already loaded or initialization in progress");
      // If data is already loaded but we haven't called onDataLoaded yet, do it now
      if (!hasCalledOnDataLoaded.current) {
        hasCalledOnDataLoaded.current = true;
        onDataLoaded();
      }
      return;
    }
    
    // If already running, skip
    if (alreadyRunningInitRef.current) {
      return;
    }
    
    const initializeData = async () => {
      // Prevent concurrent initializations
      if (initStarted.current) return;
      
      alreadyRunningInitRef.current = true;
      initStarted.current = true;
      
      try {
        // Check if analyses are already loaded
        const analysesCount = Object.keys(allAnalyses).length;
        if (analysesCount > 0) {
          console.log(`DataInitializer found ${analysesCount} analyses already loaded, skipping load`);
          if (!hasCalledOnDataLoaded.current) {
            hasCalledOnDataLoaded.current = true;
            onDataLoaded();
            try {
              sessionStorage.setItem('data_initializer_ran', 'true');
            } catch (e) {
              // Ignore storage errors
            }
          }
          return;
        }
        
        console.log("DataInitializer loading analyses from Supabase");
        await loadCacheTableData(false); // Use the updated function with forceRefresh=false
      } catch (error) {
        console.error('Data initialization error:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          attempts: loadAttempts.current
        });

        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load analysis data. Please try refreshing the page.",
          duration: 7000,
        });
        
        onError("Failed to initialize data");
      } finally {
        alreadyRunningInitRef.current = false;
      }
    };

    initializeData();
  }, [isDataLoaded, loadCacheTableData, onError, toast, allAnalyses, onDataLoaded]);

  return null;
};

export default DataInitializer;