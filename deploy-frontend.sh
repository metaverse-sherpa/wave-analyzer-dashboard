#!/bin/bash

# Build the frontend
npm run build

# Backup the original wrangler.toml if it exists
if [ -f wrangler.toml ]; then
  mv wrangler.toml wrangler.toml.backup
fi

# Create Pages-specific wrangler.toml
cat > wrangler.toml << EOF
name = "wave-analyzer-dashboard"
compatibility_date = "2023-10-30"
pages_build_output_dir = "dist"

[env.production.vars]
VITE_API_BASE_URL = "https://wave-analyzer-dashboard-api.metaversesherpa.workers.dev"
EOF

# Deploy to Cloudflare Pages
echo "Deploying to Cloudflare Pages..."
wrangler pages deploy dist

# Restore the original wrangler.toml
if [ -f wrangler.toml.backup ]; then
  mv wrangler.toml.backup wrangler.toml
fi

echo "Deployment completed!"