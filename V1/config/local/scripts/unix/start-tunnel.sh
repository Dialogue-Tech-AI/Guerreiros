#!/bin/bash

# Cloudflare Tunnel Start Script
echo "🚀 Starting Cloudflare Tunnel for Altese Autopeças..."

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared not found. Please install it first."
    echo "Visit: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    exit 1
fi

# Check if config exists (prefer cloudflare-tunnel-config.yaml)
CONFIG="../../dependencies/cloudflare-tunnel-config.yaml"
if [ ! -f "$CONFIG" ]; then
    CONFIG="../../dependencies/config.yaml"
fi
if [ ! -f "$CONFIG" ]; then
    echo "❌ Config not found. Please configure config/local/dependencies/cloudflare-tunnel-config.yaml first"
    exit 1
fi

# Check if applications are running
echo "🔍 Checking if applications are running..."

# Check backend
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "⚠️  Backend not running on port 3000"
    echo "Start it with: npm run dev"
fi

# Check frontend
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "⚠️  Frontend not running on port 5173"
    echo "Start it with: cd core/services/frontend && npm run dev"
fi

# Start tunnel
echo "🌐 Starting tunnel..."
cloudflared tunnel --config "$CONFIG" run altese-dev
