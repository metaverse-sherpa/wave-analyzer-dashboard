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
import { FavoritesManager } from '@/components/FavoritesManager';

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
  isLoaded?: boolean; // Add isLoaded property
}

interface WaveAnalysisEntry {
  analysis: {
    waves: any[];
    [key: string]: any;
  };
  timestamp: number;
  isLoaded?: boolean; // Add isLoaded property
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
  const [chartPaddingDays, setChartPaddingDays] = useState(20); // Default to 20 days
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
const [localCacheTimestamp, setLocalCacheTimestamp] = useState<number>(0);
const LOCAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Modify loadCacheData function to implement hybrid caching
const loadCacheData = useCallback(async (forceRefresh = false) => {
  setIsRefreshing(true);
  console.log('Loading cache data, forceRefresh =', forceRefresh);
  
  try {
    // Check if we have a recent local cache and force refresh wasn't requested
    const now = Date.now();
    const cachedData = localStorage.getItem('admin_dashboard_cache');
    const cachedTimestamp = localCacheTimestamp || parseInt(localStorage.getItem('admin_dashboard_cache_timestamp') || '0');
    
    if (!forceRefresh && cachedData && (now - cachedTimestamp < LOCAL_CACHE_TTL)) {
      // Use local cache if it's recent enough
      console.log('Using local cache from', new Date(cachedTimestamp).toLocaleTimeString());
      const parsedCache = JSON.parse(cachedData);
      setWaveAnalyses(parsedCache.waves || {});
      setHistoricalData(parsedCache.historical || {});
      setAiAnalysisCount(parsedCache.aiCount || 0);
      setIsRefreshing(false);
      return;
    }
    
    // Load metadata-only from Supabase (not full data)
    const PAGE_SIZE = 500; // Increase page size since we're only fetching metadata
    
    // For waves: Only fetch keys and timestamps, not full data
    let waveData = [];
    let waveHasMore = true;
    let waveFrom = 0;
    
    while (waveHasMore) {
      const { data: pageData, error } = await supabase
        .from('cache')
        .select('key, timestamp') // Don't fetch the full data!
        .like('key', 'wave_analysis_%')
        .range(waveFrom, waveFrom + PAGE_SIZE - 1)
        .order('timestamp', { ascending: false });
      
      if (error) {
        console.error('Error loading wave analysis metadata:', error);
        break;
      }
      
      if (pageData && pageData.length > 0) {
        waveData = [...waveData, ...pageData];
        waveFrom += PAGE_SIZE;
        waveHasMore = pageData.length === PAGE_SIZE;
      } else {
        waveHasMore = false;
      }
    }
    
    // Similarly for historical data - only metadata
    let histData = [];
    let histHasMore = true;
    let histFrom = 0;
    
    while (histHasMore) {
      const { data: pageData, error } = await supabase
        .from('cache')
        .select('key, timestamp') // Don't fetch the full data!
        .like('key', 'historical_data_%')
        .range(histFrom, histFrom + PAGE_SIZE - 1)
        .order('timestamp', { ascending: false });
      
      if (error) {
        console.error('Error loading historical metadata:', error);
        break;
      }
      
      if (pageData && pageData.length > 0) {
        histData = [...histData, ...pageData];
        histFrom += PAGE_SIZE;
        histHasMore = pageData.length === PAGE_SIZE;
      } else {
        histHasMore = false;
      }
    }
    
    console.log(`Loaded metadata: ${waveData.length} wave entries, ${histData.length} historical entries`);
    
    // Build lightweight objects with metadata only
    const waveAnalysesObj: Record<string, WaveAnalysisEntry> = {};
    const historicalDataObj: Record<string, HistoricalDataEntry> = {};
    
    waveData.forEach(item => {
      const key = item.key.replace('wave_analysis_', '');
      waveAnalysesObj[key] = {
        analysis: { waves: [] }, // Empty placeholder - will be loaded on demand
        timestamp: item.timestamp,
        isLoaded: false
      };
    });
    
    histData.forEach(item => {
      const key = item.key.replace('historical_data_', '');
      historicalDataObj[key] = {
        data: [], // Empty placeholder - will be loaded on demand
        timestamp: item.timestamp,
        isLoaded: false
      };
    });
    
    // Update state with lightweight objects
    setWaveAnalyses(waveAnalysesObj);
    console.log(`Setting histData state with ${Object.keys(historicalDataObj).length} entries`);
    console.dir(Object.keys(historicalDataObj).slice(0, 5)); // Show first 5 keys
    setHistoricalData(historicalDataObj);
    
    // Log what we're setting
    console.log(`Setting state with: ${Object.keys(waveAnalysesObj).length} wave entries, ${Object.keys(historicalDataObj).length} historical entries`);
    
    // Get AI analysis count (just count, no data)
    const { count: aiCount } = await supabase
      .from('cache')
      .select('key', { count: 'exact', head: true })
      .like('key', 'ai_elliott_wave_%');
    
    setAiAnalysisCount(aiCount || 0);
    
    // Save to localStorage for future quick loads
    const cacheData = {
      waves: waveAnalysesObj,
      historical: historicalDataObj,
      aiCount: aiCount || 0
    };
    localStorage.setItem('admin_dashboard_cache', JSON.stringify(cacheData));
    localStorage.setItem('admin_dashboard_cache_timestamp', now.toString());
    setLocalCacheTimestamp(now);
    
  } catch (error) {
    console.error('Error loading cache metadata:', error);
    toast.error('Failed to load cache metadata');
  } finally {
    setIsRefreshing(false);
  }
}, [supabase]);

// Add this function to load the full data when a user clicks on an item
const loadItemDetails = useCallback(async (key: string, type: 'waves' | 'historical') => {
  try {
    // Show loading toast
    toast.info(`Loading full ${type === 'waves' ? 'wave analysis' : 'historical'} data for ${key}...`);
    
    const cacheKey = type === 'waves' ? `wave_analysis_${key}` : `historical_data_${key}`;
    
    // Fetch the full data for just this item, ensure we get the entire data object
    const { data, error } = await supabase
      .from('cache')
      .select('*') // Get all fields including data
      .eq('key', cacheKey)
      .single();
    
    if (error) {
      console.error(`Error loading ${type} data for ${key}:`, error);
      toast.error(`Failed to load ${type} data: ${error.message}`);
      throw error;
    }
    
    if (!data || !data.data) {
      console.error(`No data found for ${key}`);
      toast.error(`No data found for ${key}`);
      return null;
    }
    
    console.log(`Successfully loaded ${type} data for ${key}:`, {
      dataSize: JSON.stringify(data.data).length,
      recordCount: Array.isArray(data.data) ? data.data.length : 'Not an array'
    });
    
    // Update the state with the full data
    if (type === 'waves') {
      setWaveAnalyses(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          analysis: data.data, // Store the entire analysis object
          isLoaded: true
        }
      }));
    } else {
      setHistoricalData(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          data: data.data, // Store all historical data points
          isLoaded: true
        }
      }));
    }
    
    // Return the complete data
    return data.data;
  } catch (error) {
    console.error(`Error loading details for ${key}:`, error);
    toast.error(`Failed to load ${type} data for ${key}`);
    return null;
  }
}, [supabase, toast]);

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
      
      // Process the keys to get symbols - but limit to stockCount TOTAL
      const stocksToAnalyze = (histData || [])
        .map(item => item.key.replace('historical_data_', ''))
        .filter(key => key.includes('_1d'))
        .map(key => key.split('_')[0])
        .slice(0, stockCount); // IMPORTANT: Apply the limit here
      
      console.log(`Analyzing ${stocksToAnalyze.length} stocks (limit: ${stockCount})`);
      
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
          
          // Start the analysis
          const analysisPromise = getAnalysis(symbol, historicalData, true, true);
          
          // IMPORTANT: Don't await immediately to allow UI updates
          // Instead, use the promise's completion to update state

          // Update progress and UI immediately before analysis completes
          completed++;
          setAnalysisProgress(prev => ({
            ...prev,
            current: completed
          }));
          
          // Handle analysis result once it's complete
          analysisPromise.then(analysis => {
            if (analysis && analysis.waves) {
              // Update the waveAnalyses state incrementally
              setWaveAnalyses(prev => ({
                ...prev,
                [`${symbol}_1d`]: {
                  analysis: analysis,
                  timestamp: Date.now(),
                  isLoaded: true // Mark as loaded
                }
              }));
            }
          }).catch(err => {
            console.error(`Error processing analysis result for ${symbol}:`, err);
          });
          
          // Small delay between stocks to prevent performance issues
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.error(`Failed to analyze ${symbol}`, err);
        }
      }
      
      // Wait for all analyses to complete before showing final toast
      toast.success(`Wave analysis completed for ${completed} stocks`);

      // Add this block to update localStorage cache
      const cacheData = {
        waves: waveAnalyses,
        historical: historicalData,
        aiCount: aiAnalysisCount
      };
      localStorage.setItem('admin_dashboard_cache', JSON.stringify(cacheData));
      localStorage.setItem('admin_dashboard_cache_timestamp', Date.now().toString());
      setLocalCacheTimestamp(Date.now());
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
      // First fetch top stocks from the API based on stockCount
      const stocks = await fetchTopStocks(stockCount);
      
      // Check if we got any stocks
      if (!stocks.length) {
        throw new Error('No stocks returned from API');
      }
      
      // Next, separately fetch favorites from Supabase to ensure we have them
      const { data: favoritesData, error: favError } = await supabase
        .from('cache')
        .select('data')
        .eq('key', 'favorite_stocks')
        .single();
        
      // Handle error silently - just log and continue with what we have
      if (favError) {
        console.warn('Could not retrieve favorites:', favError);
      }
      
      // Create an array of all stock symbols we want to fetch, with favorites prioritized
      let symbolsToProcess: string[] = [];

      // Add favorites first (if available)
      if (favoritesData?.data && Array.isArray(favoritesData.data)) {
        // Only take favorites up to the stockCount limit
        symbolsToProcess = favoritesData.data
          .slice(0, stockCount)
          .map(symbol => String(symbol));
      }

      // If we still have room for more stocks, add from the API results
      if (symbolsToProcess.length < stockCount) {
        const remainingCount = stockCount - symbolsToProcess.length;
        
        // Create a set of existing symbols to avoid duplicates
        const existingSymbols = new Set(symbolsToProcess);
        
        // Add unique top stocks up to the remaining count
        for (const stock of stocks) {
          const symbol = String(stock.symbol);
          if (!existingSymbols.has(symbol)) {
            symbolsToProcess.push(symbol);
            existingSymbols.add(symbol);
            
            // Stop when we reach the total limit
            if (symbolsToProcess.length >= stockCount) break;
          }
        }
      }
      
      console.log(`Processing total of ${symbolsToProcess.length} stocks (limit: ${stockCount})`);
      
      // Initialize progress tracking with the actual symbols to fetch
      setHistoryLoadProgress({
        total: symbolsToProcess.length,
        current: 0,
        inProgress: true
      });
      
      // Process the limited list of symbols
      let completed = 0;
      let failed = 0;
      let errors = [];
      
      // Rest of function remains the same, but use symbolsToProcess instead of symbols
      const batchSize = 3;
      for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
        const batch = symbolsToProcess.slice(i, i + batchSize);
        
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
                timestamp: Date.now(),
                isLoaded: true // Mark as loaded
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
      console.log('Historical data load complete, refreshing cache display...');
      await loadCacheData(true); // Force refresh to ensure we see the latest data
      
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
        
        // Clear state IMMEDIATELY so UI updates
        setWaveAnalyses({});
        
        // Then refresh data
        await loadCacheData(true); // Force refresh to ensure cleared state
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
        
        // Clear state IMMEDIATELY so UI updates
        setHistoricalData({});
        
        // Then refresh data
        await loadCacheData(true); // Force refresh to ensure cleared state
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
  cacheExpiryDays: number,
  chartPaddingDays: number  // Add this line
}) => {
  try {
    setIsRefreshing(true);
    
    // Store previous settings to determine what changed
    const previousStockCount = stockCount;
    
    await supabase
      .from('cache')
      .upsert({
        key: 'admin_settings',
        data: settings,
        timestamp: Date.now(),
        duration: 365 * 24 * 60 * 60 * 1000, // 1 year
      }, { onConflict: 'key' });
      
    toast.success('Settings saved successfully');
    
    // Only trigger refresh if stock count changed
    if (settings.stockCount !== previousStockCount) {
      setSettingsChanged(true);
    }
  } finally {
    setIsRefreshing(false);
  }
}, [supabase, stockCount]);

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
    
    if (data?.data?.chartPaddingDays !== undefined) {
      setChartPaddingDays(data.data.chartPaddingDays);
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
      
      // Ask once for confirmation of the complete process, mentioning stock count specifically
      if (window.confirm('The number of stocks to analyze has changed. This will clear existing data and perform a full analysis with the new stock count. This process may take several minutes. Continue?')) {
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

  // Update the useEffect at the bottom of the component
  useEffect(() => {
    // When the component mounts, load data from Supabase, not cache
    const initialLoad = async () => {
      try {
        await loadSettings();
        await loadCacheData(true); // Force a fresh load on initial page load
      } catch (err) {
        console.error('Error during initial data load:', err);
      }
    };
    
    initialLoad();
  }, [loadSettings, loadCacheData]);

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
            onClick={() => loadCacheData(true)} // Force refresh parameter
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
                          key={key} // Add this line
                          itemKey={key}
                          data={waveData}
                          type="waves"
                          onDelete={deleteCacheItem}
                          onClick={async () => {
                            // Always load fresh data when clicking - don't rely on isLoaded flag
                            const fullData = await loadItemDetails(key, "waves");
                            if (!fullData) return; // Don't open modal if loading failed
                            
                            // Now that we have the data, update selectedData and open the modal
                            setSelectedData({
                              type: 'waves',
                              key,
                              data: {
                                analysis: fullData, // Use the freshly loaded data
                                timestamp: (rawData as WaveAnalysisEntry).timestamp || Date.now(),
                                isLoaded: true
                              } as WaveAnalysisEntry
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
                {isRefreshing ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Updating historical data...
                  </div>
                ) : Object.keys(filteredHistoricalData || {}).length === 0 ? (
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
                        key={key} // Add this line
                        itemKey={key}
                        data={data as HistoricalDataEntry}
                        type="historical"
                        onDelete={deleteCacheItem}
                        onClick={async () => {
                          // Always load fresh data when clicking - don't rely on isLoaded flag
                          const fullData = await loadItemDetails(key, "historical");
                          if (!fullData) return; // Don't open modal if loading failed
                          
                          // Now that we have the data, update selectedData and open the modal
                          setSelectedData({
                            type: 'historical',
                            key,
                            data: {
                              data: fullData, // Use the freshly loaded data 
                              timestamp: (data as HistoricalDataEntry).timestamp || Date.now(),
                              isLoaded: true
                            } as HistoricalDataEntry
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
        chartPaddingDays={chartPaddingDays}  // Add this line
        setStockCount={setStockCount}
        setCacheExpiryDays={setCacheExpiryDays}
        setChartPaddingDays={setChartPaddingDays}  // Add this line
        saveSettings={saveSettings}
        isRefreshing={isRefreshing}
        loadSettings={loadSettings}  // Add this line
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
  chartPaddingDays: number;  // Add this line
  setStockCount: (count: number) => void;
  setCacheExpiryDays: (days: number) => void;
  setChartPaddingDays: (days: number) => void;  // Add this line
  saveSettings: (settings: { 
    stockCount: number; 
    cacheExpiryDays: number;
    chartPaddingDays: number;  // Add this line 
  }) => void;
  isRefreshing: boolean;
  loadSettings: () => Promise<void>; // Add this line
}

// 2. Update the SettingsDialog component
const SettingsDialog = ({ 
  isOpen,
  onOpenChange,
  stockCount,
  cacheExpiryDays,
  chartPaddingDays,  // Add this line
  setStockCount,
  setCacheExpiryDays,
  setChartPaddingDays,  // Add this line
  saveSettings,
  isRefreshing,
  loadSettings  // Add this line
}: SettingsDialogProps) => {
  const [localStockCount, setLocalStockCount] = useState(stockCount);
  const [localCacheExpiryDays, setLocalCacheExpiryDays] = useState(cacheExpiryDays);
  const [localChartPaddingDays, setLocalChartPaddingDays] = useState(chartPaddingDays);  // Add this line
  const [activeTab, setActiveTab] = useState("settings");
  
  useEffect(() => {
    if (isOpen) {
      setLocalStockCount(stockCount);
      setLocalCacheExpiryDays(cacheExpiryDays);
      setLocalChartPaddingDays(chartPaddingDays);
    }
  }, [isOpen, stockCount, cacheExpiryDays, chartPaddingDays]);  // Add chartPaddingDays to dependency array
  
  const handleSave = () => {
    setStockCount(localStockCount);
    setCacheExpiryDays(localCacheExpiryDays);
    setChartPaddingDays(localChartPaddingDays);  // Add this line
    saveSettings({ 
      stockCount: localStockCount, 
      cacheExpiryDays: localCacheExpiryDays,
      chartPaddingDays: localChartPaddingDays  // Add this line
    });
    onOpenChange(false);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure admin preferences and system parameters.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings">General Settings</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
          </TabsList>
          
          <TabsContent value="settings" className="space-y-6 mt-4">
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
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="chart-padding-days">Chart Future Projection Days</Label>
                <span className="text-sm font-medium">{localChartPaddingDays}</span>
              </div>
              <Slider
                id="chart-padding-days"
                min={5}
                max={60}
                step={1}
                value={[localChartPaddingDays]}
                onValueChange={(value) => setLocalChartPaddingDays(value[0])}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This controls how many days of future projection space are added to charts.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="favorites" className="mt-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Favorite Stocks</h4>
              <p className="text-xs text-muted-foreground">
                Add stocks that should always be included in analysis regardless of market cap.
              </p>
              <div className="border rounded-md p-3 max-h-[300px] overflow-auto">
                <FavoritesManager onFavoritesChange={loadSettings} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
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

// Fix the DataCard component by removing the embedded key prop
const DataCard = ({ 
  itemKey, 
  data, 
  type, 
  onDelete, 
  onClick,
  getAgeString 
}: DataCardProps) => (
  <Card className="cursor-pointer hover:bg-accent/5 transition-colors">
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