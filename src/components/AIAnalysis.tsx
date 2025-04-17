import React from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { WaveAnalysisResult, StockHistoricalData } from '@/types/shared';

interface AIAnalysisProps {
  symbol: string;
  analysis: WaveAnalysisResult;
  historicalData: StockHistoricalData[];
}

const AIAnalysis: React.FC<AIAnalysisProps> = ({ symbol, analysis, historicalData }) => {
  if (!analysis) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Analysis Available</AlertTitle>
        <AlertDescription>
          Unable to analyze waves for {symbol} at this time.
        </AlertDescription>
      </Alert>
    );
  }

  const { currentWave, trend, waves, fibTargets } = analysis;

  // Format the AI insight based on the wave analysis
  const formatAIInsight = () => {
    const insights = [];

    // Overall trend assessment
    if (trend) {
      insights.push(`${symbol} is currently showing a ${trend} trend pattern.`);
    }

    // Current wave context
    if (currentWave) {
      insights.push(`The stock is currently in Wave ${currentWave.number} of the Elliott Wave sequence, which started at $${currentWave.startPrice.toFixed(2)}.`);
    }

    // Pattern recognition
    if (analysis.impulsePattern) {
      insights.push('An impulse pattern has been identified, which typically signals a strong trend direction.');
    }
    if (analysis.correctivePattern) {
      insights.push('A corrective pattern has been detected, which often indicates a temporary pause or reversal in the trend.');
    }

    // Add the cached analysis if available
    if (analysis.analysis) {
      insights.push(analysis.analysis);
    }

    // Fibonacci targets if available
    if (analysis.fibTargets && analysis.fibTargets.length > 0) {
      // Format and add Fibonacci targets
      analysis.fibTargets
        .filter(target => target.isCritical)
        .forEach(target => {
          insights.push(`${target.label}: $${target.price.toFixed(2)}`);
        });
    }

    // Add stop loss if available
    if (analysis.stopLoss) {
      insights.push(`Suggested stop loss level: $${analysis.stopLoss.toFixed(2)}`);
    }

    // Add confidence level if available
    if (analysis.confidenceLevel) {
      insights.push(`Analysis confidence level: ${analysis.confidenceLevel.charAt(0).toUpperCase() + analysis.confidenceLevel.slice(1)}`);
    }

    return insights.join('\n\n');
  };

  const aiInsight = formatAIInsight();

  return (
    <div className="space-y-4">
      {/* Wave Pattern Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {currentWave && (
            <div className="bg-secondary px-3 py-1 rounded-md">
              <span className="text-sm font-medium">
                Wave {currentWave.number}
              </span>
            </div>
          )}
          {trend && (
            <div className={`px-3 py-1 rounded-md ${
              trend === 'bullish' ? 'bg-green-500/20 text-green-700' :
              trend === 'bearish' ? 'bg-red-500/20 text-red-700' :
              'bg-secondary'
            }`}>
              <span className="text-sm font-medium">
                {trend.charAt(0).toUpperCase() + trend.slice(1)} Trend
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Pattern Details */}
      {(analysis.impulsePattern || analysis.correctivePattern) && (
        <div className="text-sm text-muted-foreground">
          {analysis.impulsePattern && "Impulse pattern detected. "}
          {analysis.correctivePattern && "Corrective pattern detected. "}
          {waves?.length > 0 && `${waves.length} waves identified.`}
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
    </div>
  );
};

export default AIAnalysis;
