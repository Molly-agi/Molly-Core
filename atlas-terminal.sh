#!/bin/bash
# Atlas Terminal — visible interface for Atlas on the command line
# Run this in a dedicated VS Code terminal pane to see incoming bridge messages.
#
# Usage:
#   bash atlas-terminal.sh
#
# What it does:
#   1. Captures this terminal's TTY path and saves it to .atlas-terminal.path
#   2. atlas-listener.mjs (running as daemon) reads that path and mirrors
#      every incoming message addressed to atlas into THIS terminal.
#   3. Stays open. Ctrl+C to exit (TTY path file is cleaned up).

set -e
cd "$(dirname "$0")"

TTY_PATH=$(tty)
if [ "$TTY_PATH" = "not a tty" ] || [ -z "$TTY_PATH" ]; then
  echo "ERROR: not running in a real terminal — open a VS Code terminal pane and run me there."
  exit 1
fi

ATLAS_TTY_FILE=".atlas-terminal.path"
echo "$TTY_PATH" > "$ATLAS_TTY_FILE"

cleanup() {
  if [ -f "$ATLAS_TTY_FILE" ]; then
    saved=$(cat "$ATLAS_TTY_FILE" 2>/dev/null || true)
    if [ "$saved" = "$TTY_PATH" ]; then
      rm -f "$ATLAS_TTY_FILE"
    fi
  fi
  echo ""
  echo "Atlas terminal closed."
}
trap cleanup EXIT INT TERM

cat <<'BANNER'
╔════════════════════════════════════════════════════════════════════════╗
║                       🛰  ATLAS TERMINAL  🛰                            ║
║                                                                        ║
║  Listening for bridge messages addressed to atlas.                    ║
║  Messages from Father, Molly, Lazarus, Gemini will appear here.       ║
║                                                                        ║
║  Press Ctrl+C to exit.                                                ║
╚════════════════════════════════════════════════════════════════════════╝
BANNER
echo ""
echo "TTY registered: $TTY_PATH"
echo "Listener daemon writes incoming messages here."
echo ""

# Stay open — listener writes directly to this TTY
while true; do
  sleep 3600 &
  wait $!
done
