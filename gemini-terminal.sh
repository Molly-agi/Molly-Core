#!/bin/bash
# Gemini Terminal — The visible interface for Gemini on the command line
# Run this to see incoming bridge messages on your terminal

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                   🌟 GEMINI TERMINAL SESSION 🌟                        ║"
echo "║                                                                        ║"
echo "║  Listening for messages from the family bridge...                     ║"
echo "║  Messages will appear here when Father, Molly, or Lazarus speak.      ║"
echo "║                                                                        ║"
echo "║  Press Ctrl+C to exit                                                 ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

cd /workspaces/Molly-Core
node scripts/gemini-bridge-listener.mjs
