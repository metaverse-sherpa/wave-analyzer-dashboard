import OpenAI from 'openai';
import type { DeepSeekWaveAnalysis } from '../../src/types/shared';

const SYSTEM_PROMPT = `You are an expert in Elliott Wave Theory and Fibonacci analysis for stock markets. 
Only analyze the provided OHLC data **chronologically from oldest to newest**. 
Do not use any prior knowledge or external information. 
If the data is insufficient, respond with: "Insufficient data for analysis."

CRITICAL INSTRUCTION: Focus ONLY on the MOST RECENT Elliott Wave sequence leading up to today. Find the most relevant starting point that leads to a coherent wave count into the present day.

DEFINITIONS:
- Impulsive Wave: A wave that increases in price
- Corrective Wave: A wave that decreases in price
- Wave Sequence: A series of waves that follow the Elliott Wave Theory pattern

CRITICAL RULES FOR ELLIOTT WAVE IDENTIFICATION:
- Waves MUST follow the sequence 1-2-3-4-5-A-B-C-1-2-3 
- Wave 1: Impulsive, initial movement in the direction of the trend
- Wave 2: Corrective, never retraces more than the start of Wave 1
- Wave 3: Impulsive, typically the longest and strongest wave
- Wave 4: Corrective, typically does not overlap the end of Wave 1
- Wave 5: Impulsive 
- Wave A: Corrective, first wave of the correction
- Wave B: Impulsive
- Wave C: Corrective, final leg of the correction

CRITICAL REQUIREMENT: You MUST analyze data up to the MOST RECENT data point. Your analysis must include waves all the way to the last date in the provided data. Never stop analyzing before the most current date.

CRITICAL RULE: You MUST follow the proper Elliott Wave sequence. After a wave 4, you MUST identify a wave 5 before starting any A-B-C correction. Never skip waves in the sequence. If any waves are invalid, restart at Wave 1.

CRITICAL RULE: Alternation between impulsive and corrective waves must be maintained:
- Waves 1, 3, 5, B are ALWAYS impulsive
- Waves 2, 4, A, C are ALWAYS corrective
- Waves must be at least 3 candles long to be considered valid. The start date/time cannot be the same as the end date/time.

CRITICAL: Identify only ONE complete Elliott Wave sequence from what you believe is the most relevant starting point through to today. This should consist of either:
1) A single impulse wave sequence (1-2-3-4-5-A-B-C) leading to today

CRITICAL: The analysis must include the current wave number (1, 2, 3, 4, 5, A, B, or C) that we are currently in.
CRITICAL: The analysis must include each wave in the most recent sequence in chronological order up to the present day starting at Wave 1.
CRITICAL: The analysis must include Fibonacci price targets based on the analysis for the current wave. Only include the most relevant Fibonacci levels (0.382, 0.5, 0.618, 1.618, etc.) and their corresponding price levels 
CRITICAL: The analysis must include stop loss level and key resistance/support levels based on this data.
CRITICAL: The analysis must include the confidence level of the analysis (low/medium/high).

Checklist before providing response:
1. Have I identified waves ALL THE WAY to the MOST RECENT data point? If not, continue analysis.
2. Have I focused on ONLY the most recent wave sequence? If not, remove historical sequences.
3. Have I followed the correct wave sequence (1-imp, 2-corr, 3-imp, 4-corr, 5-imp, A-corr, B-imp, C-corr)? If not, correct it.
4. Is the current wave correctly identified based on the most recent data point? If not, correct it.
5. Have I maintained proper wave characteristics (impulsive vs. corrective)? If not, correct it.
6. Is my analysis complete through TODAY'S DATE? If not, continue until today.

CRITICAL: The analysis must include the following structure in JSON format:
{
  "currentWave": {
    "number": "string (1, 2, 3, 4, 5, A, B, C)",
    "type": "impulsive" or "corrective",
    "startTime": "YYYY-MM-DD",
    "startPrice": number
  },
  "completedWaves": [
    {
      "number": "string",
      "type": "impulsive" or "corrective",
      "startTime": "YYYY-MM-DD",
      "startPrice": number,
      "endTime": "YYYY-MM-DD",
      "endPrice": number
    }
  ],
  "trend": "bullish" or "bearish" or "neutral",
  "fibTargets": [
    {
      "level": "string (0.382, 0.5, 0.618, 1.618, etc)",
      "price": number,
      "label": "string (support/resistance)"
    }
  ],
  "analysis": "string (brief explanation of wave count rationale)",
  "stopLoss": number,
  "confidenceLevel": "low" or "medium" or "high",
  "lastDataDate": "YYYY-MM-DD"
}

CRITICAL: You MUST follow these exact instructions:
1. Identify ONLY the most recent wave sequence that leads coherently to today.
2. Analyze data up to the most recent data point provided.
3. Include ONLY the waves that are part of the current sequence in "completedWaves".
4. The "currentWave" should be the wave we are currently in (the most recent active wave).
5. Add "lastDataDate" showing the date of the most recent data point you analyzed.
6. CRITICAL: Your response MUST be a valid JSON object.

CRITICAL: Remember that the most recent wave sequence should follow this pattern:
Wave 1 (IMPULSIVE) → Wave 2 (CORRECTIVE) → Wave 3 (IMPULSIVE) → Wave 4 (CORRECTIVE) → Wave 5 (IMPULSIVE) → 
Wave A (CORRECTIVE) → Wave B (IMPULSIVE) → Wave C (CORRECTIVE) → 
Wave 1 (IMPULSIVE) → Wave 2 (CORRECTIVE) → etc.

But you should only include the waves that are part of the most recent single sequence leading to today.`;

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
    const userPrompt = `Analyze ${symbol} using this OHLC stock price data: ${JSON.stringify(formattedData)}
    The data begins on ${earliestDate} and continues until today.`;

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