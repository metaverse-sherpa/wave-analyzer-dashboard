import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from 'react-router-dom';
import { getAllAnalyses, clearAllAnalyses } from '@/services/databaseService';
import { toast } from '@/lib/toast';
import { storageHelpers } from '@/lib/storage-monitor'; // Import the storage helpers
import { ArrowLeft, Trash2, RefreshCw, Database, Clock, BarChart3, Activity, LineChart, Loader2, 
         Search, X, Cog, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext'; // Fix this import
import { buildApiUrl } from '@/config/apiConfig';  // Add this import if it doesn't exist
import DataRefreshStatus from '@/components/DataRefreshStatus'; // Add this import
import BackgroundRefreshControl, { REFRESH_COMPLETED_EVENT } from "@/components/BackgroundRefreshControl"; // Import the BackgroundRefreshControl component and event
import WavePatternChart from '@/components/WavePatternChart';
import { getAdminDirectAnalysis } from '@/api/deepseekApi';
import { convertDeepSeekToWaveAnalysis } from '@/utils/wave-analysis';
import { DeepSeekWaveAnalysis, DeepSeekAnalysis, Wave, FibTarget, WaveAnalysisResult, WaveAnalysis, HistoricalDataPoint } from '@/types/shared'; // Consolidated imports
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
import { FavoritesManager } from '@/components/FavoritesManager';
import UserManagement from '@/components/admin/UserManagement';

// Store the original console methods to restore them later
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info
};

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
    waves: Wave[];
    invalidWaves: Wave[];
    currentWave: Wave;
    fibTargets: FibTarget[];
    trend: 'bullish' | 'bearish' | 'neutral';
    impulsePattern?: boolean;
    correctivePattern?: boolean;
    [key: string]: any;
  };
  timestamp: number;
  isLoaded?: boolean;
  currentWave?: string | number; // Add this property
}

// Define a proper type for selectedData
type SelectedDataType = 
  | { type: 'waves'; key: string; data: WaveAnalysisEntry }
  | { type: 'historical'; key: string; data: HistoricalDataEntry }
  | null;

// Add this function before the AdminDashboard component
const fetchTopStocks = async (limit: number): Promise<{symbol: string}[]> => {
  try {
    const apiUrl = buildApiUrl(`/stocks/top?limit=${limit}`);
    console.log(`Fetching top stocks from API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      // Add cache control to avoid stale responses
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      console.error(`API returned status ${response.status}`);
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Handle both array response and object with data property
    const stocks = Array.isArray(data) ? data : (data.data || []);
    
    // Make sure we have the expected format
    const formattedStocks = stocks.map((stock: any) => ({
      symbol: typeof stock === 'string' ? stock : (stock.symbol || '')
    })).filter((stock: {symbol: string}) => !!stock.symbol);

    console.log(`Successfully fetched ${formattedStocks.length} top stocks`);
    
    // Return an empty array if we have no stocks to prevent further errors
    if (formattedStocks.length === 0) {
      console.warn("API returned 0 stocks, using fallback list");
      return getFallbackStocks();
    }
    
    return formattedStocks;
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    
    // Return a fallback list of common stocks when the API fails
    return getFallbackStocks();
  }
};

// Add a helper function to provide fallback stock symbols when the API fails
const getFallbackStocks = (): {symbol: string}[] => {
  console.log("Using fallback stocks list");
  return [
    { symbol: 'AAPL' },
    { symbol: 'MSFT' },
    { symbol: 'GOOGL' },
    { symbol: 'AMZN' },
    { symbol: 'TSLA' },
    { symbol: 'META' },
    { symbol: 'NVDA' },
    { symbol: 'JPM' },
    { symbol: 'JNJ' },
    { symbol: 'V' },
    { symbol: 'PG' },
    { symbol: 'DIS' },
    { symbol: 'BAC' },
    { symbol: 'MA' },
    { symbol: 'HD' },
    { symbol: 'INTC' },
    { symbol: 'VZ' },
    { symbol: 'ADBE' },
    { symbol: 'CSCO' },
    { symbol: 'NFLX' }
  ];
};

// Add this function to fetch historical data directly from API
const fetchHistoricalData = async (symbol: string, timeframe: string = '1d') => {
  try {
    console.log(`Fetching historical data for ${symbol} with timeframe ${timeframe}`);
    
    // Get historical data directly from API without caching
    // Changed lookback from 1095 days (3 years) to 365 days (1 year) to match chart display capabilities
    const url = buildApiUrl(`/stocks/${symbol}/history/${timeframe}?lookback=365`);
    console.log(`Requesting historical data with URL: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status} for ${symbol}`);
    }
    
    const json = await response.json();
    
    if (!json || !json.data || !Array.isArray(json.data)) {
      throw new Error(`Invalid data format for ${symbol}`);
    }
    
    console.log(`Received ${json.data.length} data points for ${symbol}, date range: ${new Date(json.data[0].timestamp).toISOString()} to ${new Date(json.data[json.data.length-1].timestamp).toISOString()}`);
    return json.data;
  } catch (error) {
    console.error(`Failed to fetch historical data for ${symbol}:`, error);
    throw error;
  }
};

// Replace getAnalysis function with direct Elliott Wave analysis
const getAnalysis = async (symbol: string): Promise<WaveAnalysis | null> => {
  try {
    // Get historical data for the symbol
    const historicalData = await fetchHistoricalData(symbol);
    
    if (!historicalData || historicalData.length < 50) {
      console.warn(`Insufficient historical data for ${symbol} in getAnalysis`);
      return null; // Return null if not enough data
    }

    console.log(`Analyzing Elliott Waves for ${symbol} using built-in analysis module...`);
    
    // Import the Elliott Wave analysis function dynamically
    const { analyzeElliottWaves } = await import('@/utils/elliottWaveAnalysis');
    
    // Call the Elliott Wave analysis function directly
    const analysis = await analyzeElliottWaves(
      symbol,
      historicalData,
      () => false,      // isCancelled function
      undefined,      // onProgress callback
      false           // verbose flag
    );
    
    // Apply consistent cleanup logic for the current wave, matching WaveAnalysisContext
    if (analysis.currentWave) {
      // Always ensure currentWave is marked as incomplete and has no end properties
      analysis.currentWave.isComplete = false;
      console.log(`[Admin:getAnalysis] Ensuring currentWave is marked incomplete for ${symbol}`);

      // Remove endTimestamp and endPrice if they exist on the current wave
      if ('endTimestamp' in analysis.currentWave) {
        delete analysis.currentWave.endTimestamp;
        console.log(`[Admin:getAnalysis] Removed endTimestamp from currentWave for ${symbol}`);
      }
      if ('endPrice' in analysis.currentWave) {
        delete analysis.currentWave.endPrice;
        console.log(`[Admin:getAnalysis] Removed endPrice from currentWave for ${symbol}`);
      }
      
      // Also update the corresponding wave in the main waves array if it exists and matches
      const currentWaveIndex = analysis.waves.findIndex(
        w => w.startTimestamp === analysis.currentWave?.startTimestamp && w.number === analysis.currentWave?.number
      );
      if (currentWaveIndex !== -1) {
         analysis.waves[currentWaveIndex].isComplete = false;
         if ('endTimestamp' in analysis.waves[currentWaveIndex]) {
           delete analysis.waves[currentWaveIndex].endTimestamp;
         }
         if ('endPrice' in analysis.waves[currentWaveIndex]) {
           delete analysis.waves[currentWaveIndex].endPrice;
         }
         console.log(`[Admin:getAnalysis] Also cleaned up wave in main array at index ${currentWaveIndex} for ${symbol}`);
      }
      
    } else {
      console.log(`[Admin:getAnalysis] No current wave found for ${symbol}`);
    }
    
    // Return the analysis result with added symbol field and required properties
    return {
      ...analysis,
      symbol: symbol,
      impulsePattern: analysis.impulsePattern || false,
      correctivePattern: analysis.correctivePattern || false
    };
  } catch (error) {
    console.error('Error performing Elliott Wave analysis:', error);
    return null;
  }
};

const AdminDashboard: React.FC = () => {
  const { getAnalysis: getWaveAnalysis, analysisEvents, cancelAllAnalyses, clearCache, refreshStockAnalysis } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData();
  const [isLoading, setIsLoading] = useState(false);
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalDataEntry>>({});
  const [waveAnalyses, setWaveAnalyses] = useState<Record<string, WaveAnalysisEntry>>({});

  // Use useEffect for data loading instead of during render
  useEffect(() => {
    const loadAnalysis = async () => {
      if (!historicalData?.AAPL || !historicalData.AAPL.data || historicalData.AAPL.data.length < 50) {
        return; // Not enough data yet
      }

      setIsLoading(true);
      try {
        await getWaveAnalysis('AAPL');
      } catch (error) {
        console.error('Error loading wave analysis:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalysis();
  }, [historicalData?.AAPL, getWaveAnalysis]);

  // Show loading state
  if (isLoading) {
    return <div>Loading wave analysis...</div>;
  }

  const [cacheData, setCacheData] = useState<{
    waves: Record<string, any>;
    historical: Record<string, any>;
  }>({
    waves: {},
    historical: {}
  });
  const [selectedData, setSelectedData] = useState<SelectedDataType>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false,
    currentSymbol: undefined as string | undefined
  });
  const [historyLoadProgress, setHistoryLoadProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false,
    currentSymbol: undefined as string | undefined,
    processedSymbols: [] as string[] // Add this line to track processed symbols
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

  // Add these state declarations at the top of the AdminDashboard component
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>('');
  const [selectedStockList, setSelectedStockList] = useState<string>('');
  const [selectedStockFilter, setSelectedStockFilter] = useState<string>('');
  const [ignoreCache, setIgnoreCache] = useState<boolean>(false);

  // Context hooks

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
    const cachedTimestampStr = localStorage.getItem('admin_dashboard_cache_timestamp') || 
                              localStorage.getItem('admin_dashboard_cache_chunk_timestamp');
    const cachedTimestamp = localCacheTimestamp || (cachedTimestampStr ? parseInt(cachedTimestampStr) : 0);
    
    // Use storage helpers to get potentially chunked data
    const cachedData = storageHelpers.getItem('admin_dashboard_cache');
    
    if (!forceRefresh && cachedData && (now - cachedTimestamp < LOCAL_CACHE_TTL)) {
      // Use local cache if it's recent enough
      console.log('Using local cache from', new Date(cachedTimestamp).toLocaleTimeString());
      try {
        const parsedCache = JSON.parse(cachedData);
        setWaveAnalyses(parsedCache.waves || {});
        setHistoricalData(parsedCache.historical || {});
        setAiAnalysisCount(parsedCache.aiCount || 0);
        setIsRefreshing(false);
        return;
      } catch (parseError) {
        console.error('Error parsing cached data:', parseError);
        // Continue with fresh data load if parsing fails
      }
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
        .select('key, timestamp, data') // Add data to selected fields
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
      let currentWave = undefined;
      
      // Extract current wave from the data if available
      if (item.data?.waves && item.data.waves.length > 0) {
        const lastWave = item.data.waves[item.data.waves.length - 1];
        currentWave = lastWave.number;
      }
      
      waveAnalysesObj[key] = {
        analysis: item.data || { waves: [] },
        timestamp: item.timestamp,
        isLoaded: true,
        currentWave // Store the current wave number
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
    
    try {
      // Use storage helpers to store potentially large data with chunking
      const cacheString = JSON.stringify(cacheData);
      const success = storageHelpers.setItem('admin_dashboard_cache', cacheString);
      
      if (success) {
        // Store timestamp separately
        localStorage.setItem('admin_dashboard_cache_chunk_timestamp', now.toString());
        setLocalCacheTimestamp(now);
        console.log('Successfully stored cache data in localStorage (possibly chunked)');
      } else {
        // If chunking failed, we'll still have the in-memory data, just no persistence
        console.warn('Failed to save cache to localStorage due to size constraints');
        toast.warning('Cache is too large to save locally. Data will be reloaded on refresh.');
      }
    } catch (storageError) {
      console.error('Error saving to localStorage:', storageError);
      // Failure to cache is not critical, just log warning
      toast.warning('Failed to save cache locally due to browser limitations');
    }
    
  } catch (error) {
    console.error('Error loading cache metadata:', error);
    toast.error('Failed to load cache metadata');
  } finally {
    setIsRefreshing(false);
  }
}, [supabase]);

// Add this function to load the full data when a user clicks on an item
const loadItemDetails = useCallback((key: string, type: 'waves' | 'historical') => {
  return new Promise(async (resolve) => {
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
        resolve(null);
      }
      
      if (!data || !data.data) {
        console.error(`No data found for ${key}`);
        toast.error(`No data found for ${key}`);
        resolve(null);
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
      resolve(data.data);
    } catch (error) {
      console.error(`Error loading details for ${key}:`, error);
      toast.error(`Failed to load ${type} data for ${key}`);
      resolve(null);
    }
  });
}, [supabase, toast]);

const analyzeWaves = useCallback(async () => {
  if (!selectedAnalysisType || !selectedStockList || !selectedStockFilter) {
    toast.error('Please select all required options');
    return;
  }

  // If ignoreCache is selected, clear existing wave analysis cache first
  // Note: refreshStockAnalysis might handle its own caching logic, 
  // but clearing here ensures a fresh start if requested.
  if (ignoreCache) {
    try {
      console.log('[Admin:analyzeWaves] Clearing wave analysis cache due to ignoreCache=true');
      const { error } = await supabase
        .from('cache')
        .delete()
        .like('key', 'wave_analysis_%');
      
      if (error) {
        console.error('Error clearing wave analysis cache:', error);
        toast.error('Failed to clear wave analysis cache');
      } else {
        // Clear local state as well
        setWaveAnalyses({});
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Start the analysis process
  setAnalysisProgress({
    total: selectedStockList.length,
    current: 0,
    inProgress: true,
    currentSymbol: selectedStockList[0]
  });

  try {
    let waveAnalyzed = 0;
    let failedAnalyses = 0;
    
    // Use the refreshStockAnalysis function from the context

    for (const symbol of selectedStockList) {
      setAnalysisProgress(prev => ({
        ...prev,
        currentSymbol: symbol
      }));

      try {
        console.log(`[Admin:analyzeWaves] Calling refreshStockAnalysis for ${symbol}`);
        // Call the same refresh function used in StockDetails
        const success = await refreshStockAnalysis(symbol);
        
        if (success) {
          waveAnalyzed++;
          console.log(`[Admin:analyzeWaves] refreshStockAnalysis succeeded for ${symbol}`);
        } else {
          failedAnalyses++;
          console.warn(`[Admin:analyzeWaves] refreshStockAnalysis failed for ${symbol}`);
          // Optionally add a specific toast message for failed symbols
          // toast.warning(`Analysis failed for ${symbol}`); 
        }

        // Update progress regardless of success/failure for this symbol
        setAnalysisProgress(prev => ({
          ...prev,
          current: prev.current + 1
        }));

      } catch (error) {
        failedAnalyses++;
        console.error(`[Admin:analyzeWaves] Error calling refreshStockAnalysis for ${symbol}:`, error);
        toast.error(`Error analyzing ${symbol}: ${(error as Error).message}`);
        // Update progress even on error
        setAnalysisProgress(prev => ({
          ...prev,
          current: prev.current + 1
        }));
      }

      // Small delay between analyses to avoid overwhelming APIs or context updates
      await new Promise(r => setTimeout(r, 200)); // Increased delay slightly
    }

    // Update the local state with the potentially new analyses from the context/cache
    await loadCacheData(true); // Force refresh to pull latest data
    
    if (failedAnalyses > 0) {
      toast.warning(`Wave analysis completed for ${waveAnalyzed} stocks, ${failedAnalyses} failed.`);
    } else {
      toast.success(`Wave analysis completed successfully for ${waveAnalyzed} stocks`);
    }

  } catch (error) {
    console.error('Error during bulk wave analysis:', error);
    toast.error('Failed to complete bulk wave analysis');
  } finally {
    setAnalysisProgress({
      total: 0,
      current: 0,
      inProgress: false,
      currentSymbol: undefined
    });
  }
}, [selectedAnalysisType, selectedStockList, selectedStockFilter, ignoreCache, supabase, loadCacheData, refreshStockAnalysis]);

  // Function to preload historical data for top stocks
  const preloadHistoricalData = useCallback(async () => {
    // Make the historical tab active
    setActiveTab("historical");
    
    setIsRefreshing(true);
    try {
      // First fetch top stocks from the API based on stockCount
      const topStocksFromAPI = await fetchTopStocks(stockCount);
      
      // Check if we got any stocks
      if (!topStocksFromAPI || topStocksFromAPI.length === 0) {
        toast.error('Failed to fetch top stocks, please try again');
        setIsRefreshing(false);
        return;
      }
      
      // Update the state with the fetched stocks
      setTopStocks(topStocksFromAPI);
      
      // Process stocks in small chunks to provide better UI feedback
      const symbolsToProcess = topStocksFromAPI.map(stock => stock.symbol);
      
      // Initialize favorites to an empty array if null
      const { data: favoritesData } = await supabase
        .from('cache')
        .select('data')
        .eq('key', 'favorite_stocks')
        .single();
      
      const favoriteSymbols = (favoritesData?.data || []) as string[];
      
      // Initialize progress tracking with empty processedSymbols array
      setHistoryLoadProgress({
        total: symbolsToProcess.length,
        current: 0,
        inProgress: true,
        currentSymbol: undefined,
        processedSymbols: [] // Initialize processedSymbols as an empty array
      });
      
      // Track which favorites are invalid to remove later
      let invalidFavorites: string[] = [];
      let validFavorites: string[] = [];
      
      // Process the limited list of symbols
      let completed = 0;
      let failed = 0;
      let errors = [];
      
      // Use a smaller batch size for more frequent UI updates
      const batchSize = 1; // Process one at a time for smoother UI updates
      for (let i = 0; i < symbolsToProcess.length; i += batchSize) {
        const batch = symbolsToProcess.slice(i, i + batchSize);
        
        // Process each stock in the batch sequentially for better UI updates
        for (const symbol of batch) {
          try {
            // Update the UI to show which stock is currently being processed
            setHistoryLoadProgress(prev => ({
              ...prev,
              currentSymbol: symbol
            }));
            
            // Update the currentApiCall state to show in UI
            setCurrentApiCall(`Loading historical data for ${symbol}...`);
            
            // Get historical data with the correct timeframe
            const data = await fetch(buildApiUrl(`/stocks/${symbol}/history/1d`));
            
            // Check for HTTP errors first
            if (!data.ok) {
              throw new Error(`API returned status ${data.status} for ${symbol}`);
            }
            
            const json = await data.json();
            
            // Basic validation
            if (!json || !json.data || !Array.isArray(json.data)) {
              throw new Error(`Invalid data format for ${symbol}`);
            }
            
            if (json.data.length < 50) {
              throw new Error(`Insufficient data points for ${symbol}: only ${json.data.length} found (minimum 50 required)`);
            }
            
            // Format data for our application needs - must be compatible with downstream functions
            const formattedData = json.data.map(item => {
              // Handle various timestamp formats consistently
              let timestamp = item.timestamp || item.date; // Try alternate field name if timestamp is undefined

              // Convert string timestamps to numbers
              if (typeof timestamp === 'string') {
                timestamp = new Date(timestamp).getTime(); // Use Date parsing for strings
              } 
              
              // If timestamp is still undefined, generate a reasonable timestamp based on index
              if (timestamp === undefined) {
                // Create a timestamp based on today minus the index days (oldest data first)
                const index = json.data.indexOf(item);
                const today = new Date();
                const date = new Date(today);
                date.setDate(today.getDate() - (json.data.length - index));
                timestamp = date.getTime();
                
                console.warn(`Generated timestamp for ${symbol} data point at index ${index} - data issue should be reported`);
              }

              // Convert seconds to milliseconds if needed
              if (typeof timestamp === 'number' && timestamp < 4000000000) {
                timestamp *= 1000;
              }

              // Validate timestamp
              const date = new Date(timestamp);
              if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
                console.warn(`Invalid timestamp ${timestamp} for ${symbol}, using current time`);
                timestamp = Date.now() - (json.data.length - json.data.indexOf(item)) * 86400000; // Approximate daily intervals
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
            
            // Update the local state incrementally in real-time with a function updater 
            setHistoricalData(prev => {
              const newData = {
                ...prev,
                [`${symbol}_1d`]: {
                  data: formattedData,
                  timestamp: Date.now(),
                  isLoaded: true // Mark as loaded
                }
              };
              return newData;
            });
            
            // Update the processed symbols array for real-time UI updates
            setHistoryLoadProgress(prev => ({
              ...prev,
              processedSymbols: [...prev.processedSymbols, symbol]
            }));
            
            completed++;
            
            // If this is a favorite, mark it as valid
            if (favoriteSymbols.includes(symbol)) {
              validFavorites.push(symbol);
            }
            
            console.log(`Stored ${symbol} data in Supabase (${formattedData.length} points)`);
          } catch (error) {
            console.error(`Failed to load data for ${symbol}:`, error);
            errors.push(`${symbol}: ${error.message}`);
            failed++;

            // Check if this is a favorite stock
            const isFavorite = favoriteSymbols.includes(symbol);
            
            // For HTTP 500 errors, always add to invalidFavorites if it's a favorite
            const isServerError = error.message && (
              error.message.includes("500") || 
              error.message.includes("API returned status 500")
            );
            
            if (isFavorite) {
              console.log(`Adding ${symbol} to invalidFavorites list - is server error: ${isServerError}`);
              invalidFavorites.push(symbol);
              
              // IMPORTANT: Immediately remove from favorites when error occurs
              try {
                // Get the current favorites list right now
                const { data: currentFavs } = await supabase
                  .from('cache')
                  .select('data')
                  .eq('key', 'favorite_stocks')
                  .single();
                  
                if (currentFavs && Array.isArray(currentFavs.data)) {
                  // Remove the invalid symbol
                  const updatedFavorites = (currentFavs.data as string[]).filter(s => s !== symbol);
                  
                  // Update favorites in Supabase
                  await supabase
                    .from('cache')
                    .upsert({
                      key: 'favorite_stocks',
                      data: updatedFavorites,
                      timestamp: Date.now(),
                      duration: 365 * 24 * 60 * 60 * 1000, // 1 year
                      is_string: false
                    }, { onConflict: 'key' });
                }
              } catch (favError) {
                console.error(`Failed to update favorites after removing ${symbol}:`, favError);
              }
            }
          } finally {
            // Update progress regardless of success or failure
            setHistoryLoadProgress(prev => ({
              ...prev,
              current: prev.current + 1
            }));
          }
        }
      }
      
      // Reset API call display
      setCurrentApiCall(null);
      
      // Success message
      if (failed > 0) {
        toast.warning(`Historical data loaded with issues - ${completed} succeeded, ${failed} failed`);
        
        // Display error details in the console in a readable format
        console.error('Historical data load failures:', errors);
      } else {
        toast.success(`Historical data stored in Supabase successfully for all ${completed} stocks`);
      }

      // Now automatically analyze the waves too
      if (completed > 0) {
        try {
          toast.info("Starting wave analysis for loaded historical data...");
          
          // Switch to the waves tab to show analysis progress
          setActiveTab("waves");

          // Initialize progress tracking for wave analysis
          setAnalysisProgress({
            total: completed,
            current: 0,
            inProgress: true,
            currentSymbol: undefined
          });

          // Get all symbols that were successfully loaded with historical data
          const symbolsToAnalyze = Object.keys(historicalData)
            .filter(key => key.includes('_1d'))
            .map(key => key.split('_')[0])
            .slice(0, stockCount);
            
          console.log(`Analyzing waves for ${symbolsToAnalyze.length} symbols...`);
          
          // Process one symbol at a time for smoother UI updates
          let waveAnalyzed = 0;
          
          for (const symbol of symbolsToAnalyze) {
            try {
              // Update the UI to show which stock is currently being processed
              setAnalysisProgress(prev => ({
                ...prev,
                currentSymbol: symbol
              }));
              
              console.log(`Analyzing waves for ${symbol}...`);
              
              // Get the historical data that was just loaded
              const historicalData = await getHistoricalData(symbol, '1d');
              
              // Require at least 50 data points for analysis
              if (!historicalData || historicalData.length < 50) {
                console.warn(`Insufficient data for ${symbol}: only ${historicalData?.length || 0} data points`);
                continue; // Skip this stock
              }
              
              // Start the analysis
              const analysis = await getAnalysis(symbol);
              
              // If we have valid analysis results
              if (analysis && analysis.waves) {
                // Update state
                setWaveAnalyses(prev => ({
                  ...prev,
                  [`${symbol}_1d`]: {
                    analysis: analysis,
                    timestamp: Date.now(),
                    isLoaded: true // Mark as loaded
                  }
                }));

                // CRITICAL: Explicitly save the wave analysis to Supabase
                console.log('[WaveAnalysis] Inserting/updating record:', {
                  key: `wave_analysis_${symbol}_1d`,
                  wavesCount: analysis.waves.length,
                  trend: analysis.trend,
                  currentWave: analysis.currentWave?.number
                });
                const upsertResult = await supabase
                  .from('cache')
                  .upsert({
                    key: `wave_analysis_${symbol}_1d`,
                    data: analysis,
                    timestamp: Date.now(),
                    duration: 7 * 24 * 60 * 60 * 1000, // 7 days
                    is_string: false
                  }, { onConflict: 'key' });
                if (upsertResult.error) {
                  console.error('[WaveAnalysis] Supabase upsert error:', upsertResult.error);
                } else {
                  console.log(`[WaveAnalysis] Successfully stored wave analysis for ${symbol} in Supabase`, upsertResult);
                }
                waveAnalyzed++;
              }
            } catch (err) {
              console.error(`Failed to analyze ${symbol}`, err);
            } finally {
              // Update progress regardless of success or failure
              setAnalysisProgress(prev => ({
                ...prev,
                current: prev.current + 1
              }));
            }

            // Small delay between analyses
            await new Promise(r => setTimeout(r, 100));
          }

          // Final success message for wave analysis
          toast.success(`Wave analysis completed for ${waveAnalyzed} stocks`);
          
          // Update cache data after all analyses are done
          await loadCacheData(true);
        } catch (waveErr) {
          console.error('Error during automatic wave analysis:', waveErr);
          toast.error('Error occurred during automatic wave analysis');
        } finally {
          // Reset progress indicator
          setAnalysisProgress({
            total: 0,
            current: 0,
            inProgress: false,
            currentSymbol: undefined
          });
        }
      }
    } catch (error) {
      console.error('Error preloading historical data:', error);
      toast.error(`Failed to preload historical data: ${error.message}`);
    } finally {
      // Reset progress and clear current API call
      setHistoryLoadProgress({
        total: 0,
        current: 0,
        inProgress: false,
        currentSymbol: undefined,
        processedSymbols: [] // Reset processedSymbols to an empty array
      });
      setCurrentApiCall(null);
      setIsRefreshing(false);
    }
  }, [loadCacheData, supabase, stockCount, fetchTopStocks, cacheExpiryDays, getHistoricalData, getAnalysis]);

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
  const clearHistoricalCache = async () => {
    toast.info('Historical data is no longer cached');
  };

// Add this function near your other clear functions - this one skips the confirmation dialog
const clearHistoricalCacheWithoutConfirm = async () => {
  toast.info('Historical data is no longer cached');
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
        getAnalysis(latestEvent.symbol)
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

  // Move setWaveAnalyses hook inside the component
  const setWaveAnalysisData = useCallback(async (symbol: string, analysis: WaveAnalysisResult) => {
    try {
      // Store the wave analysis with current wave information
      await supabase
        .from('cache')
        .upsert({
          key: `wave_analysis_${symbol}_1d`,
          data: analysis,
          timestamp: Date.now(),
          duration: 7 * 24 * 60 * 60 * 1000, // 7 days
          is_string: false
        }, { onConflict: 'key' });
      
      // Update local state
      setWaveAnalyses(prev => ({
        ...prev,
        [`${symbol}_1d`]: {
          analysis,
          timestamp: Date.now(),
          isLoaded: true
        }
      }));
    } catch (error) {
      console.error(`Error storing wave analysis for ${symbol}:`, error);
    }
  }, [supabase]);

  // Add this function to save settings to Supabase
const saveSettings = useCallback(async (settings: { 
  stockCount: number,
  cacheExpiryDays: number,
  chartPaddingDays: number  
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
  } catch (error) {
    console.error('Error saving settings:', error);
    toast.error('Failed to save settings');
  } finally {
    setIsRefreshing(false);
  }
}, [supabase, stockCount]);

  // Add this function to load settings from Supabase
  const loadSettings = useCallback(async () => {
    try {
      setIsRefreshing(true);
      
      // Get settings from Supabase
      const { data, error } = await supabase
        .from('cache')
        .select('data')
        .eq('key', 'admin_settings')
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // Not found, use defaults
          console.log('No saved settings found, using defaults');
        } else {
          console.error('Error loading settings:', error);
          toast.error('Failed to load settings');
        }
      } else if (data?.data) {
        // Apply loaded settings
        const settings = data.data;
        setStockCount(settings.stockCount || 100);
        setCacheExpiryDays(settings.cacheExpiryDays || 7);
        setChartPaddingDays(settings.chartPaddingDays || 20);
        
        console.log('Settings loaded successfully:', settings);
      }
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error in loadSettings:', error);
      toast.error('Failed to load settings');
      return Promise.resolve();
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase, setStockCount, setCacheExpiryDays, setChartPaddingDays]);

  useEffect(() => {
    // Create a special log function that will always work for important operations
    window._addApiError = (error: string) => {
      originalConsole.error(`[API ERROR]: ${error}`);
    };
    
    // Don't disable all console logs to allow seeing important operations
    // Only suppress non-essential logs for cleaner console output
    console.log = (...args) => {
      // Allow logs that contain specific debugging prefixes
      const message = args[0]?.toString() || '';
      if (
        message.includes('DEBUG:') ||
        message.includes('Analyzing waves') ||
        message.includes('Elliott Wave') ||
        message.includes('SCHEDULED REFRESH')
      ) {
        originalConsole.log(...args);
      }
    };
    console.warn = originalConsole.warn;  // Keep warnings visible
    console.error = originalConsole.error; // Keep errors visible
    console.info = (...args) => {
      // Allow important info messages
      const message = args[0]?.toString() || '';
      if (message.includes('Elliott Wave') || message.includes('analysis')) {
        originalConsole.info(...args);
      }
    };

    return () => {
      // Restore original console methods during unmount
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
      window._addApiError = undefined;
    };
  }, []);

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
          {/* System Administrator badge removed */}
        </div>
        
        {/* Refresh Data button removed */}
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
              {/* Cache Management Section */}
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
          <DataRefreshStatus isRefreshing={isRefreshing} />
          <BackgroundRefreshControl /> {/* Add the BackgroundRefreshControl component here */}
        </div>
        
        {/* Right column - Tabs */}
        <div className="col-span-1 lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-col sm:flex-row w-full">
              <TabsTrigger value="waves" className="flex-1 justify-start">
                <BarChart3 className="h-4 w-4 mr-2" />
                Wave Analysis Cache
              </TabsTrigger>
              <TabsTrigger value="users" className="flex-1 justify-start">
                <Users className="h-4 w-4 mr-2" />
                User Management
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="waves" className="border rounded-md p-2 sm:p-4 min-h-[500px]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-2 sm:space-y-0">
                <h3 className="text-lg font-medium">
                  Wave Analysis Data ({cacheStats.waveEntryCount})
                </h3>
                
                {/* Add search box for wave analysis tab */}
                <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-sm sm:ml-4">
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
                    {analysisProgress.currentSymbol && (
                      <span className="ml-1 font-semibold">{analysisProgress.currentSymbol}</span>
                    )}
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
                {/* Only show loading spinner when isRefreshing is true but NOT when actively analyzing waves */}
                {isRefreshing && !analysisProgress.inProgress ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Updating wave analysis data...
                  </div>
                ) : Object.keys(filteredWaveAnalyses || {}).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {Object.keys(waveAnalyses).length === 0 ? (
                      analysisProgress.inProgress ? 
                        "Analyzing data... stocks will appear as they're processed" :
                        "No wave analysis cache found"
                    ) : (
                      `No results found for "${waveSearchQuery}"`
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(filteredWaveAnalyses || {}).map(([key, rawData]) => {
                      // Type assert and transform the raw data
                      const data = rawData as unknown as { 
                        analysis?: WaveAnalysisResult;
                        timestamp?: number;
                      };
                      
                      // Extract the current wave number if available
                      let currentWave: string | number | undefined = undefined;
                      if (data.analysis?.waves && data.analysis?.waves.length > 0) {
                        // Get the last wave in the array as the current one
                        const lastWave = data.analysis.waves[data.analysis.waves.length - 1];
                        currentWave = lastWave.number;
                      }
                      
                      // Create a properly typed wave data object
                      const waveData = {
                        analysis: {
                          waves: data.analysis?.waves || [],
                          invalidWaves: data.analysis?.invalidWaves || [],
                          currentWave: {
                            number: currentWave || 0,
                            startTimestamp: data.timestamp || Date.now(),
                            startPrice: 0,
                            type: 'corrective' as const,
                            isComplete: false,
                            isImpulse: false
                          },
                          fibTargets: data.analysis?.fibTargets || [],
                          trend: data.analysis?.trend || 'neutral',
                          impulsePattern: data.analysis?.impulsePattern || data.analysis?.waves?.some(w => w.number === 5) || false,
                          correctivePattern: data.analysis?.correctivePattern || data.analysis?.waves?.some(w => w.number === 'C') || false
                        },
                        timestamp: data.timestamp || Date.now(),
                        isLoaded: true
                      } as WaveAnalysisEntry;
                    
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
                          // Pass the current wave number to the DataCard
                          waveNumber={currentWave}
                        />
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="users" className="border rounded-md p-4 min-h-[500px]">
              <UserManagement />
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
  waveNumber?: string | number; // Add this line
}

// Fix the DataCard component by removing the embedded key prop
const DataCard = ({ 
  itemKey, 
  data, 
  type, 
  onDelete, 
  onClick,
  getAgeString,
  waveNumber // Add this line
}: DataCardProps) => (
  <Card className="cursor-pointer hover:bg-accent/5 transition-colors">
    <CardContent className="p-3 flex items-center justify-between">
      <div className="flex-1" onClick={onClick}>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="fontmedium text-sm">{itemKey}</span>
            {waveNumber !== undefined && (
              <Badge variant="outline" className="text-xs py-0 h-5">
                Wave {waveNumber}
              </Badge>
            )}
          </div>
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