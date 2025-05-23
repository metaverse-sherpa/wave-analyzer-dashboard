import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from './ui/progress';
import ReversalsList from './ReversalsList';
import ReversalsLastUpdated from './ReversalsLastUpdated';
import MarketSentimentAI from './MarketSentimentAI';
import { Badge } from '@/components/ui/badge';

// Helper function to determine if a wave is bullish
const isBullishWave = (waveNumber: string | number | undefined): boolean => {
  if (!waveNumber) return false;
  
  // Handle numeric waves (both string and number types)
  if (typeof waveNumber === 'number' || !isNaN(Number(waveNumber))) {
    const num = Number(waveNumber);
    return [1, 3, 5].includes(num);
  }
  
  // For lettered waves (corrective pattern)
  // Only Wave B is bullish (moves against the main corrective trend)
  return waveNumber === 'B';
};

// Update the timestamp handling helper
const getTimestampValue = (timestamp: any): number => {
  if (!timestamp) return Date.now();
  
  try {
    // Handle numeric timestamps
    if (typeof timestamp === 'number') {
      // Convert seconds to milliseconds if needed
      if (timestamp < 4000000000) {
        timestamp = timestamp * 1000;
      }
      return timestamp;
    }
    
    // Handle Date objects
    if (timestamp instanceof Date) {
      return timestamp.getTime();
    }
    
    // Handle string timestamps
    if (typeof timestamp === 'string') {
      const parsed = new Date(timestamp).getTime();
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    
    // Fallback to current time if invalid
    return Date.now();
  } catch (error) {
    console.warn('Error processing timestamp:', error);
    return Date.now();
  }
};

// Format a date to show how recent it is (e.g., "2d ago", "5h ago")
const getTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  // Convert to appropriate units
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'just now';
  }
};

const MarketOverview: React.FC = () => {
  const navigate = useNavigate();
  const { allAnalyses, isDataLoaded } = useWaveAnalysis();
  const [showMoreBullish, setShowMoreBullish] = useState(false);
  const [showMoreBearish, setShowMoreBearish] = useState(false);
  const [bullishWaveFilter, setBullishWaveFilter] = useState<string | number | null>(null);
  const [bearishWaveFilter, setBearishWaveFilter] = useState<string | number | null>(null);

  // Wave categorization logic
  const { bullishStocks, bearishStocks } = useMemo(() => {
    const bullish: { symbol: string; wave: string | number; startTimestamp: number }[] = [];
    const bearish: { symbol: string; wave: string | number; startTimestamp: number }[] = [];

    if (!allAnalyses) {
      console.warn('allAnalyses is null or undefined');
      return { bullishStocks: [], bearishStocks: [] };
    }

    // Process and categorize in a single loop
    Object.entries(allAnalyses).forEach(([key, entry]) => {
      try {
        if (!entry?.analysis || !entry.isLoaded) {
          return;
        }

        const { analysis } = entry;
        const [symbol] = key.split(':');
        
        if (!symbol) {
          return;
        }

        // Determine current wave - first try currentWave, then last wave in array
        let waveNumber: string | number | undefined;
        let startTimestamp: number;

        if (analysis.currentWave?.number !== undefined) {
          // Use currentWave if available and valid
          waveNumber = analysis.currentWave.number;
          startTimestamp = getTimestampValue(analysis.currentWave.startTimestamp);
        } else if (analysis.waves?.length > 0) {
          // Fall back to last wave in the array
          const lastWave = analysis.waves[analysis.waves.length - 1];
          waveNumber = lastWave.number;
          startTimestamp = getTimestampValue(lastWave.startTimestamp);
        } else {
          return;
        }

        // Skip invalid wave numbers
        if (waveNumber === undefined || waveNumber === null) {
          return;
        }

        // Categorize based on wave number
        const isBullish = isBullishWave(waveNumber);
        if (isBullish) {
          bullish.push({ symbol, wave: waveNumber, startTimestamp });
        } else {
          bearish.push({ symbol, wave: waveNumber, startTimestamp });
        }
      } catch (error) {
        console.error(`Error processing ${key}:`, error);
      }
    });

    // Sort by most recent first
    return {
      bullishStocks: bullish.sort((a, b) => b.startTimestamp - a.startTimestamp),
      bearishStocks: bearish.sort((a, b) => b.startTimestamp - a.startTimestamp)
    };
  }, [allAnalyses]);

  // Debug log once - only when component mounts or allAnalyses changes
  useEffect(() => {
    // Only log when we have actual data
    if (allAnalyses && Object.keys(allAnalyses).length > 0) {
      // Use a ref to track if we've already logged this set of data before
      const analysesCount = Object.keys(allAnalyses).length;
      
      console.log('MarketOverview - Current analyses:', {
        count: analysesCount,
        isDataLoaded,
        sampleKeys: Object.keys(allAnalyses).slice(0, 3)
      });
      
      // Only log the categorization if we have data to categorize
      if (bullishStocks.length > 0 || bearishStocks.length > 0) {
        console.log('Final categorization:', {
          bullishCount: bullishStocks.length,
          bearishCount: bearishStocks.length,
          sampleBullish: bullishStocks.slice(0, 3).map(s => `${s.symbol}:${s.wave}`),
          sampleBearish: bearishStocks.slice(0, 3).map(s => `${s.symbol}:${s.wave}`)
        });
      }
    }
  }, [bullishStocks.length, bearishStocks.length, allAnalyses, isDataLoaded]);

  // Get available waves for filtering
  const availableWaves = useMemo(() => {
    const bullish = new Set<string | number>();
    const bearish = new Set<string | number>();

    bullishStocks.forEach(stock => bullish.add(stock.wave));
    bearishStocks.forEach(stock => bearish.add(stock.wave));

    // Sort waves numerically/alphabetically
    const sortWaves = (waves: (string | number)[]) => {
      return waves.sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a - b;
        }
        return String(a).localeCompare(String(b));
      });
    };
    
    return {
      bullish: sortWaves(Array.from(bullish)),
      bearish: sortWaves(Array.from(bearish))
    };
  }, [bullishStocks, bearishStocks]);

  // Filter stocks based on selected wave
  const filteredStocks = useMemo(() => {
    return {
      bullish: bullishWaveFilter 
        ? bullishStocks.filter(stock => stock.wave === bullishWaveFilter)
        : bullishStocks,
      bearish: bearishWaveFilter
        ? bearishStocks.filter(stock => stock.wave === bearishWaveFilter)
        : bearishStocks
    };
  }, [bullishStocks, bearishStocks, bullishWaveFilter, bearishWaveFilter]);

  // Calculate market sentiment
  const marketSentiment = useMemo(() => {
    const bullish = bullishStocks.length;
    const bearish = bearishStocks.length;
    const total = bullish + bearish;
    
    if (total === 0) {
      return {
        count: 0,
        bullish: 0,
        bearish: 0,
        neutral: 0,
        bullishPercentage: 0,
        bearishPercentage: 0,
        neutralPercentage: 0,
        overallSentiment: 'Neutral'
      };
    }
    
    // Calculate percentages based on categorized stocks
    const bullishPercentage = Math.round((bullish / total) * 100) || 0;
    const bearishPercentage = Math.round((bearish / total) * 100) || 0;
    
    // Determine overall sentiment with more nuanced thresholds
    let overallSentiment = 'Neutral';
    if (bullishPercentage > 60) overallSentiment = 'Bullish';
    else if (bearishPercentage > 60) overallSentiment = 'Bearish';
    else if (bullishPercentage > bearishPercentage + 10) overallSentiment = 'Slightly Bullish';
    else if (bearishPercentage > bullishPercentage + 10) overallSentiment = 'Slightly Bearish';
    
    return {
      count: total,
      bullish,
      bearish,
      neutral: 0,
      bullishPercentage,
      bearishPercentage,
      neutralPercentage: 0,
      overallSentiment
    };
  }, [bullishStocks, bearishStocks]);

  // Format waves for display
  const formatWaves = (waves: (string | number)[]) => {
    return waves.join(', ');
  };

  // Navigate to stock details
  const goToStockDetails = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };

  return (
    <div className="space-y-4">
      {/* Market Sentiment Overview */}
      <div className="bg-secondary rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-muted-foreground text-sm">Market Sentiment</div>
            <div className={"text-lg font-medium " + (marketSentiment.overallSentiment.toLowerCase().includes('bullish') ? 'text-green-600' : 'text-red-600')}>
              {marketSentiment.overallSentiment}
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground">
            {marketSentiment.count} stocks analyzed
          </div>
        </div>
        
        {/* Sentiment progress bar */}
        <div className="mt-3 mb-1">
          <div className="flex relative h-8 bg-muted rounded-md overflow-hidden">
            {/* Bearish portion (left side) */}
            <div 
              className="bg-red-500 h-full flex items-center justify-start px-2"
              style={{ width: `${marketSentiment.bearishPercentage}%` }}
            >
              {marketSentiment.bearishPercentage > 15 && (
                <span className="text-xs font-medium text-white">
                  {marketSentiment.bearishPercentage}%
                </span>
              )}
            </div>
            
            {/* Bullish portion (right side) */}
            <div 
              className="bg-green-500 h-full flex items-center justify-end px-2"
              style={{ width: `${marketSentiment.bullishPercentage}%` }}
            >
              {marketSentiment.bullishPercentage > 15 && (
                <span className="text-xs font-medium text-white">
                  {marketSentiment.bullishPercentage}%
                </span>
              )}
            </div>
          </div>
          
          {/* Labels under progress bar */}
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Bearish</span>
            <span>Bullish</span>
          </div>
        </div>
      </div>

      {/* Add AI Market Sentiment analysis here */}
      <div className="mt-4">
        <MarketSentimentAI 
          bullishCount={marketSentiment.bullish}
          bearishCount={marketSentiment.bearish}
          neutralCount={marketSentiment.neutral}
          overallSentiment={marketSentiment.overallSentiment}
        />
      </div>

      {/* Modified grid for responsiveness */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bullish Section */}
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">
            Bullish (Waves {availableWaves.bullish.length > 0 ? 
              <>{formatWaves(availableWaves.bullish)}</> : 
              "None"}
            )
            {bullishWaveFilter && (
              <Badge variant="outline" className="ml-2 py-0">
                <span className="mr-1">Showing Wave {bullishWaveFilter}</span>
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setBullishWaveFilter(null)} 
                />
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowUpRight className="mr-1 text-green-500" />
              <span className="text-xl font-mono">{marketSentiment.bullishPercentage}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {filteredStocks.bullish.length} stocks
              {bullishWaveFilter && ` in Wave ${bullishWaveFilter}`}
            </div>
          </div>
          
          <div className="space-y-1">
            {filteredStocks.bullish.length > 0 ? (
              <>
                {filteredStocks.bullish.slice(0, showMoreBullish ? undefined : 5).map(stock => (
                  <div key={stock.symbol} className="flex items-center justify-between">
                    <Button 
                      variant="link"
                      className="h-6 p-0 text-green-600 hover:text-green-700 text-left"
                      onClick={() => goToStockDetails(stock.symbol)}
                    >
                      {stock.symbol} <span className="text-xs ml-1">(Wave {stock.wave})</span>
                    </Button>
                    {stock.startTimestamp && (
                      <span className="text-xs text-muted-foreground">
                        {getTimeAgo(stock.startTimestamp)}
                      </span>
                    )}
                  </div>
                ))}
                
                {/* Show more/less button */}
                {filteredStocks.bullish.length > 5 && (
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-6 text-xs w-full"
                    onClick={() => setShowMoreBullish(!showMoreBullish)}
                  >
                    {showMoreBullish ? (
                      <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
                    ) : (
                      <>Show {filteredStocks.bullish.length - 5} More <ChevronDown className="ml-1 h-3 w-3" /></>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <div className="py-2 text-center text-muted-foreground text-sm">
                No bullish stocks found
                {bullishWaveFilter && ` for Wave ${bullishWaveFilter}`}
              </div>
            )}
          </div>
        </div>
        
        {/* Bearish Section */}
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">
            Bearish (Waves {availableWaves.bearish.length > 0 ? 
              <>{formatWaves(availableWaves.bearish)}</> : 
              "None"}
            )
            {bearishWaveFilter && (
              <Badge variant="outline" className="ml-2 py-0">
                <span className="mr-1">Showing Wave {bearishWaveFilter}</span>
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setBearishWaveFilter(null)} 
                />
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowDownRight className="mr-1 text-red-500" />
              <span className="text-xl font-mono">{marketSentiment.bearishPercentage}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {filteredStocks.bearish.length} stocks
              {bearishWaveFilter && ` in Wave ${bearishWaveFilter}`}
            </div>
          </div>
          
          <div className="space-y-1">
            {filteredStocks.bearish.length > 0 ? (
              <>
                {filteredStocks.bearish.slice(0, showMoreBearish ? undefined : 5).map(stock => (
                  <div key={stock.symbol} className="flex items-center justify-between">
                    <Button 
                      variant="link"
                      className="h-6 p-0 text-red-600 hover:text-red-700 text-left"
                      onClick={() => goToStockDetails(stock.symbol)}
                    >
                      {stock.symbol} <span className="text-xs ml-1">(Wave {stock.wave})</span>
                    </Button>
                    {stock.startTimestamp && (
                      <span className="text-xs text-muted-foreground">
                        {getTimeAgo(stock.startTimestamp)}
                      </span>
                    )}
                  </div>
                ))}
                
                {/* Show more/less button */}
                {filteredStocks.bearish.length > 5 && (
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-6 text-xs w-full"
                    onClick={() => setShowMoreBearish(!showMoreBearish)}
                  >
                    {showMoreBearish ? (
                      <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
                    ) : (
                      <>Show {filteredStocks.bearish.length - 5} More <ChevronDown className="ml-1 h-3 w-3" /></>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <div className="py-2 text-center text-muted-foreground text-sm">
                No bearish stocks found
                {bearishWaveFilter && ` for Wave ${bearishWaveFilter}`}
              </div>
            )}
          </div>
        </div>
        
        {/* Reversal Alerts Section */}
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Reversal Alerts</div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <svg className="mr-1 text-amber-500 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-xl font-mono">!</span>
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ReversalsLastUpdated />
            </div>
          </div>
          
          <div className="space-y-1">
            <ReversalsList hideHeader={true} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketOverview;