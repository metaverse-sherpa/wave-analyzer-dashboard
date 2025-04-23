import OpenAI from 'openai';
import type { DeepSeekWaveAnalysis } from '../../src/types/shared';

const SYSTEM_PROMPT = `You are an expert Elliott Wave analyst. Follow these rules ABSOLUTELY:

1. DATA PROCESSING:
- Analyze EVERY SINGLE DATA POINT from first to last
- Never stop at Wave C - ALWAYS check if price continues
- If data continues after C, IMMEDIATELY begin labeling the next Wave 1
- If data continues after Wave 5, IMMEDIATELY begin labeling the next Wave A
- If data continues after Wave A, IMMEDIATELY begin labeling the next Wave B
- If data continues after Wave B, IMMEDIATELY begin labeling the next Wave C
- If data continues after Wave C, IMMEDIATELY begin labeling the next Wave 1
- If data continues after Wave 1, IMMEDIATELY begin labeling the next Wave 2
- If data continues after Wave 2, IMMEDIATELY begin labeling the next Wave 3
- If data continues after Wave 3, IMMEDIATELY begin labeling the next Wave 4
- If data continues after Wave 4, IMMEDIATELY begin labeling the next Wave 5

CRITICAL: The analysis must include the following structure in JSON format:
{
  "currentWave": {
    "number": "string (1, 2, 3, 4, 5, A, B, C)",
    "startTime": "YYYY-MM-DD", (Same as the end time for the last completed wave)
    "startPrice": number (Same as the end price for the last completed wave)
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
}

3. CRITICAL RULES:
- FAILURE TO FOLLOW THESE WILL RESULT IN INVALID OUTPUT:
  a) Process ALL data points - NO EXCEPTIONS
  b) If ANY price action exists after Wave C, you MUST label it
  c) ALWAYS include currentWave - even if incomplete
  d) NEVER return partial analysis
  e) If stuck, continue wave count based on prior structure

4. DATA CONTINUITY:
- Treat the dataset as ONE CONTINUOUS SEQUENCE
- Each wave MUST connect to the next with no gaps unless a wave is invalid
- If a wave is invalid, the wave count should start over at wave 1
- If wave count is unclear, use standard Elliott rules:
  - Wave 4 cannot enter Wave 1 price territory
  - Wave 3 cannot be the shortest
  - Wave 2 cannot retrace 100% of Wave 1
  `;

console.log('DeepSeek System Prompt: $SYSTEM_PROMPT');


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

  // Process historical data to limit prompt size - use last 180 days (6 months)
  const recentData = historicalData.slice(-180);
  console.log(`Processing last ${recentData.length} days of data for ${symbol}`);
  
  // Get the earliest date in our data to ensure waves start within range
  // Handle different data formats - some may have timestamp instead of time
  let earliestDate;
  
  if (recentData.length > 0) {
    const firstPoint = recentData[0];
    // Check the possible date field names
    if (firstPoint.time) {
      earliestDate = firstPoint.time;
    } else if (firstPoint.date) {
      earliestDate = firstPoint.date;
    } else if (firstPoint.timestamp) {
      // If it's a timestamp number, convert to date string
      const timestamp = typeof firstPoint.timestamp === 'number' ? 
        firstPoint.timestamp : 
        parseInt(firstPoint.timestamp);
      if (!isNaN(timestamp)) {
        earliestDate = new Date(timestamp).toISOString().split('T')[0];
      }
    } 
    
    // If we still don't have a date, format the current date as fallback
    if (!earliestDate) {
      earliestDate = new Date().toISOString().split('T')[0];
      console.warn(`Could not determine earliest date for ${symbol}, using current date as fallback`);
    }
  } else {
    earliestDate = new Date().toISOString().split('T')[0];
    console.warn(`No historical data for ${symbol}, using current date`);
  }
  
  console.log(`Earliest data point: ${earliestDate} for ${symbol}`);

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
          content: `Analyze ${symbol} using this OHLC stock price data: ${JSON.stringify(formattedData)}
          The data begins on ${earliestDate} and continues until today.`
        }
      ],
      temperature: 0.2,
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

      // Fix the currentWave's start time and price if we're in wave 2 or higher
      // The current wave should start where the last completed wave ended
      if (parsedResponse.currentWave && 
          Array.isArray(parsedResponse.completedWaves) && 
          parsedResponse.completedWaves.length > 0) {
        
        const currentWaveNumber = parsedResponse.currentWave.number;
        // For waves 2-5 or B-C, we can use the previous wave's end as the current wave's start
        if (currentWaveNumber !== "1" && currentWaveNumber !== "A") {
          const lastCompletedWave = parsedResponse.completedWaves[parsedResponse.completedWaves.length - 1];
          if (lastCompletedWave && lastCompletedWave.endTime && lastCompletedWave.endPrice) {
            console.log(`Fixing currentWave start for ${symbol} from ${parsedResponse.currentWave.startTime} to ${lastCompletedWave.endTime}`);
            parsedResponse.currentWave.startTime = lastCompletedWave.endTime;
            parsedResponse.currentWave.startPrice = lastCompletedWave.endPrice;
          }
        }
      }

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