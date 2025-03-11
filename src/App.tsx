// At the top of App.tsx (before any imports)
// IMMEDIATE CPU ISSUE FIX
document.addEventListener('DOMContentLoaded', () => {
  // Force reload if the page takes too long to load
  const loadTimeout = setTimeout(() => {
    const memoryUsage = window.performance.memory?.usedJSHeapSize;
    // Only check memory if the browser supports it
    if (memoryUsage && memoryUsage > 200000000) { // 200MB
      localStorage.setItem('emergency-cpu-fix', 'true');
      window.location.reload();
    }
  }, 5000);
  
  // Clear the timeout once page is interactive
  window.addEventListener('load', () => clearTimeout(loadTimeout));
});

// At the top of your main entry file
// Check if we're in emergency mode
const isEmergencyMode = 
  localStorage.getItem('emergency-cpu-fix') === 'true' ||
  window.location.search.includes('light=true');

if (isEmergencyMode) {
  // Remove the flag to not permanently disable features
  localStorage.removeItem('emergency-cpu-fix');
  
  // In emergency mode, disable intensive features
  window.disableWaveAnalysis = true;
  window.sampleDataHeavily = true;
  console.warn('Running in light mode to reduce CPU usage');
}

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import Index from "./pages/Index";
import StockDetails from "./pages/StockDetails";
import NotFound from "./pages/NotFound";
import Dashboard from './components/Dashboard';
import WaveAnalysis, { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { HistoricalDataProvider } from '@/context/HistoricalDataContext';
import { useState, useEffect } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { KillSwitchProvider, useKillSwitch } from './context/KillSwitchContext';
import DataInitializer from './context/DataInitializer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const emergencyFixHighCPU = () => {
  // Clear any potentially problematic intervals or timeouts
  for (let i = 0; i < 10000; i++) {
    clearInterval(i);
    clearTimeout(i);
  }
  
  // Force garbage collection if possible
  if (window.gc) {
    window.gc();
  }
  
  // Store a flag in localStorage to prevent heavy analyses on next load
  localStorage.setItem('emergency-cpu-fix', 'true');
  
  // Reload the page with a simple URL parameter
  window.location.href = window.location.pathname + '?light=true';
};

const App = () => {
  const [calculationKillSwitch, setCalculationKillSwitch] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  // Check if we're experiencing consistent crashes
  const crashCount = parseInt(localStorage.getItem('crash-count') || '0');
  const safeMode = crashCount > 3;
  
  useEffect(() => {
    // Set a watchdog timer
    const watchdog = setTimeout(() => {
      // If this executes, the page didn't freeze
      localStorage.setItem('crash-count', '0');
    }, 10000);
    
    // Record an attempted load
    const currentCount = parseInt(localStorage.getItem('crash-count') || '0');
    localStorage.setItem('crash-count', (currentCount + 1).toString());
    
    return () => {
      clearTimeout(watchdog);
      localStorage.setItem('crash-count', '0');
    };
  }, []);
  
  if (safeMode) {
    return (
      <div className="p-8 max-w-md mx-auto mt-20">
        <h1 className="text-2xl font-bold mb-4">Safe Mode Activated</h1>
        <p className="mb-4">
          We detected that the app was crashing repeatedly. 
          We've loaded it in safe mode with minimal features.
        </p>
        <button
          onClick={() => {
            localStorage.setItem('crash-count', '0');
            window.location.reload();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Try Normal Mode
        </button>
        <button
          onClick={emergencyFixHighCPU}
          className="px-4 py-2 bg-red-600 text-white rounded ml-2"
        >
          Reset All Settings
        </button>
      </div>
    );
  }

  useEffect(() => {
    // Allow the initial data loading to happen before enabling CPU monitoring
    const initialLoadDelay = setTimeout(() => {
      console.log("Initial data load period complete, enabling CPU monitoring");
      
      // Only now set up the visibility change handler
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          setCalculationKillSwitch(true);
        } else {
          setCalculationKillSwitch(false);
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Simplified CPU monitor that runs less frequently
      let highCpuUsageCount = 0;
      const cpuMonitor = setInterval(() => {
        // Simpler check that's less CPU intensive
        const start = Date.now();
        setTimeout(() => {
          const elapsed = Date.now() - start;
          // Only consider it high CPU usage if the delay is very significant
          if (elapsed > 1000) { // More tolerance - 1 second
            console.warn('High CPU usage detected - throttling analysis');
            setCalculationKillSwitch(true);
            // Reset after recovery
            setTimeout(() => setCalculationKillSwitch(false), 5000);
          }
        }, 100);
      }, 10000); // Check even less frequently - every 10 seconds
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        clearInterval(cpuMonitor);
      };
    }, 10000); // Wait 10 seconds before enabling CPU monitoring
    
    return () => clearTimeout(initialLoadDelay);
  }, []);

  useEffect(() => {
    console.log('App component mounted');
    
    // Log the route
    console.log('Current path:', window.location.pathname);
    
    // Log if providers are initialized
    console.log('Providers ready:', {
      queryClient: !!queryClient,
      isEmergencyMode,
      calculationKillSwitch
    });
    
    // Check if DOM is ready
    console.log('DOM ready state:', document.readyState);
    
    // Report any pending errors
    console.log('Pending errors:', window.onerror);
  }, []);

  useEffect(() => {
    // Check if data is loaded every second
    const checkInterval = setInterval(() => {
      const hasAnalysisData = Object.keys(localStorage).some(key => key.startsWith('wave_analysis_'));
      if (hasAnalysisData) {
        setDataLoaded(true);
        clearInterval(checkInterval);
      }
    }, 1000);
    
    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    const checkApi = async () => {
      try {
        // Check if the API is available
        const response = await fetch('/api/health');
        if (response.ok) {
          setApiAvailable(true);
        } else {
          setApiAvailable(false);
        }
      } catch (error) {
        console.error("API health check failed:", error);
        setApiAvailable(false);
      }
    };
    
    checkApi();
  }, []);

  useEffect(() => {
    // Force the app to continue after 20 seconds regardless of loading state
    const forceLoadTimeout = setTimeout(() => {
      if (loadState === 'loading') {
        console.log('Forcing app to load after timeout');
        setLoadState('success');
        toast.warning('Data loading timed out, but app will continue. Some features may be limited.');
      }
    }, 20000);
    
    return () => clearTimeout(forceLoadTimeout);
  }, [loadState]);

  const { analyses, getAnalysis } = useWaveAnalysis();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <KillSwitchProvider>
              <HistoricalDataProvider>
                <WaveAnalysis.Provider killSwitch={calculationKillSwitch}>
                  {loadState === 'loading' ? (
                    <div className="flex items-center justify-center h-screen">
                      <div className="text-center p-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4 mx-auto"></div>
                        <h2 className="text-xl font-bold mb-2">Loading Data</h2>
                        <p className="text-muted-foreground mb-4">
                          Please wait while we load stock data and perform analysis...
                        </p>
                        
                        {apiAvailable === false && (
                          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4 text-left">
                            <p className="text-yellow-700">
                              <strong>Warning:</strong> The API server appears to be unavailable. 
                              The application will work with limited functionality.
                            </p>
                          </div>
                        )}
                        
                        <button
                          onClick={() => {
                            setLoadState('success');
                            toast.warning('Data loading bypassed. Some features may be limited.');
                          }}
                          className="mt-4 px-4 py-2 bg-muted text-muted-foreground rounded"
                        >
                          Skip Loading
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ErrorBoundary>
                      <Toaster />
                      <Sonner position="top-right" closeButton />
                      <BrowserRouter>
                        <Routes>
                          <Route path="/" element={<Index />} />
                          <Route path="/stocks/:symbol" element={<StockDetails />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </BrowserRouter>
                    </ErrorBoundary>
                  )}
                  
                  <DataInitializer 
                    onDataLoaded={() => {
                      console.log("Data successfully loaded from DataInitializer");
                      setLoadState('success');
                    }}
                    onError={(msg) => {
                      console.error("DataInitializer error:", msg);
                      // Still set success to allow app to load
                      setLoadState('success');
                    }}
                  />
                  
                  {/* Your emergency buttons */}
                </WaveAnalysis.Provider>
              </HistoricalDataProvider>
            </KillSwitchProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
