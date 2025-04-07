import { supabase } from '@/lib/supabase';
import { StockHistoricalData, WaveAnalysisResult } from '@/types/shared';
import { calculateAverageReturn, identifyLeadingSectors } from '@/utils/marketAnalysisUtils';
import { buildApiUrl } from '@/services/yahooFinanceService'; // Import this utility

export interface MarketSentimentResult {
  analysis: string;     // The actual AI analysis
  isMockData: boolean;  // Whether mock data was used
  sourcesUsed: string[]; // What data sources were used
  timestamp: number;    // When the analysis was generated
}

/**
 * Gets an AI-powered market sentiment analysis that incorporates historical data and wave analysis
 * @param marketData Object containing bullish/bearish counts and sentiment
 * @param waveAnalyses Object containing wave analyses for all stocks
 * @param forceRefresh Whether to force refresh the cache
 * @param skipApiCall Whether to skip the API call (helpful for debugging)
 * @returns Object with analysis text and metadata
 */
export async function getAIMarketSentiment(
  marketData: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    overallSentiment: string;
  }, 
  waveAnalyses: Record<string, { analysis: WaveAnalysisResult, timestamp: number }> = {},
  forceRefresh: boolean = false,
  skipApiCall: boolean = false // Add this parameter
): Promise<MarketSentimentResult> {
  try {
    // Check cache first unless we're forcing a refresh
    if (!forceRefresh) {
      const cached = await getFromCache();
      if (cached) {
        return cached;
      }
    }
    
    // Extract meaningful insights from wave analyses
    const analysisInsights = processWaveAnalyses(waveAnalyses);
    
    // Get symbols from wave analyses
    const symbols = Object.keys(waveAnalyses).map(key => key.split('_')[0]);
    
    // Skip API call if requested (helpful for debugging)
    let marketInsightsResult: MarketInsightsResult;
    if (skipApiCall) {
      marketInsightsResult = {
        content: generateMockInsights(symbols),
        isMock: true,
        sourcesUsed: ['mock data (API skipped)']
      };
    } else {
      try {
        marketInsightsResult = await fetchMarketInsights(symbols);
      } catch (apiError) {
        console.error("Failed to fetch any market insights, using mockup data", apiError);
        marketInsightsResult = {
          content: generateMockInsights(symbols),
          isMock: true,
          sourcesUsed: ['mock data (API unavailable)']
        };
      }
    }
    
    // Call DeepSeek API with enhanced context
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are an expert market analyst with deep knowledge of Elliott Wave Theory and equity markets. 
            You analyze market patterns, news, and analyst insights to provide concise, actionable market sentiment summaries.`
          },
          {
            role: "user",
            content: `Generate a brief market sentiment analysis based on this market data:
            
Bullish stocks: ${marketData.bullishCount} 
Bearish stocks: ${marketData.bearishCount}
Neutral stocks: ${marketData.neutralCount}
Overall sentiment: ${marketData.overallSentiment}

Elliott Wave Insights:
${analysisInsights}

Current Market Insights and News:
${marketInsightsResult.content}

${marketInsightsResult.isMock ? "Note: Some market data is simulated due to API limitations." : ""}
Include specific references to current market events or news mentioned in the insights.
Keep your response under 120 words and focus on what this means for investors.`
          }
        ],
        temperature: 0.3,
        max_tokens: 250
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    const sentimentAnalysis = result.choices[0].message.content;
    
    // Create the complete result with metadata
    const sentimentResult: MarketSentimentResult = {
      analysis: sentimentAnalysis,
      isMockData: marketInsightsResult.isMock,
      sourcesUsed: ['Elliott Wave analysis', ...marketInsightsResult.sourcesUsed],
      timestamp: Date.now()
    };
    
    // Save to cache
    await saveToCache(sentimentResult);
    
    return sentimentResult;
    
  } catch (error) {
    console.error('Error getting AI market sentiment:', error);
    throw new Error(`Failed to get market sentiment analysis: ${(error as Error).message}`);
  }
}

/**
 * Process wave analyses to extract meaningful insights
 */
function processWaveAnalyses(waveAnalyses: Record<string, { analysis: WaveAnalysisResult, timestamp: number }>): string {
  // Count stocks in different wave phases
  const waveCounts = {
    wave1: 0,
    wave2: 0,
    wave3: 0,
    wave4: 0,
    wave5: 0,
    waveA: 0,
    waveB: 0,
    waveC: 0,
  };
  
  // Count patterns
  const patternCounts = {
    impulse: 0,
    corrective: 0
  };

  // Track completed waves (5th or C waves)
  const completedPatterns = [];
  
  // Dominant current wave direction
  const waveDirections = {
    bullish: 0,
    bearish: 0
  };
  
  // Process each stock's wave analysis
  let stocksAnalyzed = 0;
  Object.entries(waveAnalyses).forEach(([symbol, { analysis }]) => {
    if (!analysis || !analysis.currentWave) return;
    stocksAnalyzed++;
    
    // Count patterns
    if (analysis.impulsePattern) patternCounts.impulse++;
    if (analysis.correctivePattern) patternCounts.corrective++;
    
    // Count current wave numbers
    const currentWave = analysis.currentWave.number;
    if (typeof currentWave === 'number') {
      switch(currentWave) {
        case 1: waveCounts.wave1++; break;
        case 2: waveCounts.wave2++; break;
        case 3: waveCounts.wave3++; break;
        case 4: waveCounts.wave4++; break;
        case 5: waveCounts.wave5++; break;
      }
      
      // Determine wave direction
      if ([1, 3, 5].includes(currentWave)) {
        waveDirections.bullish++;
      } else {
        waveDirections.bearish++;
      }
    } else if (typeof currentWave === 'string') {
      switch(currentWave) {
        case 'A': waveCounts.waveA++; break;
        case 'B': waveCounts.waveB++; break;
        case 'C': waveCounts.waveC++; break;
      }
      
      // Determine wave direction for letter waves
      if (currentWave === 'B') {
        waveDirections.bullish++;
      } else {
        waveDirections.bearish++;
      }
    }
    
    // Look for completed patterns (stocks at wave 5 or C)
    if (currentWave === 5 || currentWave === 'C') {
      completedPatterns.push(symbol);
    }
  });
  
  // Build the insights string
  const insights = [
    `Analyzed ${stocksAnalyzed} stocks using Elliott Wave Theory.`,
    `Wave Distribution: Wave 1 (${waveCounts.wave1}), Wave 2 (${waveCounts.wave2}), Wave 3 (${waveCounts.wave3}), Wave 4 (${waveCounts.wave4}), Wave 5 (${waveCounts.wave5}), Wave A (${waveCounts.waveA}), Wave B (${waveCounts.waveB}), Wave C (${waveCounts.waveC})`,
    `Pattern Types: Impulse patterns (${patternCounts.impulse}), Corrective patterns (${patternCounts.corrective})`,
    `Wave Direction: Bullish waves (${waveDirections.bullish}), Bearish waves (${waveDirections.bearish})`,
  ];
  
  if (completedPatterns.length > 0) {
    insights.push(`${completedPatterns.length} stocks have completed their wave patterns, suggesting potential trend reversals.`);
  }
  
  if (waveCounts.wave3 > waveCounts.wave1 && waveCounts.wave3 > waveCounts.wave5) {
    insights.push('Many stocks are in Wave 3, typically the strongest trending phase.');
  }
  
  return insights.join('\n');
}

// Update cache functions to handle the new result type

async function getFromCache(): Promise<MarketSentimentResult | null> {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('data, timestamp')
      .eq('key', 'ai_market_sentiment')
      .single();
    
    if (error || !data) return null;
    
    // Check if cache is fresh (less than 12 hours for market data)
    const cacheAge = Date.now() - data.timestamp;
    if (cacheAge < 12 * 60 * 60 * 1000) {
      // Make sure we handle both old string format and new object format
      if (typeof data.data === 'string') {
        // Handle legacy format - convert to new format
        return {
          analysis: data.data,
          isMockData: true, // Default to true for old format
          sourcesUsed: ['cached data'],
          timestamp: data.timestamp
        };
      }
      
      return data.data as MarketSentimentResult;
    }
    
    return null;
  } catch (err) {
    console.warn('Error reading from cache:', err);
    return null;
  }
}

async function saveToCache(result: MarketSentimentResult): Promise<void> {
  try {
    await supabase
      .from('cache')
      .upsert({
        key: 'ai_market_sentiment',
        data: result,
        timestamp: Date.now(),
        duration: 12 * 60 * 60 * 1000, // 12 hours
        is_string: false // Now storing an object, not just a string
      }, { onConflict: 'key' });
      
    console.log('Cached market sentiment analysis in Supabase');
  } catch (err) {
    console.warn('Error saving to cache:', err);
  }
}

// Update return type to include metadata
interface MarketInsightsResult {
  content: string;   // The actual insights text
  isMock: boolean;   // Flag indicating if data is mock
  sourcesUsed: string[]; // Which sources were successfully used
}

/**
 * Builds appropriate API URL based on environment
 * @param endpoint API endpoint path
 * @returns Full URL with proper protocol
 */
function buildSafeApiUrl(endpoint: string): string {
  // Always use relative URLs in production to avoid CORS issues
  const baseUrl = '/api';
  
  // Make sure endpoint starts with / but baseUrl doesn't end with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  return `${baseUrl}${cleanEndpoint}`;
}

/**
 * Retries a function with exponential backoff
 * @param fn Function to retry
 * @param retriesLeft Number of retries left
 * @param interval Starting interval in ms
 * @returns Promise resolving to the function result
 */
async function retry<T>(
  fn: () => Promise<T>, 
  retriesLeft = 3,
  interval = 300
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retriesLeft <= 0) {
      throw error;
    }
    
    // Wait with exponential backoff
    await new Promise(resolve => setTimeout(resolve, interval));
    
    // Retry with one fewer retry and doubled interval
    return retry(fn, retriesLeft - 1, interval * 2);
  }
}

/**
 * Fetches market insights from Yahoo Finance for the provided symbols
 * @param symbols Array of stock symbols to get insights for
 * @returns Object with content, isMock flag, and sources used
 */
async function fetchMarketInsights(symbols: string[]): Promise<MarketInsightsResult> {
  try {
    // Take at most 10 symbols to avoid excessive API calls
    const limitedSymbols = symbols.slice(0, 10);
    const insights: string[] = [];
    const sourcesUsed: string[] = [];
    
    console.log(`Fetching insights for ${limitedSymbols.length} symbols`);
    
    // First check if API is even available before proceeding
    try {
      // Simple health check with timeout and better error handling
      const healthCheck = await fetch('/api/health', { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(5000) // 5s timeout
      });
      
      if (!healthCheck.ok) {
        throw new Error(`API health check failed: ${healthCheck.status}`);
      }
    } catch (healthErr) {
      console.error('API health check failed:', healthErr);
      throw new Error('API unavailable');
    }
    
    // Try to fetch real insights but be ready to fallback
    let apiSuccessCount = 0;
    
    // Batch process to avoid hitting rate limits
    for (const symbol of limitedSymbols) {
      try {
        console.log(`Fetching insights for ${symbol}`);
        const insightUrl = `/api/stocks/${symbol}/insights`;
        console.log(`Using URL: ${insightUrl}`);
        
        // Add more extensive error handling
        const response = await fetch(insightUrl, { 
          signal: AbortSignal.timeout(10000), // Increase timeout to 10 seconds
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`HTTP error ${response.status} for ${symbol}: ${errorText}`);
          throw new Error(`HTTP error ${response.status} for ${symbol}`);
        }
        
        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error(`Failed to parse JSON for ${symbol}:`, jsonError);
          const responseText = await response.text();
          console.error(`Response text: ${responseText.substring(0, 200)}...`);
          throw new Error(`Invalid JSON response for ${symbol}`);
        }
        
        // Continue with the rest of your code...
      } catch (err) {
        console.warn(`Error fetching insights for ${symbol}:`, err);
      }
    }
    
    // Also fetch general market news with HTTPS
    let hasMarketNews = false;
    try {
      const marketNewsUrl = buildSafeApiUrl('/market/news');
      
      const newsResponse = await fetch(marketNewsUrl, { 
        signal: AbortSignal.timeout(5000),
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (newsResponse.ok) {
        const newsData = await newsResponse.json();
        
        // Add top 3 headlines
        if (newsData && Array.isArray(newsData) && newsData.length > 0) {
          insights.push("Latest Market Headlines:");
          newsData.slice(0, 3).forEach(article => {
            insights.push(`- ${article.title}`);
          });
          hasMarketNews = true;
          sourcesUsed.push('market news');
        }
      }
    } catch (err) {
      console.warn('Error fetching market news:', err);
    }
    
    // If we didn't get much data from the real API, use fallback
    if (apiSuccessCount < 2 && !hasMarketNews) {
      console.warn('Insufficient real insights, using fallback data');
      const mockData = generateMockInsights(symbols);
      return {
        content: mockData,
        isMock: true,
        sourcesUsed: ['mock data']
      };
    }
    
    // If we got any insights at all, return them
    if (insights.length > 0) {
      return {
        content: insights.join('\n'),
        isMock: false,
        sourcesUsed
      };
    }
    
    // Fallback to mock data if nothing was retrieved
    throw new Error('No insights retrieved');
    
  } catch (error) {
    console.error('Error fetching market insights:', error);
    const mockData = generateMockInsights(symbols);
    return {
      content: mockData,
      isMock: true,
      sourcesUsed: ['mock data (error fallback)']
    };
  }
}

/**
 * Generates mock insights when real API is unavailable
 * @param symbols Array of stock symbols
 * @returns String with mock insights
 */
function generateMockInsights(symbols: string[]): string {
  const possibleInsights = [
    "shows a bullish trend with increasing institutional buying",
    "faces technical resistance at key levels",
    "is trading near 52-week highs with strong momentum",
    "has earnings coming up that could increase volatility",
    "shows signs of consolidation after recent gains",
    "has been downgraded by several analysts recently",
    "is experiencing unusual options activity",
    "is outperforming its sector peers this quarter",
    "shows a potential reversal pattern forming",
    "has increased short interest according to recent data"
  ];
  
  const mockInsights: string[] = [];
  
  // Generate mock insights for each symbol
  symbols.slice(0, 8).forEach(symbol => {
    // Pick a random insight based on symbol characteristics
    const insightIndex = symbol.charCodeAt(0) % possibleInsights.length;
    mockInsights.push(`${symbol} ${possibleInsights[insightIndex]}`);
  });
  
  // Add mock news headlines
  mockInsights.push("Latest Market Headlines:");
  mockInsights.push("- Fed signals potential rate changes ahead");
  mockInsights.push("- Major tech stocks lead market rally");
  mockInsights.push("- Earnings season shows mixed results across sectors");
  
  return mockInsights.join('\n');
}