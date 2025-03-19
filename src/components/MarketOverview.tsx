import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from './ui/progress';
import ReversalsList from './ReversalsList';
import ReversalsLastUpdated from './ReversalsLastUpdated';

// Keep this helper function at the top
const getTimestampValue = (timestamp: any): number => {
  if (!timestamp) return 0;
  
  if (typeof timestamp === 'number') {
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return 0;
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
  const { analyses } = useWaveAnalysis();
  const [showMoreBullish, setShowMoreBullish] = useState(false);
  const [showMoreBearish, setShowMoreBearish] = useState(false);
  
  // Use a ref to track initialization
  const initialized = useRef(false);
  
  // Only debug log once when analyses are loaded
  useEffect(() => {
    if (Object.keys(analyses).length > 0 && !initialized.current) {
      console.log('Wave analyses loaded:', Object.keys(analyses).length);
      initialized.current = true;
    }
  }, [analyses]);

  // Fix the categorization logic to correctly match with your Supabase data structure
  const categorizedStocks = React.useMemo(() => {
    console.log("Categorizing stocks from analyses:", Object.keys(analyses).length);
    
    const categorized = {
      bullish: [] as {symbol: string, wave: string | number, startTimestamp?: number}[],
      bearish: [] as {symbol: string, wave: string | number, startTimestamp?: number}[]
    };
    
    // No need to process if no analyses
    if (Object.keys(analyses).length === 0) {
      return categorized;
    }
    
    // This should process the entire analyses object, regardless of key format
    Object.entries(analyses).forEach(([key, analysis]) => {
      try {
        // Extract the symbol from the key - just use the key directly as it seems to be the symbol
        const symbol = key;
        
        // Skip if no analysis or it's in an unexpected format
        if (!analysis || !analysis.currentWave || !analysis.currentWave.number) {
          return;
        }
        
        // Get current wave and number directly
        const { currentWave } = analysis;
        const currentWaveNumber = currentWave.number;
        const startTimestamp = getTimestampValue(currentWave.startTimestamp || 0);
        
        // Categorize based on wave number
        if (typeof currentWaveNumber === 'number') {
          // Number waves: 1,3,5 are bullish; 2,4 are bearish
          if (currentWaveNumber % 2 === 1) {
            categorized.bullish.push({ symbol, wave: currentWaveNumber, startTimestamp });
          } else {
            categorized.bearish.push({ symbol, wave: currentWaveNumber, startTimestamp });
          }
        } else if (typeof currentWaveNumber === 'string') {
          // Letter waves: B is bullish; A,C are bearish
          if (currentWaveNumber === 'B') {
            categorized.bullish.push({ symbol, wave: currentWaveNumber, startTimestamp });
          } else if (currentWaveNumber === 'A' || currentWaveNumber === 'C') {
            categorized.bearish.push({ symbol, wave: currentWaveNumber, startTimestamp });
          }
        }
      } catch (error) {
        // Just silently skip problematic entries
      }
    });
    
    // Sort both arrays by startTimestamp descending (most recent first)
    categorized.bullish.sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0));
    categorized.bearish.sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0));
    
    console.log("Categorization complete - Bullish:", categorized.bullish.length, ", Bearish:", categorized.bearish.length);
    return categorized;
  }, [analyses]);

  // Generate market sentiment based on categorized stocks
  const marketSentiment = useMemo(() => {
    const analysisList = Object.values(analyses);
    
    if (!analysisList || analysisList.length === 0) {
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
    
    let bullish = 0;
    let bearish = 0;
    let neutral = 0;
    
    analysisList.forEach(analysis => {
      if (!analysis || !analysis.waves || analysis.waves.length === 0) return;
      
      // Get the latest wave classification
      const latestWave = analysis.waves[analysis.waves.length - 1];
      
      // Check if wave properties exist on the wave object
      if (!latestWave) return;
      
      // Access properties safely using optional chaining
      const waveDegree = (latestWave as any).degree;
      const waveNumber = (latestWave as any).waveNumber || latestWave.number; // Try both property names
      const waveTrend = (latestWave as any).trend;
      
      // Determine if this is an impulse or corrective wave
      let isImpulseWave = false;
      
      if (typeof waveNumber === 'number') {
        isImpulseWave = [1, 3, 5].includes(waveNumber);
      } else if (typeof waveNumber === 'string') {
        isImpulseWave = ['1', '3', '5'].includes(waveNumber);
      }
      
      // Determine trend direction
      const isUptrend = waveTrend === 'up' || waveTrend === true;
      
      // Classify sentiment
      if ((isUptrend && isImpulseWave) || (!isUptrend && !isImpulseWave)) {
        bullish++;
      } else if ((isUptrend && !isImpulseWave) || (!isUptrend && isImpulseWave)) {
        bearish++;
      } else {
        neutral++;
      }
    });
    
    const total = bullish + bearish + neutral;
    const bullishPercentage = Math.round((bullish / total) * 100) || 0;
    const bearishPercentage = Math.round((bearish / total) * 100) || 0;
    const neutralPercentage = Math.round((neutral / total) * 100) || 0;
    
    // Determine overall sentiment
    let overallSentiment = 'Neutral';
    if (bullishPercentage > 60) overallSentiment = 'Bullish';
    else if (bearishPercentage > 60) overallSentiment = 'Bearish';
    else if (bullishPercentage > bearishPercentage + 10) overallSentiment = 'Slightly Bullish';
    else if (bearishPercentage > bullishPercentage + 10) overallSentiment = 'Slightly Bearish';
    
    return {
      count: total,
      bullish,
      bearish,
      neutral,
      bullishPercentage,
      bearishPercentage,
      neutralPercentage,
      overallSentiment
    };
  }, [analyses]);
  
  // Navigate to stock details page
  const goToStockDetails = (symbol: string) => {
    navigate("/stocks/" + symbol);
  };
  
  // Calculate overall market sentiment
  const overallSentiment = marketSentiment.bullish >= marketSentiment.bearish ? 'bullish' : 'bearish';
  
  // Simplified display of stock lists
  return (
    <div className="space-y-4">
      {/* Market Sentiment section moved to the top */}
      <div className="bg-secondary rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-muted-foreground text-sm">Market Sentiment</div>
            <div className={"text-lg font-medium " + (overallSentiment === 'bullish' ? 'text-green-600' : 'text-red-600')}>
              {marketSentiment.overallSentiment}
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground">
            {marketSentiment.count} stocks analyzed
          </div>
        </div>
        
        {/* Single sentiment progress bar */}
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
            
            {/* Neutral portion (middle) */}
            <div 
              className="bg-gray-400 h-full flex items-center justify-center"
              style={{ width: `${marketSentiment.neutralPercentage}%` }}
            >
              {marketSentiment.neutralPercentage > 15 && (
                <span className="text-xs font-medium text-white">
                  {marketSentiment.neutralPercentage}%
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

      {/* Three-column grid for Bullish, Bearish, and Reversals */}
      <div className="grid grid-cols-3 gap-4">
        {/* Bullish Section */}
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Bullish (Waves 1, 3, 5, B)</div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowUpRight className="mr-1 text-green-500" />
              <span className="text-xl font-mono">{marketSentiment.bullishPercentage}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {categorizedStocks.bullish.length} stocks
            </div>
          </div>
          
          <div className="space-y-1">
            {categorizedStocks.bullish.length > 0 ? (
              <>
                {categorizedStocks.bullish.slice(0, showMoreBullish ? undefined : 5).map(stock => (
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
                {categorizedStocks.bullish.length > 5 && (
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-6 text-xs w-full"
                    onClick={() => setShowMoreBullish(!showMoreBullish)}
                  >
                    {showMoreBullish ? (
                      <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
                    ) : (
                      <>Show {categorizedStocks.bullish.length - 5} More <ChevronDown className="ml-1 h-3 w-3" /></>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <div className="py-2 text-center text-muted-foreground text-sm">
                No bullish stocks found
              </div>
            )}
          </div>
        </div>
        
        {/* Bearish Section */}
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Bearish (Waves 2, 4, A, C)</div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowDownRight className="mr-1 text-red-500" />
              <span className="text-xl font-mono">{marketSentiment.bearishPercentage}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {categorizedStocks.bearish.length} stocks
            </div>
          </div>
          
          <div className="space-y-1">
            {categorizedStocks.bearish.length > 0 ? (
              <>
                {categorizedStocks.bearish.slice(0, showMoreBearish ? undefined : 5).map(stock => (
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
                {categorizedStocks.bearish.length > 5 && (
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-6 text-xs w-full"
                    onClick={() => setShowMoreBearish(!showMoreBearish)}
                  >
                    {showMoreBearish ? (
                      <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
                    ) : (
                      <>Show {categorizedStocks.bearish.length - 5} More <ChevronDown className="ml-1 h-3 w-3" /></>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <div className="py-2 text-center text-muted-foreground text-sm">
                No bearish stocks found
              </div>
            )}
          </div>
        </div>
        
        {/* NEW Reversal Alerts Section - Using the same styling */}
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