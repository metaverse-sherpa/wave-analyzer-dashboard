import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge"; // Add this import
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import StockDetailChart from "@/components/StockDetailChart";
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
  
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [historicalData, setHistoricalData] = useState<StockHistoricalData[]>([]);
  const [analysis, setAnalysis] = useState<WaveAnalysisResult>({
    waves: [],
    currentWave: null,
    fibTargets: [],
    trend: 'neutral' as 'bullish' | 'bearish' | 'neutral',
    impulsePattern: false,
    correctivePattern: false
  });
  const [loading, setLoading] = useState(true);
  const { getAnalysis } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData();
  const [selectedWave, setSelectedWave] = useState<Wave | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  
  // Move this outside of useEffect - this is the key fix
  const dataLoadedRef = useRef(false);

  useEffect(() => {
    // Now we use the ref that's defined at component level
    // instead of creating it inside the effect
    const loadData = async () => {
      setLoading(true);
      
      if (!symbol) {
        setLoading(false);
        return;
      }
      
      try {
        // First check if cached data exists and whether it's expired
        let forceRefresh = false;
        
        const { data: cachedEntry, error: cacheError } = await supabase
          .from('cache')
          .select('timestamp')
          .eq('key', `historical_data_${symbol}_1d`)
          .single();
        
        if (cacheError) {
          console.log(`No cache found for ${symbol}, will fetch fresh data`);
          forceRefresh = true;
        } else if (await isCacheExpired(cachedEntry.timestamp)) {
          console.log(`Cached data for ${symbol} is ${getAgeString(cachedEntry.timestamp)} old - refreshing`);
          forceRefresh = true;
        } else {
          console.log(`Using cached data for ${symbol} (age: ${getAgeString(cachedEntry.timestamp)})`);
        }
        
        console.log(`Fetching historical data for ${symbol} (forceRefresh: ${forceRefresh})`);
        const historicalData = await getHistoricalData(symbol, '1d', forceRefresh);
        
        // Update all required state variables
        setHistoricalData(historicalData);
        setChartData(formatChartData(historicalData));
        
        // Fetch stock information 
        try {
          const { data: stockResult } = await supabase
            .from('cache')
            .select('data')
            .eq('key', `stock_${symbol}`)
            .single();
            
          if (stockResult?.data) {
            setStockData(stockResult.data);
          } else {
            // If no cached stock data, use a minimal object
            setStockData({
              ...defaultStock,
              symbol,
              shortName: symbol,
            });
          }
        } catch (stockErr) {
          console.error('Error fetching stock data:', stockErr);
          // Set a minimal stock object if we can't get it from cache
          setStockData({
            ...defaultStock,
            symbol,
            shortName: symbol,
          });
        }
        
        // Get Elliott Wave analysis
        const waveAnalysis = await getAnalysis(symbol, historicalData);
        setAnalysis(waveAnalysis);
        
        console.log('Data loading complete:', {
          histPoints: historicalData.length,
          waves: waveAnalysis.waves.length
        });
        
        // Mark as loaded
        dataLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading stock data:', error);
        toast.error(`Failed to load stock data for ${symbol}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    
    // Cleanup function for when component unmounts or symbol changes
    return () => {
      dataLoadedRef.current = false;
    };
  }, [symbol]); // Only depend on symbol to prevent infinite loops
  
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
  
  return (
    <ErrorBoundary>
      <div className="container mx-auto px-4 py-6">
        {/* Header with back button and stock info */}
        <div className="flex items-center justify-between mb-6">
          <Button 
            variant="ghost" 
            className="mb-6 flex items-center gap-2"
            onClick={handleBackClick}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>

          {/* Add stock price info header here */}
          {!loading && stockData && (
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold">{stockData.shortName || symbol}</h1>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-mono">{formattedPrice}</div>
                  <div className={`flex items-center ${isPositive ? "text-bullish" : "text-bearish"}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    <span>{formattedChange} ({formattedPercent})</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="space-y-6">
          {/* Chart section */}
          <div className="bg-card rounded-lg p-6">
            {loading ? (
              <Skeleton className="w-full h-[500px]" />
            ) : analysis ? (
              <StockDetailChart
                symbol={symbol}
                data={historicalData}
                waves={analysis.waves}
                currentWave={analysis.currentWave}
                fibTargets={analysis.fibTargets as any} // Use type assertion to bypass the type check
                selectedWave={selectedWave} // Pass the selected wave to the chart
                onClearSelection={() => setSelectedWave(null)} // Allow clearing selection
              />
            ) : null}
          </div>

          {/* Analysis sections in two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Elliott Wave Analysis */}
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
                            waves={getMostRecentWaves(analysis.waves, 9)} // Only pass the 7 most recent waves
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

            {/* AI Analysis */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">AI Analysis</h3>
                {analysis && (
                  <AIAnalysis 
                    symbol={symbol}
                    analysis={analysis}
                    historicalData={historicalData}
                  />
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Remove the duplicate Elliott Wave Analysis section */}
        </div>
      </div>
    </ErrorBoundary>
  );
};

// Define the AIAnalysis props
interface AIAnalysisProps {
  symbol: string;
  analysis: WaveAnalysisResult; // Add this prop
  historicalData: StockHistoricalData[];
}

// Create the AIAnalysis component if it doesn't exist
const AIAnalysis: React.FC<AIAnalysisProps> = ({ symbol, analysis, historicalData }) => {
  // Component implementation
  return <div>{/* Render analysis information */}</div>;
};

export default StockDetails;
