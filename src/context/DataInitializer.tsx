import { FC, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useWaveAnalysis } from './WaveAnalysisContext';

interface DataInitializerProps {
  onDataLoaded: () => void;
  onError: (message: string) => void;
}

const DataInitializer: FC<DataInitializerProps> = ({ onDataLoaded, onError }) => {
  const { toast } = useToast();
  // isDataLoaded reflects if the context *thinks* data has been loaded (might be empty)
  // allAnalyses holds the actual data
  const { loadCacheTableData, allAnalyses, isDataLoaded } = useWaveAnalysis();

  // Ref to track if onDataLoaded has been called by this instance
  const hasCalledOnDataLoaded = useRef(false);
  // Ref to track if an initialization attempt is currently in progress
  const isInitializing = useRef(false);

  // Effect 1: React to changes in the actual data (allAnalyses)
  useEffect(() => {
    const analysesCount = Object.keys(allAnalyses).length;
    console.log("DataInitializer: Data listener effect.", { analysesCount, hasCalled: hasCalledOnDataLoaded.current });

    // If we have data AND we haven't called onDataLoaded yet, call it.
    if (analysesCount > 0 && !hasCalledOnDataLoaded.current) {
      console.log(`DataInitializer: Detected ${analysesCount} analyses. Calling onDataLoaded.`);
      hasCalledOnDataLoaded.current = true;
      onDataLoaded();
    }
  }, [allAnalyses, onDataLoaded]);

  // Effect 2: Trigger the initial load if necessary
  useEffect(() => {
    console.log("DataInitializer: Initial load trigger effect.", {
      isDataLoadedContext: isDataLoaded, // Context flag
      hasCalled: hasCalledOnDataLoaded.current, // Local flag
      isInitializing: isInitializing.current // Local flag
    });

    // Conditions to *skip* initialization:
    // 1. If onDataLoaded has already been called by this instance.
    // 2. If the context already indicates data is loaded (isDataLoaded is true).
    // 3. If an initialization process is already running.
    if (hasCalledOnDataLoaded.current || isDataLoaded || isInitializing.current) {
      console.log("DataInitializer: Skipping initialization trigger.", {
         called: hasCalledOnDataLoaded.current,
         contextLoaded: isDataLoaded,
         initializing: isInitializing.current
      });
      // If context says loaded but we haven't called onDataLoaded (e.g., race condition), call it now.
      if (isDataLoaded && !hasCalledOnDataLoaded.current) {
          console.log("DataInitializer: Context loaded but local flag not set. Calling onDataLoaded.");
          hasCalledOnDataLoaded.current = true;
          onDataLoaded();
      }
      return;
    }

    // --- Proceed with initialization --- 
    const initialize = async () => {
      // Prevent concurrent runs within this instance
      if (isInitializing.current) return;
      isInitializing.current = true;
      console.log("DataInitializer: Starting data initialization...");

      try {
        // Check data count *again* right before fetching, in case it loaded between effects
        const currentAnalysesCount = Object.keys(allAnalyses).length;
        if (currentAnalysesCount > 0) {
           console.log(`DataInitializer: Found ${currentAnalysesCount} analyses just before fetch. Skipping fetch.`);
           if (!hasCalledOnDataLoaded.current) {
               hasCalledOnDataLoaded.current = true;
               onDataLoaded();
           }
        } else {
            console.log("DataInitializer: Calling loadCacheTableData()...");
            await loadCacheTableData(false); // forceRefresh = false
            console.log("DataInitializer: loadCacheTableData() finished.");
            // Effect 1 will handle calling onDataLoaded when allAnalyses updates
        }
      } catch (error) {
        console.error('DataInitializer: Error during data load:', error);
        toast({ variant: "destructive", title: "Error", description: "Failed to load initial analysis data.", duration: 7000 });
        onError("Failed to initialize data");
        // Ensure we don't get stuck waiting if an error occurs
        if (!hasCalledOnDataLoaded.current) {
          hasCalledOnDataLoaded.current = true; // Mark as 'done' even on error to prevent loops
        }
      } finally {
        console.log("DataInitializer: Initialization attempt finished.");
        isInitializing.current = false;
      }
    };

    initialize();

  }, [isDataLoaded, allAnalyses, loadCacheTableData, onDataLoaded, onError, toast]); // Dependencies

  // This component manages the loading process but renders nothing
  return null;
};

export default DataInitializer;