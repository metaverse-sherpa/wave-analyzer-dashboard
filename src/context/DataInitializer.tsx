import { FC, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useWaveAnalysis } from './WaveAnalysisContext';

interface DataInitializerProps {
  onDataLoaded: () => void;
  onError: (message: string) => void;
}

const DataInitializer: FC<DataInitializerProps> = ({ onDataLoaded, onError }) => {
  const { toast } = useToast();
  const { loadAllAnalysesFromSupabase, allAnalyses, isDataLoaded } = useWaveAnalysis();
  const hasCalledOnDataLoaded = useRef(false);
  const previousAnalysesCount = useRef(0);
  const loadAttempts = useRef(0);
  const maxLoadAttempts = 3;

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
        onDataLoaded();
      }
    }
    // Handle case where data is marked as loaded but no analyses found
    else if (isDataLoaded && analysesCount === 0) {
      console.warn("Data marked as loaded but no analyses found", {
        attempts: loadAttempts.current,
        maxAttempts: maxLoadAttempts
      });

      if (loadAttempts.current < maxLoadAttempts) {
        // Try loading again
        loadAttempts.current++;
        loadAllAnalysesFromSupabase().catch(error => {
          console.error('Retry attempt failed:', error);
        });
      } else if (!hasCalledOnDataLoaded.current) {
        console.error("Max load attempts reached with no data");
        onError("Failed to load analysis data after multiple attempts");
        hasCalledOnDataLoaded.current = true;
      }
    }
  }, [allAnalyses, isDataLoaded, loadAllAnalysesFromSupabase, onDataLoaded, onError]);

  useEffect(() => {
    const initializeData = async () => {
      if (!isDataLoaded) {
        try {
          await loadAllAnalysesFromSupabase();
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
        }
      }
    };

    initializeData();
  }, [isDataLoaded, loadAllAnalysesFromSupabase, onError, toast]);

  return null;
};

export default DataInitializer;