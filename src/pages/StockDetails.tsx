import React, { useEffect, useState, useMemo } from 'react';
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
    getAnalysis,
    loadCacheTableData, // Get the function from context
    isDataLoaded,       // Get loading status
    waveAnalysesCache   // Use the simpler cache
  } = useWaveAnalysis();
  const { user } = useAuth(); // Get user from AuthContext
  const { isPreviewMode } = usePreview(); // Get isPreviewMode from PreviewContext

  // Define handleBackClick
  const handleBackClick = () => {
    navigate(-1); // Go back to the previous page
  };

  const [stockData, setStockData] = useState<StockData>(defaultStock);
  const [historicalData, setHistoricalData] = useState<StockHistoricalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'current'>('current');
  const [selectedWave, setSelectedWave] = useState<Wave | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { getHistoricalData } = useHistoricalData();

  // No longer needed - removing debugging code that causes infinite loop
  /* 
  useEffect(() => {
    if (symbol === 'RNMBY') {
      console.log(`[StockDetails:RNMBY] Forcing data reload via loadCacheTableData(true)`);
      loadCacheTableData(true); // Pass true to force refresh
    }
  }, [symbol, loadCacheTableData]); 
  */

  // Use waveAnalysesCache which is simpler Record<string, WaveAnalysisResult>
  const analysis = useMemo(() => {
    if (!symbol) return null;
    const cacheKey = `${symbol}:1d`; // Assuming '1d' timeframe for now
    return waveAnalysesCache[cacheKey] || null;
  }, [symbol, waveAnalysesCache]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      if (!symbol) {
        setLoading(false);
        setError("No stock symbol provided");
        return;
      }
      try {
        // Get historical data
        let historicalData;
        try {
          historicalData = await getHistoricalData(symbol, '1d', false);
        } catch (error) {
          historicalData = generateMockHistoricalData(symbol);
        }
        if (!historicalData || historicalData.length < 50) {
          if (historicalData && historicalData.length > 0) {
            setHistoricalData(historicalData);
          } else {
            setHistoricalData(generateMockHistoricalData(symbol));
          }
        } else {
          setHistoricalData(historicalData);
        }

        // Try to get stock info, but don't fail if it doesn't work
        try {
          const stockInfo = await fetchStockQuote(symbol);
          setStockData({ ...stockInfo, symbol });
          if (stockInfo.price) setLivePrice(stockInfo.price);
        } catch {
          setStockData({ ...defaultStock, symbol });
        }
      } catch (error) {
        setError(`Failed to fetch data: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [symbol]);

  // Function to generate mock historical data as a fallback
  const generateMockHistoricalData = (symbol: string): StockHistoricalData[] => {
    console.log(`Generating realistic mock data for ${symbol}`);
    const data: StockHistoricalData[] = [];
    const today = new Date();
    let price = 100 + (symbol.charCodeAt(0) % 10) * 10; // Base price on first character
    
    // Generate a year of data
    for (let i = 365; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      
      // Generate realistic price movements
      const change = (Math.random() - 0.5) * 2; // Random change between -1 and 1
      price += change;
      if (price < 10) price = 10; // Prevent negative prices
      
      // Add slight trend based on symbol
      if (symbol.length % 2 === 0) {
        price *= 1.0005; // Slight uptrend
      } else {
        price *= 0.9995; // Slight downtrend
      }
      
      const vol = Math.floor(100000 + Math.random() * 900000);
      
      data.push({
        timestamp: date.getTime(),
        open: price - change/2,
        high: Math.max(price, price - change/2) + Math.random(),
        low: Math.min(price, price - change/2) - Math.random(),
        close: price,
        volume: vol
      });
    }
    
    console.log(`Generated ${data.length} data points for ${symbol}`);
    return data;
  };

  // Handle case where symbol is missing
  if (!symbol) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Stock symbol not provided in URL.</AlertDescription>
        <Button onClick={() => navigate('/')} className="mt-4">Go to Dashboard</Button> {/* Use navigate here */}
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
              onClick={handleBackClick} // Use defined function
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> {/* Use imported icon */}
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
                onClick={handleBackClick} // Use defined function
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> {/* Use imported icon */}
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
              {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />} {/* Use imported icons */}
              <span>{formattedChange} ({formattedPercent})</span>
            </span>
          </div>
          
          <RadioGroup // Use imported component
            defaultValue="current" 
            onValueChange={(value) => setViewMode(value as 'all' | 'current')}
            className="flex space-x-4 items-center mt-2 sm:mt-0"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="current" id="current-wave" /> {/* Use imported component */}
              <Label htmlFor="current-wave" className="cursor-pointer">Current</Label> {/* Use imported component */}
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="all-waves" /> {/* Use imported component */}
              <Label htmlFor="all-waves" className="cursor-pointer">All</Label> {/* Use imported component */}
            </div>
          </RadioGroup> {/* Use imported component */}
        </div>
      </div>

      {loading && (
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
      )}

      <div className="space-y-6">
        <div className="relative mb-8">
          {(!user && isPreviewMode) && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
              <div className="text-center p-6 bg-card border rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-2">Premium Feature</h3>
                <p className="text-muted-foreground mb-4">Full AI analysis requires login.</p>
                <Button onClick={() => navigate('/login')}>Login to View</Button>
              </div>
            </div>
          )}
          <div className={(!user && isPreviewMode) ? "blur-premium" : ""}>
            {loading ? (
              <Skeleton className="w-full h-[500px]" />
            ) : analysis ? (
              <StockDetailChart
                symbol={symbol}
                data={historicalData}
                waves={analysis.waves}
                currentWave={analysis.currentWave}
                fibTargets={analysis.fibTargets}
                selectedWave={selectedWave}
                onClearSelection={() => setSelectedWave(null)}
                livePrice={livePrice}
                viewMode={viewMode}
              />
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-4">AI Analysis</h3>
            <div className="relative mb-4">
              {(!user && isPreviewMode) && (
                <div className="absolute inset-0 backdrop-blur-sm flex flex-col items-center justify-center z-10 bg-background/20">
                  <div className="bg-background/90 p-6 rounded-lg shadow-lg text-center max-w-md">
                    <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
                    <p className="mb-4">Sign in to access AI-powered Elliott Wave analysis.</p>
                    <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}> {/* Use imported Link */}
                      <Button>Sign In Now</Button>
                    </Link> {/* Use imported Link */}
                  </div>
                </div>
              )}
              
              <div className={(!user && isPreviewMode) ? "blur-premium" : ""}>
                {analysis && (
                  <AIAnalysisSection // Use the renamed local component
                    symbol={symbol}
                    analysis={analysis}
                    historicalData={historicalData}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-4">Elliott Wave Analysis</h3>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium">Recent Wave Sequence</h4>
                  <Badge variant="outline"> {/* Use imported Badge */}
                    {analysis?.waves.length || 0} waves detected (showing most recent 7)
                  </Badge> {/* Use imported Badge */}
                </div>
                
                {analysis?.waves && analysis.waves.length > 0 ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {getWavePatternDescription(analysis.waves) || // Use imported function
                        "Analyzing detected wave patterns and market positions."}
                    </p>
                    
                    <div className="mt-4">
                      <WaveSequencePagination // Use imported component
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
                    No wave patterns detected
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Rename the local AIAnalysis component to avoid conflicts
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
        // Use the imported function
        const analysisData = await getCachedWaveAnalysis(symbol);
        
        if (analysisData) {
          // Set the analysis text directly from the response
          if (analysisData.analysis) {
            setAiInsight(analysisData.analysis);
          }
          
          // Extract wave number and trend
          let currentWaveNumber = null;
          if (analysisData.currentWave && analysisData.currentWave.number) {
            currentWaveNumber = analysisData.currentWave.number;
          }
          setWaveNumber(currentWaveNumber);
          
          // Set trend if available
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
            <AlertCircle className="text-red-500" /> {/* Use imported icon */}
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

export default StockDetails;
