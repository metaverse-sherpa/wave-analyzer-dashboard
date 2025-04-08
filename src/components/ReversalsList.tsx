import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { apiUrl } from '@/utils/apiConfig';
import type { WaveAnalysisResult } from '@/types/shared'; // Import the shared type
import ReversalsLastUpdated, { ReversalsContext } from './ReversalsLastUpdated';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface ReversalsListProps {
  hideHeader?: boolean;
}

// Define only the types we need within the component
interface PriceMap {
  [symbol: string]: number;
}

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

const CACHE_KEY = 'reversal-candidates-cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const handleGlobalRefresh = async (symbols: string[]) => {
  console.log("Global refresh called with", symbols.length, "symbols");
  
  try {
    // Clear existing cache
    localStorage.removeItem(CACHE_KEY);
    
    // Create a simple approach to fetch prices and recalculate
    // This is effectively what the component's fetchPrices and calculateReversals do
    const url = apiUrl(`/quotes?symbols=${symbols.slice(0, 50).join(',')}`); // Limit to 50 symbols for performance
    console.log(`Fetching fresh prices from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Fetched ${data.length} price quotes`);
    
    // We don't need to do the calculation here, just trigger a state update
    // that will cause the component to refresh itself
    
    // Return success
    return true;
  } catch (error) {
    console.error("Error in global refresh:", error);
    return false;
  }
};

const ReversalsList: React.FC<ReversalsListProps> = ({ hideHeader = false }) => {
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const { analyses } = useWaveAnalysis();
  const [reversalCandidates, setReversalCandidates] = useState<ReversalCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<number>(0);
  
  // Extract symbols once to avoid recalculating
  const symbols = useMemo(() => {
    return [...new Set(Object.keys(analyses).map(key => key.split('_')[0]))];
  }, [analyses]);
  
  // Function to save data to cache
  const saveToCache = useCallback((data: ReversalCandidate[]) => {
    const now = Date.now();
    const cacheData = {
      timestamp: now,
      data: data
    };
    
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      setLastCacheUpdate(now);
      console.log('Reversal data saved to cache');
    } catch (e) {
      console.warn('Failed to cache reversal data:', e);
    }
  }, []);
  
  // Function to load data from cache
  const loadFromCache = useCallback((): { data: ReversalCandidate[], isFresh: boolean } => {
    try {
      const cacheJson = localStorage.getItem(CACHE_KEY);
      if (!cacheJson) return { data: [], isFresh: false };
      
      const cache = JSON.parse(cacheJson);
      const now = Date.now();
      const isFresh = now - cache.timestamp < CACHE_EXPIRY;
      
      if (isFresh) {
        setLastCacheUpdate(cache.timestamp);
        return { data: cache.data, isFresh: true };
      } else {
        console.log('Cache expired, will fetch fresh data');
        return { data: [], isFresh: false };
      }
    } catch (e) {
      console.warn('Failed to load cached data:', e);
      return { data: [], isFresh: false };
    }
  }, []);
  
  // Load data when analyses change
  useEffect(() => {
    // Skip if no analyses available
    if (Object.keys(analyses).length === 0) return;
  
    const loadReversalData = async () => {
      // First check the cache
      const { data: cachedData, isFresh } = loadFromCache();
      
      // If we have fresh cached data, use it
      if (cachedData.length > 0 && isFresh) {
        console.log('Using cached reversal data from', new Date(lastCacheUpdate).toLocaleTimeString());
        setReversalCandidates(cachedData);
        return;
      }
      
      // Otherwise, load fresh data
      try {
        setLoading(true);
        
        // Fetch prices and calculate reversals
        const priceMap = await fetchPrices(symbols);
        if (Object.keys(priceMap).length === 0) {
          // If we couldn't get prices, use wave end prices
          const fallbackPrices = getFallbackPrices();
          calculateReversals(fallbackPrices);
        } else {
          calculateReversals(priceMap);
        }
      } catch (error) {
        console.error("Error loading reversal data:", error);
        
        // If we have any cached data, use it as a fallback even if it's stale
        if (cachedData.length > 0) {
          console.log('Using stale cached data as fallback');
          setReversalCandidates(cachedData);
        }
        
        setLoading(false);
      }
    };
    
    loadReversalData();
  }, [analyses, symbols, loadFromCache]); 
  
  // Add this new useEffect right here 👇
  useEffect(() => {
    // This effect handles ONLY manual refresh (when lastCacheUpdate changes)
    if (lastCacheUpdate > 0) {
      console.log('Manual refresh triggered at:', new Date(lastCacheUpdate).toLocaleTimeString());
    }
  }, [lastCacheUpdate]);
  
  // Get fallback prices from the wave analysis data
  const getFallbackPrices = (): PriceMap => {
    const priceMap: PriceMap = {};
    
    // This is how the MarketOverview component safely accesses the data
    Object.entries(analyses).forEach(([key, analysisData]) => {
      const symbol = key.split('_')[0];
      
      // Use a type assertion to handle the data structure
      const analysis = analysisData as WaveAnalysisResult;
      
      // Check if waves property exists
      if (analysis?.waves?.length > 0) {
        // Safe access to the waves property
        const latestWave = analysis.waves[analysis.waves.length - 1];
        if (typeof latestWave.endPrice === 'number') {
          priceMap[symbol] = latestWave.endPrice;
        }
      }
    });
    
    return priceMap;
  };
  
  // Optimized function to fetch prices with better error handling
  const fetchPrices = async (symbols: string[]): Promise<PriceMap> => {
    // Quick return if no symbols
    if (symbols.length === 0) return {};
    
    console.log(`Fetching prices for ${symbols.length} symbols`);
    const priceMap: PriceMap = {};
    
    try {
      // Log the API URL we're about to use to help diagnose the issue
      const sampleUrl = apiUrl(`/quotes?symbols=AAPL`);
      console.log(`API URL format being used: ${sampleUrl}`);
      
      // Use batch processing with 50 symbols at a time
      const batchSize = 50;
      let successfulBatch = false;
      
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const symbolsParam = batch.join(',');
        
        try {
          console.log(`Fetching batch ${Math.floor(i/batchSize) + 1} with ${batch.length} symbols`);
          
          // Create the full URL to log for debugging
          const batchUrl = apiUrl(`/quotes?symbols=${symbolsParam}`);
          console.log(`Fetching from: ${batchUrl}`);
          
          // Add a timeout to the fetch to avoid hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(batchUrl, { 
            signal: controller.signal,
            // Add headers that might be needed
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          // Clear the timeout since fetch completed
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            console.warn(`Error fetching batch: ${response.status} ${response.statusText}`);
            // Try to get response text for more info
            try {
              const errorText = await response.text();
              console.warn(`Response error text: ${errorText}`);
            } catch (e) {
              // Ignore error reading response text
            }
            continue;
          }
          
          const data = await response.json();
          if (!Array.isArray(data)) {
            console.warn('Expected array response from quotes API, got:', typeof data);
            continue;
          }
          
          // Populate price map with results
          data.forEach(quote => {
            if (quote.symbol) {
              // Handle different possible price field names
              const price = quote.regularMarketPrice || quote.price || quote.lastPrice;
              if (typeof price === 'number' && price > 0) {
                priceMap[quote.symbol] = price;
              }
            }
          });
          
          console.log(`Processed batch with ${data.length} quotes`);
          successfulBatch = true;
        } catch (error) {
          console.warn(`Failed to fetch batch ${Math.floor(i/batchSize) + 1}:`, error);
        }
      }
      
      // If all batches failed, try to provide more diagnostic info
      if (!successfulBatch) {
        console.error("All batch requests failed. This could indicate:");
        console.error("1. Network connectivity issues");
        console.error("2. CORS restrictions (if running locally)");
        console.error("3. API endpoint URL is incorrect");
        console.error("4. API service is down");
        console.error("Attempting to fetch prices from individual stock endpoints as fallback...");
        
        // Try fetching a single stock as a test
        try {
          const testSymbol = symbols[0];
          const testUrl = apiUrl(`/stocks/${testSymbol}`);
          console.log(`Testing single stock URL: ${testUrl}`);
          
          const testResponse = await fetch(testUrl);
          console.log(`Test response status: ${testResponse.status} ${testResponse.statusText}`);
          
          if (testResponse.ok) {
            // Single stock endpoint works, use it for a few symbols
            const fallbackSymbols = symbols.slice(0, 10); // Just try first 10 symbols
            
            for (const symbol of fallbackSymbols) {
              try {
                const response = await fetch(apiUrl(`/stocks/${symbol}`));
                if (response.ok) {
                  const data = await response.json();
                  if (data && typeof data.regularMarketPrice === 'number') {
                    priceMap[symbol] = data.regularMarketPrice;
                  }
                }
              } catch (e) {
                // Skip individual errors
              }
            }
          }
        } catch (e) {
          console.error("Fallback test failed too:", e);
        }
      }
      
      const fetchedCount = Object.keys(priceMap).length;
      console.log(`Successfully fetched prices for ${fetchedCount}/${symbols.length} symbols (${Math.round(fetchedCount/symbols.length*100)}%)`);
    } catch (error) {
      console.error("Error in batch processing:", error);
    }
    
    // If we couldn't get prices, return empty map and let caller use fallback
    return priceMap;
  };
  
  // Calculate reversals and update state
  const calculateReversals = (priceMap: PriceMap) => {
    console.time('calculateReversals');
    const candidates: (ReversalCandidate & { startDate: string })[] = [];
    
    // Process each analysis entry using proper types
    Object.entries(analyses).forEach(([key, analysisData]) => {
      // Extract just the symbol from the key (e.g., "AAPL_1d" -> "AAPL")
      const symbol = key.split('_')[0];
      
      // Use type assertion for the analysis structure
      const analysis = analysisData as WaveAnalysisResult;
      
      // Use safe property access to avoid runtime errors
      if (!analysis?.waves?.length || !analysis.fibTargets?.length) {
        return;
      }
      
      // The rest of your code using safe property access
      const latestWave = analysis.waves[analysis.waves.length - 1];
      
      // Get the CURRENT price from our price map
      // Fall back to the end price of the latest wave if we don't have current price
      const currentPrice = priceMap[symbol] || latestWave.endPrice;
      
      if (!currentPrice || currentPrice <= 0) {
        return;
      }
      
      const waveNumber = latestWave.number;
      const waveTrend = analysis.trend;
      const waveStartTimestamp = latestWave.startTimestamp || 0;
      const waveType = latestWave.type; // Get the wave type
      
      // Use the fib targets directly
      const fibTargets = analysis.fibTargets || [];
      
      if (!fibTargets.length) return;
      
      // KEY CHANGE: Check if any targets are left (like ReversalCandidatesList does)
      const hasTargetsLeft = fibTargets.some(target => {
        if (waveType === 'impulse') {
          // For impulse waves, we're looking ahead for higher targets
          return target.price > currentPrice;
        } else {
          // For corrective waves, we're looking ahead for lower targets
          return target.price < currentPrice;
        }
      });
      
      // If we still have targets ahead, this is not a reversal candidate
      if (hasTargetsLeft) return;
      
      // If we reach here, it means the price has already passed all fib targets
      
      // Get closest fib target to see how much it was exceeded by
      let closestFibTarget = 0;
      let targetLevel = '';
      let isBullish = waveType === 'impulse';
      
      // Find the extreme fib target based on wave type
      if (isBullish) {
        // For bullish waves, find highest target
        let highestTarget = 0;
        
        fibTargets.forEach(target => {
          if (target.price > highestTarget) {
            highestTarget = target.price;
            targetLevel = target.label || String(target.level);
          }
        });
        
        closestFibTarget = highestTarget;
      } else {
        // For bearish waves, find lowest target
        let lowestTarget = Infinity;
        
        fibTargets.forEach(target => {
          if (target.price < lowestTarget && target.price > 0) {
            lowestTarget = target.price;
            targetLevel = target.label || String(target.level);
          }
        });
        
        closestFibTarget = lowestTarget;
      }
      
      // Calculate how much the target was exceeded by
      let exceededByPercentage: string;
      if (isBullish) {
        exceededByPercentage = ((currentPrice / closestFibTarget - 1) * 100).toFixed(1);
      } else {
        exceededByPercentage = ((closestFibTarget / currentPrice - 1) * 100).toFixed(1);
      }
      
      candidates.push({
        symbol,
        waveNumber,
        trend: waveTrend,
        isBearish: !isBullish,
        currentPrice,
        targetPrice: closestFibTarget,
        targetLevel,
        exceededBy: exceededByPercentage,
        nextWave: getNextWave(waveNumber),
        startDate: waveStartTimestamp ? new Date(waveStartTimestamp).toISOString() : '',
      });
    });
    
    console.timeEnd('calculateReversals');
    console.log("Found reversal candidates:", candidates.length);
    
    // First sort by date (most recent first), then by exceededBy percentage
    const sortedCandidates = candidates
      .sort((a, b) => {
        // Primary sort: by date (newest first)
        if (a.startDate && b.startDate) {
          return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        } 
        // If dates are missing or equal, sort by exceededBy percentage
        return parseFloat(b.exceededBy) - parseFloat(a.exceededBy);
      })
      .map(({ startDate, ...rest }) => rest); // Remove the startDate from the final output
    
    saveToCache(sortedCandidates);
    setReversalCandidates(sortedCandidates);
    setLoading(false);
  };
  
  // Helper functions
  function isBearish(waveNumber: number | string, trend: string): boolean {
    const isBullishTrend = trend === 'bullish' || trend === 'up';
    
    if (typeof waveNumber === 'number') {
      return isBullishTrend ? (waveNumber % 2 === 0) : (waveNumber % 2 === 1);
    } else if (typeof waveNumber === 'string') {
      if (isBullishTrend) {
        return waveNumber === 'A' || waveNumber === 'C' || waveNumber === '2' || waveNumber === '4';
      } else {
        return waveNumber === '1' || waveNumber === '3' || waveNumber === '5' || waveNumber === 'B';
      }
    }
    
    return false;
  }
  
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
    navigate(`/stocks/${symbol}`);
  };
  
  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    console.log("handleRefresh called in ReversalsList");
    setLoading(true);
    
    try {
      // Clear cache
      localStorage.removeItem(CACHE_KEY);
      setLastCacheUpdate(0);
      
      // Fetch fresh prices and recalculate
      const priceMap = await fetchPrices(symbols);
      
      // Calculate reversals with fresh prices
      calculateReversals(priceMap);
      
      // Update timestamp for last refresh
      setLastCacheUpdate(Date.now());
      
      console.log("Reversal data refreshed successfully");
      return true;
    } catch (error) {
      console.error("Error refreshing reversal data:", error);
      setLoading(false);
      return false;
    }
  }, [symbols, fetchPrices, calculateReversals]);
  
  // Return wrapped in context provider
  return (
    <ReversalsContext.Provider value={{ 
      lastCacheUpdate, 
      refreshReversals: handleRefresh, // Ensure this is the correct function
      loading 
    }}>
      <div className="space-y-1">
        {/* Only show header if not hidden */}
        {!hideHeader && (
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Fib Target Reversals</h3>
            <div className="flex items-center">
              <ReversalsLastUpdated />
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="py-2 text-center text-muted-foreground text-sm">
            Looking for reversals...
          </div>
        ) : reversalCandidates.length > 0 ? (
          <>
            {reversalCandidates.slice(0, showMore ? undefined : 5).map((candidate) => (
              <div key={candidate.symbol} className="flex items-center justify-between">
                <Button 
                  variant="link"
                  className="h-6 p-0 text-amber-600 hover:text-amber-700 text-left"
                  onClick={() => goToStockDetails(candidate.symbol)}
                >
                  {candidate.symbol} <span className="text-xs ml-1">(Wave {candidate.waveNumber})</span>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground flex items-center">
                      {candidate.isBearish ? (
                        // Bearish badge
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                          <ArrowUp className="h-3 w-3 mr-1" />
                          Bullish +{candidate.exceededBy}% past {candidate.targetLevel}
                        </Badge>
                      ) : (
                        // Bullish badge
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">
                          <ArrowDown className="h-3 w-3 mr-1" />
                          Bearish -{candidate.exceededBy}% past {candidate.targetLevel}
                        </Badge>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {candidate.isBearish
                      ? "Price has fallen below all bearish targets, suggesting a potential bullish reversal"
                      : "Price has risen above all bullish targets, suggesting a potential bearish reversal"
                    }
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
            
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
    </ReversalsContext.Provider>
  );
};

export default ReversalsList;