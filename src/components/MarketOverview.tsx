import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ArrowUpRight, ArrowDownRight, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// Move the helper function to the top of the file, outside of the component
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

const MarketOverview: React.FC = () => {
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis();
  const [showMoreBullish, setShowMoreBullish] = useState(false);
  const [showMoreBearish, setShowMoreBearish] = useState(false);
  
  // Debug: Log analyses to console to see what data we're getting
  useEffect(() => {
    console.log('Current wave analyses:', analyses);
  }, [analyses]);
  
  // Replace the entire useEffect block that's checking data format
  useEffect(() => {
    // Debug the structure of analyses object
    if (Object.keys(analyses).length > 0) {
      const sampleKey = Object.keys(analyses)[0];
      console.log(`Sample analysis structure for ${sampleKey}:`, analyses[sampleKey]);
      
      // Instead of throwing an error, let's just log what we find
      if (analyses[sampleKey]?.currentWave?.number) {
        console.log('Data format looks correct');
      } else {
        console.log('Note: Expected structure not found - attempting to adapt to available format');
        // Log what we DO have to better understand the structure
        console.log('Available structure:', Object.keys(analyses[sampleKey] || {}));
        
        // Try to find any waves array
        const wavesArray = analyses[sampleKey]?.waves;
        if (Array.isArray(wavesArray) && wavesArray.length > 0) {
          console.log('Found waves array:', wavesArray);
        }
      }
    } else {
      console.log('No analyses data available');
    }
  }, [analyses]);
  
  // Add this to your MarketOverview component - safe fallback when there are no analyses
  useEffect(() => {
    // If no analyses are found after 3 seconds, create some fallback data for display
    if (Object.keys(analyses).length === 0) {
      const timer = setTimeout(() => {
        if (Object.keys(analyses).length === 0) {
          console.log("Creating fallback market data");
          
          // Create sample data for UI demonstration
          const fallbackAnalyses = {
            'AAPL_1d': { currentWave: { number: 5 } },
            'MSFT_1d': { currentWave: { number: 3 } },
            'GOOGL_1d': { currentWave: { number: 1 } },
            'AMZN_1d': { currentWave: { number: 2 } },
            'META_1d': { currentWave: { number: 4 } },
            'TSLA_1d': { currentWave: { number: 'A' } },
            'NVDA_1d': { currentWave: { number: 'B' } },
            'JPM_1d': { currentWave: { number: 'C' } }
          };
          
          // You'll need to add this setter to your context or find another way to provide fallback data
          // This is just a conceptual example
          // setAnalyses(fallbackAnalyses); 
        }
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [analyses]);
  
  // In MarketOverview.tsx, update your categorizedStocks useMemo
  const categorizedStocks = React.useMemo(() => {
    console.log("Categorizing stocks from analyses:", Object.keys(analyses).length);
    
    const categorized = {
      bullish: [] as {symbol: string, wave: string | number, startTimestamp?: number}[],
      bearish: [] as {symbol: string, wave: string | number, startTimestamp?: number}[]
    };
    
    // Process each analysis - with improved defensive checking
    Object.entries(analyses).forEach(([key, analysis]) => {
      try {
        // Skip if no analysis or it's in an unexpected format
        if (!analysis) {
          console.warn("Skipping " + key + ": No analysis data");
          return;
        }
        
        // Try to find the current wave even if the structure isn't exactly as expected
        let currentWave = analysis.currentWave;
        
        // If currentWave isn't directly available, try to find it elsewhere
        if (!currentWave) {
          console.warn("No current Wave found for " + key + ", looking in alternate locations");
          
          // Check if it's nested under another property
          const possibleNestedData = Object.values(analysis).find(
            val => val && typeof val === 'object' && 'currentWave' in val
          );
          
          if (possibleNestedData && possibleNestedData.currentWave) {
            currentWave = possibleNestedData.currentWave;
          }
          
          // Or maybe it's in a waves array
          else if (Array.isArray(analysis.waves) && analysis.waves.length > 0) {
            currentWave = analysis.waves[analysis.waves.length - 1];
          }
          
          if (!currentWave) {
            console.warn("Couldn't find currentWave for " + key + ", skipping");
            return;
          }
        }

        // Only include daily timeframe analyses
        if (!key.includes('_1d')) {
          return;
        }
        
        const symbol = key.split('_')[0];
        
        // Extract wave number
        let currentWaveNumber;
        if (currentWave.number !== undefined) {
          currentWaveNumber = currentWave.number;
        } else if (currentWave && typeof currentWave === 'object') {
          currentWaveNumber = 
            (currentWave as any).waveType !== undefined ? (currentWave as any).waveType :
            (currentWave as any).type !== undefined ? (currentWave as any).type :
            (currentWave as any).wave_type !== undefined ? (currentWave as any).wave_type :
            undefined;
        }
        
        if (currentWaveNumber === undefined || currentWaveNumber === null) {
          console.warn("Skipping", symbol, ": Invalid wave number:", currentWaveNumber);
          return;
        }
        
        // Extract startTimestamp - important for sorting
        const startTimestamp = getTimestampValue(
          // Try all possible timestamp properties in priority order
          (currentWave as any).startTimestamp || 
          (currentWave as any).start_timestamp || 
          (currentWave as any).startTime || 
          (currentWave as any).start_time || 
          (currentWave as any).timestamp || 
          (currentWave as any).time || 
          0  // Default fallback
        );
        
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
        console.error("Error processing", key, ":", error);
      }
    });
    
    // Sort both arrays by startTimestamp descending (most recent first)
    categorized.bullish.sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0));
    categorized.bearish.sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0));
    
    console.log("Categorization complete - Bullish:", categorized.bullish.length, ", Bearish:", categorized.bearish.length);
    return categorized;
  }, [analyses]);

  // Generate market sentiment based on categorized stocks
  const marketSentiment = React.useMemo(() => {
    const bullishCount = categorizedStocks.bullish.length;
    const bearishCount = categorizedStocks.bearish.length;
    const total = bullishCount + bearishCount;
    
    if (total === 0) return { bullish: 0, bearish: 0 };
    
    return {
      bullish: Math.round((bullishCount / total) * 100),
      bearish: Math.round((bearishCount / total) * 100)
    };
  }, [categorizedStocks]);
  
  // Navigate to stock details page
  const goToStockDetails = (symbol: string) => {
    navigate("/stocks/" + symbol);
  };
  
  // Calculate overall market sentiment
  const overallSentiment = marketSentiment.bullish >= marketSentiment.bearish ? 'bullish' : 'bearish';
  
  // Simplified display of stock lists
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Bullish Section */}
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Bullish (Impulsive Waves: 1, 3, 5, B)</div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowUpRight className="mr-1 text-green-500" />
              <span className="text-xl font-mono">{marketSentiment.bullish}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {categorizedStocks.bullish.length} stocks
            </div>
          </div>
          
          <div className="space-y-1">
            {categorizedStocks.bullish.length > 0 ? (
              <>
                {/* Display all bullish stocks - simplified approach */}
                {categorizedStocks.bullish.slice(0, showMoreBullish ? undefined : 5).map(stock => (
                  <div key={stock.symbol} className="flex items-center">
                    <Button 
                      variant="link"
                      className="h-6 p-0 text-green-600 hover:text-green-700 text-left"
                      onClick={() => goToStockDetails(stock.symbol)}
                    >
                      {stock.symbol} <span className="text-xs ml-1">(Wave {stock.wave})</span>
                    </Button>
                  </div>
                ))}
                
                {/* Show more/less button if we have more than 5 stocks */}
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
          <div className="text-muted-foreground text-sm mb-1">Bearish (Corrective Waves: 2, 4, A, C)</div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowDownRight className="mr-1 text-red-500" />
              <span className="text-xl font-mono">{marketSentiment.bearish}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {categorizedStocks.bearish.length} stocks
            </div>
          </div>
          
          <div className="space-y-1">
            {categorizedStocks.bearish.length > 0 ? (
              <>
                {/* Display all bearish stocks - simplified approach */}
                {categorizedStocks.bearish.slice(0, showMoreBearish ? undefined : 5).map(stock => (
                  <div key={stock.symbol} className="flex items-center">
                    <Button 
                      variant="link"
                      className="h-6 p-0 text-red-600 hover:text-red-700 text-left"
                      onClick={() => goToStockDetails(stock.symbol)}
                    >
                      {stock.symbol} <span className="text-xs ml-1">(Wave {stock.wave})</span>
                    </Button>
                  </div>
                ))}
                
                {/* Show more/less button if we have more than 5 stocks */}
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
      </div>
      
      {/* Overall market sentiment */}
      <div className="bg-secondary rounded-lg p-4">
        <div className="text-muted-foreground text-sm mb-1">Market Sentiment</div>
        <div className={"text-lg font-medium " + (overallSentiment === 'bullish' ? 'text-green-600' : 'text-red-600')}>
          {overallSentiment.charAt(0).toUpperCase() + overallSentiment.slice(1)}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Based on Elliott Wave analysis of {Object.keys(analyses).filter(k => k.includes('_1d')).length} stocks
        </div>
      </div>
    </div>
  );
};

export default MarketOverview;