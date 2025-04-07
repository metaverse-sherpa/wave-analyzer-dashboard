import { supabase } from '@/lib/supabase';

/**
 * Gets an AI-powered market sentiment analysis that incorporates recent news
 * @param marketData Object containing bullish/bearish counts and sentiment
 * @returns String containing the analysis
 */
export async function getAIMarketSentiment(marketData: {
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  overallSentiment: string;
}, forceRefresh: boolean = false): Promise<string> {
  try {
    // Check cache first unless we're forcing a refresh
    if (!forceRefresh) {
      const cached = await getFromCache();
      if (cached) {
        return cached;
      }
    }
    
    // Call DeepSeek API
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
            content: `You are an expert market analyst with deep knowledge of equity markets and economic trends.`
          },
          {
            role: "user",
            content: `Generate a brief market sentiment analysis based on this summary:
            
Bullish stocks: ${marketData.bullishCount} 
Bearish stocks: ${marketData.bearishCount}
Neutral stocks: ${marketData.neutralCount}
Overall sentiment: ${marketData.overallSentiment}

Include one mention of a relevant recent market event or news that helps explain the current sentiment.
Keep your response under 100 words and focus on what this means for investors.`
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    const sentimentAnalysis = result.choices[0].message.content;
    
    // Save to cache
    await saveToCache(sentimentAnalysis);
    
    return sentimentAnalysis;
    
  } catch (error) {
    console.error('Error getting AI market sentiment:', error);
    throw new Error(`Failed to get market sentiment analysis: ${(error as Error).message}`);
  }
}

async function getFromCache(): Promise<string | null> {
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
      return data.data;
    }
    
    return null;
  } catch (err) {
    console.warn('Error reading from cache:', err);
    return null;
  }
}

async function saveToCache(analysis: string): Promise<void> {
  try {
    await supabase
      .from('cache')
      .upsert({
        key: 'ai_market_sentiment',
        data: analysis,
        timestamp: Date.now(),
        duration: 12 * 60 * 60 * 1000, // 12 hours
        is_string: true
      }, { onConflict: 'key' });
      
    console.log('Cached market sentiment analysis in Supabase');
  } catch (err) {
    console.warn('Error saving to cache:', err);
  }
}