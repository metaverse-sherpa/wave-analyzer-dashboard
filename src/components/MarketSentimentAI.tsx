import React, { useState, useEffect } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePreview } from '@/context/PreviewContext';
import { Link } from 'react-router-dom';
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
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const { user } = useAuth();
  const { isPreviewMode } = usePreview();
  
  const getAgeString = (timestamp: number): string => {
    const now = Date.now();
    const diffMs = now - timestamp;
    
    // Convert to days/hours/minutes
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffMins > 0) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else {
      return 'just now';
    }
  };

  const fetchAIMarketSentiment = async (force: boolean = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const sentimentAnalysis = await getAIMarketSentiment({
        bullishCount,
        bearishCount,
        neutralCount,
        overallSentiment
      }, force);
      
      setAnalysis(sentimentAnalysis);
      setLastUpdated(force ? 'just now' : null);
    } catch (error) {
      console.error('Error fetching AI market sentiment:', error);
      setError('Failed to generate market analysis. Try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Load sentiment on initial render
  useEffect(() => {
    fetchAIMarketSentiment();
  }, [bullishCount, bearishCount, neutralCount]);

  // If no user and in preview mode, show the blurred premium feature
  if (!user && isPreviewMode) {
    return (
      <Card className="relative">
        <div className="absolute inset-0 backdrop-blur-sm flex flex-col items-center justify-center z-10 bg-background/20">
          <div className="bg-background/90 p-4 rounded-lg shadow-lg text-center">
            <h3 className="text-base font-semibold mb-2">Premium Feature</h3>
            <p className="text-sm mb-3">Sign in to access AI market insights</p>
            <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
              <Button size="sm">Sign In Now</Button>
            </Link>
          </div>
        </div>
        <CardContent className="p-4 blur-premium min-h-[120px]">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">AI Market Insights</h3>
            </div>
            <Badge variant="outline" className="text-xs">AI</Badge>
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-2" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">AI Market Insights</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">AI</Badge>
            {lastUpdated && (
              <div className="text-xs text-muted-foreground">
                Updated {lastUpdated}
              </div>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={() => fetchAIMarketSentiment(true)}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh</span>
            </Button>
          </div>
        </div>
        
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="text-sm">
            {analysis}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MarketSentimentAI;