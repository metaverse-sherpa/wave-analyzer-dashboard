import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from 'react-router-dom';
import { getAllAnalyses, clearAllAnalyses } from '@/services/databaseService';
import { getAllHistoricalData } from '@/services/cacheService'; // Get the Supabase version
import { toast } from '@/lib/toast';
import { ArrowLeft, Trash2, RefreshCw, Database, Clock, BarChart3, Activity, LineChart, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Wave } from '@/types/shared';
import ApiStatusCheck from '@/components/ApiStatusCheck';
import { topStockSymbols } from '@/services/yahooFinanceService';
import { clearMemoCache } from '@/utils/elliottWaveAnalysis';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import { migrateFromLocalStorage } from '@/services/cacheService';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { X } from 'lucide-react';

interface ActiveAnalysis {
  symbol: string;
  startTime: number;
  waves: Wave[];
  status: 'running' | 'completed' | 'error';
}

// Add this utility function at the top of your component or in a separate utils file
const normalizeTimestamp = (timestamp: number): number => {
  // If timestamp is in seconds (before year 2001), convert to milliseconds
  return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
};

const AdminDashboard = () => {
  // State and context hooks remain at the top
  const [cacheData, setCacheData] = useState<{
    waves: Record<string, any>;
    historical: Record<string, any>;
  }>({
    waves: {},
    historical: {}
  });
  const [selectedData, setSelectedData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeAnalyses, setActiveAnalyses] = useState<Record<string, ActiveAnalysis>>({});
  const [historicalData, setHistoricalData] = useState<Record<string, any>>({});
  const [waveAnalyses, setWaveAnalyses] = useState<Record<string, any>>({});
  const [analysisProgress, setAnalysisProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false
  });

  // Add this state variable with the other state variables
  const [historyLoadProgress, setHistoryLoadProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false
  });

  // Add this state at the top with other state variables
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking' | 'degraded'>('checking');

  // Add this state to track the active tab
  const [activeTab, setActiveTab] = useState<string>("historical");

  // Add this state at the top of your component
  const [modalOpen, setModalOpen] = useState(false);

  // Context hooks
  const { analysisEvents, getAnalysis, cancelAllAnalyses, clearCache } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData();

  // Fix loadCacheData function - it's incomplete in your code
const loadCacheData = useCallback(async () => {
  setIsRefreshing(true);
  try {
    // Query all wave analysis entries from Supabase
    const { data: waveData, error: waveError } = await supabase
      .from('cache')
      .select('key, data, timestamp')
      .like('key', 'wave_analysis_%');
      
    // Query all historical data entries from Supabase  
    const { data: histData, error: histError } = await supabase
      .from('cache')
      .select('key, data, timestamp')
      .like('key', 'historical_data_%');
    
    if (waveError) throw waveError;
    if (histError) throw histError;
    
    // Process wave analysis data
    const waveAnalyses = {};
    if (waveData) {
      for (const item of waveData) {
        const key = item.key.replace('wave_analysis_', '');
        waveAnalyses[key] = {
          analysis: item.data,
          timestamp: item.timestamp
        };
      }
    }
    
    // Process historical data
    const historicalData = {};
    if (histData) {
      for (const item of histData) {
        const key = item.key.replace('historical_data_', '');
        historicalData[key] = {
          data: item.data,
          timestamp: item.timestamp
        };
      }
    }
    
    setWaveAnalyses(waveAnalyses);
    setHistoricalData(historicalData);
    
  } catch (error) {
    console.error('Error loading cache data from Supabase:', error);
    toast.error('Failed to load data from Supabase');
  } finally {
    setIsRefreshing(false);
  }
}, [supabase]);

  // 2. NOW define functions that depend on loadCacheData
  const analyzeWaves = useCallback(async () => {
    setActiveTab("waves");
    setIsRefreshing(true);
    try {
      // Get historical data directly from Supabase
      const { data: histData, error: histError } = await supabase
        .from('cache')
        .select('key')
        .like('key', 'historical_data_%');
        
      if (histError) throw histError;
      
      // Process the keys to get symbols
      const stocksToAnalyze = (histData || [])
        .map(item => item.key.replace('historical_data_', ''))
        .filter(key => key.includes('_1d'))
        .map(key => key.split('_')[0]);
      
      if (stocksToAnalyze.length === 0) {
        toast.error('No historical data found in Supabase. Please preload historical data first.');
        setIsRefreshing(false);
        return;
      }
      
      // Initialize progress tracking
      setAnalysisProgress({
        total: stocksToAnalyze.length,
        current: 0,
        inProgress: true
      });
      
      // Process stocks one by one with a small delay between them
      let completed = 0;
      
      for (const symbol of stocksToAnalyze) {
        console.log(`Analyzing ${symbol}...`);
        try {
          // Use the cached historical data - this will get from Supabase now
          const historicalData = await getHistoricalData(symbol, '1d');
          
          // Require at least 50 data points for analysis
          if (!historicalData || historicalData.length < 50) {
            console.warn(`Insufficient data for ${symbol}: only ${historicalData?.length || 0} data points`);
            continue; // Skip this stock without incrementing completed
          }
          
          // Now analyze with validated data
          await getAnalysis(symbol, historicalData, true, true); // Added silent parameter
          
          // Update progress
          completed++;
          setAnalysisProgress(prev => ({
            ...prev,
            current: completed
          }));
          
          // Small delay between stocks to prevent performance issues
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.error(`Failed to analyze ${symbol}`, err);
        }
      }
      
      // Finish up
      loadCacheData();
      toast.success(`Wave analysis completed for ${completed} stocks`);
    } catch (error) {
      console.error('Error analyzing waves:', error);
      toast.error('Failed to analyze waves');
    } finally {
      // Reset progress
      setAnalysisProgress({
        total: 0,
        current: 0,
        inProgress: false
      });
      setIsRefreshing(false);
    }
  }, [getAnalysis, getHistoricalData, loadCacheData, supabase]);

  // Function to preload historical data for top stocks
  const preloadHistoricalData = useCallback(async () => {
    // Make the historical tab active
    setActiveTab("historical");
    
    setIsRefreshing(true);
    try {
      // Use all stocks from the topStockSymbols array
      const stocks = topStockSymbols;
      
      // Initialize progress tracking
      setHistoryLoadProgress({
        total: stocks.length,
        current: 0,
        inProgress: true
      });
      
      // Track progress for user feedback
      let completed = 0;
      let failed = 0;
      
      // Process stocks in batches to avoid overwhelming the browser
      const batchSize = 5;
      for (let i = 0; i < stocks.length; i += batchSize) {
        const batch = stocks.slice(i, i + batchSize);
        
        // Process each stock in the batch concurrently
        await Promise.all(batch.map(async (symbol) => {
          try {
            // Fetch historical data directly
            const response = await fetch(`/api/stocks/historical/${symbol}?timeframe=1d`);
            
            if (!response.ok) {
              throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Format the data to match our expected format
            const historicalData = data.map(item => ({
              timestamp: typeof item.timestamp === 'string' ? new Date(item.timestamp).getTime() : item.timestamp,
              open: Number(item.open),
              high: Number(item.high),
              low: Number(item.low),
              close: Number(item.close),
              volume: Number(item.volume || 0)
            }));
            
            // Store directly to Supabase with a 7-day cache duration
            const cacheKey = `historical_data_${symbol}_1d`;
            await supabase
              .from('cache')
              .upsert({
                key: cacheKey,
                data: historicalData,
                timestamp: Date.now(),
                duration: 7 * 24 * 60 * 60 * 1000, // 7 days
                is_string: false
              }, { onConflict: 'key' });
              
            completed++;
            
            // Update progress
            setHistoryLoadProgress(prev => ({
              ...prev,
              current: completed
            }));
            
            console.log(`Stored ${symbol} data in Supabase (${historicalData.length} points)`);
          } catch (error) {
            console.error(`Failed to load data for ${symbol}:`, error);
            failed++;
          }
        }));
        
        // Small delay between batches to allow UI to remain responsive
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Refresh the cache display
      loadCacheData();
      
      // Show final status
      if (failed > 0) {
        toast.warning(`Historical data stored in Supabase with some issues: ${completed} succeeded, ${failed} failed`);
      } else {
        toast.success(`Historical data stored in Supabase successfully for all ${completed} stocks`);
      }
    } catch (error) {
      console.error('Error preloading historical data:', error);
      toast.error('Failed to preload historical data');
    } finally {
      // Reset progress
      setHistoryLoadProgress({
        total: 0,
        current: 0,
        inProgress: false
      });
      setIsRefreshing(false);
    }
  }, [loadCacheData, supabase]);

  // Calculate cache statistics using useMemo
  const cacheStats = useMemo(() => ({
    waveEntryCount: Object.keys(waveAnalyses).length,
    histEntryCount: Object.keys(historicalData).length,
    totalSize: Math.round(
      (
        JSON.stringify(waveAnalyses || {}).length +
        JSON.stringify(historicalData || {}).length
      ) / 1024
    ),
    oldestWave: Object.entries(waveAnalyses).reduce((oldest, [key, data]) => {
      return data.timestamp < oldest.timestamp ? { key, timestamp: data.timestamp } : oldest;
    }, { key: '', timestamp: Date.now() }),
    oldestHistorical: Object.entries(historicalData).reduce((oldest, [key, data]) => {
      return data.timestamp < oldest.timestamp ? { key, timestamp: data.timestamp } : oldest;
    }, { key: '', timestamp: Date.now() })
  }), [waveAnalyses, historicalData]);

  // Handlers
  // Title effect
  useEffect(() => {
    document.title = "EW Analyzer - Admin";
    return () => {
      document.title = "EW Analyzer";
    };
  }, []);

  // Make sure loadCacheData sets a default empty state
  useEffect(() => {
    loadCacheData();
  }, []);
  
  // Format timestamps for readability
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };
  
  // Calculate how old data is
  const getAgeString = (timestamp: number) => {
    const ageMs = Date.now() - timestamp;
    const ageMinutes = Math.round(ageMs / (1000 * 60));
    
    if (ageMinutes < 60) {
      return `${ageMinutes} min ago`;
    } else if (ageMinutes < 1440) { // 24 hours
      return `${Math.round(ageMinutes / 60)} hours ago`;
    } else {
      return `${Math.round(ageMinutes / 1440)} days ago`;
    }
  };
  
  // Format data for display
  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2);
  };
  
  // Clear wave analysis cache from Supabase
  const clearWaveCache = async () => {
    if (window.confirm('Are you sure you want to clear all wave analysis cache? This will also cancel any ongoing analyses.')) {
      // Make the waves tab active after confirmation
      setActiveTab("waves");
      setIsRefreshing(true);
      try {
        // Cancel any running analyses first
        cancelAllAnalyses();
        
        // Use the clearCache from context (which might handle some cache)
        clearCache();
        
        // Delete all wave analysis entries from Supabase
        const { error } = await supabase
          .from('cache')
          .delete()
          .like('key', 'wave_analysis_%');
        
        if (error) {
          throw error;
        }
        
        // Update display
        await loadCacheData();
        toast.success('Wave analysis cache cleared successfully from Supabase');
      } catch (error) {
        console.error('Error clearing wave cache from Supabase:', error);
        toast.error('Failed to clear wave analysis cache');
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Clear historical data cache from Supabase
  const clearHistoricalCache = async () => {
    if (window.confirm('Are you sure you want to clear all historical data cache?')) {
      // Make the historical tab active after confirmation
      setActiveTab("historical");
      setIsRefreshing(true);
      try {
        // Delete all historical data entries from Supabase
        const { error } = await supabase
          .from('cache')
          .delete()
          .like('key', 'historical_data_%');
        
        if (error) {
          throw error;
        }
        
        await loadCacheData();
        toast.success('Historical data cache cleared successfully from Supabase');
      } catch (error) {
        console.error('Error clearing historical cache from Supabase:', error);
        toast.error('Failed to clear historical data cache');
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Delete a single item from cache
  const deleteCacheItem = async (key: string, type: 'waves' | 'historical') => {
    if (window.confirm(`Are you sure you want to delete ${key}?`)) {
      try {
        const storageKey = type === 'waves' 
          ? `wave_analysis_${key}`
          : `historical_data_${key}`;
          
        // Delete from Supabase instead of localStorage
        const { error } = await supabase
          .from('cache')
          .delete()
          .eq('key', storageKey);
        
        if (error) {
          throw error;
        }
        
        await loadCacheData();
        toast.success(`Deleted ${key} from Supabase cache`);
        if (selectedData?.key === key) {
          setSelectedData(null);
        }
      } catch (error) {
        console.error(`Error deleting ${key}:`, error);
        toast.error(`Failed to delete ${key}`);
      }
    }
  };

  // Add this in loadCacheData or somewhere appropriate
  const debugStorageContents = async () => {
    console.log("===== DEBUG: Supabase cache contents =====");
    
    try {
      // Query wave analysis data from Supabase instead of localStorage
      const { data: waveAnalysisData, error } = await supabase
        .from('cache')
        .select('key, data')
        .like('key', 'wave_analysis_%');
      
      if (error) {
        console.error("Error fetching cache data:", error);
        return;
      }
      
      // Log each item from Supabase
      waveAnalysisData?.forEach(item => {
        console.log(`${item.key}: ${item.data?.waves?.length || 0} waves`);
      });
      
    } catch (e) {
      console.error("Error in debugStorageContents:", e);
    }
    
    console.log("======================================");
  };

  // Call it after loadCacheData()
  useEffect(() => {
    // Call the debug function when component mounts
    debugStorageContents();
  }, []); // Empty dependency array means this runs once on mount

  // Use useEffect to respond to changes in analysisEvents
  useEffect(() => {
    // Find any new events that we need to handle
    if (!analysisEvents || analysisEvents.length === 0) return;
    
    // Get the most recent event (they should be ordered newest first)
    const latestEvent = analysisEvents[0];
    
    if (latestEvent.status === 'started') {
      // Handle analysis start
      setActiveAnalyses(prev => {
        if (!latestEvent.symbol) return prev;
        
        // Create a properly typed object
        const newAnalysis: ActiveAnalysis = {
          symbol: latestEvent.symbol,
          startTime: latestEvent.timestamp,
          waves: [],
          status: 'running'
        };
        
        // Return with proper type
        return {
          ...prev,
          [latestEvent.symbol]: newAnalysis
        };
      });
    }
    else if (latestEvent.status === 'completed') {
      // Handle analysis complete
      setActiveAnalyses(prev => {
        if (!prev[latestEvent.symbol]) return prev;
        
        // Create a properly typed updated object
        const updated: Record<string, ActiveAnalysis> = {
          ...prev,
          [latestEvent.symbol]: {
            ...prev[latestEvent.symbol],
            status: 'completed' as const  // Use a literal with const assertion
          }
        };
        
        // Load the completed analysis data
        getAnalysis(latestEvent.symbol, [])
          .then(analysis => {
            if (analysis && analysis.waves) {
              setActiveAnalyses(current => ({
                ...current,
                [latestEvent.symbol]: {
                  ...current[latestEvent.symbol],
                  waves: analysis.waves
                }
              }));
            }
          });
        
        // Refresh cache data
        loadCacheData();
        
        // Remove from active analyses after delay
        setTimeout(() => {
          setActiveAnalyses(current => {
            const next = {...current};
            delete next[latestEvent.symbol];
            return next;
          });
        }, 10000);
        
        return updated;
      });
    }
    else if (latestEvent.status === 'error' && latestEvent.message === 'Analysis canceled by user') {
      // Handle analysis error
      setActiveAnalyses(prev => {
        if (!prev[latestEvent.symbol]) return prev;
        
        return {
          ...prev,
          [latestEvent.symbol]: {
            ...prev[latestEvent.symbol],
            status: 'error'
          }
        };
      });
    }
    // Special case for cancel all
    else if (latestEvent.status === 'error' && latestEvent.message === 'Analysis canceled by user') {
      // Clear all active analyses
      setActiveAnalyses({});
      toast.info('All analyses cancelled');
    }
  }, [analysisEvents, getAnalysis, loadCacheData]);

  const handleMigration = async () => {
    if (window.confirm('Do you want to migrate data from localStorage to Supabase?')) {
      setIsRefreshing(true);
      try {
        await migrateFromLocalStorage();
        toast.success('Data migrated to Supabase successfully');
      } catch (error) {
        console.error('Migration failed:', error);
        toast.error('Failed to migrate data to Supabase');
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Add this function to your Admin component
  const clearAllSupabase = async () => {
    if (window.confirm('This will completely clear ALL Supabase cache data. Are you sure?')) {
      try {
        setIsRefreshing(true);
        await clearCache(); // Use your existing clearCache function
        toast.success('All Supabase cache data has been cleared');
      } catch (error) {
        console.error('Error clearing Supabase data:', error);
        toast.error('Failed to clear Supabase data');
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Add a function to refresh API status
  const refreshApiStatus = useCallback(async () => {
    try {
      // Make a lightweight request to your API health endpoint
      const response = await fetch('/api/health');
      if (response.ok) {
        setApiStatus('online');
      } else {
        setApiStatus('offline');
      }
    } catch (error) {
      console.error('API status check failed:', error);
      setApiStatus('offline');
    }
  }, []);

  // Set up the refresh interval - refresh every 5 minutes
  useEffect(() => {
    // Initial check
    refreshApiStatus();
    
    // Set up interval (5 minutes = 300000ms)
    const intervalId = setInterval(refreshApiStatus, 300000);
    
    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, [refreshApiStatus]);

  // Add this wrapper function
  const handleStatusChange = (status: 'online' | 'offline' | 'checking' | 'degraded') => {
    // Map 'degraded' to 'offline' and pass through other statuses
    if (status === 'degraded') {
      setApiStatus('offline');
    } else {
      setApiStatus(status as 'online' | 'offline' | 'checking');
    }
  };

  // Update your disabled state to include degraded status
  const isButtonDisabled = isRefreshing || apiStatus === 'offline' || apiStatus === 'degraded';

  return (
    <div className="container mx-auto p-4">
      {/* Header section */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Link to="/">
            <Button variant="ghost" size="icon" className="mr-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <Badge variant="secondary" className="ml-2">System Administrator</Badge>
        </div>
        
        <div>
          <Button 
            variant="outline" 
            onClick={loadCacheData} 
            className="mr-2"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>
      
      {/* Main dashboard in two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-1">
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Cache Management
              </CardTitle>
              <CardDescription>Clear and maintain cached data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Historical Data section */}
              <Button 
                onClick={preloadHistoricalData}
                variant="default"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                <Database className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Loading...' : 'Load Historical Data'}
              </Button>
              
              <Button 
                onClick={clearHistoricalCache}
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isRefreshing || cacheStats.histEntryCount === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Historical Data
              </Button>
              
              {/* Separator for visual grouping */}
              <div className="border-t my-1"></div>
              
              {/* Wave Analysis section */}
              <Button 
                onClick={analyzeWaves}
                variant="default"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                <Activity className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Analyzing...' : 'Analyze Waves'}
              </Button>
              
              <Button 
                onClick={clearWaveCache}
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Wave Analysis
              </Button>
              
            </CardContent>
          </Card>


        </div>
        
        {/* Right column - Tabs */}
        <div className="col-span-1 lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="historical">
                <Clock className="h-4 w-4 mr-2" />
                Historical Data Cache
              </TabsTrigger>
              <TabsTrigger value="waves">
                <BarChart3 className="h-4 w-4 mr-2" />
                Wave Analysis Cache
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="waves" className="border rounded-md p-4 min-h-[500px]">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium">
                  Wave Analysis Data ({cacheStats.waveEntryCount})
                </h3>
                
                {/* Add progress indicator next to title */}
                {analysisProgress.inProgress && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Processing {analysisProgress.current}/{analysisProgress.total}
                  </Badge>
                )}
              </div>
              
              {/* Add progress bar under the title */}
              {analysisProgress.inProgress && (
                <div className="mb-4 space-y-1">
                  <Progress
                    value={(analysisProgress.current / analysisProgress.total) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {Math.round((analysisProgress.current / analysisProgress.total) * 100)}% complete
                  </p>
                </div>
              )}
              
              <ScrollArea className="h-[500px]">
                {isRefreshing ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Updating wave analysis data...
                  </div>
                ) : Object.keys(waveAnalyses || {}).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No wave analysis cache data found
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(waveAnalyses || {}).map(([key, data]) => (
                      <Card key={key} className="cursor-pointer hover:bg-accent/5 transition-colors">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div 
                            className="flex-1"
                            onClick={() => {
                              setSelectedData({ type: 'waves', key, data });
                              setModalOpen(true); // Open the modal
                            }}
                          >
                            <div className="flex justify-between">
                              <span className="font-medium">{key}</span>
                              <span className="text-sm text-muted-foreground">
                                {/* Add null checks here */}
                                {data?.analysis?.waves?.length || 0} waves
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground flex justify-between mt-1">
                              <span>
                                {formatTime(data?.timestamp || Date.now())}
                              </span>
                              <span>
                                {getAgeString(data?.timestamp || Date.now())}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCacheItem(key, 'waves');
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="historical" className="border rounded-md p-4 min-h-[500px]">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium">
                  Historical Price Data ({cacheStats.histEntryCount})
                </h3>
                
                {/* Add progress indicator next to title */}
                {historyLoadProgress.inProgress && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading {historyLoadProgress.current}/{historyLoadProgress.total}
                  </Badge>
                )}
              </div>
              
              {/* Add progress bar under the title */}
              {historyLoadProgress.inProgress && (
                <div className="mb-4 space-y-1">
                  <Progress
                    value={(historyLoadProgress.current / historyLoadProgress.total) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {Math.round((historyLoadProgress.current / historyLoadProgress.total) * 100)}% complete
                  </p>
                </div>
              )}
              
              <ScrollArea className="h-[500px]">
                {Object.keys(historicalData || {}).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No historical data cache found
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(historicalData || {}).map(([key, data]) => (
                      <Card key={key} className="cursor-pointer hover:bg-accent/5 transition-colors">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div 
                            className="flex-1"
                            onClick={() => {
                              setSelectedData({ type: 'historical', key, data });
                              setModalOpen(true); // Open the modal
                            }}
                          >
                            <div className="flex justify-between">
                              <span className="font-medium">{key}</span>
                              <span className="text-sm text-muted-foreground">
                                {/* Add null checks here */}
                                {data?.data?.length || 0} points
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground flex justify-between mt-1">
                              <span>
                                {formatTime(data?.timestamp || Date.now())}
                              </span>
                              <span>
                                {getAgeString(data?.timestamp || Date.now())}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCacheItem(key, 'historical');
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Add this data inspection modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex justify-between items-center">
              <DialogTitle className="flex items-center gap-2">
                {selectedData && (
                  <>
                    <Badge variant={selectedData.type === 'waves' ? 'default' : 'secondary'}>
                      {selectedData.type === 'waves' ? 'Wave Analysis' : 'Historical Data'}
                    </Badge>
                    {selectedData.key}
                  </>
                )}
              </DialogTitle>
            </div>
            <DialogDescription>
              {selectedData && formatTime(selectedData.data.timestamp)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedData && (
            <ScrollArea className="h-[60vh] border rounded-md p-2 font-mono text-xs">
              <pre className="whitespace-pre-wrap">{formatJson(selectedData.data)}</pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;