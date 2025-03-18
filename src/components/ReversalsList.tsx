import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp } from 'lucide-react';

const ReversalsList: React.FC = () => {
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const { analyses } = useWaveAnalysis();
  
  // Find potential reversals based on Fibonacci targets being exceeded
  const reversalCandidates = React.useMemo(() => {
    const candidates = [];
    
    Object.entries(analyses).forEach(([key, analysis]) => {
      // Skip entries without proper wave data
      if (!analysis || !analysis.waves || analysis.waves.length === 0) return;
      
      // Extract symbol from key (remove _1d or similar suffix)
      const symbol = key.split('_')[0];
      
      // Get the latest wave
      const latestWave = analysis.waves[analysis.waves.length - 1];
      
      // Check for Fibonacci targets
      const fibTargets = (latestWave as any).fibTargets || [];
      const currentPrice = (analysis as any).currentPrice || 0;
      const waveNumber = (latestWave as any).number || (latestWave as any).waveNumber || '?';
      const waveTrend = (latestWave as any).trend;
      
      // Determine whether this is a bullish or bearish wave
      const isBearishWave = isBearish(waveNumber, waveTrend);
      
      if (isBearishWave) {
        // For bearish waves, check if price is BELOW the lowest Fibonacci target
        // This means the price has fallen further than expected
        let lowestTarget = Infinity;
        let targetLevel = '';
        
        fibTargets.forEach((target: any) => {
          const level = target.level || 0;
          const price = target.price || 0;
          
          // Skip targets that are zero or invalid
          if (price <= 0) return;
          
          // Store the lowest target we find
          if (price < lowestTarget) {
            lowestTarget = price;
            targetLevel = String(level);
          }
          
          // If we find standard retracement targets, prefer those
          if ([0.618, 0.5, 0.382].includes(level)) {
            lowestTarget = price;
            targetLevel = String(level);
          }
        });
        
        // If current price is below the target by 3% or more, it's a potential reversal
        if (lowestTarget < Infinity && currentPrice < lowestTarget * 0.97) {
          candidates.push({
            symbol,
            waveNumber: waveNumber,
            trend: waveTrend,
            isBearish: true, 
            currentPrice: currentPrice,
            targetPrice: lowestTarget,
            targetLevel: targetLevel,
            exceededBy: ((lowestTarget / currentPrice - 1) * 100).toFixed(1), // percentage exceeded
            nextWave: getNextWave(waveNumber)
          });
        }
      } else {
        // For bullish waves, check if price is ABOVE the highest Fibonacci target
        // This means the price has risen further than expected
        let highestTarget = 0;
        let targetLevel = '';
        
        fibTargets.forEach((target: any) => {
          const level = target.level || 0;
          const price = target.price || 0;
          
          // Store the highest target we find
          if (price > highestTarget) {
            highestTarget = price;
            targetLevel = String(level);
          }
          
          // If we find standard extension targets, prefer those
          if ([1.618, 2.618].includes(level)) {
            highestTarget = price;
            targetLevel = String(level);
          }
        });
        
        // If current price exceeds the target by 3% or more, it's a potential reversal
        if (highestTarget > 0 && currentPrice > highestTarget * 1.03) {
          candidates.push({
            symbol,
            waveNumber: waveNumber,
            trend: waveTrend,
            isBearish: false,
            currentPrice: currentPrice,
            targetPrice: highestTarget,
            targetLevel: targetLevel,
            exceededBy: ((currentPrice / highestTarget - 1) * 100).toFixed(1), // percentage exceeded
            nextWave: getNextWave(waveNumber)
          });
        }
      }
    });
    
    // Sort by how much they've exceeded their targets (highest first)
    return candidates.sort((a, b) => parseFloat(b.exceededBy) - parseFloat(a.exceededBy));
  }, [analyses]);
  
  // Helper to determine if a wave is bearish
  function isBearish(waveNumber: number | string, trend: any): boolean {
    // Corrective waves in an uptrend or impulse waves in a downtrend are bearish
    const isUptrend = trend === 'up' || trend === true;
    
    // Check wave number to determine if it's an impulse or corrective wave
    if (typeof waveNumber === 'number') {
      const isCorrectiveWave = [2, 4].includes(waveNumber);
      return (isUptrend && isCorrectiveWave) || (!isUptrend && !isCorrectiveWave);
    } else if (typeof waveNumber === 'string') {
      const isCorrectiveWave = ['A', 'C', '2', '4'].includes(waveNumber);
      return (isUptrend && isCorrectiveWave) || (!isUptrend && !isCorrectiveWave);
    }
    
    // Default case
    return false;
  }
  
  // Helper to determine the next wave
  function getNextWave(currentWave: number | string): string {
    if (typeof currentWave === 'number') {
      if (currentWave === 5) return "A";
      return String(currentWave + 1);
    } else if (currentWave === 'A') return "B";
    else if (currentWave === 'B') return "C";
    else if (currentWave === 'C') return "1";
    return "?";
  }
  
  const goToStockDetails = (symbol: string) => {
    navigate("/stocks/" + symbol);
  };
  
  return (
    <div className="space-y-1">
      {reversalCandidates.length > 0 ? (
        <>
          {reversalCandidates.slice(0, showMore ? undefined : 5).map((candidate) => (
            <div key={candidate.symbol} className="flex items-center justify-between">
              <Button 
                variant="link"
                className="h-6 p-0 text-amber-600 hover:text-amber-700 text-left"
                onClick={() => goToStockDetails(candidate.symbol)}
              >
                {candidate.symbol}
                <Badge variant="outline" className="ml-2 text-xs font-normal py-0">
                  {candidate.waveNumber} → {candidate.nextWave}
                </Badge>
              </Button>
              <span className="text-xs text-muted-foreground flex items-center">
                {candidate.isBearish ? (
                  <>
                    <ArrowDown className="h-3 w-3 text-red-500 mr-1" />
                    <span className="font-medium text-red-500">-{candidate.exceededBy}%</span>
                  </>
                ) : (
                  <>
                    <ArrowUp className="h-3 w-3 text-green-500 mr-1" />
                    <span className="font-medium text-green-500">+{candidate.exceededBy}%</span>
                  </>
                )}
                <span className="ml-1">fib {candidate.targetLevel}</span>
              </span>
            </div>
          ))}
          
          {/* Show more/less button */}
          {reversalCandidates.length > 5 && (
            <Button 
              variant="ghost"
              size="sm"
              className="mt-1 h-6 text-xs w-full"
              onClick={() => setShowMore(!showMore)}
            >
              {showMore ? (
                <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
              ) : (
                <>Show {reversalCandidates.length - 5} More <ChevronDown className="ml-1 h-3 w-3" /></>
              )}
            </Button>
          )}
        </>
      ) : (
        <div className="py-2 text-center text-muted-foreground text-sm">
          No Fibonacci target reversals found
        </div>
      )}
    </div>
  );
};

export default ReversalsList;