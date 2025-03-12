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
import { Wave } from '@/types/waves';
import ApiStatusCheck from '@/components/ApiStatusCheck';
import { topStockSymbols } from '@/services/yahooFinanceService';

interface ActiveAnalysis {
  symbol: string;
  startTime: number;
  waves: Wave[];
  status: 'running' | 'completed' | 'error';
}

const AdminDashboard = () => {
  // Group all useState hooks together
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

  // Get context values
  const { analysisEvents, getAnalysis } = useWaveAnalysis();

  // Calculate cache statistics using useMemo
  const cacheStats = useMemo(() => ({
    waveEntryCount: Object.keys(cacheData.waves).length,
    histEntryCount: Object.keys(cacheData.historical).length,
    totalSize: Math.round(
      (
        JSON.stringify(cacheData.waves).length +
        JSON.stringify(cacheData.historical).length
      ) / 1024
    ),
    oldestWave: Object.entries(cacheData.waves).reduce((oldest, [key, data]) => {
      return data.timestamp < oldest.timestamp ? { key, timestamp: data.timestamp } : oldest;
    }, { key: '', timestamp: Date.now() }),
    oldestHistorical: Object.entries(cacheData.historical).reduce((oldest, [key, data]) => {
      return data.timestamp < oldest.timestamp ? { key, timestamp: data.timestamp } : oldest;
    }, { key: '', timestamp: Date.now() })
  }), [cacheData]);

  // Handlers
  const analyzeWaves = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const stocks = topStockSymbols.slice(0, 30); // Analyze top 30 stocks
      
      toast.success(`Starting wave analysis for ${stocks.length} stocks...`);
      
      // Process in smaller batches of 5 stocks each
      for (let i = 0; i < stocks.length; i += 5) {
        const batch = stocks.slice(i, i + 5);
        console.log(`Processing batch ${Math.floor(i/5) + 1}: ${batch.join(', ')}`);
        
        try {
          for (const symbol of batch) {
            await new Promise(r => setTimeout(r, 500)); // Delay between stocks
            await getAnalysis(symbol, '1d', true);
          }
          // Small delay between batches
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.error(`Failed to analyze batch: ${batch.join(', ')}`, err);
        }
      }
      
      loadCacheData();
      toast.success('Wave analysis completed');
    } catch (error) {
      console.error('Error analyzing waves:', error);
      toast.error('Failed to analyze waves');
    } finally {
      setIsRefreshing(false);
    }
  }, [getAnalysis]);

  // Title effect
  useEffect(() => {
    document.title = "EW Analyzer - Admin";
    return () => {
      document.title = "EW Analyzer";
    };
  }, []);

  // Analysis events effect
  useEffect(() => {
    type AnalysisEvent = CustomEvent<{
      symbol: string;
      startTime?: number;
      waves?: Wave[];
      error?: string;
    }>;

    const handleAnalysisStart = (e: Event) => {
      const event = e as AnalysisEvent;
      const { symbol, startTime = Date.now() } = event.detail;
      
      setActiveAnalyses(prev => ({
        ...prev,
        [symbol]: {
          symbol,
          startTime,
          waves: [],
          status: 'running'
        }
      }));
    };

    const handleAnalysisProgress = (e: Event) => {
      const event = e as AnalysisEvent;
      const { symbol, waves = [] } = event.detail;
      
      setActiveAnalyses(prev => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          waves,
          status: 'running'
        }
      }));
    };

    const handleAnalysisComplete = (e: Event) => {
      const event = e as AnalysisEvent;
      const { symbol } = event.detail;
      
      setActiveAnalyses(prev => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          status: 'completed'
        }
      }));

      // Refresh cache data immediately when analysis completes
      loadCacheData();

      // Remove from active analyses after delay
      setTimeout(() => {
        setActiveAnalyses(prev => {
          const newState = { ...prev };
          delete newState[symbol];
          return newState;
        });
      }, 10000);
    };

    const handleAnalysisError = (e: Event) => {
      const event = e as AnalysisEvent;
      const { symbol, error } = event.detail;
      
      setActiveAnalyses(prev => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          status: 'error'
        }
      }));
    };

    // Add event listeners
    analysisEvents.addEventListener('analysisStart', handleAnalysisStart);
    analysisEvents.addEventListener('analysisProgress', handleAnalysisProgress);
    analysisEvents.addEventListener('analysisComplete', handleAnalysisComplete);
    analysisEvents.addEventListener('analysisError', handleAnalysisError);

    // Cleanup
    return () => {
      analysisEvents.removeEventListener('analysisStart', handleAnalysisStart);
      analysisEvents.removeEventListener('analysisProgress', handleAnalysisProgress);
      analysisEvents.removeEventListener('analysisComplete', handleAnalysisComplete);
      analysisEvents.removeEventListener('analysisError', handleAnalysisError);
    };
  }, [analysisEvents]);

  const loadCacheData = () => {
    setIsRefreshing(true);
    try {
      const waveData = getAllAnalyses();
      const histData = getAllHistoricalData();
      setCacheData({
        waves: waveData,
        historical: histData
      });
      setIsRefreshing(false);
    } catch (error) {
      console.error('Error loading cache data:', error);
      setIsRefreshing(false);
      toast.error('Failed to load cache data');
    }
  };

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
    if (window.confirm('Are you sure you want to clear all wave analysis cache?')) {
      setIsRefreshing(true);
      try {
        clearAllAnalyses();
        loadCacheData();
        toast.success('Wave analysis cache cleared successfully');
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

  return (
    <div className="container mx-auto p-4">
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              <div className="space-y-4">
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
              {cacheStats.waveEntryCount > 0 ? (
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
              ) : (
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
              )}
              
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
              
              <div className="pt-3 mt-3 border-t text-sm text-muted-foreground">
                <div className="flex justify-between mb-1">
                  <span>Oldest Wave Analysis:</span>
                  <span>{cacheStats.oldestWave.key ? getAgeString(cacheStats.oldestWave.timestamp) : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Oldest Historical Data:</span>
                  <span>{cacheStats.oldestHistorical.key ? getAgeString(cacheStats.oldestHistorical.timestamp) : 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

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
                <div className="space-y-4">
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
                          {analysis.waves.map((wave, index) => (
                            <Badge 
                              key={index} 
                              variant="outline" 
                              className={`wave-${wave.number} text-xs`}
                            >
                              Wave {wave.number}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                ) : Object.keys(cacheData.waves).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No wave analysis cache data found
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(cacheData.waves).map(([key, data]) => (
                      <Card key={key} className="cursor-pointer hover:bg-accent/5 transition-colors">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div 
                            className="flex-1"
                            onClick={() => setSelectedData({ type: 'waves', key, data })}
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{key}</h4>
                              <span className="text-xs text-muted-foreground">
                                {getAgeString(data.timestamp)}
                              </span>
                            </div>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {data.analysis.waves.length} waves
                              </Badge>
                              
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  data.analysis.trend === 'bullish' ? 'bg-green-50 text-green-700 border-green-200' : 
                                  data.analysis.trend === 'bearish' ? 'bg-red-50 text-red-700 border-red-200' : 
                                  'bg-gray-50'
                                }`}
                              >
                                {data.analysis.trend}
                              </Badge>
                              
                              {data.analysis.currentWave?.number && (
                                <Badge variant="outline" className="text-xs">
                                  Wave {data.analysis.currentWave.number}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => deleteCacheItem(key, 'waves')}
                            className="h-8 w-8"
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
                {Object.keys(cacheData.historical).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No historical data cache found
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(cacheData.historical).map(([key, data]) => (
                      <Card key={key} className="cursor-pointer hover:bg-accent/5 transition-colors">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div 
                            className="flex-1"
                            onClick={() => setSelectedData({ type: 'historical', key, data })}
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{key}</h4>
                              <span className="text-xs text-muted-foreground">
                                {getAgeString(data.timestamp)}
                              </span>
                            </div>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {data.historicalData.length} data points
                              </Badge>
                              
                              {data.historicalData.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(data.historicalData[0].timestamp * 1000).toLocaleDateString()} - 
                                  {new Date(data.historicalData[data.historicalData.length-1].timestamp * 1000).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => deleteCacheItem(key, 'historical')}
                            className="h-8 w-8"
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
    </div>
  );
};

export default AdminDashboard;