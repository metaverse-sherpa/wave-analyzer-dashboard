import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from 'react-router-dom';
import { getAllAnalyses, getAllHistoricalData, clearAllAnalyses } from '@/services/databaseService';
import { toast } from '@/lib/toast';
import { ArrowLeft, Trash2, RefreshCw, Database, Clock, BarChart3, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Wave } from '@/types/shared';
import ApiStatusCheck from '@/components/ApiStatusCheck';
import { topStockSymbols } from '@/services/yahooFinanceService';
import { clearMemoCache } from '@/utils/elliottWaveAnalysis';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import { migrateFromLocalStorage } from '@/services/cacheService';

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

  // Context hooks
  const { analysisEvents, getAnalysis, cancelAllAnalyses, clearCache } = useWaveAnalysis();
  const { getHistoricalData, preloadHistoricalData: contextPreloadHistoricalData } = useHistoricalData();

  // 1. MOVE loadCacheData definition BEFORE any functions that depend on it
  const loadCacheData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const analyses = await getAllAnalyses() || {};
      const historicalData = await getAllHistoricalData() || {};
      
      setWaveAnalyses(analyses);
      setHistoricalData(historicalData);
    } catch (error) {
      console.error('Error loading cache data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 2. NOW define functions that depend on loadCacheData
  const analyzeWaves = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Get all historical data cache keys
      const cachedHistorical = await getAllHistoricalData() || {};
      const stocksToAnalyze = Object.keys(cachedHistorical)
        .filter(key => key.includes('_1d')) // Only use daily timeframe data
        .map(key => key.split('_')[0]); // Extract symbol from key format "SYMBOL_TIMEFRAME"
      
      if (stocksToAnalyze.length === 0) {
        toast.error('No historical data found. Please preload historical data first.');
        setIsRefreshing(false);
        return;
      }
      
      toast.success(`Starting wave analysis for ${stocksToAnalyze.length} stocks with cached data...`);
      
      // Process stocks one by one with a small delay between them
      for (const symbol of stocksToAnalyze) {
        console.log(`Analyzing ${symbol}...`);
        try {
          // Use the cached historical data
          const historicalData = await getHistoricalData(symbol, '1d');
          
          // Require at least 50 data points for analysis
          if (!historicalData || historicalData.length < 50) {
            console.warn(`Insufficient data for ${symbol}: only ${historicalData?.length || 0} data points`);
            toast.warning(`Skipping ${symbol} - insufficient data points (${historicalData?.length || 0})`);
            continue; // Skip this stock
          }
          
          // Now analyze with validated data
          await getAnalysis(symbol, historicalData, true); // Force refresh for admin analysis
          
          // Small delay between stocks to prevent performance issues
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.error(`Failed to analyze ${symbol}`, err);
        }
      }
      
      loadCacheData();
      toast.success(`Wave analysis completed for ${stocksToAnalyze.length} stocks`);
    } catch (error) {
      console.error('Error analyzing waves:', error);
      toast.error('Failed to analyze waves');
    } finally {
      setIsRefreshing(false);
    }
  }, [getAnalysis, getHistoricalData, loadCacheData, getAllHistoricalData]);

  // Function to preload historical data for top stocks
  const preloadHistoricalData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Use all stocks from the topStockSymbols array
      const stocks = topStockSymbols;
      
      toast.success(`Fetching historical data for ${stocks.length} stocks...`);
      
      // Track progress for user feedback
      let completed = 0;
      let failed = 0;
      
      // Process stocks in batches to avoid overwhelming the browser
      const batchSize = 5;
      for (let i = 0; i < stocks.length; i += batchSize) {
        const batch = stocks.slice(i, i + batchSize);
        
        // Show progress update every batch
        toast.info(`Processing stocks ${i+1}-${Math.min(i+batchSize, stocks.length)} of ${stocks.length}...`, {
          id: 'preload-progress',
          duration: 2000
        });
        
        // Process each stock in the batch concurrently
        await Promise.all(batch.map(async (symbol) => {
          try {
            await getHistoricalData(symbol, '1d', true);
            completed++;
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
        toast.warning(`Historical data preloaded with some issues: ${completed} succeeded, ${failed} failed`);
      } else {
        toast.success(`Historical data preloaded successfully for all ${completed} stocks`);
      }
    } catch (error) {
      console.error('Error preloading historical data:', error);
      toast.error('Failed to preload historical data');
    } finally {
      setIsRefreshing(false);
    }
  }, [getHistoricalData, loadCacheData]);

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
  
  // Clear wave analysis cache
  const clearWaveCache = () => {
    if (window.confirm('Are you sure you want to clear all wave analysis cache? This will also cancel any ongoing analyses.')) {
      setIsRefreshing(true);
      try {
        // Cancel any running analyses first
        cancelAllAnalyses();
        
        // Use the clearCache from context (which might handle some cache)
        clearCache();
        
        // Also manually clear all localStorage entries with any wave-related prefixes
        // This ensures we catch all cache formats across the application
        Object.keys(localStorage).forEach(key => {
          // Clear both formats: 'wave_analysis_' and 'wave-analysis:'
          if (key.startsWith('wave_analysis_') || 
              key.startsWith('wave-analysis:') ||
              key.includes('_waves_') ||
              key.includes('wave-pattern')) {
            localStorage.removeItem(key);
          }
        });
        
        // Also clear memo cache from Elliott wave analysis
        clearMemoCache();
        
        // Update display
        loadCacheData();
        toast.success('Wave analysis cache cleared successfully');
        
        console.log("All wave caches cleared");
      } catch (error) {
        console.error('Error clearing wave cache:', error);
        toast.error('Failed to clear wave analysis cache');
      } finally {
        setIsRefreshing(false);
      }
    }
  };
  
  // Clear historical data cache
  const clearHistoricalCache = () => {
    if (window.confirm('Are you sure you want to clear all historical data cache?')) {
      setIsRefreshing(true);
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('historical_data_')) {
            localStorage.removeItem(key);
          }
        });
        loadCacheData();
        toast.success('Historical data cache cleared successfully');
      } catch (error) {
        console.error('Error clearing historical cache:', error);
        toast.error('Failed to clear historical data cache');
      } finally {
        setIsRefreshing(false);
      }
    }
  };
  
  // Delete a single item from cache
  const deleteCacheItem = (key: string, type: 'waves' | 'historical') => {
    if (window.confirm(`Are you sure you want to delete ${key}?`)) {
      try {
        const storageKey = type === 'waves' 
          ? `wave_analysis_${key}`
          : `historical_data_${key}`;
          
        localStorage.removeItem(storageKey);
        loadCacheData();
        toast.success(`Deleted ${key} from cache`);
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
  const debugStorageContents = () => {
    //console.log("===== DEBUG: localStorage contents =====");
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('wave_analysis_')) {
        const data = localStorage.getItem(key);
        const parsed = JSON.parse(data || '{}');
        //console.log(`${key}: ${parsed.waves?.length || 0} waves`);
      }
    });
    //console.log("======================================");
  };

  // Call it after loadCacheData()
  debugStorageContents();

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Cache Statistics
              </CardTitle>
              <CardDescription>Overview of cached data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Wave Analysis Entries:</span>
                  <Badge variant="outline">{cacheStats.waveEntryCount}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Historical Data Entries:</span>
                  <Badge variant="outline">{cacheStats.histEntryCount}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Total Cache Size:</span>
                  <Badge variant="outline">{cacheStats.totalSize} KB</Badge>
                </div>
                
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Cache Utilization</p>
                  <Progress value={Math.min(cacheStats.totalSize / 50, 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {cacheStats.totalSize} KB of ~5000 KB recommended max
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Cache Management
              </CardTitle>
              <CardDescription>Clear and maintain cached data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
                onClick={preloadHistoricalData}
                variant="default"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                <Database className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Loading...' : 'Preload Historical Data'}
              </Button>
              
              <Button 
                onClick={clearWaveCache}
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Wave Analysis Cache
              </Button>
              
              <Button 
                onClick={clearHistoricalCache}
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isRefreshing || cacheStats.histEntryCount === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Historical Data Cache
              </Button>

              <Button 
                onClick={handleMigration}
                variant="default"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                <Database className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Migrating...' : 'Migrate to Supabase'}
              </Button>
              
              <div className="pt-3 mt-3 border-t text-sm text-muted-foreground">
                {/* Existing cache statistics remain the same */}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                API Status
              </CardTitle>
              <CardDescription>Backend service health monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <ApiStatusCheck />
            </CardContent>
          </Card>
        </div>
        
        {/* Right column - Tabs */}
        <div className="col-span-1 lg:col-span-2">
          <Tabs defaultValue="waves">
            <TabsList>
              <TabsTrigger value="waves">
                <BarChart3 className="h-4 w-4 mr-2" />
                Wave Analysis Cache
              </TabsTrigger>
              <TabsTrigger value="historical">
                <Clock className="h-4 w-4 mr-2" />
                Historical Data Cache
              </TabsTrigger>
              <TabsTrigger value="details">Data Inspector</TabsTrigger>
            </TabsList>
            
            <TabsContent value="waves" className="border rounded-md p-4 min-h-[500px]">
              <h3 className="text-lg font-medium mb-2">Wave Analysis Data</h3>
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
                            onClick={() => setSelectedData({ type: 'waves', key, data })}
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
              <h3 className="text-lg font-medium mb-2">Historical Price Data</h3>
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
                            onClick={() => setSelectedData({ type: 'historical', key, data })}
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
            
            <TabsContent value="details" className="border rounded-md p-4 min-h-[500px]">
              <h3 className="text-lg font-medium mb-2">Data Inspector</h3>
              {selectedData ? (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Badge variant={selectedData.type === 'waves' ? 'default' : 'secondary'}>
                        {selectedData.type === 'waves' ? 'Wave Analysis' : 'Historical Data'}
                      </Badge>
                      {selectedData.key}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(selectedData.data.timestamp)}
                    </span>
                  </div>
                  <ScrollArea className="h-[450px] border rounded-md p-2 font-mono text-xs">
                    <pre className="whitespace-pre-wrap">{formatJson(selectedData.data)}</pre>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[450px] text-muted-foreground">
                  Select an item from Wave Analysis or Historical Data to inspect
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Active Analyses - Now placed at the bottom */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Active Analyses
          </CardTitle>
          <CardDescription>Real-time wave detection monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(activeAnalyses).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No active wave analyses
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(activeAnalyses).map(([symbol, analysis]) => (
                <div key={symbol} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{symbol}</span>
                    <Badge variant="outline" className={
                      analysis.status === 'running' ? 'bg-blue-50 text-blue-700' :
                      analysis.status === 'completed' ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }>
                      {analysis.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Started: {new Date(analysis.startTime).toLocaleTimeString()}
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                      {analysis.waves.map((wave, index) => {
                        // Determine the appropriate styling based on wave number and type
                        const getWaveStyle = (wave: Wave) => {
                          // For numeric waves (1-5)
                          if (typeof wave.number === 'number') {
                            // Impulse waves (1, 3, 5)
                            if (wave.number % 2 === 1) {
                              return 'bg-green-50 text-green-700 border-green-200';
                            } 
                            // Corrective waves (2, 4)
                            else {
                              return 'bg-red-50 text-red-700 border-red-200';
                            }
                          } 
                          // For letter waves (A, B, C)
                          else {
                            // A and C are corrective
                            if (wave.number === 'A' || wave.number === 'C') {
                              return 'bg-red-50 text-red-700 border-red-200';
                            }
                            // B is impulse-like
                            else if (wave.number === 'B') {
                              return 'bg-green-50 text-green-700 border-green-200';
                            }
                            // Default
                            return '';
                          }
                        };
                        
                        return (
                          <Badge 
                            key={index} 
                            variant="outline" 
                            className={`text-xs ${getWaveStyle(wave)}`}
                          >
                            Wave {wave.number}
                          </Badge>
                        );
                      })}
                      
                      {/* If analysis is complete but no waves detected, show a message */}
                      {analysis.status === 'completed' && analysis.waves.length === 0 && (
                        <span className="text-xs text-muted-foreground">No waves detected</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;