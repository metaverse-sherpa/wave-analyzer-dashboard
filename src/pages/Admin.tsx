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
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { 
  Cog,
  Settings as SettingsIcon
} from 'lucide-react';
import {
  Slider
} from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface ActiveAnalysis {
  symbol: string;
  startTime: number;
  waves: Wave[];
  status: 'running' | 'completed' | 'error';
}

// Add these interfaces at the top of your file
interface HistoricalDataEntry {
  data: any[];
  timestamp: number;
}

interface WaveAnalysisEntry {
  analysis: {
    waves: any[];
    [key: string]: any;
  };
  timestamp: number;
}

// Add this utility function at the top of your component or in a separate utils file
const normalizeTimestamp = (timestamp: number): number => {
  // If timestamp is in seconds (before year 2001), convert to milliseconds
  return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
};

// Define a proper type for selectedData
type SelectedDataType = 
  | { type: 'waves'; key: string; data: WaveAnalysisEntry }
  | { type: 'historical'; key: string; data: HistoricalDataEntry }
  | null;

const AdminDashboard = () => {
  // State and context hooks remain at the top
  const [cacheData, setCacheData] = useState<{
    waves: Record<string, any>;
    historical: Record<string, any>;
  }>({
    waves: {},
    historical: {}
  });
  const [selectedData, setSelectedData] = useState<SelectedDataType>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeAnalyses, setActiveAnalyses] = useState<Record<string, ActiveAnalysis>>({});
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalDataEntry>>({});
  const [waveAnalyses, setWaveAnalyses] = useState<Record<string, WaveAnalysisEntry>>({});
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

  // Add these state variables at the top of your AdminDashboard component
  const [waveSearchQuery, setWaveSearchQuery] = useState('');
  const [historicalSearchQuery, setHistoricalSearchQuery] = useState('');

  // Add this state near your other state variables
  const [currentApiCall, setCurrentApiCall] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stockCount, setStockCount] = useState(100);
  const [settingsChanged, setSettingsChanged] = useState(false);

  // First, add a new state at the top of your component to store the fetched top stocks
  const [topStocks, setTopStocks] = useState<{symbol: string}[]>([]);

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
        .map(key => key.split('_')[0])
        .slice(0, stockCount); // Limit by stockCount
      
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
          const analysis = await getAnalysis(symbol, historicalData, true, true); // Added silent parameter
          
          // Add this section to update the state incrementally
          if (analysis && analysis.waves) {
            // Update the waveAnalyses state incrementally
            setWaveAnalyses(prev => ({
              ...prev,
              [`${symbol}_1d`]: {
                analysis: analysis,
                timestamp: Date.now()
              }
            }));
          }
          
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
      
      // Finish up - still load from the database to ensure everything is consistent
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
  }, [getAnalysis, getHistoricalData, loadCacheData, supabase, stockCount]);

  // Add a function to fetch the top stocks
  const fetchTopStocks = useCallback(async (limit: number) => {
    try {
      console.log(`DEBUG: Fetching top stocks with limit: ${limit}`);
      const response = await fetch(`/api/stocks/top?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      const data = await response.json();
      console.log(`DEBUG: API returned only ${data.length} stocks (requested ${limit})`);
      setTopStocks(data);
      return data;
    } catch (error) {
      console.error('Error fetching top stocks:', error);
      toast.error('Failed to fetch top stocks');
      return [];
    }
  }, []);

  // Function to preload historical data for top stocks
  const preloadHistoricalData = useCallback(async () => {
    // Make the historical tab active
    setActiveTab("historical");
    
    setIsRefreshing(true);
    try {
      // First fetch the top stocks from the API based on stockCount
      const stocks = await fetchTopStocks(stockCount);
      const symbols = stocks.map(stock => stock.symbol);
      
      // Initialize progress tracking with the actual fetched symbols
      setHistoryLoadProgress({
        total: symbols.length,
        current: 0,
        inProgress: true
      });
      
      // Track progress for user feedback
      let completed = 0;
      let failed = 0;
      
      // Process stocks in batches to avoid overwhelming the browser
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        
        // Process each stock in the batch concurrently
        await Promise.all(batch.map(async (symbol) => {
          try {
            console.log(`Fetching historical data for ${symbol}...`);
            
            // ========= DEBUG: Add direct API call ==========
            const proxyUrl = `/api/stocks/historical/${symbol}?timeframe=1d`;
            console.log(`DEBUG: Directly calling API for ${symbol}: ${proxyUrl}`);
            
            // Update the currentApiCall state to show in UI
            setCurrentApiCall(proxyUrl);
            
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
              throw new Error(`API returned status ${response.status}`);
            }
            
            const apiData = await response.json();
            console.log(`DEBUG: API returned ${apiData.length} points for ${symbol}`);
            console.log(`DEBUG: First data point:`, apiData[0]);
            console.log(`DEBUG: Last data point:`, apiData[apiData.length - 1]);
            
            // ========= Use this API data directly ========== 
            // Skip getHistoricalData and use API data directly
            const historicalData = apiData;
            
            // Validate the data
            if (!historicalData || historicalData.length < 50) {
              console.warn(`Not enough data points for ${symbol}: ${historicalData?.length || 0}`);
              throw new Error(`Insufficient data points for ${symbol}: ${historicalData?.length || 0}`);
            }
            
            // Ensure proper timestamp format
            const formattedData = historicalData.map(item => {
              // Debug the timestamp before conversion
              if (item.date) {
                console.log(`DEBUG: Found 'date' property instead of timestamp:`, item.date);
              }
              
              // Convert timestamps properly
              let timestamp;
              if (item.date) {
                // Some APIs return date instead of timestamp
                timestamp = new Date(item.date).getTime();
              } else if (typeof item.timestamp === 'string') {
                timestamp = new Date(item.timestamp).getTime();
              } else if (typeof item.timestamp === 'number' && item.timestamp < 10000000000) {
                timestamp = item.timestamp * 1000; // Convert seconds to milliseconds
              } else {
                timestamp = item.timestamp;
              }
              
              return {
                timestamp,
                open: Number(item.open),
                high: Number(item.high),
                low: Number(item.low),
                close: Number(item.close),
                volume: Number(item.volume || 0),
                // Include original data for debugging
                original: {
                  timestamp: item.timestamp,
                  date: item.date
                }
              };
            });
            
            // Verify the data was converted properly
            console.log(`DEBUG: Formatted ${formattedData.length} data points for ${symbol}`);
            console.log(`DEBUG: First formatted point:`, formattedData[0]);
            console.log(`DEBUG: Last formatted point:`, formattedData[formattedData.length - 1]);
            console.log(`DEBUG: Sample date string:`, new Date(formattedData[0].timestamp).toISOString());
            
            // Store directly to Supabase with a 7-day cache duration
            const cacheKey = `historical_data_${symbol}_1d`;
            
            // Store the data with a verified timestamp format
            await supabase
              .from('cache')
              .upsert({
                key: cacheKey,
                data: formattedData,
                timestamp: Date.now(),
                duration: 7 * 24 * 60 * 60 * 1000, // 7 days
                is_string: false
              }, { onConflict: 'key' });
            
            // Verify what's stored in Supabase
            const { data: storedData } = await supabase
              .from('cache')
              .select('data')
              .eq('key', cacheKey)
              .single();
            
            console.log(`DEBUG: Stored data for ${symbol}:`, storedData?.data?.length || 0);
            
            // Update the local state incrementally without fetching from Supabase
            setHistoricalData(prev => ({
              ...prev,
              [symbol]: {
                data: formattedData,
                timestamp: Date.now()
              }
            }));
            
            completed++;
            
            // Update progress
            setHistoryLoadProgress(prev => ({
              ...prev,
              current: completed + failed
            }));
            
            console.log(`Stored ${symbol} data in Supabase (${formattedData.length} points)`);
          } catch (error) {
            console.error(`Failed to load data for ${symbol}:`, error);
            failed++;
            
            // Update progress for failures too
            setHistoryLoadProgress(prev => ({
              ...prev,
              current: completed + failed
            }));
          } finally {
            // Clear the current API call when done with this symbol
            setCurrentApiCall(null);
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
      // Reset progress and clear current API call
      setHistoryLoadProgress({
        total: 0,
        current: 0,
        inProgress: false
      });
      setCurrentApiCall(null);
      setIsRefreshing(false);
    }
  }, [loadCacheData, supabase, stockCount, fetchTopStocks]);

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

  // Add these filtered data memos after your cacheStats memo
  const filteredWaveAnalyses = useMemo(() => {
    if (!waveSearchQuery) return waveAnalyses;
    
    const lowerQuery = waveSearchQuery.toLowerCase();
    return Object.entries(waveAnalyses)
      .filter(([key]) => key.toLowerCase().includes(lowerQuery))
      .reduce<Record<string, WaveAnalysisEntry>>((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
  }, [waveAnalyses, waveSearchQuery]);

  const filteredHistoricalData = useMemo(() => {
    if (!historicalSearchQuery) return historicalData;
    
    const lowerQuery = historicalSearchQuery.toLowerCase();
    return Object.entries(historicalData)
      .filter(([key]) => key.toLowerCase().includes(lowerQuery))
      .reduce<Record<string, HistoricalDataEntry>>((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
  }, [historicalData, historicalSearchQuery]);

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

// Add this function near your other clear functions - this one skips the confirmation dialog
const clearHistoricalCacheWithoutConfirm = async () => {
  try {
    setIsRefreshing(true);
    
    // Delete all historical data entries from Supabase
    const { error } = await supabase
      .from('cache')
      .delete()
      .like('key', 'historical_data_%');
    
    if (error) {
      throw error;
    }
    
    await loadCacheData();
    toast.success('Historical data cache cleared successfully');
  } catch (error) {
    console.error('Error clearing historical cache:', error);
    toast.error('Failed to clear historical data cache');
    throw error; // Re-throw to handle in caller
  } finally {
    // Don't set isRefreshing to false here - the caller will handle that
  }
};

// Add a function to clear wave cache without confirmation (similar to historical)
const clearWaveCacheWithoutConfirm = async () => {
  try {
    setIsRefreshing(true);
    
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
    
    await loadCacheData();
    toast.success('Wave analysis cache cleared successfully');
  } catch (error) {
    console.error('Error clearing wave cache:', error);
    toast.error('Failed to clear wave analysis cache');
    throw error; // Re-throw to handle in caller
  } finally {
    // Don't set isRefreshing to false here - the caller will handle that
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
        //console.log(`${item.key}: ${item.data?.waves?.length || 0} waves`);
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
        
        // Also delete all entries from Supabase to be thorough
        const { error: waveError } = await supabase
          .from('cache')
          .delete()
          .like('key', 'wave_analysis_%');
          
        const { error: histError } = await supabase
          .from('cache')
          .delete()
          .like('key', 'historical_data_%');
        
        if (waveError || histError) {
          console.error("Errors clearing Supabase:", waveError, histError);
          throw new Error("Failed to clear some Supabase data");
        }
        
        // Refresh the data
        await loadCacheData();
        toast.success('All Supabase cache data has been cleared');
      } catch (error) {
        console.error('Error clearing Supabase data:', error);
        toast.error('Failed to clear Supabase data');
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Add this function to save settings to Supabase
const saveSettings = useCallback(async (settings: { stockCount: number }) => {
  try {
    setIsRefreshing(true);
    
    // Save to Supabase with a special key for admin settings
    await supabase
      .from('cache')
      .upsert({
        key: 'admin_settings',
        data: settings,
        timestamp: Date.now(),
        duration: 365 * 24 * 60 * 60 * 1000, // 1 year
      }, { onConflict: 'key' });
      
    toast.success('Settings saved successfully');
    setSettingsChanged(true);
  } catch (error) {
    console.error('Error saving settings:', error);
    toast.error('Failed to save settings');
  } finally {
    setIsRefreshing(false);
  }
}, [supabase]);

// Add this function to load settings from Supabase
const loadSettings = useCallback(async () => {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('data')
      .eq('key', 'admin_settings')
      .single();
      
    if (error) {
      // If settings don't exist yet, use defaults
      console.log('No saved settings found, using defaults');
      return;
    }
    
    if (data?.data?.stockCount) {
      setStockCount(data.data.stockCount);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}, [supabase]);

// Add effect to load settings when component mounts
useEffect(() => {
  loadSettings();
}, [loadSettings]);

// Add this effect to prompt for data reload when settings change
useEffect(() => {
  if (settingsChanged) {
    const handleSettingsChange = async () => {
      // Reset the flag first
      setSettingsChanged(false);
      
      // Ask once for confirmation of the complete process
      if (window.confirm('This will clear existing data and perform a full analysis with the new stock count. This process may take several minutes. Continue?')) {
        try {
          // First clear the historical cache, then load new data
          await clearHistoricalCacheWithoutConfirm();
          await preloadHistoricalData();
          
          // Then clear the wave analysis cache and analyze waves
          await clearWaveCacheWithoutConfirm();
          await analyzeWaves();
          
          toast.success('Settings applied and data fully refreshed');
        } catch (error) {
          console.error('Error during settings update process:', error);
          toast.error('An error occurred during the refresh process');
        }
      }
    };
    
    handleSettingsChange();
  }
}, [settingsChanged, preloadHistoricalData, analyzeWaves]);

  // Move the SettingsDialog component here
  // Update the SettingsDialog component's handleSave function
const SettingsDialog = () => {
  // Replace the existing useState line with this:
  const [localStockCount, setLocalStockCount] = useState(stockCount);
  
  // Add this useEffect to reset the local state when dialog opens
  useEffect(() => {
    // Reset to the current stockCount whenever the dialog opens
    if (settingsOpen) {
      setLocalStockCount(stockCount);
    }
  }, [settingsOpen, stockCount]);
  
  const handleSave = () => {
    // Update the local state immediately before saving to Supabase
    setStockCount(localStockCount);
    
    // Then save to Supabase
    saveSettings({ stockCount: localStockCount });
    setSettingsOpen(false);
  };
  
  // Rest of the component remains the same
  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => {
      // When closing without saving, discard changes
      setSettingsOpen(open);
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Cache Settings
          </DialogTitle>
          <DialogDescription>
            Configure admin preferences and system parameters.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="stocks-to-analyze">Number of Stocks to Analyze</Label>
              <span className="text-sm font-medium">{localStockCount}</span>
            </div>
            <Slider
              id="stocks-to-analyze"
              min={10}
              max={5000}
              step={10}
              value={[localStockCount]}
              onValueChange={(value) => setLocalStockCount(value[0])}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This controls how many top stocks are loaded and analyzed. 
              Higher numbers require more processing time.
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setSettingsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isRefreshing}>
            {isRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
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
              
              <div className="border-t my-1"></div>
                
              {/* Settings button */}
              <Button 
                onClick={() => setSettingsOpen(true)}
                variant="outline" 
                size="sm" 
                className="w-full"
              >
                <Cog className="h-4 w-4 mr-2" />
                Cache Settings
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
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium flex-shrink-0">
                  Wave Analysis Data ({cacheStats.waveEntryCount})
                </h3>
                
                {/* Add search box for wave analysis tab */}
                <div className="relative flex-1 max-w-sm ml-4">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by symbol..." 
                    className="pl-8"
                    value={waveSearchQuery}
                    onChange={(e) => setWaveSearchQuery(e.target.value)}
                  />
                </div>
                
                {/* Add progress indicator next to title */}
                {analysisProgress.inProgress && (
                  <Badge variant="outline" className="flex items-center gap-1 ml-4 flex-shrink-0">
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
                ) : Object.keys(filteredWaveAnalyses || {}).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {Object.keys(waveAnalyses).length === 0 ? (
                      "No wave analysis cache data found"
                    ) : (
                      `No results found for "${waveSearchQuery}"`
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(filteredWaveAnalyses || {}).map(([key, data]) => (
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
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium flex-shrink-0">
                  Historical Price Data ({cacheStats.histEntryCount})
                </h3>
                
                {/* Add search box for historical data tab */}
                <div className="relative flex-1 max-w-sm ml-4">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by symbol..." 
                    className="pl-8"
                    value={historicalSearchQuery}
                    onChange={(e) => setHistoricalSearchQuery(e.target.value)}
                  />
                </div>
                
                {/* Add progress indicator next to title */}
                {historyLoadProgress.inProgress && (
                  <Badge variant="outline" className="flex items-center gap-1 ml-4 flex-shrink-0">
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
                {Object.keys(filteredHistoricalData || {}).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {Object.keys(historicalData).length === 0 ? (
                      "No historical data cache found"
                    ) : (
                      `No results found for "${historicalSearchQuery}"`
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(filteredHistoricalData || {}).map(([key, data]) => (
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

      {/* Add the settings dialog */}
      <SettingsDialog />
    </div>
  );
};

export default AdminDashboard;