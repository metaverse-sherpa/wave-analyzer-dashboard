#!/bin/bash
set -e  # Exit on error

echo "🚀 Deploying API backend to Cloudflare Workers..."

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

# Handle Supabase URL
if [ -z "$VITE_SUPABASE_URL" ]; then
  read -p "Enter your Supabase URL (leave blank to skip): " SUPABASE_URL
  
  if [ ! -z "$SUPABASE_URL" ]; then
    echo "Setting SUPABASE_URL as a secret..."
    npx wrangler secret put SUPABASE_URL <<< "$SUPABASE_URL"
  fi
else
  echo "Using SUPABASE_URL from environment"
  npx wrangler secret put SUPABASE_URL <<< "$VITE_SUPABASE_URL"
fi

# Handle Supabase Service Key - Use VITE_SUPABASE_ANON_KEY instead of prompting for SUPABASE_SERVICE_KEY
if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  read -p "Enter your Supabase Service Key (leave blank to skip): " SUPABASE_SERVICE_KEY
  
  if [ ! -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "Setting SUPABASE_SERVICE_KEY as a secret..."
    npx wrangler secret put SUPABASE_SERVICE_KEY <<< "$SUPABASE_SERVICE_KEY"
  fi
else
  echo "Using VITE_SUPABASE_ANON_KEY from environment as SUPABASE_SERVICE_KEY"
  npx wrangler secret put SUPABASE_SERVICE_KEY <<< "$VITE_SUPABASE_ANON_KEY"
fi

# Deploy the API
echo "Deploying API to Cloudflare Workers..."
npx wrangler deploy

# Verify the deployment
echo "✅ Deployment completed! API should be available at both:"
echo "- https://elliottwaves.ai/api"
echo "- https://api-backend.metaversesherpa.workers.dev"

