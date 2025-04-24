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
        marketInsightsResult = await fetchMarketInsights(symbols, forceRefresh);
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
      
      // Check if we already have a cached result to provide immediate feedback
      const cachedResult = await getFromCache();
      if (cachedResult && !forceRefresh) {
        console.log("Using cached market sentiment result");
        return cachedResult;
      }
      
      // Increase timeout to 45 seconds to give the API more time to respond
      // The DeepSeek API can take longer especially during peak usage
      const timeoutController = new AbortController();
      const timeoutDuration = 45000; // 45 seconds
      
      console.log(`Setting DeepSeek API timeout to ${timeoutDuration/1000} seconds`);
      const timeout = setTimeout(() => {
        console.log(`DeepSeek API request timed out after ${timeoutDuration/1000} seconds, aborting`);
        timeoutController.abort('Request timed out');
      }, timeoutDuration);
      
      // Use a more robust approach to handle signals
      const signalToUse = abortSignal || timeoutController.signal;
      
      // Enhanced API call function with improved diagnostics
      const apiCall = async (attemptNumber = 1) => {
        const startTime = Date.now();
        console.log(`DeepSeek API attempt #${attemptNumber} - Started at ${new Date(startTime).toISOString()}`);
        
        try {
          // Use a more robust approach with fetch
          const controller = new AbortController();
          const signal = signalToUse ? signalToUse : controller.signal;
          
          // Set up a separate timeout just for this attempt (shorter than the overall timeout)
          const attemptTimeoutMs = Math.min(15000 * attemptNumber, 30000); // Increase timeout with each retry
          const attemptTimeout = setTimeout(() => controller.abort('Attempt timeout'), attemptTimeoutMs);
          
          console.log(`Making DeepSeek API request (attempt #${attemptNumber}, timeout: ${attemptTimeoutMs/1000}s)...`);
          
          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Connection': 'keep-alive' // Try to maintain the connection
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [
                {
                  role: "system",
                  content: `You are an expert stock market analyst with deep knowledge of Elliott Wave Theory and equity markets. 
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
Focus on what this means for investors. Don't preface with "Market Sentiment Summary". Don't include word counts.`
                }
              ],
              temperature: 0.3,
              max_tokens: 250,
              // Add a client reference ID to help track requests
              client_reference_id: `market-sentiment-${Date.now()}`
            }),
            signal
          });
          
          clearTimeout(attemptTimeout);
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
          }
          
          const result = await response.json();
          const endTime = Date.now();
          console.log(`DeepSeek API succeeded after ${(endTime - startTime)/1000} seconds (attempt #${attemptNumber})`);
          return result;
        } catch (error) {
          const endTime = Date.now();
          const durationSec = (endTime - startTime)/1000;
          
          if (error.name === 'AbortError') {
            console.warn(`DeepSeek API request aborted after ${durationSec} seconds (attempt #${attemptNumber})`, error);
            throw new Error(`DeepSeek API request timed out after ${durationSec} seconds`);
          }
          
          console.warn(`DeepSeek API error after ${durationSec} seconds (attempt #${attemptNumber}):`, error.message);
          throw error;
        }
      };

      // More intelligent retry mechanism with increased backoff
      const enhancedRetry = async () => {
        let lastError = null;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await apiCall(attempt);
          } catch (error) {
            lastError = error;
            
            // Only retry if we have more attempts left
            if (attempt < maxRetries) {
              // Exponential backoff - wait longer with each retry
              const backoffDelay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
              
              console.log(`Retrying DeepSeek API in ${backoffDelay/1000} seconds (attempt ${attempt}/${maxRetries} failed)`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
          }
        }
        
        // If we reach here, all retries failed
        throw lastError || new Error('All DeepSeek API attempts failed');
      };

      try {
        console.log("Starting DeepSeek API request with enhanced retry logic");
        
        // Generate fallback content immediately as a backup
        const fallbackSentiment = generateLocalSentimentResult(marketData, analysisInsights, marketInsightsResult);
        
        // Try the DeepSeek API with our enhanced retry logic
        const result = await Promise.race([
          enhancedRetry(),
          // After 40 seconds, return fallback but don't abort the API call
          new Promise(resolve => setTimeout(() => {
            console.log("Using fallback while API call continues in background");
            resolve({
              _usedFallback: true,
              choices: [{ message: { content: fallbackSentiment.analysis } }]
            });
          }, 40000))
        ]);
        
        // Check if we're using the fallback
        if (result._usedFallback) {
          console.log("Returned fallback sentiment while API call continues in background");
          return fallbackSentiment;
        }
        
        console.log("DeepSeek API request successful");
        
        // Extract the actual sentiment analysis
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
  
  // Extract news headlines more carefully
  let newsHeadline = "ongoing market developments";
  if (marketInsightsResult.content && !marketInsightsResult.content.includes("Market data currently unavailable")) {
    // Split the content into lines
    const contentLines = marketInsightsResult.content.split('\n');
    
    // Find the first headline after the "Latest Market Headlines:" line
    for (let i = 0; i < contentLines.length; i++) {
      if (contentLines[i].includes("Latest Market Headlines") || contentLines[i].includes("📰")) {
        if (i + 1 < contentLines.length && contentLines[i + 1].startsWith("-")) {
          // Extract the headline without the "- " prefix
          newsHeadline = contentLines[i + 1].replace(/^-\s+/, '');
          break;
        }
      }
    }
  }
  
  // Generate different analysis based on sentiment with proper news references
  switch(sentiment) {
    case "strongly bullish":
      analysisText = `As of ${dateStr}, market sentiment is decidedly bullish with ${bullishCount} stocks showing positive wave patterns. Recent news indicates ${newsHeadline}. This broad participation suggests momentum may continue. Investors might consider maintaining equity exposure while being mindful of potential overbought conditions.`;
      break;
    case "moderately bullish":
      analysisText = `Market indicators as of ${dateStr} show a cautiously optimistic outlook with ${bullishCount} bullish vs ${bearishCount} bearish stocks. Market activity reflects ${newsHeadline}. The Elliott Wave patterns suggest we may be in the early-to-middle stages of an upward movement.`;
      break;
    case "strongly bearish":
      analysisText = `Market analysis on ${dateStr} reveals significant bearish pressure with ${bearishCount} stocks showing negative wave patterns. This aligns with recent developments including ${newsHeadline}. Protective positioning may be warranted as technical indicators suggest further downside potential.`;
      break;
    case "moderately bearish":
      analysisText = `Current market conditions (${dateStr}) lean bearish with ${bearishCount} stocks showing negative wave patterns against ${bullishCount} bullish ones. News about ${newsHeadline} may be contributing factors. Elliott Wave analysis suggests we may be in a corrective phase.`;
      break;
    default:
      analysisText = `Market sentiment appears mixed as of ${dateStr}, with a balanced distribution between bullish (${bullishCount}) and bearish (${bearishCount}) patterns. Recent news includes ${newsHeadline}. This equilibrium suggests a period of consolidation may be underway.`;
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
  // Skip processing if no analyses available
  if (!waveAnalyses || Object.keys(waveAnalyses).length === 0) {
    return "No wave analysis data available.";
  }
  
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
  const completedPatterns: string[] = [];
  
  // Dominant current wave direction
  const waveDirections = {
    bullish: 0,
    bearish: 0
  };
  
  // Track stocks in each wave for detailed reporting
  const stocksByWave: Record<string, string[]> = {};
  
  // Process each stock's wave analysis
  let stocksAnalyzed = 0;
  Object.entries(waveAnalyses).forEach(([key, { analysis }]) => {
    if (!analysis || !analysis.currentWave) return;
    stocksAnalyzed++;
    
    // Extract symbol from the key (format: symbol:timeframe)
    const symbol = key.split(':')[0];
    
    // Count patterns
    if (analysis.impulsePattern) patternCounts.impulse++;
    if (analysis.correctivePattern) patternCounts.corrective++;
    
    // Count current wave numbers
    const currentWave = analysis.currentWave.number;
    const waveKey = typeof currentWave === 'string' ? 
      `wave${currentWave}` : 
      `wave${currentWave}`;
    
    // Increment wave counts if valid wave key
    if (waveKey in waveCounts) {
      waveCounts[waveKey]++;
    }
    
    // Track stocks by wave
    if (!stocksByWave[String(currentWave)]) {
      stocksByWave[String(currentWave)] = [];
    }
    stocksByWave[String(currentWave)].push(symbol);
    
    // Determine wave direction
    if (typeof currentWave === 'number') {
      if ([1, 3, 5].includes(currentWave)) {
        waveDirections.bullish++;
      } else {
        waveDirections.bearish++;
      }
    } else if (typeof currentWave === 'string') {
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
  
  // Skip further processing if no stocks analyzed
  if (stocksAnalyzed === 0) {
    return "No wave patterns detected in the analyzed stocks.";
  }
  
  // Build the insights string
  const insights = [
    `Analyzed ${stocksAnalyzed} stocks using Elliott Wave Theory.`,
  ];

  // Add CLEAR wave direction information at the top
  const bullishPercent = Math.round((waveDirections.bullish / stocksAnalyzed) * 100);
  const bearishPercent = Math.round((waveDirections.bearish / stocksAnalyzed) * 100);
  insights.push(`IMPORTANT WAVE DISTRIBUTION: ${waveDirections.bullish} stocks (${bullishPercent}%) in bullish waves (1,3,5,B) vs ${waveDirections.bearish} stocks (${bearishPercent}%) in bearish waves (2,4,A,C).`);
  
  // Add wave distribution section
  const waveEntries = Object.entries(waveCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]); // Sort by count (descending)
  
  if (waveEntries.length > 0) {
    insights.push("Detailed Wave Distribution:");
    waveEntries.forEach(([wave, count]) => {
      const waveLabel = wave.replace('wave', 'Wave ');
      const percentage = Math.round((count / stocksAnalyzed) * 100);
      const waveNumber = wave.replace('wave', '');
      const isBullishWave = ['1', '3', '5', 'B'].includes(waveNumber);
      const waveType = isBullishWave ? "BULLISH" : "BEARISH";
      insights.push(`- ${waveLabel}: ${count} stocks (${percentage}%) - ${waveType} wave`);
      
      // Add top examples for significant waves (at least 10% of stocks)
      if (percentage >= 10 && stocksByWave[waveNumber]) {
        const examples = stocksByWave[waveNumber].slice(0, 5).join(', ');
        insights.push(`  Examples: ${examples}`);
      }
    });
  }
  
  // Add pattern types
  insights.push(`Pattern Types: ${patternCounts.impulse} impulse patterns, ${patternCounts.corrective} corrective patterns`);
  
  // Add information about completed patterns
  if (completedPatterns.length > 0) {
    insights.push(`${completedPatterns.length} stocks have completed their wave patterns and may be near reversal points: ${completedPatterns.slice(0, 5).join(', ')}${completedPatterns.length > 5 ? '...' : ''}`);
  }
  
  // Add wave-specific insights
  if (waveCounts.wave3 > waveCounts.wave1 && waveCounts.wave3 > waveCounts.wave5) {
    insights.push('Many stocks are in Wave 3, typically the strongest trending phase of the market cycle.');
  }
  
  if (waveCounts.wave5 > (stocksAnalyzed * 0.2)) {
    insights.push('A significant number of stocks are in Wave 5, suggesting the current trend may be nearing completion.');
  }
  
  if (waveCounts.waveA > (stocksAnalyzed * 0.2)) {
    insights.push('Many stocks are starting corrective patterns (Wave A), indicating a pullback phase may be underway.');
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
async function fetchMarketInsights(additionalSymbols: string[] = [], forceRefresh: boolean = false): Promise<MarketInsightsResult> {
  try {
    // Get all major index symbols
    const indexSymbols = getIndexSymbols();
    
    // Combine with any additional symbols (limited to 10 to keep focused)
    // Filter out empty strings and limit to reasonable number
    const validSymbols = additionalSymbols
      .filter(s => s && s.trim().length > 0)
      .slice(0, 10);
    
    // Use a set to remove duplicates
    const uniqueSymbols = Array.from(new Set([...indexSymbols, ...validSymbols]));
    
    const insights: string[] = [];
    const sourcesUsed: string[] = [];
    
    // Log which API URL we're using 
    console.log(`[API] Using API base URL: ${API_BASE_URL}`);
    console.log(`Fetching insights for ${uniqueSymbols.length} symbols: ${uniqueSymbols.join(', ')}`);

    // Create a fallback content that's robust even when everything fails
    // This ensures we always have something to display
    let fallbackContent = `Market analysis based on ${uniqueSymbols.length} symbols.`;
    
    // Track API success/failure
    let apiSuccessCount = 0;
    let apiFailureCount = 0;
    
    // First try to get market news - with improved error handling
    let hasMarketNews = false;
    try {
      // Build news URL with symbols and refresh parameters
      const newsParams = new URLSearchParams();
      if (uniqueSymbols.length > 0) {
        newsParams.append('symbols', uniqueSymbols.join(','));
      }
      if (forceRefresh) {
        newsParams.append('refresh', 'true');
      }
      
      const paramsString = newsParams.toString();
      const marketNewsUrl = buildSafeApiUrl(`/market/news${paramsString ? '?' + paramsString : ''}`);
      
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