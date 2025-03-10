import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
        
        // Fetch historical data from context
        const historicalData = await getHistoricalData(symbol, '1d');
        setHistoricalData(historicalData);
        
        // Get wave analysis from context or calculate if needed
        const waveAnalysis = await getAnalysis(symbol, '1d');
        
        if (waveAnalysis) {
          setAnalysis(waveAnalysis);
        } else {
          toast.error(`Failed to analyze waves for ${symbol}`);
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
            <div>
              <div className="flex items-baseline gap-4">
                <h1 className="text-3xl font-bold">{symbol}</h1>
                <h2 className="text-xl text-muted-foreground">{stockData.shortName}</h2>
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xl font-mono">
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
          ) : (
            <div>Stock not found</div>
          )}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {loading ? (
              <Skeleton className="h-[500px] w-full rounded-lg" />
            ) : analysis && historicalData.length > 0 ? (
              <StockDetailChart
                symbol={symbol}
                data={historicalData}
                waves={analysis.waves}
                currentWave={analysis.currentWave}
                fibTargets={analysis.fibTargets}
              />
            ) : (
              <div className="bg-card rounded-lg p-6 flex items-center justify-center h-[500px]">
                <p className="text-muted-foreground">No chart data available</p>
              </div>
            )}
            
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
                            Start: ${analysis.currentWave.startPrice.toFixed(2)} 
                            ({new Date(analysis.currentWave.startTimestamp * 1000).toLocaleDateString()})
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
                      {analysis.waves.map((wave, index) => (
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
                            {wave.endTimestamp ? ` → ${new Date(wave.endTimestamp * 1000).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric'
                            })}` : ' → Now'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No analysis available</p>
              )}
            </div>
          </div>
          
          <div>
            <AIAnalysis symbol={symbol} />
            
            {!loading && stockData && (
              <div className="mt-6 bg-card rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Stock Information</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-sm text-muted-foreground">Market Cap</span>
                    <span className="text-sm font-mono">
                      ${(stockData.marketCap / 1000000000).toFixed(2)}B
                    </span>
                  </div>
                  
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-sm text-muted-foreground">52 Week Range</span>
                    <span className="text-sm font-mono">
                      ${stockData.fiftyTwoWeekLow.toFixed(2)} - ${stockData.fiftyTwoWeekHigh.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-sm text-muted-foreground">Volume</span>
                    <span className="text-sm font-mono">
                      {(stockData.regularMarketVolume / 1000000).toFixed(2)}M
                    </span>
                  </div>
                  
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-sm text-muted-foreground">Avg. Volume</span>
                    <span className="text-sm font-mono">
                      {(stockData.averageVolume / 1000000).toFixed(2)}M
                    </span>
                  </div>
                  
                  {stockData.trailingPE && (
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-sm text-muted-foreground">P/E (TTM)</span>
                      <span className="text-sm font-mono">{stockData.trailingPE.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {stockData.forwardPE && (
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-sm text-muted-foreground">Forward P/E</span>
                      <span className="text-sm font-mono">{stockData.forwardPE.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {stockData.dividendYield && (
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-sm text-muted-foreground">Dividend Yield</span>
                      <span className="text-sm font-mono">
                        {(stockData.dividendYield * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="mt-6 text-xs text-muted-foreground">
              <p>Data provided by Yahoo Finance API. This tool provides Elliott Wave analysis for educational purposes only.</p>
              <p className="mt-2">The analysis is based on historical price patterns and should not be considered as financial advice.</p>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default StockDetails;
