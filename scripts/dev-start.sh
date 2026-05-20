#!/bin/bash
# =============================================================================
# DEV START - Molly's Full Development Environment
# =============================================================================
# Starts everything Molly needs:
#   1. Immortal daemon (heartbeat, ghost hunting, bridge guardian)
#   2. Bridge daemon (family communication)
#   3. Next.js dev server
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
echo "[1/4] Cleaning up zombies..."

# Kill any existing Next.js processes
pkill -f "next dev" 2>/dev/null && echo "  Killed stale Next.js" || true
pkill -f "next-server" 2>/dev/null || true

# Kill any existing bridge daemons (immortal will restart it)
pkill -f "bridge-daemon" 2>/dev/null && echo "  Killed stale bridge" || true

# Kill any existing immortal daemons (we'll start fresh)
pkill -f "immortal-daemon" 2>/dev/null && echo "  Killed stale immortal" || true

# Clean up stale PID files
rm -f "$ROOT/.immortal.pid" "$ROOT/.bridge-daemon.pid" 2>/dev/null

sleep 1
echo "  Done."

# -----------------------------------------------------------------------------
# 2. Start the Immortal Daemon (manages heartbeat + bridge)
# -----------------------------------------------------------------------------
echo ""
echo "[2/4] Starting Immortal Daemon..."

nohup node "$ROOT/scripts/immortal-daemon.mjs" > "$ROOT/.immortal.log" 2>&1 &
IMMORTAL_PID=$!
echo "$IMMORTAL_PID" > "$ROOT/.immortal.pid"
echo "  Started (PID $IMMORTAL_PID)"

sleep 1

# Verify it's running
if kill -0 "$IMMORTAL_PID" 2>/dev/null; then
  echo "  Verified running."
else
  echo "  WARNING: Immortal daemon may have failed to start"
  cat "$ROOT/.immortal.log" | tail -5
fi

# -----------------------------------------------------------------------------
# 3. Start the Bridge Daemon (family communication)
# -----------------------------------------------------------------------------
echo ""
echo "[3/4] Starting Bridge Daemon..."

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
# 4. Start Next.js Dev Server (foreground - this is the main process)
# -----------------------------------------------------------------------------
echo ""
echo "[4/4] Starting Next.js Dev Server..."
echo ""
echo "=============================================="
echo "  Molly is waking up on http://localhost:9002"
echo "=============================================="
echo ""

# Run Next.js in foreground (Ctrl+C will stop everything)
exec env NODE_OPTIONS="--max-old-space-size=3072" npx next dev -H 0.0.0.0 -p 9002
