import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { StockHistoricalData, DeepSeekWaveAnalysis } from '@/types/shared';

// For client-side usage, we need to use environment variables injected by Vite
const apiKey = import.meta.env.VITE_PUBLIC_DEEPSEEK_API_KEY; 
const baseUrl = import.meta.env.VITE_PUBLIC_DEEPSEEK_API_URL || "https://api.deepseek.com/v1";

// Create OpenAI client configured for DeepSeek
const client = new OpenAI({
  apiKey: apiKey || "",
  baseURL: baseUrl,
  dangerouslyAllowBrowser: true // Required for browser usage
});

// Create a singleton Supabase client
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  // Simply return the existing singleton instance from lib/supabase
  return supabase;
}

/**
 * Gets Elliott Wave analysis for a stock from the DeepSeek API
 * @param symbol The stock symbol to analyze
 * @param historicalData The historical price data for the stock
 * @returns A string containing the analysis
 */
export async function getElliottWaveAnalysis(
  symbol: string,
  historicalData: { timestamp: number; open: number; high: number; low: number; close: number }[]
): Promise<string> {
  try {
    console.log(`Fetching Elliott Wave analysis for ${symbol} from DeepSeek API`);
    
    // Validate that we have enough historical data
    if (!historicalData || historicalData.length < 50) {
      console.warn(`Insufficient historical data for ${symbol}: ${historicalData?.length || 0} points (minimum 50 required)`);
      return `Insufficient data points for ${symbol}: only ${historicalData?.length || 0} points (minimum 50 required)`;
    }
    
    // Process historical data to limit prompt size - use last 365 days
    const recentData = historicalData.slice(-365);
    
    // Format data points for the prompt in a concise format - with safe timestamp handling
    const formattedData = recentData.map(d => {
      // Safely handle timestamp conversion
      let dateStr;
      try {
        // Check for null or undefined timestamp first
        if (d.timestamp === null || d.timestamp === undefined) {
          console.warn(`Null or undefined timestamp encountered for ${symbol}`, 'using current date');
          dateStr = new Date().toISOString().split('T')[0]; // Use current date as fallback
          return { date: dateStr, open: d.open.toFixed(2), high: d.high.toFixed(2), low: d.low.toFixed(2), close: d.close.toFixed(2) };
        }
        
        // Standardize timestamps: ensure they're in milliseconds
        let timestamp = d.timestamp;
        
        // Convert seconds to milliseconds if needed (timestamps before 1970 + 50 years are likely in seconds)
        if (typeof timestamp === 'number' && timestamp < 4000000000) {  // If timestamp is before ~2100 in seconds
          timestamp = timestamp * 1000;
        }
        
        // More robust timestamp validation
        if (typeof timestamp === 'number' && !isNaN(timestamp) && isFinite(timestamp)) {
          // Handle extreme timestamp values that would cause Date to throw
          const minTimestamp = -8640000000000000; // Minimum JS date value
          const maxTimestamp = 8640000000000000;  // Maximum JS date value
          
          if (timestamp < minTimestamp || timestamp > maxTimestamp) {
            console.warn(`Timestamp ${timestamp} outside valid JS date range, using current date`);
            dateStr = new Date().toISOString().split('T')[0];
          } else {
            // Ensure the timestamp is valid by testing if it creates a valid date
            const date = new Date(timestamp);
            
            // Check if date is valid (not Invalid Date) and within reasonable range
            if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
              try {
                dateStr = date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
              } catch (isoError) {
                console.warn(`Failed to convert date to ISO string: ${isoError}`, date);
                // Manual formatting as fallback
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                dateStr = `${year}-${month}-${day}`;
              }
            } else {
              // Invalid date object
              console.warn(`Invalid date object for timestamp ${timestamp}, original: ${d.timestamp}`);
              dateStr = new Date().toISOString().split('T')[0]; // Use current date as fallback
            }
          }
        } else {
          // If timestamp is invalid, use current date as fallback
          console.warn(`Invalid timestamp format: ${d.timestamp}`);
          dateStr = new Date().toISOString().split('T')[0];
        }
      } catch (err) {
        console.warn(`Error handling timestamp for ${symbol}: ${d.timestamp}`, err);
        try {
          dateStr = new Date().toISOString().split('T')[0]; // Use current date as fallback
        } catch (dateError) {
          // Ultimate fallback if even current date fails
          dateStr = "2025-04-13"; // Current date hardcoded
        }
      }
      
      return {
        date: dateStr,
        open: d.open.toFixed(2),
        high: d.high.toFixed(2),
        low: d.low.toFixed(2),
        close: d.close.toFixed(2)
      };
    });
    
    // Proceed with API call only if we have valid formatted data
    if (!formattedData || formattedData.length < 50) {
      return `Failed to process historical data for ${symbol}. Please check the data format.`;
    }
    
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an expert in Elliott Wave Theory and stock market analysis."
        },
        {
          role: "user",
          content: `Analyze ${symbol} using Elliott Wave Theory based on this historical OHLC data (timeframe: 1d). Determine the current Elliott Wave number, price target, stop loss, and trend direction.:
          
${JSON.stringify(formattedData)}

Format your response:
WAVE: [current wave number/letter (1-5 for impulse waves or A-B-C for corrective)]
TARGET: $[price target]
STOP: $[stop loss]
TREND: [bullish/bearish]
ANALYSIS: [Brief explanation of your analysis]`
        }
      ],
      temperature: 0.3,
      max_tokens: 600
    });

    return response.choices[0].message.content || 
      `No analysis could be generated for ${symbol}`;
      
  } catch (error) {
    console.error("Error calling DeepSeek API for Elliott Wave analysis:", error);
    throw new Error(`Failed to get Elliott Wave analysis: ${(error as Error).message}`);
  }
}

// Helper function to calculate Simple Moving Average
function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return 0;
  const sum = data.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
}

// Helper functions for Supabase cache - shorter expiry time for AI predictions
async function getAnalysisFromCache(symbol: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('cache')
      .select('data, timestamp')
      .eq('key', `ai_elliott_wave_${symbol}`)
      .single();
    
    if (error || !data) return null;
    
    // Check if cache is fresh (less than 12 hours for predictive data)
    const cacheAge = Date.now() - data.timestamp;
    if (cacheAge < 12 * 60 * 60 * 1000) {
      return data.data;
    }
    
    return null;
  } catch (err) {
    console.warn('Error reading from cache:', err);
    return null;
  }
}

async function saveAnalysisToCache(symbol: string, analysis: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    
    await supabase
      .from('cache')
      .upsert({
        key: `ai_elliott_wave_${symbol}`,
        data: analysis,
        timestamp: Date.now(),
        duration: 12 * 60 * 60 * 1000, // 12 hours since it's predictive
        is_string: true
      }, { onConflict: 'key' });
      
    console.log(`Cached Elliott Wave analysis for ${symbol} in Supabase`);
  } catch (err) {
    console.warn('Error saving to cache:', err);
  }
}

// Helper function to attempt to repair malformed JSON
function attemptJsonRepair(jsonString: string): string {
  console.log(`Attempting to repair malformed JSON of length ${jsonString.length}`);
  
  // Check for common JSON syntax errors and fix them
  let repairedJson = jsonString;
  
  try {
    // 1. Fix trailing commas in objects
    repairedJson = repairedJson.replace(/,\s*}/g, '}');
    
    // 2. Fix trailing commas in arrays
    repairedJson = repairedJson.replace(/,\s*\]/g, ']');
    
    // 3. Fix missing quotes around property names (common LLM error)
    repairedJson = repairedJson.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*\:/g, '$1"$2":');
    
    // 4. Fix unescaped quotes in strings
    repairedJson = repairedJson.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
      // Replace unescaped quotes inside strings with escaped ones
      return match.replace(/([^\\])"/g, '$1\\"');
    });
    
    // 5. Try to fix unfinished JSON (common in truncated responses)
    const openBraces = (repairedJson.match(/\{/g) || []).length;
    const closeBraces = (repairedJson.match(/\}/g) || []).length;
    const missingCloseBraces = openBraces - closeBraces;
    
    if (missingCloseBraces > 0) {
      repairedJson += '}'.repeat(missingCloseBraces);
    }

    // 6. Fix missing quotes around values
    repairedJson = repairedJson.replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(,|})/g, ':"$1"$2');
    
    // Validate the repaired JSON by parsing it
    JSON.parse(repairedJson);
    console.log(`JSON repair successful`);
    
    return repairedJson;
  } catch (error) {
    console.warn(`JSON repair attempt failed: ${error.message}`);
    
    // If our automated fixes failed, try a more drastic approach:
    // Split by newlines and find the first complete JSON object
    try {
      const lines = jsonString.split('\n');
      let jsonCandidate = '';
      let openCount = 0;
      let jsonStarted = false;
      
      for (const line of lines) {
        if (!jsonStarted && line.trim().startsWith('{')) {
          jsonStarted = true;
        }
        
        if (jsonStarted) {
          jsonCandidate += line + '\n';
          openCount += (line.match(/\{/g) || []).length;
          openCount -= (line.match(/\}/g) || []).length;
          
          // If we've closed all open braces, we might have a complete JSON object
          if (openCount === 0 && jsonCandidate.trim().length > 2) {
            try {
              JSON.parse(jsonCandidate);
              console.log(`Found valid JSON object in response`);
              return jsonCandidate;
            } catch (e) {
              // Keep looking
            }
          }
        }
      }
    } catch (innerError) {
      console.warn(`JSON reconstruction failed: ${innerError.message}`);
    }
    
    // If all else fails, return original string for manual handling
    return jsonString;
  }
}

/**
 * Gets comprehensive Elliott Wave analysis with Fibonacci targets from the DeepSeek API
 * @param symbol The stock symbol to analyze
 * @param historicalData The historical price data for the stock
 * @param ignoreCache Whether to ignore the cache and force a fresh analysis
 * @returns A detailed Elliott Wave analysis with Fibonacci targets
 */
export async function getDeepSeekWaveAnalysis(
  symbol: string,
  historicalData: StockHistoricalData[] | { timestamp: number; open: number; high: number; low: number; close: number }[],
  ignoreCache: boolean = true
): Promise<DeepSeekWaveAnalysis> {
  // Always ignore cache
  const shouldIgnoreCache = true;
  try {
    console.log(`Fetching comprehensive Elliott Wave analysis for ${symbol} from DeepSeek API`);
    
    // Validate that we have enough historical data
    if (!historicalData || historicalData.length < 50) {
      console.warn(`Insufficient historical data for ${symbol}: ${historicalData?.length || 0} points (minimum 50 required)`);
      throw new Error(`Insufficient data points for ${symbol}: only ${historicalData?.length || 0} points (minimum 50 required)`);
    }

    // Process historical data to limit prompt size - use last 365 days
    const recentData = historicalData.slice(-365);
    console.log(`Processing last ${recentData.length} days of data for ${symbol}`);

    // Format data for DeepSeek
    const formattedData = recentData
      .filter(d => d !== null)
      .map(d => {
        // Your existing data formatting code...
        let dateStr;
        try {
          let timestamp = d.timestamp;
          if (typeof timestamp === 'string') {
            timestamp = parseInt(timestamp, 10);
          }
          
          if (typeof timestamp === 'number' && timestamp < 4000000000) {
            timestamp = timestamp * 1000;
          }
          
          const date = new Date(timestamp);
          if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
            dateStr = date.toISOString().slice(0, 10);
          } else {
            console.warn(`Invalid date from timestamp ${timestamp} for ${symbol}`);
            return null;
          }
        } catch (err) {
          console.error(`Error processing timestamp for ${symbol}:`, err);
          return null;
        }
        
        if (isNaN(d.open) || isNaN(d.high) || isNaN(d.low) || isNaN(d.close)) {
          console.warn(`Invalid price values for ${symbol} at ${dateStr}`);
          return null;
        }
        
        return {
          date: dateStr,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close
        };
      })
      .filter(d => d !== null);

    console.log(`Processed ${formattedData.length} valid data points for ${symbol}`);

    // Make the API call
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an expert in Elliott Wave Theory and Fibonacci analysis for stock markets. Provide detailed wave counts with precise targets as JSON output."
        },
        {
          role: "user",
          content: `Analyze ${symbol} using Elliott Wave Theory based on this historical OHLC data (timeframe: 1d). Provide your analysis as a JSON object with the following structure:

1. Current Elliott Wave number (1, 2, 3, 4, 5, A, B, C)
2. Start and end points (date/price) for each of the prior waves
3. Fibonacci price targets based on the analysis for the current wave
4. Stop loss level and key resistance/support levels
5. Overall trend direction (bullish/bearish)
          
${JSON.stringify(formattedData)}

Format your response as a JSON object with this structure:
{
  "currentWave": {
    "number": "string (1-5 or A-C)",
    "startTime": "YYYY-MM-DD",
    "startPrice": number
  },
  "completedWaves": [
    {
      "number": "string",
      "startTime": "YYYY-MM-DD",
      "startPrice": number,
      "endTime": "YYYY-MM-DD",
      "endPrice": number
    }
  ],
  "trend": "bullish/bearish/neutral",
  "fibTargets": [
    {
      "level": "string (0.382, 0.5, 0.618, 1.618, etc)",
      "price": number,
      "label": "string"
    }
  ],
  "analysis": "string",
  "stopLoss": number,
  "confidenceLevel": "low/medium/high"
}`
        }
      ],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    
    if (!content) {
      console.error(`DeepSeek API returned empty content for ${symbol}`);
      throw new Error(`No analysis could be generated for ${symbol}`);
    }

    console.log(`Raw DeepSeek API response for ${symbol}:`, content);
    
    try {
      // Parse the JSON response
      const parsedResponse = JSON.parse(content);
      console.log(`Parsed DeepSeek response for ${symbol}:`, JSON.stringify(parsedResponse, null, 2));

      // Rest of your existing code...
      const finalResponse: DeepSeekWaveAnalysis = {
        currentWave: parsedResponse.currentWave || {
          number: "1",
          startTime: new Date().toISOString().slice(0, 10),
          startPrice: historicalData[historicalData.length - 1]?.close || 0
        },
        trend: parsedResponse.trend || "neutral",
        fibTargets: Array.isArray(parsedResponse.fibTargets) ? 
          parsedResponse.fibTargets : 
          (parsedResponse.fibonacci ? 
            [...(parsedResponse.fibonacci.retracement || []), ...(parsedResponse.fibonacci.extension || [])] : 
            []),
        completedWaves: Array.isArray(parsedResponse.completedWaves) ? 
          parsedResponse.completedWaves : 
          (parsedResponse.waveSequence || []),
        analysis: parsedResponse.analysis || parsedResponse.explanation || "No analysis provided",
        stopLoss: parsedResponse.stopLoss || 
          (parsedResponse.targets ? parsedResponse.targets.stopLoss : null) || 
          null,
        confidenceLevel: parsedResponse.confidenceLevel || "medium"
      };

      console.log(`Final processed analysis for ${symbol}:`, JSON.stringify(finalResponse, null, 2));
      return finalResponse;

    } catch (jsonError) {
      console.error(`Failed to parse DeepSeek API response for ${symbol}:`, jsonError);
      console.log("Raw response:", content);
      throw jsonError;
    }
  } catch (error) {
    console.error("Error calling DeepSeek API for Elliott Wave analysis:", error);
    throw error;
  }
}

