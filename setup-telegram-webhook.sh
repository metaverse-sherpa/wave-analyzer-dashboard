#!/bin/bash
set -e  # Exit on error

# Check if a token is provided
if [ -z "$1" ]; then
  # Try to load from .env.local if no argument provided
  if [ -f .env.local ]; then
    echo "Loading token from .env.local file..."
    export $(grep -v '^#' .env.local | xargs)
    BOT_TOKEN=$TELEGRAM_BOT_TOKEN
  fi
  
  # If still no token, ask for it
  if [ -z "$BOT_TOKEN" ]; then
    echo "Usage: ./setup-telegram-webhook.sh <BOT_TOKEN>"
    read -p "Please enter your Telegram Bot Token: " BOT_TOKEN
  fi
else
  BOT_TOKEN=$1
fi

# The correct domain for your webhook
# This should be the domain where your API is hosted
WEBHOOK_DOMAIN="api-backend.metaversesherpa.workers.dev"

# The webhook path
WEBHOOK_PATH="/telegram/webhook"

# Full webhook URL
WEBHOOK_URL="https://$WEBHOOK_DOMAIN$WEBHOOK_PATH"

echo "Setting webhook to $WEBHOOK_URL..."

# Call the Telegram API to set the webhook
curl -X POST \
  https://api.telegram.org/bot${BOT_TOKEN}/setWebhook \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\", \"allowed_updates\": [\"message\", \"callback_query\"]}"

echo -e "\n\nChecking webhook info..."

# Check the webhook info to verify it's set properly
curl -X GET https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo

echo -e "\n\nDone!"