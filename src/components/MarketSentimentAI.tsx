import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider, 
  TooltipTrigger
} from '@/components/ui/tooltip';
import { getAIMarketSentiment } from '@/services/aiMarketService';
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const { allAnalyses } = useWaveAnalysis();
  
  // Function to format the timestamp
  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    // Convert to appropriate units
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
  };

  const loadMarketSentiment = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // Gather market data from props
      const marketData = {
        bullishCount,
        bearishCount,
        neutralCount,
        overallSentiment
      };
      
      // Create a single abort controller for both requests
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 15000);
      
      try {
        // Pass the abort signal to the service
        const result = await getAIMarketSentiment(
          marketData, 
          allAnalyses, 
          forceRefresh, 
          false, // skipApiCall parameter
          abortController.signal // Pass the abort signal
        );
        
        setAnalysis(result.analysis);
        setIsSimulated(result.isMockData);
        setTimestamp(result.timestamp);
        setSources(result.sourcesUsed || []);
        
        // Clear the timeout when the request completes successfully
        clearTimeout(timeoutId);
      } catch (err) {
        // Handle abort errors more gracefully
        if (err.name === 'AbortError') {
          console.warn('API request was aborted due to timeout');
          setError('The request took too long and was cancelled. Using cached data if available.');
          
          // Try to get cached data as a fallback
          try {
            const cachedResult = await getAIMarketSentiment(marketData, allAnalyses, false, true);
            setAnalysis(cachedResult.analysis);
            setIsSimulated(true); // Flag as simulated since we're using local generation
            setTimestamp(cachedResult.timestamp);
            setSources([...cachedResult.sourcesUsed, 'local fallback']);
          } catch (fallbackErr) {
            console.error('Failed to use fallback data:', fallbackErr);
            setError('Unable to load market analysis. Please try again.');
          }
        } else {
          console.error('Error loading market sentiment:', err);
          setError('Failed to load market analysis.');
        }
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    } catch (err) {
      console.error('Unexpected error in loadMarketSentiment:', err);
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  // Load sentiment on component mount
  useEffect(() => {
    loadMarketSentiment();
  }, [bullishCount, bearishCount, overallSentiment]);

  return (
    <div className="bg-secondary rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <h3 className="text-sm font-medium">AI Market Analysis</h3>
          {isSimulated && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="ml-2 text-amber-500 flex items-center">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs max-w-[200px]">
                    This analysis includes simulated or cached data due to API limitations.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {sources.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="ml-1 text-muted-foreground flex items-center">
                    <Info className="h-3 w-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="text-xs max-w-[200px]">
                    <p className="font-medium mb-1">Sources:</p>
                    <ul className="list-disc pl-4">
                      {sources.map((source, index) => (
                        <li key={index}>{source}</li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(timestamp)}
            </span>
          )}
          
          <Button 
            variant="ghost" 
            size="icon"
            className="h-7 w-7"
            disabled={loading}
            onClick={() => loadMarketSentiment(true)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>
      
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[95%]" />
          <Skeleton className="h-4 w-[80%]" />
        </div>
      ) : error ? (
        <div className="text-destructive text-sm p-2">
          {error}
        </div>
      ) : (
        <p className="text-sm leading-relaxed">
          {analysis}
        </p>
      )}
    </div>
  );
};

export default MarketSentimentAI;