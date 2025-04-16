import OpenAI from 'openai';
import type { DeepSeekWaveAnalysis } from '../../src/types/shared';

const SYSTEM_PROMPT = `You are an expert in Elliott Wave Theory and Fibonacci analysis for stock markets. Provide detailed wave counts with precise targets as JSON output.`;

interface HistoricalData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Helper function to attempt to repair malformed JSON
function attemptJsonRepair(jsonString: string): string {
  console.log(`Attempting to repair malformed JSON of length ${jsonString.length}`);
  
  let repairedJson = jsonString;
  
  try {
    // 1. Fix trailing commas
    repairedJson = repairedJson.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
    
    // 2. Fix missing quotes around property names
    repairedJson = repairedJson.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*\:/g, '$1"$2":');
    
    // 3. Fix unescaped quotes in strings
    repairedJson = repairedJson.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
      return match.replace(/([^\\])"/g, '$1\\"');
    });
    
    // 4. Fix unfinished JSON
    const openBraces = (repairedJson.match(/\{/g) || []).length;
    const closeBraces = (repairedJson.match(/\}/g) || []).length;
    const missingCloseBraces = openBraces - closeBraces;
    
    if (missingCloseBraces > 0) {
      repairedJson += '}'.repeat(missingCloseBraces);
    }

    // 5. Fix missing quotes around values
    repairedJson = repairedJson.replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(,|})/g, ':"$1"$2');
    
    JSON.parse(repairedJson); // Validate
    return repairedJson;
  } catch (error) {
    console.warn(`JSON repair attempt failed: ${error.message}`);
    
    // Try reconstructing from partial JSON
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
          
          if (openCount === 0 && jsonCandidate.trim().length > 2) {
            try {
              JSON.parse(jsonCandidate);
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
    
    return jsonString;
  }
}

/**
 * Creates an OpenAI client configured for DeepSeek using worker environment variables
 */
function createDeepSeekClient(env: any): OpenAI {
  return new OpenAI({
    apiKey: env.DEEPSEEK_API_KEY || "",
    baseURL: env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1"
  });
}

/**
 * Gets comprehensive Elliott Wave analysis with Fibonacci targets from the DeepSeek API
 * Backend version that uses worker environment variables instead of Vite's
 */
export async function getDeepSeekWaveAnalysis(
  symbol: string,
  historicalData: HistoricalData[],
  env: any
): Promise<DeepSeekWaveAnalysis> {
  if (!historicalData?.length || historicalData.length < 50) {
    throw new Error(`Insufficient data points for ${symbol}: only ${historicalData?.length || 0} points (minimum 50 required)`);
  }

  // Process historical data to limit prompt size - use last 365 days
  const recentData = historicalData.slice(-365);
  console.log(`Processing last ${recentData.length} days of data for ${symbol}`);

  // Format data for DeepSeek
  const formattedData = recentData
    .map(d => ({
      date: d.time,
      open: d.open.toFixed(2),
      high: d.high.toFixed(2),
      low: d.low.toFixed(2),
      close: d.close.toFixed(2)
    }))
    .filter(d => d !== null);

  console.log(`Processed ${formattedData.length} valid data points for ${symbol}`);

  const client = createDeepSeekClient(env);
  
  try {
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
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
    "number": "string (1, 2, 3, 4, 5, a, b, c)",
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

      const finalResponse: DeepSeekWaveAnalysis = {
        currentWave: parsedResponse.currentWave || {
          number: "1",
          startTime: new Date().toISOString().slice(0, 10),
          startPrice: historicalData[historicalData.length - 1].close
        },
        completedWaves: Array.isArray(parsedResponse.completedWaves) ? 
          parsedResponse.completedWaves : 
          (parsedResponse.waveSequence || []),
        trend: parsedResponse.trend || "neutral",
        fibTargets: parsedResponse.fibTargets || [],
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
      
      // Attempt to repair malformed JSON
      const repairedContent = attemptJsonRepair(content);
      return JSON.parse(repairedContent);
    }
  } catch (error) {
    console.error("Error calling DeepSeek API for Elliott Wave analysis:", error);
    throw error;
  }
}