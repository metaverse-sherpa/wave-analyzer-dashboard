import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge"; // Add this import
import { ArrowLeft, ArrowUpRight, ArrowDownRight, AlertCircle } from "lucide-react";
import StockDetailChart from "@/components/StockDetailChart";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  fetchHistoricalData, 
  fetchTopStocks 
} from "@/services/yahooFinanceService";
import { 
  analyzeElliottWaves 
} from "@/utils/elliottWaveAnalysis";
import { 
  storeWaveAnalysis, 
  retrieveWaveAnalysis, 
  isAnalysisExpired 
} from "@/services/databaseService";
import { toast } from "@/lib/toast";
import ErrorBoundary from '@/components/ErrorBoundary';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import SimpleCandlestickChart from '@/components/SimpleCandlestickChart';
import WaveSequencePagination from '@/components/WaveSequencePagination';
import { Card, CardContent } from "@/components/ui/card";
import { getWavePatternDescription } from '@/components/chart/waveChartUtils';
import type { Wave, WaveAnalysisResult, StockData, StockHistoricalData } from '@/types/shared';
import { isCacheExpired } from '@/utils/cacheUtils';
import { supabase } from '@/lib/supabase';
import { formatChartData } from '@/utils/chartUtils';
import { getElliottWaveAnalysis } from '@/api/deepseekApi';
import { apiUrl } from '@/utils/apiConfig'; // Add this import at the top
import { useAuth } from '@/context/AuthContext'; // Add this import
import { usePreview } from '@/context/PreviewContext'; // Add import
import TelegramLayout from '@/components/layout/TelegramLayout';
import { useTelegram } from '@/context/TelegramContext';

interface StockDetailsProps {
  stock?: StockData;
}

const defaultStock: StockData = {
  symbol: '',
  name: '', // Add required name field
  shortName: '',
  price: 0,  // Add required price field
  change: 0, // Add required change field
  changePercent: 0, // Add required changePercent field 
  volume: 0, // Add required volume field
  regularMarketPrice: 0,
  regularMarketChange: 0,
  regularMarketChangePercent: 0,
  regularMarketVolume: 0,
  averageVolume: 0,
  marketCap: 0,
  fiftyTwoWeekLow: 0,
  fiftyTwoWeekHigh: 0,
};

// Add this helper function near the top of your StockDetails.tsx file
// This will sort waves by timestamp (newest first) and give us the most recent waves
const getMostRecentWaves = (waves: Wave[], count: number = 7): Wave[] => {
  // Create a copy of waves, then sort by timestamp descending (newest first)
  return [...waves]
    .sort((a, b) => {
      const aTimestamp = typeof a.startTimestamp === 'number' ? a.startTimestamp : Date.parse(a.startTimestamp as string);
      const bTimestamp = typeof b.startTimestamp === 'number' ? b.startTimestamp : Date.parse(b.startTimestamp as string);
      return bTimestamp - aTimestamp;
    })
    .slice(0, count); // Take only the first 'count' waves
};

const MAX_CACHE_AGE_DAYS = 1; // Only use cache if less than a week old

const getAgeString = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  
  // Convert to days/hours/minutes
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

const StockDetails: React.FC<StockDetailsProps> = ({ stock = defaultStock }) => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPreviewMode } = usePreview();
  const { isTelegram } = useTelegram();
  const dataLoadedRef = useRef(false);

  const [stockData, setStockData] = useState<StockData>(defaultStock);
  const [historicalData, setHistoricalData] = useState<StockHistoricalData[]>([]);
  const [analysis, setAnalysis] = useState<WaveAnalysisResult>({
    waves: [],
    currentWave: null,
    fibTargets: [],
    trend: 'neutral',
    impulsePattern: false,
    correctivePattern: false,
    invalidWaves: []  // Add this to match WaveAnalysisResult interface
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'current'>('current');
  const [selectedWave, setSelectedWave] = useState<Wave | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { getHistoricalData } = useHistoricalData();
  const { getAnalysis } = useWaveAnalysis();

  // Load data effect
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      if (!symbol) {
        setLoading(false);
        setError("No stock symbol provided");
        return;
      }
      
      try {
        // Always fetch fresh historical data from backend API
        const historicalData = await getHistoricalData(symbol, '1d', true);
        
        if (!historicalData || historicalData.length < 50) {
          console.warn(`Insufficient historical data for ${symbol}: ${historicalData?.length || 0} points (minimum 50 required)`);
          setHistoricalData(historicalData || []);
          setError(`Insufficient historical data for ${symbol}: ${historicalData?.length || 0} points available (minimum 50 required for wave analysis)`);
        } else {
          setHistoricalData(historicalData);
          setError(null);
          
          // Get Elliott Wave analysis using DeepSeek API
          try {
            const waveAnalysis = await getAnalysis(symbol, historicalData);
            
            // Ensure we have valid analysis with required properties
            if (waveAnalysis) {
              const safeAnalysis = {
                ...waveAnalysis,
                waves: waveAnalysis.waves || [],
                invalidWaves: waveAnalysis.invalidWaves || [],
                fibTargets: waveAnalysis.fibTargets || [],
                currentWave: waveAnalysis.currentWave || null,
                trend: waveAnalysis.trend || 'neutral',
                impulsePattern: !!waveAnalysis.impulsePattern,
                correctivePattern: !!waveAnalysis.correctivePattern
              };
              
              setAnalysis(safeAnalysis);
              console.log('Wave analysis loaded:', {
                waves: safeAnalysis.waves.length,
                invalidWaves: safeAnalysis.invalidWaves.length,
                currentWave: safeAnalysis.currentWave?.number
              });
            }
          } catch (analysisErr) {
            console.error('Error getting wave analysis:', analysisErr);
            setError(`Failed to analyze waves: ${(analysisErr as Error).message}`);
          }
        }

        // Get latest stock info
        try {
          const response = await fetch(apiUrl(`/stocks/${symbol}`));
          if (response.ok) {
            const stockInfo = await response.json();
            setStockData({
              ...stockInfo,
              symbol
            });
            
            // Update live price if available
            if (stockInfo.regularMarketPrice) {
              setLivePrice(stockInfo.regularMarketPrice);
            }
          }
        } catch (stockErr) {
          console.error('Error fetching stock data:', stockErr);
        }

      } catch (error) {
        console.error('Error loading data:', error);
        setError(`Failed to load data: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    
    // Set up live price updates
    const priceInterval = setInterval(async () => {
      try {
        const response = await fetch(apiUrl(`/stocks/${symbol}`));
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.regularMarketPrice === 'number') {
            setLivePrice(data.regularMarketPrice);
          }
        }
      } catch (error) {
        console.error(`Error updating live price: ${error}`);
      }
    }, 30000); // Update every 30 seconds

    return () => {
      clearInterval(priceInterval);
    };
  }, [symbol]);

  // Add this useEffect to fetch the live price
  useEffect(() => {
    const fetchLivePrice = async () => {
      if (!symbol) return;

      try {
        const response = await fetch(apiUrl(`/stocks/${symbol}`));
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.regularMarketPrice === 'number') {
            setLivePrice(data.regularMarketPrice);
            console.log(`Got live price for ${symbol}: $${data.regularMarketPrice}`);
          }
        }
      } catch (error) {
        console.error(`Error fetching live price for ${symbol}:`, error);
      }
    };

    fetchLivePrice();
    
    // Set up a 30-second refresh interval for the price
    const refreshInterval = setInterval(fetchLivePrice, 30000);
    return () => clearInterval(refreshInterval);
  }, [symbol]);

  // Add this to StockDetails.tsx, right before returning the JSX
  useEffect(() => {
    // Debug on mount to check if invalidWaves are being included
    if (analysis?.invalidWaves?.length > 0) {
      console.log(`Found ${analysis.invalidWaves.length} invalid waves:`, 
        analysis.invalidWaves.map(w => `Wave ${w.number} (${new Date(w.invalidationTimestamp).toLocaleDateString()})`));
    } else {
      console.log("No invalid waves found in analysis");
    }
  }, [analysis?.invalidWaves]);
  
  const handleBackClick = () => {
    navigate('/');
  };
  
  if (!symbol) {
    return <div>Invalid stock symbol</div>;
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
  
  const stockDetailsContent = (
    <ErrorBoundary>
      <div className="container mx-auto px-4 py-6">
        {/* Header with back button, stock info, and radio buttons all in one row */}
        {!loading && stockData && (
          <div className="flex flex-col space-y-2 mb-4">
            {/* Back button - separate row on mobile, hidden on desktop */}
            {!isTelegram && ( // Don't show back button if in Telegram - use Telegram's native back button
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

            {/* Top row: Back button on desktop and stock name */}
            <div className="flex items-center justify-between">
              {/* Left side: Back button - visible only on desktop */}
              {!isTelegram && ( // Don't show back button if in Telegram
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

              {/* Center: Stock name and symbol - centered on mobile, left-aligned on desktop */}
              <div className={`flex-grow ${isTelegram ? 'text-center' : 'text-center sm:text-left'}`}>
                <h1 className="text-xl md:text-2xl font-bold truncate px-2 sm:px-0">
                  {stockData.name || stockData.shortName} ({stockData.symbol})
                </h1>
              </div>

              {/* Right side: Placeholder to maintain centering - only on desktop */}
              {!isTelegram && (
                <div className="hidden sm:flex items-center invisible">
                  <Button variant="ghost" className="opacity-0">Back</Button>
                </div>
              )}
            </div>
            
            {/* Bottom row: Stock price and change percentage - row that stacks on mobile */}
            <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${isTelegram ? 'pl-4' : 'sm:pl-14 pl-4'}`}>
              {/* Left side: Stock price and change percentage */}
              <div className="flex items-center">
                <span className="text-lg font-mono">{formattedPrice}</span>
                <span className={`flex items-center ml-2 ${isPositive ? "text-bullish" : "text-bearish"}`}>
                  {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                  <span>{formattedChange} ({formattedPercent})</span>
                </span>
              </div>
              
              {/* Right side: Current/All radio buttons (moved to new row on mobile) */}
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
        )}

        {/* Show loading skeleton if data is still loading */}
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

        {/* Main content area */}
        <div className="space-y-6">
          {/* Chart section */}
          <div className="relative mb-8">
            {(!user && isPreviewMode) && ( // Check both conditions
              <div className="absolute inset-0 backdrop-blur-sm flex flex-col items-center justify-center z-10 bg-background/20">
                <div className="bg-background/90 p-6 rounded-lg shadow-lg text-center max-w-md">
                  <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
                  <p className="mb-4">Sign in to view detailed stock charts with technical analysis.</p>
                  <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
                    <Button>Sign In Now</Button>
                  </Link>
                </div>
              </div>
            )}
            
            <div className={(!user && isPreviewMode) ? "blur-premium" : ""}> {/* Apply blur class when both conditions met */}
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
                  livePrice={livePrice} // Pass the live price
                  viewMode={viewMode} // Add the viewMode prop here
                />
              ) : null}
            </div>
          </div>

          {/* AI Analysis - Moved here to come directly below the chart for mobile */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">AI Analysis</h3>
              <div className="relative mb-4">
                {(!user && isPreviewMode) && (
                  <div className="absolute inset-0 backdrop-blur-sm flex flex-col items-center justify-center z-10 bg-background/20">
                    <div className="bg-background/90 p-6 rounded-lg shadow-lg text-center max-w-md">
                      <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
                      <p className="mb-4">Sign in to access AI-powered Elliott Wave analysis.</p>
                      <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
                        <Button>Sign In Now</Button>
                      </Link>
                    </div>
                  </div>
                )}
                
                <div className={(!user && isPreviewMode) ? "blur-premium" : ""}>
                  {analysis && (
                    <AIAnalysis 
                      symbol={symbol}
                      analysis={analysis}
                      historicalData={historicalData}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Elliott Wave Analysis - Now will appear after AI Analysis on mobile */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">Elliott Wave Analysis</h3>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">Recent Wave Sequence</h4> {/* Updated label */}
                    <Badge variant="outline">
                      {analysis?.waves.length || 0} waves detected (showing most recent 7)
                    </Badge>
                  </div>
                  
                  {analysis?.waves && analysis.waves.length > 0 ? (
                    <div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {getWavePatternDescription(analysis.waves) || 
                          "Analyzing detected wave patterns and market positions."}
                      </p>
                      
                      {/* Add WaveSequencePagination here */}
                      <div className="mt-4">
                        <WaveSequencePagination 
                          waves={analysis?.waves || []}
                          invalidWaves={analysis?.invalidWaves || []} // Add this line
                          selectedWave={selectedWave} // Pass the same selected wave here
                          currentWave={analysis.currentWave} // Add this prop
                          fibTargets={analysis.fibTargets}   // Add this prop
                          onWaveSelect={(wave) => {
                            // Compare startTimestamp instead of id
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

          {/* Add WaveInvalidations component */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">Wave Invalidations</h3>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <WaveInvalidations invalidWaves={analysis.invalidWaves} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ErrorBoundary>
  );
  
  // If running in Telegram, use the TelegramLayout
  if (isTelegram) {
    return (
      <TelegramLayout title={symbol} showBackButton={true}>
        {stockDetailsContent}
      </TelegramLayout>
    );
  }
  
  // Otherwise use regular layout
  return stockDetailsContent;
};

// Define the AIAnalysis props
interface AIAnalysisProps {
  symbol: string;
  analysis: WaveAnalysisResult; // Add this prop
  historicalData: StockHistoricalData[];
}

// Replace the AIAnalysis component
const AIAnalysis: React.FC<AIAnalysisProps> = ({ symbol, analysis, historicalData }) => {
  const [aiInsight, setAiInsight] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [waveNumber, setWaveNumber] = useState<string | number | null>(null);
  const [trend, setTrend] = useState<string | null>(null);
  
  useEffect(() => {
    // Only fetch if we have the required data
    if (!symbol || historicalData.length === 0) {
      setLoading(false);
      setError("Insufficient data to perform analysis");
      return;
    }
    
    const fetchAIAnalysis = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // First check cache with 24-hour expiration
        const { data: cachedResult, error } = await supabase
          .from('cache')
          .select('data, timestamp')
          .eq('key', `ai_elliott_wave_${symbol}`)
          .single();
        
        // Use cache if available and less than 24 hours old
        if (!error && cachedResult?.data && 
            (Date.now() - cachedResult.timestamp) < 24 * 60 * 60 * 1000) {
          console.log(`Using cached AI analysis for ${symbol} (age: ${getAgeString(cachedResult.timestamp)})`);
          
          setAiInsight(cachedResult.data);
          
          // Extract wave number and trend from the cached result
          const waveMatch = cachedResult.data.match(/WAVE:\s*(\w+)/i);
          const trendMatch = cachedResult.data.match(/TREND:\s*(\w+)/i);
          
          if (waveMatch && waveMatch[1]) setWaveNumber(waveMatch[1]);
          if (trendMatch && trendMatch[1]) setTrend(trendMatch[1].toLowerCase());
          
          setLoading(false);
          return;
        }
        
        console.log(`Getting fresh AI analysis for ${symbol}`);
        
        // If no cache or expired, get fresh analysis
        const result = await getElliottWaveAnalysis(symbol, historicalData);
        
        // Save to cache with 24-hour duration
        await supabase
          .from('cache')
          .upsert({
            key: `ai_elliott_wave_${symbol}`,
            data: result,
            timestamp: Date.now(),
            duration: 24 * 60 * 60 * 1000,
            is_string: true
          }, { onConflict: 'key' });
        
        setAiInsight(result);
        
        // Extract wave number and trend
        const waveMatch = result.match(/WAVE:\s*(\w+)/i);
        const trendMatch = result.match(/TREND:\s*(\w+)/i);
        
        if (waveMatch && waveMatch[1]) setWaveNumber(waveMatch[1]);
        if (trendMatch && trendMatch[1]) setTrend(trendMatch[1].toLowerCase());
        
      } catch (error) {
        console.error('Error getting AI analysis:', error);
        setError(`Failed to generate AI analysis: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAIAnalysis();
  }, [symbol, historicalData]);
  
  return (
    <div className="space-y-4">
      {/* Header section with wave information */}
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
      
      {/* Loading state */}
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

// Define the WaveInvalidations props
interface WaveInvalidationsProps {
  invalidWaves: Wave[];
}

// Add the WaveInvalidations component
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

export default StockDetails;
