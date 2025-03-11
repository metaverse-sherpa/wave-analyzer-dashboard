import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface StockTrendListProps {}

const StockTrendList: React.FC<StockTrendListProps> = () => {
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis();
  
  // Get stocks with the strongest trends
  const trendingStocks = Object.entries(analyses)
    .filter(([key, analysis]) => key.includes('_1d') && analysis.waves.length > 0)
    .map(([key, analysis]) => {
      const symbol = key.split('_')[0];
      return {
        symbol,
        trend: analysis.trend,
        currentWave: analysis.currentWave,
        waveCount: analysis.waves.length,
        patternType: analysis.impulsePattern ? 'impulse' : analysis.correctivePattern ? 'corrective' : 'undefined'
      };
    })
    .sort((a, b) => b.waveCount - a.waveCount)
    .slice(0, 5);
  
  // Navigate to stock details page
  const goToStockDetails = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };
  
  const getWaveClassName = (waveNumber: string | number) => {
    // Handle both numeric and letter wave numbers
    if (typeof waveNumber === 'number') {
      return `wave-${waveNumber}`;
    }
    
    // For A-B-C waves
    return `wave-${waveNumber}`;
  };
  
  return (
    <div className="space-y-4">
      {trendingStocks.length > 0 ? (
        <ul className="space-y-2">
          {trendingStocks.map(stock => (
            <li key={stock.symbol} className="flex items-center justify-between py-2 border-b border-border">
              <Button 
                variant="ghost" 
                className="h-8 p-2 font-medium" 
                onClick={() => goToStockDetails(stock.symbol)}
              >
                {stock.symbol}
              </Button>
              <div className="flex items-center gap-2">
                <Badge className={`${
                  stock.trend === 'bullish' ? 'bg-bullish/20 text-bullish hover:bg-bullish/30' : 
                  stock.trend === 'bearish' ? 'bg-bearish/20 text-bearish hover:bg-bearish/30' : 
                  'bg-neutral/20 text-neutral hover:bg-neutral/30'
                }`}>
                  {stock.trend}
                </Badge>
                <Badge variant="outline" className={`${getWaveClassName(stock.currentWave?.number || '')}`}>
                  Wave {stock.currentWave?.number || '-'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          No trending stocks available yet
        </div>
      )}
    </div>
  );
};

export default StockTrendList;