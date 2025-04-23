#!/bin/bash

# Script to test the DeepSeek API for Elliott Wave Analysis directly using curl
# Usage: ./test-deepseek-api.sh SYMBOL [lookback_days]

# Default values
SYMBOL=${1:-"AAPL"}
LOOKBACK_DAYS=${2:-180}
ENV_FILE=".env.local"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️ Warning: .env file not found, checking alternative locations..."
  # Try common alternative locations
  if [ -f "../.env" ]; then
    ENV_FILE="../.env"
    echo "📄 Found .env file in parent directory"
  elif [ -f ".env.local" ]; then
    ENV_FILE=".env.local"
    echo "📄 Found .env.local file"
  else
    echo "⚠️ Warning: No .env file found, will try to use environment variables"
  fi
fi

# Try to get API URL and KEY from env file
if [ -f "$ENV_FILE" ]; then
  API_URL=$(grep -E "VITE_DEEPSEEK_API_URL|DEEPSEEK_API_URL" "$ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
  API_KEY=$(grep -E "VITE_DEEPSEEK_API_KEY|DEEPSEEK_API_KEY" "$ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
fi

# Fall back to environment variables if not found in file
if [ -z "$API_URL" ]; then
  API_URL="${VITE_DEEPSEEK_API_URL:-${DEEPSEEK_API_URL:-}}"
fi

if [ -z "$API_KEY" ]; then
  API_KEY="${VITE_DEEPSEEK_API_KEY:-${DEEPSEEK_API_KEY:-}}"
fi

# Final fallback to default API URL
if [ -z "$API_URL" ]; then
  echo "⚠️ API URL not found. Using default API URL."
  API_URL="https://api.deepseek.com/v1" 
fi

# Check if API key exists and show masked version
if [ -z "$API_KEY" ]; then
  echo "❌ Error: No DeepSeek API key found in .env file or environment variables."
  echo "Please add VITE_DEEPSEEK_API_KEY to your .env file or set it in your environment."
  exit 1
else
  # Show first 4 chars and last 4 chars only
  KEY_LENGTH=${#API_KEY}
  if [ $KEY_LENGTH -gt 8 ]; then
    MASKED_KEY="${API_KEY:0:4}...${API_KEY: -4}"
  else
    MASKED_KEY="****"
  fi
  echo "🔑 Using API key: $MASKED_KEY"
fi

echo "🔍 Testing DeepSeek Elliott Wave Analysis API"
echo "Symbol: $SYMBOL"
echo "Lookback days: $LOOKBACK_DAYS"
echo "API URL: $API_URL"
echo "ENV file: $ENV_FILE"

# Step 1: Fetch historical data for the symbol
echo "📊 Fetching historical data for $SYMBOL (last $LOOKBACK_DAYS days)..."

# Detect if we're running in Cloudflare Pages environment or local
if [ -f "/api/stocks/$SYMBOL/history" ]; then
  # Running in Cloudflare Pages environment
  HISTORY_URL="/api/stocks/$SYMBOL/history?lookback=$LOOKBACK_DAYS"
else
  # Running locally
  HISTORY_URL="https://www.elliottwaves.ai/api/stocks/$SYMBOL/history?lookback=$LOOKBACK_DAYS"
fi

echo "📡 Fetching from URL: $HISTORY_URL"

# Get historical data - save it to a temp file
HISTORY_TEMP_FILE=$(mktemp)
curl -s "$HISTORY_URL" > "$HISTORY_TEMP_FILE"

# Check if we got valid JSON
if ! jq -e . "$HISTORY_TEMP_FILE" > /dev/null 2>&1; then
  echo "❌ Error: Invalid JSON response from history API"
  cat "$HISTORY_TEMP_FILE"
  rm "$HISTORY_TEMP_FILE"
  exit 1
fi

# Extract and validate historical data
HISTORICAL_DATA=$(jq -c '.data' "$HISTORY_TEMP_FILE")
rm "$HISTORY_TEMP_FILE"

if [ -z "$HISTORICAL_DATA" ] || [ "$HISTORICAL_DATA" = "null" ]; then
  echo "❌ Error: Failed to fetch historical data for $SYMBOL"
  exit 1
fi

# Count the number of data points
DATA_POINTS=$(echo "$HISTORICAL_DATA" | jq 'length')
echo "📈 Retrieved $DATA_POINTS data points"

# Save the historical data to a temporary file for reference
echo "$HISTORICAL_DATA" > "${SYMBOL}_historical_data.json"

# Format the data for the prompt 
FORMATTED_DATA=$(jq -c 'map({date: (if .timestamp then (.timestamp | tostring) else .time end), open: .open, high: .high, low: .low, close: .close})' <<< "$HISTORICAL_DATA")

# Get the earliest date in the dataset
EARLIEST_DATE=$(jq -r '.[0].date // "2025-01-01"' <<< "$FORMATTED_DATA" | cut -c1-10)

# Using the same enhanced system prompt from deepseekApi.ts
SYSTEM_PROMPT='You are an expert in Elliott Wave Theory and Fibonacci analysis. Analyze the provided OHLC data **strictly from the most recent high or low** (prioritizing the last 3-6 months of data). Ignore older wave patterns unless they directly impact the current wave structure. Identify only the **latest incomplete wave sequence** leading to the current price, and label it as "currentWave". If the current wave is part of a larger pattern (e.g., Wave 3 of a larger Wave (3)), note this in "analysis" but prioritize recent subdivisions. Always return the most recent Fibonacci targets based on the active wave.
Do not use any prior knowledge or external information. 
If the data is insufficient, respond with: "Insufficient data for analysis.

CRITICAL INSTRUCTION: Focus ONLY on the MOST RECENT Elliott Wave sequence leading up to today. Find the most relevant starting point that leads to a coherent wave count into the present day.

CRITICAL RULES FOR ELLIOTT WAVE IDENTIFICATION:
- Impulse waves MUST follow the sequence 1-3-5 (impulsive/trending) and 2-4 (corrective/countertrend).
- Wave 1: Impulsive, initial movement in the direction of the trend
- Wave 2: Corrective, never retraces more than 100% of Wave 1
- Wave 3: Impulsive, typically the longest and strongest wave
- Wave 4: Corrective, typically does not overlap Wave 1
- Wave 5: Impulsive, final leg in the trend direction
- Wave A: Corrective, first wave of the correction
- Wave B: Corrective (though sometimes appears impulsive), counter-correction
- Wave C: Corrective, final leg of the correction
- Once wave C ends, look for a new wave 1 and start the sequence again.

CRITICAL REQUIREMENT: You MUST analyze data up to the MOST RECENT data point. Your analysis must include waves all the way to the last date in the provided data. Never stop analyzing before the most current date.

CRITICAL RULE: You MUST follow the proper Elliott Wave sequence. After a wave 4, you MUST identify a wave 5 before starting any A-B-C correction. Never skip waves in the sequence.

CRITICAL RULE: Alternation between impulsive and corrective waves must be maintained:
- Waves 1, 3, 5 are ALWAYS impulsive
- Waves 2, 4, A, C are ALWAYS corrective
- Wave B can be impulsive in appearance but is technically corrective

CRITICAL: Identify only ONE complete Elliott Wave sequence from what you believe is the most relevant starting point through to today. This should consist of either:
1) A single impulse wave sequence (1-2-3-4-5) leading to today, or
2) An impulse sequence followed by a correction (1-2-3-4-5-A-B-C) leading to today, or
3) A correction sequence (A-B-C) leading to today, or
4) The beginning of a new impulse wave after a correction (A-B-C-1-2...) leading to today.

CRITICAL: The analysis must include the current wave number (1, 2, 3, 4, 5, A, B, or C) that we are currently in.
CRITICAL: The analysis must include each wave in the most recent sequence in chronological order up to the present day.
CRITICAL: The analysis must include Fibonacci price targets based on the analysis for the current wave.
CRITICAL: The analysis must include stop loss level and key resistance/support levels based on this data.
CRITICAL: The analysis must include the overall trend direction (bullish/bearish) for this time period.
CRITICAL: The analysis must include the confidence level of the analysis (low/medium/high).

Checklist before providing response:
1. Have I identified waves ALL THE WAY to the MOST RECENT data point? If not, continue analysis.
2. Have I focused on ONLY the most recent wave sequence? If not, remove historical sequences.
3. Have I followed the correct wave sequence (1-imp, 2-corr, 3-imp, 4-corr, 5-imp, A-corr, B-imp, C-corr)? If not, correct it.
4. Is the current wave correctly identified based on the most recent data point? If not, correct it.
5. Have I maintained proper wave characteristics (impulsive vs. corrective)? If not, correct it.
6. Is my analysis complete through TODAY"S DATE? If not, continue until today.

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

But you should only include the waves that are part of the most recent single sequence leading to today.'

# Create the user prompt with the actual data included
USER_PROMPT="Analyze $SYMBOL using this OHLC stock price data: $FORMATTED_DATA
The data begins on $EARLIEST_DATE and continues until today."

echo "💾 Preparing analysis request with full historical data"
echo "📝 Using enhanced system prompt from deepseekApi.ts"

# Create a JSON file directly with jq to ensure proper JSON formatting
jq -n \
  --arg model "deepseek-chat" \
  --arg system_prompt "$SYSTEM_PROMPT" \
  --arg user_prompt "$USER_PROMPT" \
  '{
    "model": $model,
    "messages": [
      {
        "role": "system",
        "content": $system_prompt
      },
      {
        "role": "user",
        "content": $user_prompt
      }
    ],
    "temperature": 0.2,
    "response_format": { "type": "json_object" }
  }' > "debug_request.json"

echo "📝 Saved API request to debug_request.json"

echo "🔍 Validating API request JSON format..."
if ! jq -e . "debug_request.json" > /dev/null 2>&1; then
  echo "❌ Error: Invalid JSON in request"
  cat "debug_request.json"
  exit 1
else
  echo "✅ API request JSON is valid"
  echo "📊 Request includes full $DATA_POINTS data points for analysis with enhanced prompt"
fi

echo "🚀 Calling DeepSeek API for Elliott Wave analysis..."
echo "📡 API URL: $API_URL/chat/completions"

# Use a non-verbose curl command and directly capture the JSON response
echo "⏳ Sending API request (this may take 15-30 seconds)..."
RESPONSE_JSON=$(curl -s -X POST "$API_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d @"debug_request.json")

# Save the API response to a file
echo "$RESPONSE_JSON" > "debug_response.json"
echo "📝 Saved API response to debug_response.json"

# Check if the response is valid JSON
if ! echo "$RESPONSE_JSON" | jq -e . >/dev/null 2>&1; then
  echo "❌ Error: API returned non-JSON response"
  echo "Response preview:"
  echo "$RESPONSE_JSON" | head -n 20
  exit 1
fi

# Check for errors in the JSON response
ERROR=$(echo "$RESPONSE_JSON" | jq -r '.error.message // empty')
if [ -n "$ERROR" ]; then
  echo "❌ API Error: $ERROR"
  echo "Full error response saved to debug_response.json"
  exit 1
fi

# Extract the analysis content from the response
ANALYSIS_CONTENT=$(echo "$RESPONSE_JSON" | jq -r '.choices[0].message.content')

# Check if the analysis content is valid JSON
if ! echo "$ANALYSIS_CONTENT" | jq -e . >/dev/null 2>&1; then
  echo "⚠️ Warning: Analysis content is not valid JSON"
  echo "Raw content:"
  echo "$ANALYSIS_CONTENT"
else
  echo "✅ Elliott Wave analysis complete!"
  echo "================ ANALYSIS RESULT ================"
  echo "$ANALYSIS_CONTENT" | jq .
  echo "================================================="
  echo ""
  echo "Analysis saved to ${SYMBOL}_wave_analysis.json"
  
  # Save the result to a file
  echo "$ANALYSIS_CONTENT" > "${SYMBOL}_wave_analysis.json"
fi

# Output the command for future reference
echo ""
echo "To analyze another stock, run:"
echo "./test-deepseek-api.sh SYMBOL [lookback_days]"