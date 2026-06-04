#!/bin/bash

# Script to fix permissions and ownership on Hostinger (VPS or Shared)
# Usage: bash fix-permissions.sh

echo "🚀 Starting permissions fix..."

# Detect user (usually 'www-data' on Ubuntu/Debian or the account name on Shared)
CURRENT_USER=$(whoami)

echo "Setting ownership to $CURRENT_USER..."
chown -R $CURRENT_USER:$CURRENT_USER .

echo "Setting directory permissions to 755..."
find . -type d -exec chmod 755 {} \;

echo "Setting file permissions to 644..."
find . -type f -exec chmod 644 {} \;

# Ensure scripts are executable
echo "Ensuring shell scripts are executable..."
find . -name "*.sh" -exec chmod +x {} \;

# If node_modules exists, sometimes it needs extra care
if [ -d "node_modules" ]; then
    echo "Fixing node_modules permissions..."
    chmod -R 755 node_modules
fi

echo "✅ Permissions and ownership fixed successfully!"
