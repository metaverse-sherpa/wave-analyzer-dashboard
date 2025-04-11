#!/bin/bash
set -e  # Exit on error

# Check if a token is provided
if [ -z "$1" ]; then
  echo "Error: Bot token is required"
  echo "Usage: $0 <BOT_TOKEN>"
  exit 1
else
  BOT_TOKEN=$1
fi

echo "Setting up Telegram bot commands menu..."

# Define the commands that will appear in the menu
# Format: command (without slash) and description
COMMANDS='[
  {"command":"start","description":"Start using Wave Analyzer Bot"},
  {"command":"analyze","description":"Open the Wave Analyzer Mini App"},
  {"command":"market","description":"Get current market overview"},
  {"command":"symbol","description":"Get analysis for a specific stock symbol"},
  {"command":"version","description":"Display the current app version"},
  {"command":"help","description":"Show the help message"}
]'

# Set the commands using the Telegram Bot API
echo "Setting bot commands..."
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setMyCommands" \
  -H "Content-Type: application/json" \
  -d "{\"commands\": $COMMANDS}")

echo "Response: $RESPONSE"

# Verify the commands were set correctly
echo "Verifying commands..."
COMMANDS_INFO=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getMyCommands")
echo "Commands info: $COMMANDS_INFO"

echo -e "\nDone! Bot commands menu has been configured."