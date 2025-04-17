import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, AlertCircle } from "lucide-react";
import StockDetailChart from "@/components/StockDetailChart";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { fetchStockQuote } from '@/lib/api';
import { toast } from "@/lib/toast";
import ErrorBoundary from '@/components/ErrorBoundary';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { useHistoricalData } from '@/context/HistoricalDataContext';
import WaveSequencePagination from '@/components/WaveSequencePagination';
import { Card, CardContent } from "@/components/ui/card";
import { getWavePatternDescription } from '@/components/chart/waveChartUtils';
import type { Wave, WaveAnalysisResult, StockData, StockHistoricalData } from '@/types/shared';
import { isCacheExpired } from '@/utils/cacheUtils';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/utils/apiConfig';
import { useAuth } from '@/context/AuthContext';
import { usePreview } from '@/context/PreviewContext';
import TelegramLayout from '@/components/layout/TelegramLayout';
import { useTelegram } from '@/context/TelegramContext';
import { convertDeepSeekToWaveAnalysis } from '@/utils/wave-analysis';
import { getCachedWaveAnalysis } from '@/utils/wave-analysis';

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
    invalidWaves: []
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'current'>('current');
  const [selectedWave, setSelectedWave] = useState<Wave | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { getHistoricalData } = useHistoricalData();

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
        const historicalData = await getHistoricalData(symbol, '1d', true);

        if (!historicalData || historicalData.length < 50) {
          console.warn(`Insufficient historical data for ${symbol}: ${historicalData?.length || 0} points`);
          setHistoricalData(historicalData || []);
          setError(`Insufficient historical data for ${symbol}`);
        } else {
          setHistoricalData(historicalData);

          const { data: cachedAnalysis } = await supabase
            .from('cache')
            .select('data')
            .eq('key', `ai_elliott_wave_${symbol}`)
            .single();

          if (cachedAnalysis?.data) {
            const waveAnalysis = convertDeepSeekToWaveAnalysis(cachedAnalysis.data, historicalData);
            setAnalysis(waveAnalysis);
          } else {
            console.log(`No cached analysis available for ${symbol}`);
            setAnalysis(null);
          }
        }

        const stockInfo = await fetchStockQuote(symbol);
        setStockData({
          ...stockInfo,
          symbol
        });

        if (stockInfo.price) {
          setLivePrice(stockInfo.price);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(`Failed to fetch data: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

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

    const refreshInterval = setInterval(fetchLivePrice, 30000);
    return () => clearInterval(refreshInterval);
  }, [symbol]);

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
        {!loading && stockData && (
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
        )}

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

          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">Elliott Wave Analysis</h3>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">Recent Wave Sequence</h4>
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
                      No wave patterns detected
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ErrorBoundary>
  );

  if (isTelegram) {
    return (
      <TelegramLayout title={symbol} showBackButton={true}>
        {stockDetailsContent}
      </TelegramLayout>
    );
  }

  return stockDetailsContent;
};

interface AIAnalysisProps {
  symbol: string;
  analysis: WaveAnalysisResult;
  historicalData: StockHistoricalData[];
}

const AIAnalysis: React.FC<AIAnalysisProps> = ({ symbol, analysis, historicalData }) => {
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
        // Use the dedicated function for cached analysis
        const analysisData = await getCachedWaveAnalysis(symbol);
        
        setAiInsight(JSON.stringify(analysisData)); // Convert to string since setAiInsight expects a string
        
        if (typeof analysisData === 'object') {
          const waveNumber = analysisData.currentWave?.number;
          const trend = analysisData.trend;
          if (waveNumber) setWaveNumber(String(waveNumber));
          if (trend) setTrend(trend);
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

export default StockDetails;
