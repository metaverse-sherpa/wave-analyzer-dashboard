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
import { WaveAnalysisProvider, useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { HistoricalDataProvider } from '@/context/HistoricalDataContext';
import { useState, useEffect } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { KillSwitchProvider, useKillSwitch, KillSwitchContext } from './context/KillSwitchContext';
import DataInitializer from './context/DataInitializer';
import AdminDashboard from "./pages/Admin";
import { toast } from "@/components/ui/use-toast";
import AnalysisStatusTracker from './components/AnalysisStatusTracker';
import { initStorageMonitor } from '@/lib/storage-monitor';
import { AdminSettingsProvider } from '@/context/AdminSettingsContext';

// Initialize it before your app renders
if (process.env.NODE_ENV === 'development') {
  initStorageMonitor();
}

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
  // 1. Move ALL hooks to the top, before any conditional returns
  const [calculationKillSwitch, setCalculationKillSwitch] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  // Check if we're experiencing consistent crashes
  const crashCount = parseInt(localStorage.getItem('crash-count') || '0');
  const safeMode = crashCount > 3;

  // Add all your useEffect hooks here
  
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
      
      // Replace the CPU monitor with a more conservative approach
      const cpuMonitor = setInterval(() => {
        // Much simpler check that's less CPU intensive itself
        const start = Date.now();
        setTimeout(() => {
          const elapsed = Date.now() - start;
          // Only consider it high CPU usage if the delay is very significant
          if (elapsed > 2000) { // 2 seconds instead of 1
            console.warn('High CPU usage detected - throttling analysis');
            setCalculationKillSwitch(true);
            // Reset after recovery with longer timeout
            setTimeout(() => setCalculationKillSwitch(false), 10000); // 10 seconds cooldown
          }
        }, 100);
      }, 20000); // Check even less frequently - every 20 seconds
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        clearInterval(cpuMonitor);
      };
    }, 10000); // Wait 10 seconds before enabling CPU monitoring
    
    return () => clearTimeout(initialLoadDelay);
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
    const forceLoadTimeout = setTimeout(() => {
      if (loadState === 'loading') {
        console.log('Forcing app to load after timeout');
        setLoadState('success');
        
        toast({
          variant: "destructive",
          title: "Loading timeout",
          description: "The operation took too long to complete."
        });
      }
    }, 20000);
    
    return () => clearTimeout(forceLoadTimeout);
  }, [loadState]);

  // 2. AFTER all hooks are declared, then do conditional rendering
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

  // 3. Regular render return
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <KillSwitchContext.Provider value={{ killSwitch: calculationKillSwitch, setKillSwitch: setCalculationKillSwitch }}>
              <HistoricalDataProvider>
                <WaveAnalysisProvider>
                  <AdminSettingsProvider>
                    <AnalysisStatusTracker />
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
                              toast({
                                title: "Limited Functionality",
                                description: 'Data loading bypassed. Some features may be limited.',
                                variant: "default" // Changed from "warning"
                              });
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
                            <Route path="/admin" element={<AdminDashboard />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </BrowserRouter>
                      </ErrorBoundary>
                    )}
                    
                    <DataInitializer 
                      onDataLoaded={() => {
                        // Only update state if not already loaded
                        if (loadState === 'loading') {
                          console.log("Data successfully loaded from DataInitializer");
                          setLoadState('success');
                        }
                      }}
                      onError={(msg) => {
                        console.error("DataInitializer error:", msg);
                        // Still set success to allow app to load
                        if (loadState === 'loading') {
                          setLoadState('success');
                        }
                      }}
                    />
                    
                    {/* Your emergency buttons */}
                  </AdminSettingsProvider>
                </WaveAnalysisProvider>
              </HistoricalDataProvider>
            </KillSwitchContext.Provider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
