import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface ReversalCandidatesListProps {}

const ReversalCandidatesList: React.FC<ReversalCandidatesListProps> = () => {
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis();
  
  // Find stocks that have met all Fibonacci targets
  const reversalCandidates = useMemo(() => {
    console.log("Finding reversal candidates from analyses:", Object.keys(analyses).length);
    
    // Early return if no analyses
    if (Object.keys(analyses).length === 0) {
      return [];
    }
    
    return Object.entries(analyses)
      .filter(([key, analysis]) => {
        // Check if we have valid analysis data
        if (!analysis || !analysis.currentWave || !analysis.fibTargets || analysis.fibTargets.length === 0) {
          return false;
        }
        
        const { currentWave, fibTargets } = analysis;
        
        // Check if there are any Fibonacci targets left
        const currentPrice = currentWave.endPrice || 0;
        
        const hasTargetsLeft = fibTargets.some(target => {
          if (currentWave.type === 'impulse') {
            return target.price > currentPrice;
          } else {
            return target.price < currentPrice;
          }
        });
        
        // If no targets are left, this is a reversal candidate
        return !hasTargetsLeft;
      })
      .map(([key, analysis]) => {
        // Extract the symbol from the key
        const symbol = key.replace('wave_analysis_', '').split('_')[0];
        
        // Get the wave data
        const { currentWave } = analysis;
        
        return {
          symbol,
          waveNumber: currentWave.number,
          waveType: currentWave.type,
          startTimestamp: currentWave.startTimestamp,
          endPrice: currentWave.endPrice
        };
      })
      // Sort by most recent start date
      .sort((a, b) => {
        const getTime = (timestamp: any) => {
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
        
        return getTime(b.startTimestamp) - getTime(a.startTimestamp);
      })
      .slice(0, 5);  // Take the top 5
  }, [analyses]);
  
  // Navigate to stock details page
  const goToStockDetails = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };
  
  // Format timestamp to show time ago
  const getTimeAgo = (timestamp: any): string => {
    if (!timestamp) return '';
    
    const now = Date.now();
    let time = timestamp;
    
    if (typeof timestamp !== 'number') {
      time = new Date(timestamp).getTime();
    }
    
    const diff = now - time;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) {
      return `${days}d ago`;
    } else {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours > 0) {
        return `${hours}h ago`;
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}m ago`;
      }
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-500 mb-2">
        <AlertTriangle size={16} className="animate-pulse" />
        <h3 className="text-sm font-medium">Reversal Candidates</h3>
      </div>
      
      {reversalCandidates.length > 0 ? (
        <ul className="space-y-2">
          {reversalCandidates.map(stock => (
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
                  stock.waveType === 'impulse' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 
                  'bg-red-500/20 text-red-700 dark:text-red-400'
                }`}>
                  Wave {stock.waveNumber}
                </Badge>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                  Reversal
                </Badge>
                {stock.startTimestamp && (
                  <span className="text-xs text-muted-foreground">
                    {getTimeAgo(stock.startTimestamp)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          No reversal candidates found
        </div>
      )}
    </div>
  );
};

export default ReversalCandidatesList;