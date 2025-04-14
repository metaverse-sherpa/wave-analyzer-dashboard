#!/bin/bash
# Script to help convert Telegram bot message formats from Markdown to HTML

# This script provides guidance on what changes are needed in your API backend
# to update the message format from Markdown to HTML

echo "=== Telegram Message Format Update Guide ==="
echo ""
echo "Since we changed the sendTelegramMessage function to use HTML formatting"
echo "instead of Markdown, you'll need to update all message formats in your code."
echo ""
echo "Here's how to convert your message formats:"
echo ""
echo "1. Markdown to HTML conversion:"
echo "   * Bold:      *text* → <b>text</b>"
echo "   * Italic:    _text_ → <i>text</i>"
echo "   * Code:      \`text\` → <code>text</code>"
echo "   * Links:     [text](URL) → <a href=\"URL\">text</a>"
echo ""
echo "2. Common patterns to update in your code:"
echo "   - Change: 📈 *Market Overview* → 📈 <b>Market Overview</b>"
echo "   - Change: *${symbol}* → <b>${symbol}</b>"
echo ""
echo "3. Important notes:"
echo "   - HTML special characters (<, >, &) don't need to be escaped in regular text"
echo "   - The Telegram API handles this automatically"
echo "   - You can use all standard HTML tags: <b>, <i>, <u>, <s>, <code>, <pre>, <a href=>"
echo ""
echo "4. Example of updated message format:"
echo "   Before: const message = \`📊 *${symbol}* Analysis\\n\\n${analysis}\`;"
echo "   After:  const message = \`📊 <b>${symbol}</b> Analysis\\n\\n${analysis}\`;"
echo ""
echo "Remember to update all message formatting in your worker.js file."
echo "This includes command handlers for /start, /help, /symbol, /market, etc."
echo ""

# Make the script executable
chmod +x "$0"

echo "This script is now executable. Run it anytime you need this reference."