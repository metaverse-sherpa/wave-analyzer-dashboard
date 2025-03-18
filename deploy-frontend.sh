#!/bin/bash
set -e  # Exit on error

echo "Building frontend with optimizations..."
npm run build

# Create a _routes.json file for SPA routing in the dist folder
cat > dist/_routes.json << EOF
{
  "version": 1,
  "include": ["/*"],
  "exclude": [
    "/assets/*",
    "/images/*",
    "/*.ico",
    "/*.svg",
    "/*.png"
  ]
}
EOF

# Backup existing wrangler.toml if it exists
if [ -f wrangler.toml ]; then
  mv wrangler.toml wrangler.toml.bak
fi

# Create wrangler.toml file for Pages deployment
cat > wrangler.toml << EOF
name = "wave-analyzer-dashboard"
compatibility_date = "2023-10-30"
pages_build_output_dir = "dist"

[env.production.vars]
VITE_API_BASE_URL = "https://api-backend.metaversesherpa.workers.dev"
EOF

# Deploy to Cloudflare Pages
echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name wave-analyzer-dashboard --commit-dirty=true

# Restore original wrangler.toml
if [ -f wrangler.toml.bak ]; then
  mv wrangler.toml.bak wrangler.toml
else
  rm wrangler.toml
fi

echo "Deployment complete!"