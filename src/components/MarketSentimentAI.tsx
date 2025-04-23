import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAIMarketSentiment } from '@/services/aiMarketService';
import { Button } from '@/components/ui/button';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { Wave } from '@/types/shared';

interface MarketSentimentAIProps {
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  overallSentiment: string;
}

const MarketSentimentAI: React.FC<MarketSentimentAIProps> = ({
  bullishCount,
  bearishCount,
  neutralCount,
  overallSentiment
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { allAnalyses } = useWaveAnalysis();
  const [sentiment, setSentiment] = useState<{
    analysis: string;
    stats: {
      totalStocks: number;
      bullishPercentage: number;
      bearishPercentage: number;
      neutralPercentage: number;
    };
    waveDistribution: Record<string, number>;
    timestamp: string;
  } | null>(null);

  // Calculate wave distribution for passing to the AI
  const calculateWaveDistribution = () => {
    if (!allAnalyses || Object.keys(allAnalyses).length === 0) {
      return {};
    }

    const waveDistribution: Record<string, number> = {};
    let totalStocks = 0;

    Object.values(allAnalyses).forEach(entry => {
      if (entry?.analysis?.currentWave?.number) {
        const waveNumber = String(entry.analysis.currentWave.number);
        waveDistribution[waveNumber] = (waveDistribution[waveNumber] || 0) + 1;
        totalStocks++;
      }
    });

    // Convert counts to percentages
    Object.keys(waveDistribution).forEach(wave => {
      waveDistribution[wave] = Math.round((waveDistribution[wave] / totalStocks) * 100);
    });

    return waveDistribution;
  };

  // Extract symbols with their current wave for more detailed analysis
  const extractTopStocksData = () => {
    if (!allAnalyses) return [];

    const stocksData = Object.entries(allAnalyses)
      .filter(([_, entry]) => entry?.analysis?.currentWave?.number)
      .map(([key, entry]) => {
        const [symbol] = key.split(':');
        const wave = entry.analysis.currentWave?.number;
        const trend = entry.analysis.trend || 'neutral';
        return { symbol, wave, trend };
      })
      .sort((a, b) => {
        // Sort by wave number first (numeric waves before letter waves)
        const aNum = parseInt(String(a.wave));
        const bNum = parseInt(String(b.wave));
        
        if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum; // Higher numeric waves first
        if (!isNaN(aNum)) return -1; // Numbers before letters
        if (!isNaN(bNum)) return 1; // Numbers before letters
        
        // Then alphabetically for letter waves
        return String(a.wave).localeCompare(String(b.wave));
      })
      .slice(0, 15); // Take top 15 stocks for analysis

    return stocksData;
  };

  const fetchMarketSentiment = async (forceRefresh: boolean = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      setError(null);

      // Calculate the wave distribution
      const waveDistribution = calculateWaveDistribution();
      
      // Get top stocks data for more detailed analysis
      const topStocks = extractTopStocksData();

      // Use the local service with enhanced data
      const result = await getAIMarketSentiment(
        {
          bullishCount,
          bearishCount,
          neutralCount,
          overallSentiment
        },
        // Convert to the format expected by the service
        Object.fromEntries(
          Object.entries(allAnalyses).map(([key, entry]) => [key, {
            analysis: entry.analysis,
            timestamp: entry.timestamp
          }])
        ),
        forceRefresh // Pass the force refresh flag to invalidate cache
      );

      // Transform the result to match component's expected format
      setSentiment({
        analysis: result.analysis,
        stats: {
          totalStocks: bullishCount + bearishCount + neutralCount,
          bullishPercentage: Math.round((bullishCount / (bullishCount + bearishCount + neutralCount || 1)) * 100),
          bearishPercentage: Math.round((bearishCount / (bullishCount + bearishCount + neutralCount || 1)) * 100),
          neutralPercentage: Math.round((neutralCount / (bullishCount + bearishCount + neutralCount || 1)) * 100)
        },
        waveDistribution,
        timestamp: new Date(result.timestamp).toISOString()
      });
    } catch (err) {
      console.error('Error fetching market sentiment:', err);
      setError((err as Error).message || 'Failed to fetch market sentiment');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMarketSentiment();
  }, [bullishCount, bearishCount, neutralCount, overallSentiment]);

  const handleRefresh = () => {
    fetchMarketSentiment(true);
  };

  // Rest of the component remains the same
  if (loading && !sentiment) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !sentiment) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!sentiment) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Analysis Available</AlertTitle>
        <AlertDescription>
          Unable to generate market sentiment analysis at this time.
        </AlertDescription>
      </Alert>
    );
  }

  // Helper function to get color class based on wave number
  const getWaveColor = (wave: string) => {
    const numWave = parseInt(wave);
    if (isNaN(numWave)) {
      // Handle letter waves (A, B, C)
      switch (wave) {
        case 'A':
        case 'C':
          return 'bg-red-500/20 text-red-700 dark:text-red-400';
        case 'B':
          return 'bg-green-500/20 text-green-700 dark:text-green-400';
        default:
          return 'bg-secondary';
      }
    } else {
      // Handle numeric waves (1-5)
      return [1, 3, 5].includes(numWave)
        ? 'bg-green-500/20 text-green-700 dark:text-green-400'
        : 'bg-red-500/20 text-red-700 dark:text-red-400';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-6">
        <h3 className="text-sm font-medium">AI Market Analysis</h3>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh} 
          disabled={refreshing || loading}
          className="h-8 w-8"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="sr-only">Refresh analysis</span>
        </Button>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-4">
          {/* Wave Distribution */}
          {Object.keys(sentiment.waveDistribution).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(sentiment.waveDistribution)
                .sort(([a], [b]) => {
                  // Sort numeric waves first, then alphabetical
                  const aNum = parseInt(a);
                  const bNum = parseInt(b);
                  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                  if (!isNaN(aNum)) return -1;
                  if (!isNaN(bNum)) return 1;
                  return a.localeCompare(b);
                })
                .map(([wave, percentage]) => (
                  <Badge
                    key={wave}
                    variant="outline"
                    className={`px-2 py-0.5 ${getWaveColor(wave)}`}
                  >
                    Wave {wave}: {percentage}%
                  </Badge>
                ))}
            </div>
          )}

          {/* AI Analysis */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {refreshing ? (
              <div className="flex flex-col items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Refreshing market analysis...</p>
              </div>
            ) : (
              sentiment.analysis.split('\n\n').map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))
            )}
          </div>

          {/* Stats Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-4 pt-4 border-t">
            <span>
              Based on {sentiment.stats.totalStocks} stocks
            </span>
            <span>
              Updated {new Date(sentiment.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketSentimentAI;