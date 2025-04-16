import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { apiUrl } from '@/utils/apiConfig';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAIMarketSentiment } from '@/services/aiMarketService';

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
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const fetchMarketSentiment = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use the local service instead of direct API call
        const result = await getAIMarketSentiment({
          bullishCount,
          bearishCount,
          neutralCount,
          overallSentiment
        });

        // Transform the result to match component's expected format
        setSentiment({
          analysis: result.analysis,
          stats: {
            totalStocks: bullishCount + bearishCount + neutralCount,
            bullishPercentage: Math.round((bullishCount / (bullishCount + bearishCount + neutralCount)) * 100),
            bearishPercentage: Math.round((bearishCount / (bullishCount + bearishCount + neutralCount)) * 100),
            neutralPercentage: Math.round((neutralCount / (bullishCount + bearishCount + neutralCount)) * 100)
          },
          waveDistribution: {}, // This will be populated by the API if available
          timestamp: new Date(result.timestamp).toISOString()
        });
      } catch (err) {
        console.error('Error fetching market sentiment:', err);
        setError((err as Error).message || 'Failed to fetch market sentiment');
      } finally {
        setLoading(false);
      }
    };

    fetchMarketSentiment();
  }, [bullishCount, bearishCount, neutralCount, overallSentiment]);

  // Rest of the component remains the same
  if (loading) {
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

  if (error) {
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
      <CardContent className="pt-6">
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
            {sentiment.analysis.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
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