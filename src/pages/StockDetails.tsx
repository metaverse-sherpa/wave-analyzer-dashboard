import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge"; // Add this import
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import StockDetailChart from "@/components/StockDetailChart";
import AIAnalysis from "@/components/AIAnalysis";
import { 
  fetchHistoricalData, 
  StockHistoricalData, 
  StockData, 
  fetchTopStocks 
} from "@/services/yahooFinanceService";
import { 
  analyzeElliottWaves, 
  WaveAnalysisResult 
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
import WaveAnalysis from '@/context/WaveAnalysisContext';
import WaveSequencePagination from '@/components/WaveSequencePagination';
import { Card, CardContent } from "@/components/ui/card";

interface StockDetailsProps {
  stock?: StockData;
}

const defaultStock: StockData = {
  symbol: '',
  shortName: '',
  regularMarketPrice: 0,
  regularMarketChange: 0,
  regularMarketChangePercent: 0,
  regularMarketVolume: 0,
  averageVolume: 0,
  marketCap: 0,
  fiftyTwoWeekLow: 0,
  fiftyTwoWeekHigh: 0,
};

const StockDetails: React.FC<StockDetailsProps> = ({ stock = defaultStock }) => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [historicalData, setHistoricalData] = useState<StockHistoricalData[]>([]);
  const [analysis, setAnalysis] = useState<WaveAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { getAnalysis } = useWaveAnalysis();
  const { getHistoricalData } = useHistoricalData();
  
  useEffect(() => {
    const loadData = async () => {
      if (!symbol) return;
      
      try {
        setLoading(true);
        
        // Get stock info
        const stocks = await fetchTopStocks();
        const stock = stocks.find(s => s.symbol === symbol);
        
        if (stock) {
          setStockData(stock);
        } else {
          toast.error(`Stock ${symbol} not found`);
          navigate('/');
          return;
        }
        
        // Load both historical data and wave analysis in parallel
        const [historicalData, waveAnalysis] = await Promise.all([
          getHistoricalData(symbol, '1d'),
          getAnalysis(symbol, '1d')
        ]);
        
        // Set historical data
        setHistoricalData(historicalData);
        
        // Set wave analysis if available
        if (waveAnalysis) {
          setAnalysis(waveAnalysis);
        } else {
          // Only show error if we have historical data but no analysis
          if (historicalData.length > 0) {
            toast.error(`Could not analyze waves for ${symbol}`);
          }
        }
      } catch (error) {
        console.error(`Error loading data for ${symbol}:`, error);
        toast.error(`Failed to load data for ${symbol}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [symbol, navigate, getAnalysis, getHistoricalData]);
  
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
        <Button 
          variant="ghost" 
          className="mb-6 flex items-center gap-2"
          onClick={handleBackClick}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        
        <div className="mb-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-6 w-32" />
            </div>
          ) : stockData ? (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
              {/* Stock header info - Takes up 3 columns */}
              <div className="md:col-span-3">
                <div className="flex items-baseline gap-2">
                  <h1 className="text-2xl font-semibold">{stockData.shortName}</h1>
                  <span className="text-base text-muted-foreground">({symbol})</span>
                </div>
                
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xl font-semibold">
                    {formattedPrice}
                  </span>
                  <span className={`flex items-center text-sm ${isPositive ? 'text-bullish' : 'text-bearish'}`}>
                    {isPositive ? (
                      <ArrowUpRight className="h-4 w-4 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 mr-1" />
                    )}
                    <span>{formattedChange} ({formattedPercent})</span>
                  </span>
                </div>
              </div>
              
              {/* Stock Information - Takes up 2 columns */}
              <div className="md:col-span-2">
                <div className="flex flex-col h-full">
                  <h3 className="text-base font-semibold mb-2">Stock Information</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Market Cap:</span>
                      <span>
                        ${(stockData.marketCap / 1000000000).toFixed(2)}B
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Volume:</span>
                      <span>
                        {(stockData.regularMarketVolume / 1000000).toFixed(2)}M
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">52W Range:</span>
                      <span>
                        ${stockData.fiftyTwoWeekLow.toFixed(2)}-${stockData.fiftyTwoWeekHigh.toFixed(2)}
                      </span>
                    </div>
                    {stockData.trailingPE && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">P/E:</span>
                        <span>{stockData.trailingPE.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* AI Analysis - Takes up 2 columns */}
              <div className="md:col-span-2">
                <h3 className="text-base font-semibold mb-2">AI Analysis</h3>
                <AIAnalysis symbol={symbol} />
              </div>
            </div>
          ) : (
            <div>Stock not found</div>
          )}
        </div>
        
        {!loading && historicalData.length > 0 ? (
          <StockDetailChart 
            symbol={symbol || ''} 
            data={historicalData} 
            waves={analysis?.waves || []}
            currentWave={analysis?.currentWave || {} as Wave}
            fibTargets={analysis?.fibTargets || []}
          />
        ) : (
          <div className="w-full h-[400px] bg-card rounded-lg p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2 mx-auto"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="mt-6 bg-card rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Elliott Wave Analysis</h3>
              
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              ) : analysis ? (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Current Wave</h4>
                      <div className="p-3 bg-secondary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm">Wave {analysis.currentWave.number}</span>
                          <span className={`wave-marker wave-${analysis.currentWave.number}`}>
                            {analysis.currentWave.isImpulse ? 'Impulse' : 'Corrective'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <div>
                            Start: {analysis.currentWave?.startPrice !== undefined 
                              ? `$${analysis.currentWave.startPrice.toFixed(2)}` 
                              : 'N/A'
                            } ({analysis.currentWave?.startTimestamp 
                              ? new Date(analysis.currentWave.startTimestamp * 1000).toLocaleDateString()
                              : 'N/A'
                            })
                          </div>
                          <div className="mt-1">
                            Pattern: {analysis.impulsePattern ? 'Impulse (5 waves)' : 
                                      analysis.correctivePattern ? 'Corrective (ABC)' : 'Undefined'}
                          </div>
                          <div className="mt-1">
                            Trend: <span className={`
                              ${analysis.trend === 'bullish' ? 'text-bullish' : 
                                analysis.trend === 'bearish' ? 'text-bearish' : 'text-neutral'}
                            `}>
                              {analysis.trend ? analysis.trend.charAt(0).toUpperCase() + analysis.trend.slice(1) : 'Neutral'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-2">Fibonacci Targets</h4>
                      <div className="p-3 bg-secondary rounded-lg">
                        <div className="grid grid-cols-2 gap-2">
                          {analysis.fibTargets
                            .filter(target => !target.isExtension)
                            .slice(0, 4)
                            .map((target, index) => (
                              <div key={index} className="flex justify-between items-center text-xs">
                                <span>{target.label}:</span>
                                <span className="font-mono">${target.price.toFixed(2)}</span>
                              </div>
                            ))}
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-border">
                          <div className="text-xs font-medium mb-1">Extensions</div>
                          <div className="grid grid-cols-2 gap-2">
                            {analysis.fibTargets
                              .filter(target => target.isExtension)
                              .slice(0, 4)
                              .map((target, index) => (
                                <div key={index} className="flex justify-between items-center text-xs">
                                  <span>{target.label}:</span>
                                  <span className="font-mono">${target.price.toFixed(2)}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Wave Sequence</h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.waves.map((wave, index) => {
                        // Find the price data points for start and end of wave
                        const startDataPoint = historicalData.find(
                          point => point.timestamp === wave.startTimestamp
                        );
                        
                        const endDataPoint = wave.endTimestamp 
                          ? historicalData.find(point => point.timestamp === wave.endTimestamp)
                          : historicalData[historicalData.length - 1];
                        
                        const startPrice = startDataPoint?.close || wave.startPrice;
                        const endPrice = endDataPoint?.close || wave.endPrice;
                        
                        return (
                          <div 
                            key={index} 
                            className={`wave-marker wave-${wave.number} text-xs px-2 py-1`}
                          >
                            Wave {wave.number}
                            <span className="text-xs opacity-75 ml-1">
                              {new Date(wave.startTimestamp * 1000).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric'
                              })}
                              <span className="font-mono"> (${startPrice?.toFixed(2)})</span>
                              <span> → </span>
                              {wave.endTimestamp 
                                ? new Date(wave.endTimestamp * 1000).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric'
                                  })
                                : "Now"
                              }
                              <span className="font-mono"> (${endPrice?.toFixed(2)})</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <Card className="mt-6">
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-medium">Wave Sequence</h3>
                          <Badge variant="outline">
                            {analysis.waves.length} waves detected
                          </Badge>
                        </div>
                        
                        <WaveSequencePagination waves={analysis.waves} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <p className="text-muted-foreground">No analysis available</p>
              )}
              
              {/* Add disclaimer here */}
              <div className="mt-6 text-xs text-muted-foreground">
                <p>Data provided by Yahoo Finance API. This tool provides Elliott Wave analysis for educational purposes only.</p>
                <p className="mt-2">The analysis is based on historical price patterns and should not be considered as financial advice.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default StockDetails;
