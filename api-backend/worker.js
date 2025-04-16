// Import URL patches for node:url compatibility
import { URL, URLSearchParams } from 'node:url';
import yahooFinance from 'yahoo-finance2';
import { getDeepSeekWaveAnalysis } from './lib/deepseekApi';
import OpenAI from 'openai';
import { getSupabaseClient } from './lib/supabase';

// Constants
const APP_VERSION = '0.0.9';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Content-Type': 'application/json'
};

// In-memory cache for non-historical data
const CACHE = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, '/');
    const headers = { ...corsHeaders };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Health check endpoint
      if (path === '/health' || path === '/') {
        return new Response(JSON.stringify({
          status: 'success',
          message: 'API server is running',
          version: APP_VERSION,
          timestamp: new Date().toISOString()
        }), { 
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
      }

      // Version endpoint
      if (path === '/version') {
        return new Response(JSON.stringify({
          version: APP_VERSION
        }), { headers });
      }

      // Market data endpoints
      if (path === '/stocks/top') {
        try {
          const cacheKey = 'top_stocks';
          const now = Date.now();
          
          // Check cache first
          if (CACHE[cacheKey] && now - CACHE[cacheKey].expires < 0) {
            return new Response(JSON.stringify(CACHE[cacheKey].data), { headers });
          }
          
          // Get fresh data from Yahoo Finance
          const result = await yahooFinance.screener({
            scrIds: 'most_actives',
            count: 100
          });
          
          if (!result?.quotes || !Array.isArray(result.quotes)) {
            throw new Error("No valid stock data received from screener");
          }
          
          const topStocks = result.quotes.map(quote => ({
            symbol: quote.symbol,
            price: quote.regularMarketPrice,
            change: quote.regularMarketChange,
            changePercent: quote.regularMarketChangePercent,
            volume: quote.regularMarketVolume,
            avgVolume: quote.averageVolume,
            marketCap: quote.marketCap,
            name: quote.shortName || quote.longName || quote.symbol
          })).filter(stock => stock.symbol && stock.symbol.length > 0);
          
          // Cache for 5 minutes
          CACHE[cacheKey] = {
            data: topStocks,
            expires: now + (5 * 60 * 1000)
          };
          
          return new Response(JSON.stringify(topStocks), { headers });
        } catch (error) {
          console.error(`Error getting top stocks: ${error.message}`);
          return new Response(JSON.stringify({
            error: 'Failed to get top stocks',
            message: error.message
          }), {
            status: 500,
            headers
          });
        }
      }

      // Historical data endpoint - updated to match new pattern
      if (path.match(/^\/stocks\/[^/]+\/history/)) {
        const symbol = path.split('/')[2];
        console.log(`Processing history request for symbol: ${symbol}`);
        
        try {
          // Get data directly from Yahoo Finance
          const period1 = new Date();
          period1.setFullYear(period1.getFullYear() - 2); // 2 years of data
          
          const data = await yahooFinance.historical(symbol, {
            period1,
            interval: '1d'
          });
          
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error(`No historical data available for ${symbol}`);
          }

          // Format the data consistently
          const formattedData = data.map(item => ({
            timestamp: new Date(item.date).getTime(),
            open: Number(item.open),
            high: Number(item.high),
            low: Number(item.low),
            close: Number(item.close),
            volume: Number(item.volume || 0)
          }));
          
          return new Response(JSON.stringify({
            status: 'success',
            data: formattedData
          }), { 
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            }
          });
        } catch (error) {
          console.error(`Error fetching historical data for ${symbol}: ${error.message}`);
          return new Response(JSON.stringify({
            status: 'error',
            error: `Failed to get historical data for ${symbol}`,
            message: error.message
          }), { 
            status: 500,
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            }
          });
        }
      }

      // Clear cache endpoint
      if (path === '/clear-cache' && request.method === 'POST') {
        return await handleClearCache(request, env, ctx);
      }

      // Wave analysis endpoints
      if (path === '/analyze-waves' && request.method === 'POST') {
        return await handleAnalyzeWaves(request, env, ctx);
      }

      // Update the market sentiment endpoint
      if (path === '/market/sentiment') {
        try {
          console.log("Generating market sentiment data using wave analysis");
          
          // Get cached wave analysis data
          const waveAnalysis = await getWaveAnalysisFromCache(env);
          
          // If we have wave analysis data, use it to generate sentiment
          if (Object.keys(waveAnalysis).length > 0) {
            // Get current quotes for price movement analysis
            const result = await yahooFinance.screener({
              scrIds: 'most_actives',
              count: 30,
              region: 'US',
              lang: 'en-US'
            });
            
            if (!result?.quotes || !Array.isArray(result.quotes)) {
              throw new Error("No valid stock data received from screener");
            }
            
            // Generate AI market sentiment using wave analysis
            const marketData = await generateMarketAISentiment(waveAnalysis, result.quotes, env);
            
            // Cache the result
            const cacheKey = "market_sentiment";
            CACHE[cacheKey] = {
              data: marketData,
              expires: Date.now() + (15 * 60 * 1000) // 15 minutes cache
            };
            
            return new Response(JSON.stringify(marketData), { headers });
          } else {
            console.log("No wave analysis data found, falling back to traditional sentiment");
            // Fall back to original sentiment calculation if no wave analysis
            // ...existing fallback code...
          }
        } catch (error) {
          console.error(`Error generating market sentiment: ${error.message}`);
          // ...existing error handling code...
        }
      }

      // Fallback for unhandled routes
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Endpoint not found',
        availableEndpoints: [
          '/health',
          '/version',
          '/stocks/top',
          '/stocks/{symbol}/history',
          '/clear-cache',
          '/analyze-waves'
        ],
        requestedPath: path
      }), { 
        status: 404,
        headers 
      });

    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      }), { 
        status: 500,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
  }
};

// Helper function to handle clearing cache
async function handleClearCache(request, env, ctx) {
  const headers = { ...corsHeaders };
  
  try {
    const data = await request.json();
    const cacheType = data.cacheType;
    
    if (!cacheType) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Missing cacheType parameter'
      }), { 
        status: 400,
        headers
      });
    }
    
    console.log(`Clearing cache for type: ${cacheType}`);
    
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        // Determine pattern for cache deletion
        let pattern;
        
        if (cacheType === 'wave_analysis') {
          pattern = 'wave_analysis_%';
        } else if (cacheType === 'ai_analysis') {
          pattern = 'ai_elliott_wave_%';
        } else {
          pattern = `${cacheType}%`;
        }
        
        // Delete from Supabase cache
        const supabaseResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/cache`, {
          method: 'DELETE',
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            key: pattern
          })
        });
        
        if (!supabaseResponse.ok) {
          throw new Error(`Supabase API error: ${await supabaseResponse.text()}`);
        }
        
        return new Response(JSON.stringify({
          status: 'success',
          message: `Cache cleared for type: ${cacheType}`
        }), { headers });
      } catch (error) {
        console.error('Error clearing cache:', error);
        return new Response(JSON.stringify({
          status: 'error',
          message: `Failed to clear cache: ${error.message}`
        }), {
          status: 500,
          headers
        });
      }
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Cache clearing attempted for type: ${cacheType}`
    }), { headers });
  } catch (error) {
    console.error('Error in handleClearCache:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Failed to clear cache: ${error.message}`
    }), { 
      status: 500,
      headers
    });
  }
}

// Helper function to handle analyzing waves
async function handleAnalyzeWaves(request, env, ctx) {
  const headers = { ...corsHeaders };
  
  try {
    const data = await request.json();
    const { symbol, historicalData } = data;
    
    if (!symbol || !historicalData) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Missing required parameters: symbol, historicalData'
      }), { 
        status: 400,
        headers
      });
    }
    
    console.log(`Analyzing waves for ${symbol}`);
    
    const waveAnalysis = await getDeepSeekWaveAnalysis(symbol, historicalData, env);
    
    if (!waveAnalysis) {
      throw new Error('Wave analysis returned no results');
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      data: waveAnalysis
    }), { headers });
  } catch (error) {
    console.error('Error in handleAnalyzeWaves:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Failed to analyze waves: ${error.message}`
    }), { 
      status: 500,
      headers
    });
  }
}

// Add new function to get wave analysis from Supabase cache
async function getWaveAnalysisFromCache(env) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase credentials not configured');
    }
    
    // Query cache table for wave analysis entries
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cache`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      // Filter to only get wave analysis entries that are not expired
      params: new URLSearchParams({
        select: '*',
        key: 'like.wave_analysis_%',
        // Add filter for non-expired entries using RLS policy
      })
    });
    
    if (!response.ok) {
      throw new Error(`Supabase request failed: ${response.status}`);
    }
    
    const cacheEntries = await response.json();
    console.log(`Found ${cacheEntries.length} wave analysis cache entries`);
    
    // Process and aggregate the wave analysis data
    return cacheEntries.reduce((acc, entry) => {
      try {
        // Extract symbol from cache key (format: wave_analysis_SYMBOL_timeframe)
        const symbol = entry.key.split('_')[2];
        const data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
        
        if (data && data.waves && data.currentWave) {
          acc[symbol] = {
            symbol,
            currentWave: data.currentWave,
            waves: data.waves,
            trend: data.trend || 'neutral',
            analysis: data.analysis || '',
            timestamp: entry.timestamp
          };
        }
      } catch (err) {
        console.error(`Error processing cache entry for ${entry.key}:`, err);
      }
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching wave analysis from cache:', error);
    throw error;
  }
}

// Add new function to generate market sentiment using DeepSeek
async function generateMarketAISentiment(waveAnalysis, stockQuotes, env) {
  try {
    // Format the wave analysis data for DeepSeek
    const analysisData = Object.values(waveAnalysis).map(data => ({
      symbol: data.symbol,
      wave: data.currentWave.number,
      trend: data.trend,
      analysis: data.analysis
    }));
    
    // Get current market stats from quotes
    const marketStats = stockQuotes.reduce((stats, quote) => {
      if (quote.regularMarketChangePercent > 0) stats.bullishCount++;
      else if (quote.regularMarketChangePercent < 0) stats.bearishCount++;
      else stats.neutralCount++;
      return stats;
    }, { bullishCount: 0, bearishCount: 0, neutralCount: 0 });
    
    // Create a prompt for DeepSeek API
    const prompt = `Analyze the current market sentiment based on Elliott Wave analysis of ${analysisData.length} stocks.

Market Statistics:
- Bullish Stocks: ${marketStats.bullishCount}
- Bearish Stocks: ${marketStats.bearishCount}
- Neutral Stocks: ${marketStats.neutralCount}

Wave Analysis Summary:
${analysisData.slice(0, 10).map(stock => 
  `${stock.symbol}: Wave ${stock.wave}, ${stock.trend} trend`
).join('\n')}
${analysisData.length > 10 ? `\n...and ${analysisData.length - 10} more stocks` : ''}

Based on this wave analysis data, provide a concise market sentiment analysis focusing on:
1. Overall market trend and potential reversal points
2. Distribution of stocks across different wave cycles
3. Key levels to watch
4. Short-term market outlook

Keep the response focused and actionable, around 3-4 sentences.`;

    // Call DeepSeek API for market sentiment analysis
    const response = await fetch(`${env.DEEPSEEK_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: prompt
        }],
        temperature: 0.7,
        max_tokens: 350
      })
    });
    
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }
    
    const aiResponse = await response.json();
    const analysis = aiResponse.choices[0].message.content;
    
    return {
      analysis,
      sentiment: determineSentiment(marketStats),
      stats: {
        ...marketStats,
        totalStocks: analysisData.length,
        bullishPercentage: Math.round((marketStats.bullishCount / analysisData.length) * 100),
        bearishPercentage: Math.round((marketStats.bearishCount / analysisData.length) * 100),
        neutralPercentage: Math.round((marketStats.neutralCount / analysisData.length) * 100)
      },
      waveDistribution: calculateWaveDistribution(analysisData),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating AI market sentiment:', error);
    throw error;
  }
}

// Helper function to calculate wave distribution
function calculateWaveDistribution(analysisData) {
  const distribution = analysisData.reduce((acc, data) => {
    const wave = data.wave?.toString() || 'unknown';
    acc[wave] = (acc[wave] || 0) + 1;
    return acc;
  }, {});
  
  // Convert to percentages
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  return Object.entries(distribution).reduce((acc, [wave, count]) => {
    acc[wave] = Math.round((count / total) * 100);
    return acc;
  }, {});
}