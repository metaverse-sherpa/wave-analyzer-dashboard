
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getAIAnalysis, StockAnalysis } from "@/services/aiAnalysisService";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";

interface AIAnalysisProps {
  symbol: string;
}

const AIAnalysis: React.FC<AIAnalysisProps> = ({ symbol }) => {
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        setLoading(true);
        const aiAnalysis = await getAIAnalysis(symbol);
        setAnalysis(aiAnalysis);
      } catch (error) {
        console.error('Error loading AI analysis:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadAnalysis();
  }, [symbol]);
  
  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return <TrendingUp className="h-5 w-5 text-bullish" />;
      case 'bearish':
        return <TrendingDown className="h-5 w-5 text-bearish" />;
      case 'neutral':
      default:
        return <Minus className="h-5 w-5 text-neutral" />;
    }
  };
  
  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return 'bg-bullish/10 text-bullish border-bullish/20';
      case 'bearish':
        return 'bg-bearish/10 text-bearish border-bearish/20';
      case 'neutral':
      default:
        return 'bg-neutral/10 text-neutral border-neutral/20';
    }
  };
  
  return (
    <Card className="border bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Market Analysis
          </CardTitle>
          
          {!loading && analysis && (
            <Badge className={`${getSentimentColor(analysis.sentiment)} px-2 py-1`}>
              <span className="flex items-center gap-1">
                {getSentimentIcon(analysis.sentiment)}
                <span className="capitalize">{analysis.sentiment}</span>
                <span className="opacity-70">({Math.round(analysis.confidence * 100)}%)</span>
              </span>
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-4 w-full my-2" />
            <Skeleton className="h-4 w-full my-2" />
            <Skeleton className="h-4 w-3/4 my-2" />
            <div className="mt-4">
              <Skeleton className="h-3 w-full my-2" />
              <Skeleton className="h-3 w-full my-2" />
              <Skeleton className="h-3 w-full my-2" />
              <Skeleton className="h-3 w-2/3 my-2" />
            </div>
          </>
        ) : analysis ? (
          <>
            <p className="text-sm mb-4 text-foreground/80">{analysis.summary}</p>
            
            <div className="mt-2">
              <h4 className="text-sm font-medium mb-2">Key Points</h4>
              <ul className="space-y-1">
                {analysis.keyPoints.map((point, index) => (
                  <li key={index} className="text-xs flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="mt-4 text-xs text-muted-foreground">
              Last updated: {new Date(analysis.timestamp).toLocaleString()}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No analysis available</p>
        )}
      </CardContent>
    </Card>
  );
};

export default AIAnalysis;
