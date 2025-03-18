import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from 'react-router-dom';
import { getAllAnalyses, clearAllAnalyses } from '@/services/databaseService';
import { getAllHistoricalData } from '@/services/cacheService'; // Get the Supabase version
import { toast } from '@/lib/toast';
import { ArrowLeft, Trash2, RefreshCw, Database, Clock, BarChart3, Activity, LineChart, Loader2, 
         Search, X, Cog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext'; // Fix this import
import { Wave } from '@/types/shared';
import ApiStatusCheck from '@/components/ApiStatusCheck';
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
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { buildApiUrl } from '@/config/apiConfig';  // Add this import if it doesn't exist

// Add this at the top of Admin.tsx with other interfaces
declare global {
  interface Window {
    _addApiError?: (error: string) => void;
  }
}

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

// Define a proper type for selectedData
type SelectedDataType = 
  | { type: 'waves'; key: string; data: WaveAnalysisEntry }
  | { type: 'historical'; key: string; data: HistoricalDataEntry }
  | null;

const AdminDashboard = () => {
  // State declarations
  const [cacheData, setCacheData] = useState<{
    waves: Record<string, any>;
    historical: Record<string, any>;
  }>({
    waves: {},
    historical: {}
  });
  const [selectedData, setSelectedData] = useState<SelectedDataType>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalDataEntry>>({});
  const [waveAnalyses, setWaveAnalyses] = useState<Record<string, WaveAnalysisEntry>>({});
  const [analysisProgress, setAnalysisProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false
  });
  const [historyLoadProgress, setHistoryLoadProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false
  });
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking' | 'degraded'>('checking');
  const [activeTab, setActiveTab] = useState<string>("historical");
  const [topStocks, setTopStocks] = useState<{symbol: string}[]>([]);
  const [stockCount, setStockCount] = useState(100);
  const [cacheExpiryDays, setCacheExpiryDays] = useState(7); // Default to 7 days
  const [aiAnalysisCount, setAiAnalysisCount] = useState(0);
  
  // Add back these state variables
  const [modalOpen, setModalOpen] = useState(false);
  const [waveSearchQuery, setWaveSearchQuery] = useState('');
  const [historicalSearchQuery, setHistoricalSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [activeAnalyses, setActiveAnalyses] = useState<Record<string, ActiveAnalysis>>({});
  const [currentApiCall, setCurrentApiCall] = useState<string | null>(null);

  // Context hooks
  const { analysisEvents, getAnalysis, cancelAllAnalyses, clearCache } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData(); // Fixed to match the exported name

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
    
    // Update your loadCacheData function to also fetch AI analysis entries

    // Add this to your loadCacheData function where you query other cache entries
    const { data: aiData, error: aiError } = await supabase
      .from('cache')
      .select('key, data, timestamp')
      .like('key', 'ai_elliott_wave_%');
    
    if (waveError) throw waveError;
    if (histError) throw histError;
    if (aiError) throw aiError;
    
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

    if (aiData) {
      setAiAnalysisCount(aiData.length);
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

  // Update this function in Admin.tsx to handle API responses without mock fallbacks
const fetchTopStocks = useCallback(async (limit: number) => {
  try {
    console.log(`DEBUG: Fetching top stocks with limit: ${limit}`);
    
    const url = buildApiUrl(`/stocks/top?limit=${limit}`);
    console.log(`Requesting URL: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Defensive check to ensure we have an array
    if (!Array.isArray(data)) {
      throw new Error('API returned non-array data: ' + JSON.stringify(data).substring(0, 100));
    }
    
    console.log(`DEBUG: API returned ${data.length} stocks (requested ${limit})`);
    setTopStocks(data);
    return data;
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    toast.error(`Failed to fetch top stocks: ${error.message}`);
    throw error; // Re-throw to handle in caller
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
      
      // Check if we got any stocks
      if (!stocks.length) {
        throw new Error('No stocks returned from API');
      }
      
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
      let errors = [];
      
      // Process stocks in batches to avoid overwhelming the browser
      const batchSize = 3;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        
        // Process each stock in the batch concurrently
        await Promise.all(batch.map(async (symbol) => {
          try {
            console.log(`Fetching historical data for ${symbol}...`);
            
            // Update the currentApiCall state to show in UI
            const proxyUrl = buildApiUrl(`/stocks/historical/${symbol}?timeframe=2y&interval=1d`);
            setCurrentApiCall(proxyUrl);
            
            // Add retry logic
            const maxRetries = 2;
            let attempts = 0;
            let response;
            
            while (attempts < maxRetries) {
              try {
                response = await fetch(proxyUrl);
                if (response.ok) break;
                attempts++;
                await new Promise(r => setTimeout(r, 1000)); // Wait 1 second between retries
              } catch (e) {
                if (attempts >= maxRetries - 1) throw e;
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
              }
            }
            
            if (!response || !response.ok) {
              throw new Error(`API returned status ${response?.status || 'unknown'}`);
            }
            
            const apiData = await response.json();
            
            // Check if the response contains an error message
            if (apiData && apiData.error) {
              throw new Error(`API returned error: ${apiData.error} - ${apiData.message || ''}`);
            }
            
            // Validate the data - now throw error for insufficient data
            if (!apiData || !Array.isArray(apiData) || apiData.length < 50) {
              throw new Error(`Insufficient data for ${symbol}: ${apiData?.length || 0} points`);
            }
            
            console.log(`DEBUG: API returned ${apiData.length} points for ${symbol}`);
            
            // Ensure proper timestamp format
            const formattedData = apiData.map(item => {
              // Convert timestamps properly
              let timestamp;
              if (item.date) {
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
                volume: Number(item.volume || 0)
              };
            });
            
            // Store to Supabase
            const cacheKey = `historical_data_${symbol}_1d`;
            
            await supabase
              .from('cache')
              .upsert({
                key: cacheKey,
                data: formattedData,
                timestamp: Date.now(),
                duration: cacheExpiryDays * 24 * 60 * 60 * 1000,
                is_string: false
              }, { onConflict: 'key' });
            
            // Update the local state incrementally
            setHistoricalData(prev => ({
              ...prev,
              [symbol]: {
                data: formattedData,
                timestamp: Date.now()
              }
            }));
            
            completed++;
            
            console.log(`Stored ${symbol} data in Supabase (${formattedData.length} points)`);
          } catch (error) {
            console.error(`Failed to load data for ${symbol}:`, error);
            errors.push(`${symbol}: ${error.message}`);
            failed++;
          } finally {
            // Update progress tracking
            setHistoryLoadProgress(prev => ({
              ...prev,
              current: completed + failed
            }));
            
            // Clear the current API call when done with this symbol
            setCurrentApiCall(null);
          }
        }));
        
        // Small delay between batches to allow UI to remain responsive
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // Refresh the cache display
      loadCacheData();
      
      // Show final status
      if (failed > 0) {
        toast.error(`Failed to load data for ${failed} stocks. Check console for details.`);
        // Display error details in the console in a readable format
        console.error('Historical data load failures:', errors);
      } else {
        toast.success(`Historical data stored in Supabase successfully for all ${completed} stocks`);
      }
    } catch (error) {
      console.error('Error preloading historical data:', error);
      toast.error(`Failed to preload historical data: ${error.message}`);
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
  }, [loadCacheData, supabase, stockCount, fetchTopStocks, cacheExpiryDays]);

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
    }, { key: '', timestamp: Date.now() }),
    aiAnalysisCount: aiAnalysisCount,
  }), [waveAnalyses, historicalData, aiAnalysisCount]);

  // Add these filtered data memos after your cacheStats memo
  const filterData = (data, query) => {
    if (!query) return data;
    const lowerQuery = query.toLowerCase();
    return Object.fromEntries(
      Object.entries(data).filter(([key]) => key.toLowerCase().includes(lowerQuery))
    );
  };

  const filteredWaveAnalyses = useMemo(() => filterData(waveAnalyses, waveSearchQuery), [waveAnalyses, waveSearchQuery]);

  const filteredHistoricalData = useMemo(() => filterData(historicalData, historicalSearchQuery), [historicalData, historicalSearchQuery]);

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
  const clearHistoricalCache = async (skipConfirm = false) => {
    if (skipConfirm || window.confirm('Are you sure you want to clear all historical data cache?')) {
      setActiveTab("historical");
      setIsRefreshing(true);
      try {
        const { error } = await supabase
          .from('cache')
          .delete()
          .like('key', 'historical_data_%');
        
        if (error) throw error;
        
        await loadCacheData();
        toast.success('Historical data cache cleared successfully');
      } catch (error) {
        console.error('Error clearing historical cache:', error);
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

// Add this function alongside your other clear functions

// Clear DeepSeek AI analysis cache
const clearAIAnalysisCache = async () => {
  if (window.confirm('Are you sure you want to clear all DeepSeek AI analysis cache?')) {
    setIsRefreshing(true);
    try {
      // Delete all AI analysis entries from Supabase
      const { error } = await supabase
        .from('cache')
        .delete()
        .like('key', 'ai_elliott_wave_%');
      
      if (error) {
        throw error;
      }
      
      await loadCacheData();
      toast.success('DeepSeek AI analysis cache cleared successfully');
    } catch (error) {
      console.error('Error clearing AI analysis cache:', error);
      toast.error('Failed to clear AI analysis cache');
    } finally {
      setIsRefreshing(false);
    }
  }
};

const clearCacheByType = async (type: 'historical' | 'waves' | 'ai', skipConfirm = false) => {
  const messages = {
    historical: 'Are you sure you want to clear all historical data cache?',
    waves: 'Are you sure you want to clear all wave analysis cache? This will also cancel any ongoing analyses.',
    ai: 'Are you sure you want to clear all DeepSeek AI analysis cache?'
  };
  
  const keyPatterns = {
    historical: 'historical_data_%',
    waves: 'wave_analysis_%',
    ai: 'ai_elliott_wave_%'
  };
  
  if (skipConfirm || window.confirm(messages[type])) {
    setIsRefreshing(true);
    try {
      if (type === 'waves') {
        // Special handling for waves
        cancelAllAnalyses();
        clearCache();
      }
      
      const { error } = await supabase
        .from('cache')
        .delete()
        .like('key', keyPatterns[type]);
      
      if (error) throw error;
      
      await loadCacheData();
      toast.success(`${type === 'historical' ? 'Historical data' : type === 'waves' ? 'Wave analysis' : 'DeepSeek AI analysis'} cache cleared successfully`);
    } catch (error) {
      console.error(`Error clearing ${type} cache:`, error);
      toast.error(`Failed to clear ${type} cache`);
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

  // Add this function to save settings to Supabase
const saveSettings = useCallback(async (settings: { 
  stockCount: number,
  cacheExpiryDays: number 
}) => {
  try {
    setIsRefreshing(true);
    
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
    
    if (data?.data?.cacheExpiryDays !== undefined) {
      setCacheExpiryDays(data.data.cacheExpiryDays);
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
                onClick={() => clearHistoricalCache(false)}
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

              {/* Add this button */}
              <Button 
                onClick={clearAIAnalysisCache}
                variant="outline"
                disabled={isRefreshing}
              >
                Clear DeepSeek Cache
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
                    {Object.entries(filteredWaveAnalyses || {}).map(([key, rawData]) => {
                      // Type assert and transform the raw data
                      const data = rawData as unknown as { 
                        analysis?: { waves?: Wave[] };
                        timestamp?: number;
                      };
                      
                      // Create a properly typed wave data object
                      const waveData: WaveAnalysisEntry = {
                        analysis: {
                          waves: data.analysis?.waves || [],
                          ...(data.analysis || {})
                        },
                        timestamp: data.timestamp || Date.now()
                      };
                    
                      return (
                        <DataCard
                          key={key}
                          itemKey={key}
                          data={waveData}
                          type="waves"
                          onDelete={deleteCacheItem}
                          onClick={() => {
                            setSelectedData({
                              type: 'waves',
                              key,
                              data: waveData
                            });
                            setModalOpen(true);
                          }}
                          getAgeString={getAgeString}
                        />
                      );
                    })}
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
                      // For historical data
                      <DataCard
                        itemKey={key}
                        data={data as HistoricalDataEntry}
                        type="historical"
                        onDelete={deleteCacheItem}
                        onClick={() => {
                          setSelectedData({
                            type: 'historical',
                            key,
                            data: data as HistoricalDataEntry
                          });
                          setModalOpen(true);
                        }}
                        getAgeString={getAgeString}
                      />
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
      <SettingsDialog 
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        stockCount={stockCount}
        cacheExpiryDays={cacheExpiryDays}
        setStockCount={setStockCount}
        setCacheExpiryDays={setCacheExpiryDays}
        saveSettings={saveSettings}
        isRefreshing={isRefreshing}
      />
    </div>
  );
};

// 1. First, create an interface for SettingsDialog props
interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  stockCount: number;
  cacheExpiryDays: number;
  setStockCount: (count: number) => void;
  setCacheExpiryDays: (days: number) => void;
  saveSettings: (settings: { stockCount: number; cacheExpiryDays: number }) => void;
  isRefreshing: boolean;
}

// 2. Update the SettingsDialog component
const SettingsDialog = ({ 
  isOpen,
  onOpenChange,
  stockCount,
  cacheExpiryDays,
  setStockCount,
  setCacheExpiryDays,
  saveSettings,
  isRefreshing
}: SettingsDialogProps) => {
  const [localStockCount, setLocalStockCount] = useState(stockCount);
  const [localCacheExpiryDays, setLocalCacheExpiryDays] = useState(cacheExpiryDays);
  
  useEffect(() => {
    if (isOpen) {
      setLocalStockCount(stockCount);
      setLocalCacheExpiryDays(cacheExpiryDays);
    }
  }, [isOpen, stockCount, cacheExpiryDays]);
  
  const handleSave = () => {
    setStockCount(localStockCount);
    setCacheExpiryDays(localCacheExpiryDays);
    saveSettings({ stockCount: localStockCount, cacheExpiryDays: localCacheExpiryDays });
    onOpenChange(false);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
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
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="cache-expiry-days">Cache Expiry (Days)</Label>
              <span className="text-sm font-medium">{localCacheExpiryDays}</span>
            </div>
            <Slider
              id="cache-expiry-days"
              min={1}
              max={30}
              step={1}
              value={[localCacheExpiryDays]}
              onValueChange={(value) => setLocalCacheExpiryDays(value[0])}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This controls how long cached data is retained before being refreshed.
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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

// Fix the DataCard component (move it outside AdminDashboard)
interface DataCardProps {
  itemKey: string;
  data: WaveAnalysisEntry | HistoricalDataEntry;
  type: 'waves' | 'historical';
  onDelete: (key: string, type: 'waves' | 'historical') => void;
  onClick: () => void;
  getAgeString: (timestamp: number) => string;
}

const DataCard = ({ 
  itemKey, 
  data, 
  type, 
  onDelete, 
  onClick,
  getAgeString 
}: DataCardProps) => (
  <Card key={itemKey} className="cursor-pointer hover:bg-accent/5 transition-colors">
    <CardContent className="p-3 flex items-center justify-between">
      <div className="flex-1" onClick={onClick}>
        <div className="flex flex-col">
          <span className="font-medium text-sm">{itemKey}</span>
          <span className="text-xs text-muted-foreground">
            Updated {getAgeString(data.timestamp)}
          </span>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={(e) => {
        e.stopPropagation();
        onDelete(itemKey, type);
      }}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </CardContent>
  </Card>
);

export default AdminDashboard;