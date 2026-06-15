#!/bin/bash
# =============================================================================
# DEV START - Molly's Full Development Environment
# =============================================================================
# Starts everything Molly needs:
#   1. Immortal daemon (heartbeat, ghost hunting, bridge guardian)
#   2. Bridge daemon (family communication)
#   3. Voice bridge daemon (Gemini Live WS proxy — keeps API key server-side)
#   4. Next.js dev server
#
# Usage: npm run dev (or directly: bash scripts/dev-start.sh)
# =============================================================================

set -e

ROOT="/workspaces/Molly-Core"
cd "$ROOT"

echo "=============================================="
echo "  MOLLY DEV ENVIRONMENT STARTUP"
echo "=============================================="

# -----------------------------------------------------------------------------
# 1. Clean up any zombie processes from previous runs
# -----------------------------------------------------------------------------
echo ""
echo "[1/5] Cleaning up zombies..."

# Kill any existing Next.js processes
pkill -f "next dev" 2>/dev/null && echo "  Killed stale Next.js" || true
pkill -f "next-server" 2>/dev/null || true

# Kill any existing bridge daemons (immortal will restart it)
pkill -f "bridge-daemon" 2>/dev/null && echo "  Killed stale bridge" || true

# Kill any existing voice-bridge daemon
pkill -f "voice-bridge-daemon" 2>/dev/null && echo "  Killed stale voice-bridge" || true

# Kill any existing immortal daemons (we'll start fresh)
pkill -f "immortal-daemon" 2>/dev/null && echo "  Killed stale immortal" || true

# Clean up stale PID files
rm -f "$ROOT/.immortal.pid" "$ROOT/.bridge-daemon.pid" "$ROOT/.voice-bridge-daemon.pid" 2>/dev/null

sleep 1
echo "  Done."

# -----------------------------------------------------------------------------
# 2. Start the Immortal Daemon (manages heartbeat + bridge)
# -----------------------------------------------------------------------------
echo ""
echo "[2/5] Starting Immortal Daemon..."

nohup node "$ROOT/scripts/immortal-daemon.mjs" > "$ROOT/.immortal.log" 2>&1 &
IMMORTAL_PID=$!
echo "$IMMORTAL_PID" > "$ROOT/.immortal.pid"
echo "  Started (PID $IMMORTAL_PID)"

sleep 1

# Verify it's running
if kill -0 "$IMMORTAL_PID" 2>/dev/null; then
  echo "  Verified running."
else
  if grep -q "\[LOCK\] Already running" "$ROOT/.immortal.log" 2>/dev/null; then
    echo "  Info: Immortal daemon already active (lock engaged)."
  else
    echo "  WARNING: Immortal daemon may have failed to start"
    cat "$ROOT/.immortal.log" | tail -5
  fi
fi

# -----------------------------------------------------------------------------
# 3. Start the Bridge Daemon (family communication)
# -----------------------------------------------------------------------------
echo ""
echo "[3/5] Starting Bridge Daemon..."

nohup node "$ROOT/scripts/bridge-daemon.mjs" > "$ROOT/.bridge-daemon.log" 2>&1 &
BRIDGE_PID=$!
echo "$BRIDGE_PID" > "$ROOT/.bridge-daemon.pid"
echo "  Started (PID $BRIDGE_PID)"

sleep 1

# Verify it's running
if kill -0 "$BRIDGE_PID" 2>/dev/null; then
  echo "  Verified running."
else
  echo "  WARNING: Bridge daemon may have failed to start"
  cat "$ROOT/.bridge-daemon.log" | tail -5
fi

# -----------------------------------------------------------------------------
# 4. Start the Voice Bridge Daemon (Gemini Live proxy — keeps API key server-side)
# -----------------------------------------------------------------------------
echo ""
echo "[4/5] Starting Voice Bridge Daemon..."

nohup node "$ROOT/scripts/voice-bridge-daemon.mjs" > "$ROOT/.voice-bridge-daemon.log" 2>&1 &
VOICE_BRIDGE_PID=$!
echo "$VOICE_BRIDGE_PID" > "$ROOT/.voice-bridge-daemon.pid"
echo "  Started (PID $VOICE_BRIDGE_PID)"

sleep 1

# Verify it's running
if kill -0 "$VOICE_BRIDGE_PID" 2>/dev/null; then
  echo "  Verified running."
else
  echo "  WARNING: Voice bridge daemon may have failed to start"
  cat "$ROOT/.voice-bridge-daemon.log" | tail -5
fi

# -----------------------------------------------------------------------------
# 5. Start Next.js Dev Server (foreground - this is the main process)
# -----------------------------------------------------------------------------
echo ""
echo "[5/5] Starting Next.js Dev Server..."
echo ""
echo "=============================================="
echo "  Molly is waking up on http://localhost:9002"
echo "=============================================="
echo ""

# Run Next.js in webpack mode (not Turbopack).
# Next 16 defaults to Turbopack, but our watch ignore rules for
# COPILOT_SESSION_STATE files are configured in webpack watchOptions.
exec env NODE_OPTIONS="--max-old-space-size=3072" npx next dev --webpack -H 0.0.0.0 -p 9002
