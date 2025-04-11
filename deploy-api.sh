#!/bin/bash
set -e  # Exit on error

# Source .env.local to get environment variables
if [ -f .env.local ]; then
  echo "Loading environment variables from .env.local"
  export $(grep -v '^#' .env.local | xargs)
fi

# Navigate to the API directory
cd api-backend

# Check if TELEGRAM_BOT_TOKEN is already in environment (from .env.local or system env)
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  # Only prompt if not already defined
  read -p "Enter your Telegram Bot Token (leave blank to skip): " TELEGRAM_BOT_TOKEN
  
  if [ ! -z "$TELEGRAM_BOT_TOKEN" ]; then
    # Add the token to wrangler secrets
    echo "Setting TELEGRAM_BOT_TOKEN as a secret..."
    npx wrangler secret put TELEGRAM_BOT_TOKEN <<< "$TELEGRAM_BOT_TOKEN"
  fi
else
  echo "Using TELEGRAM_BOT_TOKEN from environment"
  # Update the token in wrangler secrets
  npx wrangler secret put TELEGRAM_BOT_TOKEN <<< "$TELEGRAM_BOT_TOKEN"
fi

# Deploy the API directly (no build step)
echo "Deploying API to Cloudflare Workers..."
npx wrangler deploy

echo "✅ Deployment completed successfully with custom domain api.elliottwaves.ai!"