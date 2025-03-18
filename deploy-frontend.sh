#!/bin/bash
# filepath: /Users/johngiles/projects/wave-analyzer-dashboard/deploy-frontend.sh

echo "Installing dependencies..."
npm ci

# Create .env.production with all required variables
echo "Creating production environment configuration..."
cat > .env.production << EOF
VITE_USE_REAL_API=true
VITE_API_BASE_URL=https://api-backend.metaversesherpa.workers.dev/
VITE_DEBUG_API_CALLS=true
EOF

echo "Building frontend with optimizations..."
npm run build

# Verify env vars were included
echo "Checking for API URL in build files..."
grep -r "api-backend" ./dist || echo "WARNING: API URL not found in build!"

# Backup the original wrangler.toml
if [ -f wrangler.toml ]; then
  mv wrangler.toml wrangler.toml.backup
fi

# Create Pages-specific wrangler.toml
cat > wrangler.toml << EOF
name = "wave-analyzer-dashboard"
compatibility_date = "2023-10-30"
pages_build_output_dir = "dist"

# Environment variables for the production branch
[env.production.vars]
VITE_API_BASE_URL = "https://api-backend.metaversesherpa.workers.dev"
EOF

echo "Deploying to Cloudflare Pages..."
wrangler pages deploy dist

# Restore original wrangler.toml
if [ -f wrangler.toml.backup ]; then
  mv wrangler.toml.backup wrangler.toml
fi

echo "Deployment complete!"