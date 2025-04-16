import React, { useState, useEffect } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { supabase } from '@/lib/supabase';
import { getElliottWaveAnalysis } from '@/api/deepseekApi';
import type { WaveAnalysisResult, StockHistoricalData } from '@/types/shared';

interface AIAnalysisProps {
  symbol: string;
  analysis: WaveAnalysisResult;
  historicalData: StockHistoricalData[];
}

const getAgeString = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return `${diffMins}m ago`;
};

const AIAnalysis: React.FC<AIAnalysisProps> = ({ symbol, analysis, historicalData }) => {
  const [aiInsight, setAiInsight] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  useEffect(() => {
    const getAIAnalysis = async () => {
      if (!symbol || !analysis || historicalData.length < 50) {
        setError("Insufficient data for AI analysis");
        setLoading(false);
        return;
      }

      try {
        // Check cache first
        const { data: cachedResult, error: cacheError } = await supabase
          .from('cache')
          .select('data, timestamp')
          .eq('key', `ai_elliott_wave_${symbol}`)
          .single();

        if (!cacheError && cachedResult?.data && Date.now() - cachedResult.timestamp < 24 * 60 * 60 * 1000) {
          console.log(`Using cached AI analysis for ${symbol}`);
          setAiInsight(cachedResult.data);
          setLastUpdate(getAgeString(cachedResult.timestamp));
          setLoading(false);
          return;
        }

        // Generate fresh analysis
        const result = await getElliottWaveAnalysis(symbol, historicalData);
        
        // Cache the result
        await supabase
          .from('cache')
          .upsert({
            key: `ai_elliott_wave_${symbol}`,
            data: result,
            timestamp: Date.now(),
            duration: 24 * 60 * 60 * 1000,
            is_string: true
          });

        setAiInsight(result);
        setLastUpdate('just now');
        setError(null);
      } catch (err) {
        console.error('Error getting AI analysis:', err);
        setError(`Failed to generate AI analysis: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    getAIAnalysis();
  }, [symbol, analysis, historicalData]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
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

  if (!aiInsight) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Analysis Available</AlertTitle>
        <AlertDescription>
          Unable to generate AI analysis for {symbol} at this time.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Wave Pattern Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {analysis.currentWave && (
            <div className="bg-secondary px-3 py-1 rounded-md">
              <span className="text-sm font-medium">
                Wave {analysis.currentWave.number}
              </span>
            </div>
          )}
          {analysis.trend && (
            <div className={`px-3 py-1 rounded-md ${
              analysis.trend === 'bullish' ? 'bg-green-500/20 text-green-700' :
              analysis.trend === 'bearish' ? 'bg-red-500/20 text-red-700' :
              'bg-secondary'
            }`}>
              <span className="text-sm font-medium">
                {analysis.trend.charAt(0).toUpperCase() + analysis.trend.slice(1)} Trend
              </span>
            </div>
          )}
        </div>
        {lastUpdate && (
          <div className="text-xs text-muted-foreground">
            Updated {lastUpdate}
          </div>
        )}
      </div>

      {/* Pattern Details */}
      {(analysis.impulsePattern || analysis.correctivePattern) && (
        <div className="text-sm text-muted-foreground">
          {analysis.impulsePattern && "Impulse pattern detected. "}
          {analysis.correctivePattern && "Corrective pattern detected. "}
          {analysis.waves.length > 0 && `${analysis.waves.length} waves identified.`}
        </div>
      )}

      {/* AI Insight */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {aiInsight.split('\n\n').map((paragraph, i) => (
          <p key={i} className="text-sm">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Invalidations Summary */}
      {analysis.invalidWaves && analysis.invalidWaves.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Recent Wave Invalidations</AlertTitle>
          <AlertDescription>
            {analysis.invalidWaves.length} wave{analysis.invalidWaves.length === 1 ? '' : 's'} invalidated in the current pattern.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default AIAnalysis;
