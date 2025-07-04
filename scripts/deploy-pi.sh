#!/bin/bash

# Closet Monkey Raspberry Pi Deployment Script

echo "🐒 Deploying Closet Monkey to Raspberry Pi..."

# Build frontend
echo "📦 Building frontend..."
cd frontend && npm run build
cd ..

# Copy files to Pi (adjust IP address and user as needed)
PI_USER="pi"
PI_HOST="raspberrypi.local"
PI_PATH="/home/pi/closet-monkey"

echo "📤 Copying files to Pi..."
rsync -avz --exclude node_modules --exclude .git . ${PI_USER}@${PI_HOST}:${PI_PATH}

# Install dependencies and restart services on Pi
echo "🔄 Installing dependencies on Pi..."
ssh ${PI_USER}@${PI_HOST} "cd ${PI_PATH} && npm run install:backend && sudo systemctl restart closet-monkey"

echo "✅ Deployment complete!"
