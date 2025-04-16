import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Wave } from '@/types/shared';

interface ReversalsListProps {
  hideHeader?: boolean;
}

// Define only the types we need within the component
interface ReversalCandidate {
  symbol: string;
  waveNumber: number | string;
  trend: string;
  isBearish: boolean;
  currentPrice: number;
  targetPrice: number;
  targetLevel: string;
  exceededBy: string;
  nextWave: string;
}

const ReversalsList: React.FC<ReversalsListProps> = ({ hideHeader = false }) => {
  const navigate = useNavigate();
  const { analyses } = useWaveAnalysis();

  // Find potential reversals based on wave analysis
  const reversals = useMemo(() => {
    const candidates: ReversalCandidate[] = [];

    Object.entries(analyses).forEach(([key, analysis]) => {
      if (!analysis?.currentWave || !analysis.fibTargets) return;

      try {
        const [symbol] = key.split(':');
        const { currentWave, fibTargets } = analysis;

        // Check for potential reversals at Fibonacci levels
        fibTargets.forEach(target => {
          const price = analysis.currentWave?.endPrice || 0;
          const targetPrice = target.price;
          const tolerance = Math.abs(targetPrice * 0.005); // 0.5% tolerance

          if (Math.abs(price - targetPrice) <= tolerance) {
            // Calculate how much the price has exceeded the target
            const exceededBy = ((price - targetPrice) / targetPrice * 100).toFixed(2);
            const isBearish = currentWave.number === 5 || ['B'].includes(String(currentWave.number));

            candidates.push({
              symbol,
              waveNumber: currentWave.number,
              trend: isBearish ? 'bearish' : 'bullish',
              isBearish,
              currentPrice: price,
              targetPrice,
              targetLevel: target.label,
              exceededBy: `${exceededBy}%`,
              nextWave: isBearish ? 'A' : String(Number(currentWave.number) + 1)
            });
          }
        });

        // Check for wave invalidations that could signal reversals
        const currentWavePrice = currentWave.endPrice;
        if (currentWavePrice && currentWave.isInvalidated) {
          // Only show recent invalidations
          if (Date.now() - (currentWave.invalidationTimestamp || 0) < 24 * 60 * 60 * 1000) {
            const isBearish = [1, 3, 5].includes(Number(currentWave.number));
            candidates.push({
              symbol,
              waveNumber: currentWave.number,
              trend: isBearish ? 'bearish' : 'bullish',
              isBearish,
              currentPrice: currentWavePrice,
              targetPrice: currentWave.invalidationPrice || currentWavePrice,
              targetLevel: `Wave ${currentWave.number} Invalidation`,
              exceededBy: 'Invalidated',
              nextWave: isBearish ? 'A' : String(Number(currentWave.number) + 1)
            });
          }
        }
      } catch (error) {
        console.error(`Error processing reversals for ${key}:`, error);
      }
    });

    return candidates;
  }, [analyses]);

  const handleClick = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };

  if (reversals.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No reversal signals detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!hideHeader && (
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Reversal Alerts</h3>
          <span className="text-sm text-muted-foreground">
            {reversals.length} potential {reversals.length === 1 ? 'reversal' : 'reversals'}
          </span>
        </div>
      )}

      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {reversals.map((reversal, index) => (
            <div
              key={`${reversal.symbol}-${index}`}
              className="flex items-center justify-between py-1"
            >
              <Button
                variant="link"
                className="h-auto p-0 font-medium"
                onClick={() => handleClick(reversal.symbol)}
              >
                <div className="flex items-center">
                  {reversal.isBearish ? (
                    <ArrowDownRight className="w-4 h-4 mr-1 text-bearish" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 mr-1 text-bullish" />
                  )}
                  <div className="text-left">
                    <div className="flex items-center">
                      <span>{reversal.symbol}</span>
                      <span className="text-xs ml-2 text-muted-foreground">
                        Wave {reversal.waveNumber} → {reversal.nextWave}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {reversal.targetLevel}
                    </div>
                  </div>
                </div>
              </Button>
              <div className="text-right">
                <div className={`text-sm ${reversal.isBearish ? 'text-bearish' : 'text-bullish'}`}>
                  ${reversal.currentPrice.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {reversal.exceededBy}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ReversalsList;