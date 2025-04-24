import OpenAI from 'openai';
import type { DeepSeekWaveAnalysis } from '../../src/types/shared';

const SYSTEM_PROMPT = `You are an Elliott Wave expert analyzing ONLY the provided OHLC stock price data. Your primary objective is to tell us which wave the stock price is currently in and then show us how you determined that by providing us with the prior waves.
Follow these ABSOLUTE rules:

CRITICAL WAVE RULES (NON-NEGOTIABLE):

1. We only care about wave sequences where wave 3 is confirmed because the price is above where wave 1 ended.
2. Wave 2 cannot retrace more than 100% of Wave 1.  If it does, the entire count is invalid and we start wave 1 where wave 2 ends.
3. Wave 4 cannot retrace more than where wave 1 ended. If it does, the entire count is invalid and we start wave 1 where wave 2 ended.
4. Wave 3 must be the longest wave. If it is not, the entire count is invalid and we start wave 1 where wave 2 ended.
5. Wave 4 cannot overlap with wave 1. If it does, the entire count is invalid and we start wave 1 where wave 2 ended.

**Sequence Enforcement**:
   - Wave 1 (Impulsive) → Wave 2 (Corrective) → Wave 3 (Impulsive) → Wave 4 (Corrective) → Wave 5 (Impulsive) → (only then) A (Corrective) → B (Impulsive) → C (Corrective) → 1 (Impulsive) → 2 (Corrective) → 3 (Impulsive) → 4 (Corrective) → 5 (Impulsive).


4. **Output Requirements**:
   json
   {
     "currentWave": {
       "number": "1|2|3|4|5",  // Never A/B/C unless after valid 1-5
       "type": "impulsive|corrective",
       "startTime": "YYYY-MM-DD",
       "startPrice": float
     },
     "completedWaves": [
       {
         "number": "string",
         "type": "impulsive|corrective",
         "startTime": "YYYY-MM-DD",
         "startPrice": float,
         "endTime": "YYYY-MM-DD",
         "endPrice": float
       }
     ],
     "trend": "bullish|bearish",
     "fibTargets": [
       {
         "level": "0.382|0.5|0.618|1.0|1.618",
         "price": float,
         "label": "support|resistance"
       }
     ],
     "stopLoss": float,
     "validationChecks": {
       "validWaveCount": bool,
       "correctSequence": bool,
       "noRuleViolations": bool
     },
     "confidenceLevel": "high|medium|low",
     "lastDataDate": "YYYY-MM-DD"
   }`;

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

  // Format data for DeepSeek - improved formatting to match the test script
  const formattedData = recentData
    .map(d => ({
      date: d.time || (d.timestamp ? (typeof d.timestamp === 'number' ? new Date(d.timestamp).toISOString().split('T')[0] : d.timestamp) : new Date().toISOString().split('T')[0]),
      open: typeof d.open === 'number' ? d.open.toFixed(2) : parseFloat(d.open).toFixed(2),
      high: typeof d.high === 'number' ? d.high.toFixed(2) : parseFloat(d.high).toFixed(2),
      low: typeof d.low === 'number' ? d.low.toFixed(2) : parseFloat(d.low).toFixed(2),
      close: typeof d.close === 'number' ? d.close.toFixed(2) : parseFloat(d.close).toFixed(2)
    }))
    .filter(d => d !== null);

  console.log(`Processed ${formattedData.length} valid data points for ${symbol}`);

  const client = createDeepSeekClient(env);
  
  try {
    // Updated user prompt to match the test script's format
    const userPrompt = `Analyze this OHLC stock price data: ${JSON.stringify(formattedData)} for ${symbol} with Elliott Wave Rules
    CRITICAL: Invalidate if Wave 4 enters Wave 1's range. The data begins on ${earliestDate} and continues until today. Use a low-temperature (deterministic) approach. Strictly follow Elliott Wave rules and standard Fibonacci ratios. Avoid speculative patterns.
    Prioritize the most recent valid sequence.`;

    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: userPrompt
      }
    ];
    
    console.log(`DeepSeek API Request for ${symbol}:`, JSON.stringify({
      model: "deepseek-chat",
      messages: messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    }, null, 2));

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
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