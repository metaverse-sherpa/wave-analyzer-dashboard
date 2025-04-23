import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { HistoricalDataPoint, DeepSeekAnalysis, DeepSeekWaveAnalysis, StockHistoricalData, WaveAnalysis } from '@/types/shared';

// For client-side usage, we need to use environment variables injected by Vite
const DEEPSEEK_API_URL = process.env.VITE_DEEPSEEK_API_URL || 'https://api.deepseek.ai';
const DEEPSEEK_API_KEY = process.env.VITE_DEEPSEEK_API_KEY;

// Create OpenAI client configured for DeepSeek
const client = new OpenAI({
  apiKey: DEEPSEEK_API_KEY || "",
  baseURL: DEEPSEEK_API_URL,
  dangerouslyAllowBrowser: true // Required for browser usage
});

// Create a singleton Supabase client
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  // Simply return the existing singleton instance from lib/supabase
  return supabase;
}

/**
 * Gets wave analysis directly from DeepSeek API (Admin only)
 * This function is specifically for admin use to generate fresh analysis
 * @param symbol - The stock symbol to analyze
 * @param historicalData - The historical price data to analyze
 */
export const getAdminDirectAnalysis = async (
  symbol: string,
  historicalData: HistoricalDataPoint[]
): Promise<DeepSeekAnalysis> => {
  // Limit historical data to last 180 days (6 months) to reduce API payload size
  const limitedData = historicalData.length > 180 ? historicalData.slice(-180) : historicalData;
  console.log(`Requesting analysis for ${symbol} with ${limitedData.length} data points (limited to 6 months)`);
  console.log(`Data range: ${new Date(limitedData[0].timestamp).toISOString()} to ${new Date(limitedData[limitedData.length-1].timestamp).toISOString()}`);
  
  const response = await fetch(`${DEEPSEEK_API_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({ symbol, historicalData: limitedData })
  });

  if (!response.ok) {
    throw new Error(`Failed to get analysis: ${response.statusText}`);
  }

  const responseData = await response.json();
  
  // Log the complete response for debugging
  console.log(`DeepSeek API Response for ${symbol}:`, responseData);
  
  return responseData;
};

/**
 * Gets wave analysis from DeepSeek API
 * This function is used to fetch wave analysis for a given stock symbol
 * @param symbol - The stock symbol to get analysis for
 * @param historicalData - Optional historical price data to analyze
 */
export const getDeepSeekWaveAnalysis = async (
  symbol: string,
  historicalData?: StockHistoricalData[]
): Promise<DeepSeekWaveAnalysis> => {
  // If historicalData is provided, use it for direct analysis
  if (historicalData && historicalData.length > 0) {
    // Limit data to last 180 days (6 months) to reduce API payload size
    const limitedData = historicalData.length > 180 ? historicalData.slice(-180) : historicalData;
    console.log(`Requesting wave analysis for ${symbol} with ${limitedData.length} data points (limited to 6 months)`);
    
    // Find the earliest date in the provided historical data
    const earliestTimestamp = Math.min(...limitedData.map(point => 
      typeof point.timestamp === 'number' ? point.timestamp : new Date(point.timestamp).getTime()
    ));
    
    const latestTimestamp = Math.max(...limitedData.map(point => 
      typeof point.timestamp === 'number' ? point.timestamp : new Date(point.timestamp).getTime()
    ));
    
    console.log(`Data range: ${new Date(earliestTimestamp).toISOString()} to ${new Date(latestTimestamp).toISOString()}`);
    console.log(`Using lookback of ${limitedData.length} days for analysis`);
    
    // Send data to the API endpoint for processing
    const response = await fetch(`${DEEPSEEK_API_URL}/wave-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({ 
        symbol, 
        historicalData: limitedData,
        earliestTimestamp  // Send the earliest timestamp to ensure waves start from this point
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get wave analysis: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log(`DeepSeek API Wave Analysis Response for ${symbol}:`, responseData);
    return responseData;
  }
  
  // Otherwise, use the standard endpoint without historical data
  console.log(`Requesting wave analysis for ${symbol} without historical data`);
  const response = await fetch(`${DEEPSEEK_API_URL}/wave-analysis/${symbol}`, {
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get wave analysis: ${response.statusText}`);
  }

  const responseData = await response.json();
  console.log(`DeepSeek API Wave Analysis Response for ${symbol}:`, responseData);
  return responseData;
};

/**
 * Gets cached wave analysis from Supabase (Regular user flow)
 * This function is used by stock details and index pages to get pre-computed analysis
 * @param symbol - The stock symbol to get analysis for
 */
export const getCachedWaveAnalysis = async (symbol: string): Promise<WaveAnalysis | null> => {
  try {
    const response = await fetch(`${DEEPSEEK_API_URL}/analysis/${symbol}`);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Error fetching cached wave analysis:', error);
    return null;
  }
};

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

