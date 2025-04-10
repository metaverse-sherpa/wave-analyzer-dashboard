#!/bin/bash
set -e  # Exit on error

# Check if a token is provided
if [ -z "$1" ]; then
  echo "Error: Bot token is required"
  echo "Usage: $0 <BOT_TOKEN>"
  exit 1
else
  BOT_TOKEN=$1
fi

# Set the webhook URL to your API backend
WEBHOOK_URL="https://api-backend.metaversesherpa.workers.dev/telegram/webhook"

echo "Setting up Telegram webhook for bot..."
echo "Webhook URL: $WEBHOOK_URL"

# Delete any existing webhook
echo "Deleting existing webhook..."
curl -s "https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook"

# Set the new webhook
echo "Setting new webhook..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\", \"allowed_updates\": [\"message\"]}")

echo "Response: $RESPONSE"

# Check webhook info
echo "Getting webhook info..."
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo")
echo "Webhook info: $WEBHOOK_INFO"

echo -e "\nDone! Webhook has been configured."