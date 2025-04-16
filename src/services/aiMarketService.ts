import { supabase } from '@/lib/supabase';
import { StockHistoricalData, WaveAnalysisResult } from '@/types/shared';
import { calculateAverageReturn, identifyLeadingSectors } from '@/utils/marketAnalysisUtils';
import { buildApiUrl, getApiBaseUrl, switchToFallbackApi } from '@/config/apiConfig';
import { MAJOR_INDEXES, getIndexSymbols } from '@/config/marketIndexes';

// Use the centralized API configuration
const API_BASE_URL = getApiBaseUrl();

export interface MarketSentimentResult {
  analysis: string;     // The actual AI analysis
  isMockData: boolean;  // Whether mock data was used
  sourcesUsed: string[]; // What data sources were used
  timestamp: number;    // When the analysis was generated
}

interface MarketSentimentResponse {
  analysis: string;
  sentiment: string;
  bullishPercentage: number;
  bearishPercentage: number;
  timestamp: number;
  lastUpdated: string;
  isMockData: boolean;
  sourcesUsed: string[];
}

interface MarketData {
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  overallSentiment: string;
}

/**
 * Gets an AI-powered market sentiment analysis that incorporates historical data and wave analysis
 * @param marketData Object containing bullish/bearish counts and sentiment
 * @param waveAnalyses Object containing wave analyses for all stocks
 * @param forceRefresh Whether to force refresh the cache
 * @param skipApiCall Whether to skip the API call (helpful for debugging)
 * @param abortSignal Optional abort signal to cancel the request
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
  skipApiCall: boolean = false,
  abortSignal?: AbortSignal
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
        console.error("Failed to fetch market insights, using mockup data", apiError);
        marketInsightsResult = {
          content: generateMockInsights(symbols),
          isMock: true,
          sourcesUsed: ['mock data (API unavailable)']
        };
      }
    }
    
    try {
      const apiKey = import.meta.env.VITE_PUBLIC_DEEPSEEK_API_KEY;
      
      if (!apiKey) {
        console.warn("No DeepSeek API key found, using local sentiment generation");
        return generateLocalSentimentResult(marketData, analysisInsights, marketInsightsResult);
      }
      
      // Create a combined abort controller with a timeout
      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), 15000); // 15 second timeout
      
      // Combine user-provided abort signal with timeout signal
      const combinedSignal = abortSignal 
        ? AbortSignal.any([abortSignal, timeoutController.signal])
        : timeoutController.signal;

      // Retry the API call up to 3 times with exponential backoff
      const apiCall = async () => {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
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
          }),
          signal: combinedSignal
        });
        
        if (!response.ok) {
          throw new Error(`DeepSeek API error: ${response.status}`);
        }
        
        return response.json();
      };

      try {
        const result = await retry(apiCall, 3, 1000);
        const sentimentAnalysis = result.choices[0].message.content;
        
        const sentimentResult: MarketSentimentResult = {
          analysis: sentimentAnalysis,
          isMockData: marketInsightsResult.isMock,
          sourcesUsed: ['Elliott Wave analysis', 'DeepSeek AI', ...marketInsightsResult.sourcesUsed],
          timestamp: Date.now()
        };
        
        await saveToCache(sentimentResult);
        return sentimentResult;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.error('Error with DeepSeek API:', error);
      // Fall back to local generation if anything fails
      return generateLocalSentimentResult(marketData, analysisInsights, marketInsightsResult);
    }
  } catch (error) {
    console.error('Error getting AI market sentiment:', error);
    // Final fallback with basic analysis
    return {
      analysis: `Market analysis based on ${marketData.bullishCount} bullish and ${marketData.bearishCount} bearish stocks suggests a ${marketData.overallSentiment.toLowerCase()} trend. Elliott Wave patterns indicate potential for continued momentum in the current direction.`,
      isMockData: true,
      sourcesUsed: ['fallback analysis'],
      timestamp: Date.now()
    };
  }
}

// Helper function to generate sentiment result locally
function generateLocalSentimentResult(
  marketData: MarketData, 
  analysisInsights: string, 
  marketInsightsResult: MarketInsightsResult
): MarketSentimentResult {
  const currentDate = new Date();
  const dateStr = currentDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  const { bullishCount, bearishCount, neutralCount, overallSentiment } = marketData;
  
  // Create a deterministic but varying sentiment based on the counts
  const bullishRatio = bullishCount / (bullishCount + bearishCount + neutralCount || 1);
  const bearishRatio = bearishCount / (bullishCount + bearishCount + neutralCount || 1);
  
  let sentiment;
  if (bullishRatio > 0.6) sentiment = "strongly bullish";
  else if (bullishRatio > 0.5) sentiment = "moderately bullish";
  else if (bearishRatio > 0.6) sentiment = "strongly bearish";
  else if (bearishRatio > 0.5) sentiment = "moderately bearish";
  else sentiment = "neutral";
  
  // Generate different analysis based on the sentiment
  let analysisText = "";
  
  // Include some market insights if available
  const hasMarketInsights = marketInsightsResult.content && 
    !marketInsightsResult.content.includes("Market data currently unavailable");
  
  switch(sentiment) {
    case "strongly bullish":
      analysisText = `As of ${dateStr}, market sentiment is decidedly bullish with ${bullishCount} stocks showing positive wave patterns. ${hasMarketInsights ? `Recent news indicates ${marketInsightsResult.content.split('\n')[0].toLowerCase().replace('📰 latest market headlines:', '')}.` : ''}  This broad participation suggests momentum may continue. Investors might consider maintaining equity exposure while being mindful of potential overbought conditions.`;
      break;
    case "moderately bullish":
      analysisText = `Market indicators as of ${dateStr} show a cautiously optimistic outlook with ${bullishCount} bullish vs ${bearishCount} bearish stocks. ${hasMarketInsights ? `Market activity reflects ${marketInsightsResult.content.split('\n')[1]?.toLowerCase().replace('- ', '') || 'ongoing developments'}.` : ''} The Elliott Wave patterns suggest we may be in the early-to-middle stages of an upward movement.`;
      break;
    case "strongly bearish":
      analysisText = `Market analysis on ${dateStr} reveals significant bearish pressure with ${bearishCount} stocks showing negative wave patterns. ${hasMarketInsights ? `This aligns with recent developments including ${marketInsightsResult.content.split('\n')[1]?.toLowerCase().replace('- ', '') || 'current market events'}.` : ''} Protective positioning may be warranted as technical indicators suggest further downside potential.`;
      break;
    case "moderately bearish":
      analysisText = `Current market conditions (${dateStr}) lean bearish with ${bearishCount} stocks showing negative wave patterns against ${bullishCount} bullish ones. ${hasMarketInsights ? `News about ${marketInsightsResult.content.split('\n')[1]?.toLowerCase().replace('- ', '') || 'market developments'} may be contributing factors.` : ''} Elliott Wave analysis suggests we may be in a corrective phase.`;
      break;
    default:
      analysisText = `Market sentiment appears mixed as of ${dateStr}, with a balanced distribution between bullish (${bullishCount}) and bearish (${bearishCount}) patterns. ${hasMarketInsights ? `Recent news includes ${marketInsightsResult.content.split('\n')[1]?.toLowerCase().replace('- ', '') || 'various market developments'}.` : ''} This equilibrium suggests a period of consolidation may be underway.`;
  }
  
  return {
    analysis: analysisText,
    isMockData: true,
    sourcesUsed: ['local analysis', 'wave pattern data', ...(marketInsightsResult.sourcesUsed || [])],
    timestamp: Date.now()
  };
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
  // Use the centralized buildApiUrl function to ensure consistency
  return buildApiUrl(endpoint);
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
 * Fetches market insights specifically for major market indexes
 * @returns Object with content, isMock flag, and sources used
 */
async function fetchMarketInsights(additionalSymbols: string[] = []): Promise<MarketInsightsResult> {
  try {
    // Get all major index symbols
    const indexSymbols = getIndexSymbols();
    
    // Combine with any additional symbols (limited to 5 to keep focused)
    const allSymbols = [...indexSymbols, ...additionalSymbols.slice(0, 5)];
    
    const insights: string[] = [];
    const sourcesUsed: string[] = [];
    
    // Log which API URL we're using 
    console.log(`[API] Using API base URL: ${API_BASE_URL}`);
    console.log(`Fetching insights for ${allSymbols.length} market indexes`);

    // Create a fallback content that's robust even when everything fails
    // This ensures we always have something to display
    let fallbackContent = `Market analysis based on ${allSymbols.length} major indices.`;
    
    // Track API success/failure
    let apiSuccessCount = 0;
    let apiFailureCount = 0;
    
    // First try to get market news - with improved error handling
    let hasMarketNews = false;
    try {
      const marketNewsUrl = buildSafeApiUrl('/market/news');
      
      console.log('Fetching market news from:', marketNewsUrl);
      const newsResponse = await fetch(marketNewsUrl, { 
        signal: AbortSignal.timeout(5000), // Shorter timeout to fail faster
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (newsResponse.ok) {
        const newsResponseText = await newsResponse.text();
        
        try {
          if (!newsResponseText.trim().startsWith('<!DOCTYPE') && !newsResponseText.trim().startsWith('<html')) {
            const newsData = JSON.parse(newsResponseText);
            
            // Add top headlines
            if (newsData && Array.isArray(newsData) && newsData.length > 0) {
              insights.push("📰 Latest Market Headlines:");
              newsData.slice(0, 5).forEach(article => {
                insights.push(`- ${article.title}`);
              });
              hasMarketNews = true;
              sourcesUsed.push('market news');
              
              // If we got news, that's a good sign the API is working
              apiSuccessCount++;
              
              // Update fallback content with actual news headlines
              fallbackContent = `Recent market headlines indicate ${newsData[0].title.toLowerCase()}`;
            }
          } else {
            console.warn('News response was HTML instead of JSON, using fallback');
            apiFailureCount++;
          }
        } catch (parseError) {
          console.warn('Failed to parse news response:', parseError);
          apiFailureCount++;
        }
      } else {
        console.warn(`Market news request failed with status: ${newsResponse.status}`);
        apiFailureCount++;
        
        // If we received a 404, switch to fallback API for future requests
        if (newsResponse.status === 404) {
          console.warn("Received 404 from news API, switching to fallback");
          switchToFallbackApi();
        }
      }
    } catch (err) {
      console.warn('Error fetching market news:', err);
      apiFailureCount++;
    }
    
    // Try to get S&P 500 quote as another data point
    if (apiFailureCount > 0) {
      try {
        const sp500Url = buildSafeApiUrl('/market/quote/SPY');
        
        console.log('Fetching S&P 500 quote from:', sp500Url);
        const quoteResponse = await fetch(sp500Url, { 
          signal: AbortSignal.timeout(5000),
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (quoteResponse.ok) {
          const quoteData = await quoteResponse.json();
          
          if (quoteData && quoteData.price) {
            insights.push("\n📊 Market Indicators:");
            insights.push(`S&P 500 ETF (SPY): $${quoteData.price.toFixed(2)} (${quoteData.change > 0 ? '+' : ''}${quoteData.change.toFixed(2)}%)`);
            sourcesUsed.push('market quotes');
            apiSuccessCount++;
          }
        } else {
          console.warn(`S&P 500 quote request failed with status: ${quoteResponse.status}`);
          apiFailureCount++;
        }
      } catch (err) {
        console.warn('Error fetching S&P 500 quote:', err);
        apiFailureCount++;
      }
    }
    
    // If all API calls have failed, use generated mock data
    if (apiSuccessCount === 0) {
      console.warn('All API calls failed, using generated mock data');
      return {
        content: generateMockIndexInsights(),
        isMock: true,
        sourcesUsed: ['generated market data']
      };
    }
    
    // If we have at least some real data, return it
    if (insights.length > 0) {
      return {
        content: insights.join('\n'),
        isMock: apiFailureCount > apiSuccessCount,
        sourcesUsed: sourcesUsed.length ? sourcesUsed : ['market data']
      };
    }
    
    // Final fallback - should rarely reach here with the improved handling
    return {
      content: fallbackContent,
      isMock: true,
      sourcesUsed: ['fallback data']
    };
  } catch (err) {
    console.error('Error in fetchMarketInsights:', err);
    return {
      content: "Market data currently unavailable. Analysis based on Elliott Wave patterns only.",
      isMock: true,
      sourcesUsed: ['fallback only']
    };
  }
}

/**
 * Generates mock insights for market indexes when real API is unavailable
 * @returns String with mock insights for major indexes
 */
function generateMockIndexInsights(): string {
  const mockInsights: string[] = [];
  
  mockInsights.push("Analysis based on simulated market data");
  
  mockInsights.push("\n📰 Latest Market Headlines:");
  mockInsights.push("- Fed signals potential rate changes ahead based on inflation data");
  mockInsights.push("- Major tech stocks lead market rally despite economic concerns");
  mockInsights.push("- Earnings season shows mixed results across sectors");
  mockInsights.push("- Global trade tensions increase market volatility");
  mockInsights.push("- Energy sector performance tied to geopolitical developments");
  
  mockInsights.push("\n📊 US Markets:");
  mockInsights.push("S&P 500: NEUTRAL outlook");
  mockInsights.push("  \"Trading in a consolidation pattern with key resistance at recent highs\"");
  mockInsights.push("Dow Jones: BEARISH outlook");
  mockInsights.push("  \"Industrial stocks show weakening momentum with potential for further downside\"");
  mockInsights.push("NASDAQ: BULLISH outlook");
  mockInsights.push("  \"Technology sector continues to show strength, leading the broader market higher\"");
  mockInsights.push("VIX: Elevated volatility levels indicating market uncertainty");
  
  mockInsights.push("\n📊 European Markets:");
  mockInsights.push("FTSE 100: NEUTRAL outlook");
  mockInsights.push("  \"UK stocks struggling with economic headwinds but offering value\"");
  mockInsights.push("DAX: BEARISH outlook");
  mockInsights.push("  \"German manufacturing concerns weighing on market sentiment\"");
  
  mockInsights.push("\n📊 Asian Markets:");
  mockInsights.push("Nikkei 225: BULLISH outlook");
  mockInsights.push("  \"Japanese equities showing relative strength compared to other regions\"");
  mockInsights.push("Hang Seng: NEUTRAL outlook");
  mockInsights.push("  \"Chinese economic data presenting mixed signals for market direction\"");
  
  mockInsights.push("\n📈 Recent Performance:");
  mockInsights.push("S&P 500: +0.25%");
  mockInsights.push("NASDAQ: +0.73%");
  mockInsights.push("Dow Jones: -0.14%");
  
  return mockInsights.join('\n');
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

// Convert MAJOR_INDEXES to the format expected by the methods
// This adapter converts the object format to an array format
const MAJOR_INDEXES_ARRAY = Object.entries(MAJOR_INDEXES).map(([name, symbol]) => ({
  name,
  symbol,
  region: 'US' // Default region
}));

// Update function that uses map (around line 375)
// Replace the call to MAJOR_INDEXES.map with MAJOR_INDEXES_ARRAY.map
function getIndexesForPrompt() {
  // Return the formatted indexes
  return MAJOR_INDEXES_ARRAY.map(index => [index.symbol, index.name]);
}

// Update the functions that use find (around line 412-420)
function getRegionForIndex(symbol) {
  // Replace MAJOR_INDEXES.find with MAJOR_INDEXES_ARRAY.find
  const isUS = MAJOR_INDEXES_ARRAY.find(idx => idx.symbol === symbol && idx.region === 'US');
  const isEurope = MAJOR_INDEXES_ARRAY.find(idx => idx.symbol === symbol && idx.region === 'Europe');
  const isAsia = MAJOR_INDEXES_ARRAY.find(idx => idx.symbol === symbol && idx.region === 'Asia');
  const isGlobal = MAJOR_INDEXES_ARRAY.find(idx => idx.symbol === symbol && idx.region === 'Global');
  const isIndex = MAJOR_INDEXES_ARRAY.some(idx => idx.symbol === symbol);
  
  // Rest of the function
}