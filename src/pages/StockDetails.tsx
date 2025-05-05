import React, { useEffect, useState, useMemo, useCallback } from 'react'; // Add useCallback
import { useParams, useNavigate, Link } from 'react-router-dom'; // Import useNavigate and Link
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Import RadioGroup
import { Label } from "@/components/ui/label"; // Import Label
import { Badge } from "@/components/ui/badge"; // Import Badge
import { ArrowLeft, ArrowUpRight, ArrowDownRight, AlertCircle } from 'lucide-react'; // Import icons
import { useHistoricalData } from '@/context/HistoricalDataContext';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useAuth } from '@/context/AuthContext';
import { usePreview } from '@/context/PreviewContext';
import StockDetailChart from '../components/StockDetailChart'; // Corrected path
import AIAnalysisComponent from '../components/AIAnalysis'; // Corrected path & renamed import
import { WaveAnalysisResult, StockData, Wave, StockHistoricalData, FibTarget } from '@/types/shared'; // Import types
import { useTelegram } from '@/context/TelegramContext';
import TelegramLayout from '../components/layout/TelegramLayout'; // Corrected path
import WaveSequencePagination from '../components/WaveSequencePagination'; // Import WaveSequencePagination
import { fetchStockQuote } from '@/lib/api'; // Using the correct function name
import { getWavePatternDescription } from '../components/chart/waveChartUtils'; // Corrected path
import { getCachedWaveAnalysis } from '../utils/wave-analysis'; // Corrected path

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface StockDetailsProps {
  stock?: StockData;
}

const defaultStock: StockData = {
  symbol: '',
  name: '',
  shortName: '',
  price: 0,
  change: 0,
  changePercent: 0,
  volume: 0,
  regularMarketPrice: 0,
  regularMarketChange: 0,
  regularMarketChangePercent: 0,
  averageVolume: 0,
  marketCap: 0,
  fiftyTwoWeekLow: 0,
  fiftyTwoWeekHigh: 0,
};

const getMostRecentWaves = (waves: Wave[], count: number = 7): Wave[] => {
  return [...waves]
    .sort((a, b) => {
      const aTimestamp = typeof a.startTimestamp === 'number' ? a.startTimestamp : Date.parse(a.startTimestamp as string);
      const bTimestamp = typeof b.startTimestamp === 'number' ? b.startTimestamp : Date.parse(b.startTimestamp as string);
      return bTimestamp - aTimestamp;
    })
    .slice(0, count);
};

const MAX_CACHE_AGE_DAYS = 1;

const getAgeString = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  } else {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'}`;
  }
};

const StockDetails: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate(); // Get navigate function
  const { isTelegram } = useTelegram();
  const {
    loadCacheTableData,
    isDataLoaded,
    waveAnalysesCache,
    refreshStockAnalysis, // <-- Import refresh function
    allAnalyses         // <-- Import the cache with timestamps
  } = useWaveAnalysis();
  const { user } = useAuth(); // Get user from AuthContext
  const { isPreviewMode } = usePreview(); // Get isPreviewMode from PreviewContext

  const handleBackClick = () => {
    navigate(-1); // Go back to the previous page
  };

  const [stockData, setStockData] = useState<StockData>(defaultStock);
  const [historicalData, setHistoricalData] = useState<StockHistoricalData[]>([]);
  const [loading, setLoading] = useState(true); // Keep general loading state
  const [viewMode, setViewMode] = useState<'all' | 'current'>('current');
  const [selectedWave, setSelectedWave] = useState<Wave | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialRefreshDone, setIsInitialRefreshDone] = useState(false); // <-- State to track auto-refresh

  const { getHistoricalData } = useHistoricalData();

  const analysis = useMemo(() => {
    if (!symbol) return null;
    const cacheKey = `${symbol}:1d`; // Assuming '1d' timeframe for now
    return waveAnalysesCache[cacheKey] || null;
  }, [symbol, waveAnalysesCache]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); // Start loading
      setIsInitialRefreshDone(false); // Reset refresh flag when symbol changes
      setError(null);
      if (!symbol) {
        setLoading(false);
        setError("No stock symbol provided");
        return;
      }
      try {
        let histData;
        try {
          histData = await getHistoricalData(symbol, '1d', false);
        } catch (histError) {
          console.warn(`Failed to fetch real historical data for ${symbol}, using mock. Error: ${histError}`);
          histData = generateMockHistoricalData(symbol); // Use mock as fallback
        }
        setHistoricalData(histData || generateMockHistoricalData(symbol)); // Ensure data is set

        try {
          const stockInfo = await fetchStockQuote(symbol);
          setStockData({ ...stockInfo, symbol });
          if (stockInfo.price) setLivePrice(stockInfo.price);
        } catch (quoteError) {
          console.warn(`Failed to fetch quote for ${symbol}. Error: ${quoteError}`);
          setStockData({ ...defaultStock, symbol }); // Use default with symbol
        }
      } catch (err) {
        setError(`Failed to fetch initial data: ${(err as Error).message}`);
        setHistoricalData(generateMockHistoricalData(symbol)); // Ensure mock data on error
      } finally {
        // Don't set loading false here yet, wait for analysis check
      }
    };
    fetchData();
  }, [symbol, getHistoricalData]);

  useEffect(() => {
    const checkAndRefreshAnalysis = async () => {
      if (!symbol || !isDataLoaded || isInitialRefreshDone) {
        if (!isDataLoaded) console.log(`[StockDetails:${symbol}] Waiting for context data to load...`);
        if (isInitialRefreshDone) console.log(`[StockDetails:${symbol}] Initial refresh already attempted.`);
        if (loading && historicalData.length > 0) setLoading(false);
        return;
      }

      console.log(`[StockDetails:${symbol}] Checking analysis cache status.`);
      const cacheKey = `${symbol}:1d`;
      const cachedEntry = allAnalyses[cacheKey];
      let shouldRefresh = false;

      if (!cachedEntry) {
        console.log(`[StockDetails:${symbol}] No cached analysis found.`);
        shouldRefresh = true;
      } else {
        const cacheAge = Date.now() - cachedEntry.timestamp;
        if (cacheAge > CACHE_DURATION_MS) {
          console.log(`[StockDetails:${symbol}] Cached analysis is stale (age: ${getAgeString(cachedEntry.timestamp)}).`);
          shouldRefresh = true;
        } else {
          console.log(`[StockDetails:${symbol}] Using fresh cached analysis (age: ${getAgeString(cachedEntry.timestamp)}).`);
        }
      }

      if (shouldRefresh) {
        console.log(`[StockDetails:${symbol}] Triggering automatic analysis refresh.`);
        try {
          await refreshStockAnalysis(symbol); // Await the refresh
          console.log(`[StockDetails:${symbol}] Automatic refresh completed.`);
        } catch (refreshError) {
          console.error(`[StockDetails:${symbol}] Automatic refresh failed:`, refreshError);
        }
      }

      setIsInitialRefreshDone(true); // Mark as done after check/attempt
      setLoading(false); // Final loading state update
    };

    checkAndRefreshAnalysis();
  }, [symbol, isDataLoaded, allAnalyses, refreshStockAnalysis, isInitialRefreshDone, historicalData.length, loading]);

  const generateMockHistoricalData = (symbol: string): StockHistoricalData[] => {
    console.log(`Generating realistic mock data for ${symbol}`);
    const data: StockHistoricalData[] = [];
    const today = new Date();
    let price = 100 + (symbol.charCodeAt(0) % 10) * 10;

    for (let i = 365; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);

      const change = (Math.random() - 0.5) * 2;
      price += change;
      if (price < 10) price = 10;

      if (symbol.length % 2 === 0) {
        price *= 1.0005;
      } else {
        price *= 0.9995;
      }

      const vol = Math.floor(100000 + Math.random() * 900000);

      data.push({
        timestamp: date.getTime(),
        open: price - change / 2,
        high: Math.max(price, price - change / 2) + Math.random(),
        low: Math.min(price, price - change / 2) - Math.random(),
        close: price,
        volume: vol
      });
    }

    console.log(`Generated ${data.length} data points for ${symbol}`);
    return data;
  };

  if (!symbol) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Stock symbol not provided in URL.</AlertDescription>
        <Button onClick={() => navigate('/')} className="mt-4">Go to Dashboard</Button>
      </Alert>
    );
  }

  const regularMarketPrice = stockData?.regularMarketPrice || 0;
  const regularMarketChange = stockData?.regularMarketChange || 0;
  const regularMarketChangePercent = stockData?.regularMarketChangePercent || 0;

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(regularMarketPrice);

  const formattedChange = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Math.abs(regularMarketChange));

  const formattedPercent = `${Math.abs(regularMarketChangePercent).toFixed(2)}%`;

  const isPositive = regularMarketChange >= 0;

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col space-y-2 mb-4">
        {!isTelegram && (
          <div className="flex sm:hidden items-center">
            <Button 
              variant="ghost"
              className="flex items-center"
              onClick={handleBackClick}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          {!isTelegram && (
            <div className="hidden sm:flex items-center">
              <Button 
                variant="ghost"
                className="flex items-center"
                onClick={handleBackClick}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>
          )}

          <div className={`flex-grow ${isTelegram ? 'text-center' : 'text-center sm:text-left'}`}>
            <h1 className="text-xl md:text-2xl font-bold truncate px-2 sm:px-0">
              {stockData.name || stockData.shortName} ({stockData.symbol})
            </h1>
          </div>

          {!isTelegram && (
            <div className="hidden sm:flex items-center invisible">
              <Button variant="ghost" className="opacity-0">Back</Button>
            </div>
          )}
        </div>
        
        <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${isTelegram ? 'pl-4' : 'sm:pl-14 pl-4'}`}>
          <div className="flex items-center">
            <span className="text-lg font-mono">{formattedPrice}</span>
            <span className={`flex items-center ml-2 ${isPositive ? "text-bullish" : "text-bearish"}`}>
              {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
              <span>{formattedChange} ({formattedPercent})</span>
            </span>
          </div>
          
          <RadioGroup
            defaultValue="current" 
            onValueChange={(value) => setViewMode(value as 'all' | 'current')}
            className="flex space-x-4 items-center mt-2 sm:mt-0"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="current" id="current-wave" />
              <Label htmlFor="current-wave" className="cursor-pointer">Current</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="all-waves" />
              <Label htmlFor="all-waves" className="cursor-pointer">All</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      {(loading || !isDataLoaded) && (
        <div className="space-y-6">
          <div className="flex flex-col space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-8 w-48" />
              </div>
              <Skeleton className="h-8 w-32" />
            </div>
            <div className="flex items-center pl-14">
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
          <Skeleton className="w-full h-[500px]" />
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">AI Analysis</h3>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Elliott Wave Analysis</h3>
                <Skeleton className="h-8 w-32" />
              </div>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && isDataLoaded && (
        <div className="space-y-6">
          <div className="relative mb-8">
            <div className={(!user && isPreviewMode) ? "blur-premium" : ""}>
              {historicalData.length > 0 ? (
                <StockDetailChart
                  symbol={symbol}
                  data={historicalData}
                  waves={analysis?.waves || []}
                  invalidWaves={analysis?.invalidWaves || []} // Add this line to pass invalidWaves
                  currentWave={analysis?.currentWave || null}
                  fibTargets={analysis?.fibTargets || []}
                  selectedWave={selectedWave}
                  onClearSelection={() => setSelectedWave(null)}
                  livePrice={livePrice}
                  viewMode={viewMode}
                />
              ) : (
                <div className="w-full h-[500px] flex items-center justify-center border rounded-md bg-muted">
                  <p className="text-muted-foreground">Loading chart data...</p>
                </div>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">AI Analysis</h3>
              <div className={(!user && isPreviewMode) ? "blur-premium" : ""}>
                {analysis ? (
                  <AIAnalysisSection
                    symbol={symbol}
                    analysis={analysis}
                    historicalData={historicalData}
                  />
                ) : (
                  <div className="p-4 bg-muted rounded-md text-center">
                    {error ? `Error loading analysis: ${error}` : "Loading analysis..."}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Elliott Wave Analysis</h3>
                <RefreshWaveAnalysisButton symbol={symbol} />
              </div>
              {analysis?.waves && analysis.waves.length > 0 ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {getWavePatternDescription(analysis.waves) ||
                      "Analyzing detected wave patterns and market positions."}
                  </p>
                  <div className="mt-4">
                    <WaveSequencePagination
                      waves={analysis?.waves || []}
                      invalidWaves={analysis?.invalidWaves || []}
                      selectedWave={selectedWave}
                      currentWave={analysis.currentWave}
                      fibTargets={analysis.fibTargets}
                      onWaveSelect={(wave) => {
                        if (selectedWave && selectedWave.startTimestamp === wave.startTimestamp) {
                          setSelectedWave(null);
                        } else {
                          setSelectedWave(wave);
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 border rounded-md text-center">
                  {error ? `Error loading waves: ${error}` : "No wave patterns detected or still loading."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {error && !loading && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

interface AIAnalysisPropsInternal {
  symbol: string;
  analysis: WaveAnalysisResult;
  historicalData: StockHistoricalData[];
}

const AIAnalysisSection: React.FC<AIAnalysisPropsInternal> = ({ symbol, analysis, historicalData }) => {
  const [aiInsight, setAiInsight] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [waveNumber, setWaveNumber] = useState<string | number | null>(null);
  const [trend, setTrend] = useState<string | null>(null);
  
  useEffect(() => {
    if (!symbol || historicalData.length === 0) {
      setLoading(false);
      setError("Insufficient data to perform analysis");
      return;
    }
    
    const fetchAIAnalysis = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const analysisData = await getCachedWaveAnalysis(symbol);
        
        if (analysisData) {
          if (analysisData.analysis) {
            setAiInsight(analysisData.analysis);
          }
          
          let currentWaveNumber = null;
          if (analysisData.currentWave && analysisData.currentWave.number) {
            currentWaveNumber = analysisData.currentWave.number;
          }
          setWaveNumber(currentWaveNumber);
          
          if (analysisData.trend) {
            setTrend(analysisData.trend);
          }
        } else {
          setError("No analysis data available");
        }
      } catch (err) {
        console.error('Error fetching AI analysis:', err);
        setError("Failed to load analysis");
      } finally {
        setLoading(false);
      }
    };
    
    fetchAIAnalysis();
  }, [symbol, historicalData]);
  
  return (
    <div className="space-y-4">
      {!loading && !error && waveNumber && (
        <div className="flex items-center mb-2">
          <div className="bg-muted rounded-md px-3 py-1 text-sm font-medium">
            Elliott Wave: <span className="font-bold">{waveNumber}</span>
          </div>
          {trend && (
            <div className={`ml-2 rounded-md px-3 py-1 text-sm font-medium ${
              trend === 'bullish' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 
              trend === 'bearish' ? 'bg-red-500/20 text-red-700 dark:text-red-400' : 
              'bg-muted'
            }`}>
              {trend.charAt(0).toUpperCase() + trend.slice(1)} Trend
            </div>
          )}
        </div>
      )}
      
      {loading ? (
        <>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
        </>
      ) : error ? (
        <div className="p-4 bg-destructive/10 rounded-md text-destructive">
          {error}
        </div>
      ) : aiInsight ? (
        <div className="prose prose-sm dark:prose-invert">
          {aiInsight.split('\n\n').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <div className="p-4 bg-muted rounded-md text-center">
          No AI analysis available for {symbol}
        </div>
      )}
    </div>
  );
};

interface WaveInvalidationsProps {
  invalidWaves: Wave[];
}

const WaveInvalidations: React.FC<WaveInvalidationsProps> = ({ invalidWaves }) => {
  return (
    <div className="space-y-4">
      {invalidWaves.length > 0 ? (
        invalidWaves.map((wave, index) => (
          <div key={index} className="flex items-center space-x-2">
            <AlertCircle className="text-red-500" />
            <div>
              <p className="text-sm font-medium">Wave {wave.number} invalidated</p>
              <p className="text-xs text-muted-foreground">
                {new Date(wave.invalidationTimestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))
      ) : (
        <div className="p-4 bg-muted rounded-md text-center">
          No invalid waves detected
        </div>
      )}
    </div>
  );
};

interface RefreshWaveAnalysisButtonProps {
  symbol: string;
}

const RefreshWaveAnalysisButton: React.FC<RefreshWaveAnalysisButtonProps> = ({ symbol }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const { refreshStockAnalysis } = useWaveAnalysis();

  const handleRefresh = async () => {
    try {
      if (isRefreshing) return;
      
      setIsRefreshing(true);
      setStatusMessage({ text: 'Processing...', type: 'info' });
      console.log(`[RefreshButton] Starting refresh for ${symbol}`);
      
      const success = await refreshStockAnalysis(symbol);
      
      if (success) {
        console.log(`[RefreshButton] Refresh successful for ${symbol}`);
        setStatusMessage({ text: 'Analysis refreshed', type: 'success' });
        
        setTimeout(() => {
          setStatusMessage(null);
        }, 3000);
      } else {
        console.error(`[RefreshButton] Refresh failed for ${symbol}`);
        setStatusMessage({ text: 'Refresh failed', type: 'error' });
        
        setTimeout(() => {
          setStatusMessage(null);
        }, 5000);
      }
    } catch (error) {
      console.error(`[RefreshButton] Error during refresh:`, error);
      setStatusMessage({ text: 'Error: ' + (error.message || 'Unknown error'), type: 'error' });
      
      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex items-center">
      {statusMessage && (
        <span className={`text-xs mr-2 ${
          statusMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 
          statusMessage.type === 'error' ? 'text-red-600 dark:text-red-400' :
          'text-blue-600 dark:text-blue-400'
        }`}>
          {statusMessage.text}
        </span>
      )}
      <Button 
        size="sm" 
        variant="outline" 
        onClick={handleRefresh}
        disabled={isRefreshing}
      >
        {isRefreshing ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing
          </>
        ) : (
          'Refresh Analysis'
        )}
      </Button>
    </div>
  );
};

export default StockDetails;
