#!/bin/bash
# filepath: /Users/johngiles/projects/wave-analyzer-dashboard/dev-local-with-remote-api.sh

echo "Starting local frontend with remote API..."
echo "API URL: https://api-backend.metaversesherpa.workers.dev"

# Set development environment
export NODE_ENV=development
export VITE_API_BASE_URL=https://api-backend.metaversesherpa.workers.dev
export VITE_USE_REAL_API=true

# Check API health
echo "Checking API health..."
if curl -s "https://api-backend.metaversesherpa.workers.dev/health" | grep -q "ok"; then
  echo "✅ API is online and responding"
else
  echo "⚠️  Warning: API may not be responding correctly"
  # Continue anyway - don't exit
fi

# Start Vite dev server
echo "Starting frontend development server..."
npm run dev