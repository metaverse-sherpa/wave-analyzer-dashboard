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
  
  // Add this at the top of the DataInitializer component (around line 25-30)
  const DISABLE_ALL_AUTO_INITIALIZATION = true; // Master switch to disable all initialization

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
        // Skip everything if the master disable flag is set
        if (DISABLE_ALL_AUTO_INITIALIZATION) {
          //console.log("Auto-initialization is disabled");
          setInitialized(true);
          onDataLoaded();
          return;
        }
        
        // Set a flag to indicate we're in initialization mode
        initializationInProgress.current = true;
        
        // Only log initialization start in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log("Starting data initialization...");
        }
        
        // Check if API is available - no logging here
        const apiStatus = await checkBackendHealth();
        
        // Always allow initialization to continue, with or without API
        const usingFallback = isUsingFallbackMode() || apiStatus.status === 'error';
        
        if (usingFallback) {
          // Only log when there's an actual issue
          console.log('API unavailable - switching to fallback mode');
          toast.warning(
            "Limited API Access: Using cached/generated data - some features may be limited",
            { duration: 5000 }
          );
        }
        // Removed the "API is available" log
    
        // Get list of symbols to load - use a smaller list if in fallback mode
        const MAX_SYMBOLS = usingFallback ? 5 : MAX_STOCKS_TO_INITIALIZE;
        const symbols = initialStocksList.slice(0, MAX_SYMBOLS);
        
    
    
        // Track success/failure for logging
        let successCount = 0;
        let failureCount = 0;
        
        // Add this flag near line 97 (before the historical data loading loop)
        // Add a config flag for historical data preloading (similar to wave analysis)
        const ENABLE_AUTO_DATA_LOADING = false;
        const dataSymbols = ENABLE_AUTO_DATA_LOADING ? symbols : [];
        
        // Then replace the existing historical data loading loop with:
        for (const symbol of dataSymbols) {
          try {
            // Try to get historical data, but don't block on errors
            await getHistoricalData(symbol, '1d', true)
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
    
        // Only log summary in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log(`Historical data preload complete. Success: ${successCount}, Failures: ${failureCount}`);
        }
        
        // Now attempt wave analysis with improved error handling
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log("Starting wave analysis...");
        }
        
        let analysisSuccessCount = 0;
        
        // Add a config flag that can be toggled if needed in the future
        const ENABLE_AUTO_ANALYSIS = false;
        const analysisSymbols = ENABLE_AUTO_ANALYSIS ? symbols.slice(0, 3) : [];
        
        for (const symbol of analysisSymbols) {
          try {
            // Get the data first without forcing refresh (use cache if available)
            const data = await getHistoricalData(symbol);
            
            // Only analyze if we have enough data
            if (data && data.length >= 50) {
              await getAnalysis(symbol, data);
              analysisSuccessCount++;
              // Only log in development mode
              if (process.env.NODE_ENV === 'development') {
                console.log(`Analysis complete for ${symbol}`);
              }
            } else {
              // Log this as it's an actual issue
              console.log(`Skipping analysis for ${symbol} - insufficient data (${data?.length || 0} points)`);
            }
          } catch (err) {
            // Log errors as they're important
            console.log(`Error analyzing ${symbol}:`, err instanceof Error ? err.message : String(err));
          }
          
          // Small delay between analyses
          await new Promise(resolve => setTimeout(resolve, 200));
        }
    
        // Only log summary in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log(`Wave analysis initialization complete. Analyzed ${analysisSuccessCount} of ${analysisSymbols.length} symbols`);
        }
        
        // Always mark as initialized, even if some steps failed
        setInitialized(true);
        onDataLoaded();
        
      } catch (error) {
        // Always log errors
        console.error('Data initialization error:', error);
        
        // Don't block the app, just notify the user there was an issue
        toast.error(
          "Data Initialization Issue: Some data may not be available. Using fallback where needed.",
          { duration: 7000 }
        );
        
        // Still mark as initialized so the app can proceed
        setInitialized(true);
        onDataLoaded();
      } finally {
        initializationInProgress.current = false;
      }
    };
    
    // Only run if not already initialized
    if (!initialized && !initializationInProgress.current && !safetyCalled.current) {
      initializationInProgress.current = true;
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