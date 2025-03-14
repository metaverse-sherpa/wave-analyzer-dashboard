import React, { useEffect, useRef, useState } from 'react';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext'; 
import { checkBackendHealth, isUsingFallbackMode } from '@/services/yahooFinanceService';
import { toast } from '@/lib/toast';

// Add these constants if they're not defined elsewhere:
const initialStocksList = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META'];
const MAX_STOCKS_TO_INITIALIZE = 5;

interface DataInitializerProps {
  onDataLoaded: () => void;
  onError: (message: string) => void;
}

const DataInitializer: React.FC<DataInitializerProps> = ({ onDataLoaded, onError }) => {
  const { getAnalysis, preloadAnalyses, analyses } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData(); // Add this to get the missing function
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
      try {
        // Set a flag to indicate we're in initialization mode
        console.log("Starting data initialization...");
        
        // Check if API is available 
        console.log("Checking API health...");
        const apiStatus = await checkBackendHealth();
        
        // Always allow initialization to continue, with or without API
        const usingFallback = isUsingFallbackMode() || apiStatus.status === 'error';
        
        if (usingFallback) {
          console.log('API unavailable - switching to fallback mode');
          toast.warning(
            "Limited API Access: Using cached/generated data - some features may be limited",
            { duration: 5000 }
          );
        } else {
          console.log('API is available, using live data');
        }
    
        // Get list of symbols to load - use a smaller list if in fallback mode
        const MAX_SYMBOLS = usingFallback ? 5 : MAX_STOCKS_TO_INITIALIZE;
        const symbols = initialStocksList.slice(0, MAX_SYMBOLS);
        console.log(`Initializing data for ${symbols.length} symbols`);
    
        // Track success/failure for logging
        let successCount = 0;
        let failureCount = 0;
        
        // If in fallback mode, we'll mainly use cached/generated data
        // But we still try to fetch some data to see if API comes back online
        
        // First, preload all historical data with longer time period
        console.log("Preloading historical data...");
        for (const symbol of symbols) {
          try {
            // Try to get historical data, but don't block on errors
            await getHistoricalData(symbol, '1wk', true)
              .catch(err => {
                console.log(`Using generated data for ${symbol} (API unavailable)`);
                return []; // Continue with empty array on failure
              });
            
            successCount++;
          } catch (err) {
            failureCount++;
            // Continue with next symbol
          }
          
          // Add a small delay between requests to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        }
    
        console.log(`Historical data preload complete. Success: ${successCount}, Failures: ${failureCount}`);
        
        // Now attempt wave analysis with improved error handling
        console.log("Starting wave analysis...");
        let analysisSuccessCount = 0;
        
        // Process a smaller batch of symbols for wave analysis
        const analysisSymbols = symbols.slice(0, 3); // Just do 3 symbols initially
        
        for (const symbol of analysisSymbols) {
          try {
            // Get the data first without forcing refresh (use cache if available)
            const data = await getHistoricalData(symbol);
            
            // Only analyze if we have enough data
            if (data && data.length >= 50) {
              await getAnalysis(symbol, data);
              analysisSuccessCount++;
              console.log(`Analysis complete for ${symbol}`);
            } else {
              console.log(`Skipping analysis for ${symbol} - insufficient data (${data?.length || 0} points)`);
            }
          } catch (err) {
            console.log(`Error analyzing ${symbol}:`, err instanceof Error ? err.message : String(err));
          }
          
          // Small delay between analyses
          await new Promise(resolve => setTimeout(resolve, 200));
        }
    
        console.log(`Wave analysis initialization complete. Analyzed ${analysisSuccessCount} of ${analysisSymbols.length} symbols`);
        
        // Always mark as initialized, even if some steps failed
        setInitialized(true);
        onDataLoaded();
        
      } catch (error) {
        console.error('Data initialization error:', error);
        
        // Don't block the app, just notify the user there was an issue
        toast.error(
          "Data Initialization Issue: Some data may not be available. Using fallback where needed.",
          { duration: 7000 }
        );
        
        // Still mark as initialized so the app can proceed
        setInitialized(true);
        onDataLoaded();
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