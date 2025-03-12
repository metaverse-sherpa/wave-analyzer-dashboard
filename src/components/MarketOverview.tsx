import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MarketOverview: React.FC = () => {
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis();
  
  // Generate market sentiment based on wave analyses
  const marketSentiment = React.useMemo(() => {
    if (Object.keys(analyses).length === 0) return { bullish: 0, bearish: 0, neutral: 0 };
    
    const sentiments = { bullish: 0, bearish: 0, neutral: 0 };
    
    Object.values(analyses).forEach(analysis => {
      // Add null check
      if (analysis && analysis.trend) {
        sentiments[analysis.trend]++;
      }
    });
    
    const total = Object.values(sentiments).reduce((acc, val) => acc + val, 0);
    
    return {
      bullish: Math.round((sentiments.bullish / total) * 100) || 0,
      bearish: Math.round((sentiments.bearish / total) * 100) || 0,
      neutral: Math.round((sentiments.neutral / total) * 100) || 0,
    };
  }, [analyses]);
  
  // Get top stocks in each sentiment category
  const topStocks = React.useMemo(() => {
    const categorized = {
      bullish: [] as {symbol: string, waves: number}[],
      bearish: [] as {symbol: string, waves: number}[],
      neutral: [] as {symbol: string, waves: number}[]
    };
    
    Object.entries(analyses).forEach(([key, analysis]) => {
      // Add null check here
      if (analysis && analysis.trend && key.includes('_1d')) {
        const symbol = key.split('_')[0];
        categorized[analysis.trend].push({
          symbol,
          // Add optional chaining here too
          waves: analysis.waves?.length || 0
        });
      }
    });
    
    // Sort each category by wave count (more waves = more reliable pattern)
    Object.keys(categorized).forEach(category => {
      categorized[category as keyof typeof categorized].sort((a, b) => b.waves - a.waves);
    });
    
    return {
      bullish: categorized.bullish.slice(0, 3),
      bearish: categorized.bearish.slice(0, 3),
      neutral: categorized.neutral.slice(0, 3)
    };
  }, [analyses]);
  
  // Navigate to stock details page
  const goToStockDetails = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };
  
  // Calculate overall market sentiment
  const overallSentiment = 
    marketSentiment.bullish > marketSentiment.bearish ? 'bullish' :
    marketSentiment.bearish > marketSentiment.bullish ? 'bearish' : 'neutral';
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Bullish</div>
          <div className="flex items-center">
            <ArrowUpRight className="mr-1 text-bullish" />
            <span className="text-xl font-mono">{marketSentiment.bullish}%</span>
          </div>
          <div className="mt-3 space-y-1">
            {topStocks.bullish.map(stock => (
              <Button 
                key={stock.symbol}
                variant="link"
                className="h-6 p-0 text-muted-foreground"
                onClick={() => goToStockDetails(stock.symbol)}
              >
                {stock.symbol} <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>
        
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Bearish</div>
          <div className="flex items-center">
            <ArrowDownRight className="mr-1 text-bearish" />
            <span className="text-xl font-mono">{marketSentiment.bearish}%</span>
          </div>
          <div className="mt-3 space-y-1">
            {topStocks.bearish.map(stock => (
              <Button 
                key={stock.symbol}
                variant="link"
                className="h-6 p-0 text-muted-foreground"
                onClick={() => goToStockDetails(stock.symbol)}
              >
                {stock.symbol} <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>
        
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-muted-foreground text-sm mb-1">Neutral</div>
          <div className="flex items-center">
            <Minus className="mr-1 text-neutral" />
            <span className="text-xl font-mono">{marketSentiment.neutral}%</span>
          </div>
          <div className="mt-3 space-y-1">
            {topStocks.neutral.map(stock => (
              <Button 
                key={stock.symbol}
                variant="link"
                className="h-6 p-0 text-muted-foreground"
                onClick={() => goToStockDetails(stock.symbol)}
              >
                {stock.symbol} <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bg-secondary rounded-lg p-4">
        <div className="text-muted-foreground text-sm mb-1">Market Sentiment</div>
        <div className={`text-lg font-medium ${
          overallSentiment === 'bullish' ? 'text-bullish' : 
          overallSentiment === 'bearish' ? 'text-bearish' : 
          'text-neutral'
        }`}>
          {overallSentiment.charAt(0).toUpperCase() + overallSentiment.slice(1)}
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground mt-2">
        Based on Elliott Wave analysis of {Object.keys(analyses).length} stocks
      </div>
    </div>
  );
};

export default MarketOverview;