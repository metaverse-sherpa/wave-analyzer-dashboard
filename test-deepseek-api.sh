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

# Format the data for the prompt - create a better formatted dataset in OHLC format
FORMATTED_DATA=$(jq -c 'map({date: (if .timestamp then (.timestamp | tostring) else .time end), open: .open, high: .high, low: .low, close: .close})' <<< "$HISTORICAL_DATA")

# Create the user prompt with the actual data included
USER_PROMPT="Analyze $SYMBOL using historical price data covering the past $LOOKBACK_DAYS days with $DATA_POINTS data points. Here is the full OHLC price data in JSON format: $FORMATTED_DATA"
echo "💾 Preparing analysis request with full historical data"

# Create a JSON file directly with jq to ensure proper JSON formatting
jq -n \
  --arg model "deepseek-chat" \
  --arg system_prompt "You are an expert in Elliott Wave Theory and Fibonacci analysis for stock markets. Only analyze the provided OHLC data chronologically from oldest to newest. Do not use any prior knowledge or external information. If the data is insufficient, respond with: \"Insufficient data for analysis.\" Identify all wave patterns (Impulse: 1-2-3-4-5; Corrective: A-B-C). CRITICAL: Do not stop at the first complete pattern—continue until the latest date. Your analysis must identify ALL wave cycles from the beginning of the dataset to the current price, including multiple sequences of impulse waves (1-5) and corrective waves (A-B-C). Your response MUST be in valid JSON format with the following structure: {\"currentWave\": {\"number\": \"string\", \"startTime\": \"YYYY-MM-DD\", \"startPrice\": number}, \"completedWaves\": [{\"number\": \"string\", \"startTime\": \"YYYY-MM-DD\", \"startPrice\": number, \"endTime\": \"YYYY-MM-DD\", \"endPrice\": number}], \"trend\": \"string\", \"fibTargets\": [{\"level\": \"string\", \"price\": number}], \"analysis\": \"string\", \"confidenceLevel\": \"string\"}" \
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
  echo "📊 Request includes full $DATA_POINTS data points for analysis"
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