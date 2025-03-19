import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { useWaveAnalysis } from '@/context/WaveAnalysisContext';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { apiUrl } from '@/utils/apiConfig';
import type { WaveAnalysisResult } from '@/types/shared'; // Import the shared type

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

const ReversalsList: React.FC = () => {
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const { analyses } = useWaveAnalysis();
  const [reversalCandidates, setReversalCandidates] = useState<ReversalCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Extract symbols once to avoid recalculating
  const symbols = useMemo(() => {
    return [...new Set(Object.keys(analyses).map(key => key.split('_')[0]))];
  }, [analyses]);
  
  // Load data when analyses change
  useEffect(() => {
    // Skip if no analyses available
    if (Object.keys(analyses).length === 0) return;

    const loadReversalData = async () => {
      try {
        // Load fresh data
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
        setLoading(false);
      }
    };
    
    loadReversalData();
  }, [analyses, symbols]);
  
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
      const waveStartTimestamp = latestWave.startTimestamp || 0; // Get the start timestamp
      
      // Use the fib targets directly
      const fibTargets = analysis.fibTargets || [];
      
      if (!fibTargets.length) return;
      
      // Determine if this is a bearish wave
      const isBearishWave = isBearish(waveNumber, waveTrend);
      
      // Pre-filter targets for better performance
      const relevantTargets = isBearishWave 
        ? fibTargets.filter(target => target.isExtension)
        : fibTargets.filter(target => !target.isExtension);
      
      if (!relevantTargets.length) return;
      
      if (isBearishWave) {
        let lowestTarget = Infinity;
        let targetLevel = '';
        
        relevantTargets.forEach(target => {
          const price = target.price;
          
          if (price <= 0) return;
          
          if (price < lowestTarget) {
            lowestTarget = price;
            targetLevel = target.label || String(target.level);
          }
        });
        
        // If current price is below the target, it's a potential reversal
        if (lowestTarget < Infinity && currentPrice < lowestTarget) {
          candidates.push({
            symbol,
            waveNumber,
            trend: waveTrend,
            isBearish: true,
            currentPrice,
            targetPrice: lowestTarget,
            targetLevel,
            exceededBy: ((lowestTarget / currentPrice - 1) * 100).toFixed(1),
            nextWave: getNextWave(waveNumber),
            startDate: waveStartTimestamp ? new Date(waveStartTimestamp).toISOString() : '', // Convert timestamp to ISO date string
          });
        }
      } else {
        let highestTarget = 0;
        let targetLevel = '';
        
        relevantTargets.forEach(target => {
          const price = target.price;
          
          if (price <= 0) return;
          
          if (price > highestTarget) {
            highestTarget = price;
            targetLevel = target.label || String(target.level);
          }
        });
        
        // If current price is above the highest target, it's a potential reversal
        if (highestTarget > 0 && currentPrice > highestTarget) {
          candidates.push({
            symbol,
            waveNumber,
            trend: waveTrend,
            isBearish: false,
            currentPrice,
            targetPrice: highestTarget,
            targetLevel,
            exceededBy: ((currentPrice / highestTarget - 1) * 100).toFixed(1),
            nextWave: getNextWave(waveNumber),
            startDate: waveStartTimestamp ? new Date(waveStartTimestamp).toISOString() : '', // Convert timestamp to ISO date string
          });
        }
      }
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
  const handleRefresh = () => {
    setLoading(true);
    
    const loadData = async () => {
      const priceMap = await fetchPrices(symbols);
      calculateReversals(priceMap);
    };
    
    loadData();
  };
  
  // Return element with loading state
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium">Fib Target Reversals</h3>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>
      
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