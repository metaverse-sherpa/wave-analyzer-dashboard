import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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
    
    // Process historical data to limit prompt size - use last 60 days
    const recentData = historicalData.slice(-365);
    
    // Format data points for the prompt in a concise format
    const formattedData = recentData.map(d => ({
      date: new Date(d.timestamp).toISOString().split('T')[0],
      open: d.open.toFixed(2),
      high: d.high.toFixed(2),
      low: d.low.toFixed(2),
      close: d.close.toFixed(2)
    }));
    
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `You are an expert in Elliott Wave Theory and stock market analysis.`
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

