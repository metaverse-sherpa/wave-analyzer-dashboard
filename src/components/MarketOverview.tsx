import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ArrowUpRight, ArrowDownRight, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const MarketOverview: React.FC = () => {
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis();
  const [showMoreBullish, setShowMoreBullish] = useState(false);
  const [showMoreBearish, setShowMoreBearish] = useState(false);
  
  // Debug: Log analyses to console to see what data we're getting
  useEffect(() => {
    console.log('Current wave analyses:', analyses);
  }, [analyses]);
  
  // Replace the categorizedStocks useMemo with this improved version
  const categorizedStocks = React.useMemo(() => {
    console.log("Categorizing stocks from analyses:", Object.keys(analyses).length);
    
    const categorized = {
      bullish: [] as {symbol: string, wave: string | number}[],
      bearish: [] as {symbol: string, wave: string | number}[]
    };
    
    // Process each analysis - with improved defensive checking
    Object.entries(analyses).forEach(([key, analysis]) => {
      try {
        // More thorough data validation
        if (!analysis) {
          console.log(`Skipping ${key}: No analysis data`);
          return;
        }
        
        // Remove the invalid nested analysis check that's causing the build error
        // const actualAnalysis = analysis.analysis ? analysis.analysis : analysis;
        
        if (!analysis?.currentWave) {
          console.log(`Skipping ${key}: No wave data in analysis`);
          return;
        }
        
        // Only include daily timeframe analyses
        if (!key.includes('_1d')) {
          return;
        }
        
        const symbol = key.split('_')[0];
        const currentWaveNumber = analysis.currentWave.number;
        
        if (currentWaveNumber === undefined || currentWaveNumber === null) {
          console.log(`Skipping ${symbol}: Invalid wave number:`, currentWaveNumber);
          return;
        }
        
        // Improved categorization logic with strong typing
        if (typeof currentWaveNumber === 'number') {
          // Number waves: 1,3,5 are bullish; 2,4 are bearish
          if (currentWaveNumber % 2 === 1) {
            categorized.bullish.push({ symbol, wave: currentWaveNumber });
          } else {
            categorized.bearish.push({ symbol, wave: currentWaveNumber });
          }
        } else if (typeof currentWaveNumber === 'string') {
          // Letter waves: B is bullish; A,C are bearish
          if (currentWaveNumber === 'B') {
            categorized.bullish.push({ symbol, wave: currentWaveNumber });
          } else if (currentWaveNumber === 'A' || currentWaveNumber === 'C') {
            categorized.bearish.push({ symbol, wave: currentWaveNumber });
          }
        }
      } catch (error) {
        console.error(`Error processing ${key}:`, error);
      }
    });
    
    console.log(`Categorization complete - Bullish: ${categorized.bullish.length}, Bearish: ${categorized.bearish.length}`);
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
    navigate(`/stocks/${symbol}`);
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
        <div className={`text-lg font-medium ${overallSentiment === 'bullish' ? 'text-green-600' : 'text-red-600'}`}>
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