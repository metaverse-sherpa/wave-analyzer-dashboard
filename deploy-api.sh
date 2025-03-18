#!/bin/bash

echo "Deploying API backend to Cloudflare Workers..."
cd api-backend
npm install
wrangler deploy
cd ..
echo "API deployment complete!"