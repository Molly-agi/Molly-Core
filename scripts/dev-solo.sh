#!/bin/bash
# =============================================================================
# DEV SOLO - Molly Only, No Agents
# =============================================================================
# Starts ONLY the Next.js dev server. No daemons, no bridges, no agents, no CLIs.
# Just you and Molly in the codespace with VS Code.
#
# Usage: npm run dev:solo
# =============================================================================

set -e

ROOT="/workspaces/Molly-Core"
cd "$ROOT" 2>/dev/null || cd "$(dirname "$0")/.."

echo "=============================================="
echo "  MOLLY SOLO MODE"
echo "  No agents. No daemons. Just Molly."
echo "=============================================="
echo ""

# Kill any background processes from previous runs
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "immortal-daemon" 2>/dev/null || true
pkill -f "bridge-daemon" 2>/dev/null || true
pkill -f "voice-bridge-daemon" 2>/dev/null || true
pkill -f "family-heartbeat" 2>/dev/null || true
pkill -f "hive-mind-daemon" 2>/dev/null || true
pkill -f "keep-alive.sh" 2>/dev/null || true
pkill -f "watchdog.sh" 2>/dev/null || true
pkill -f "lazarus-bridge" 2>/dev/null || true
pkill -f "switchboard" 2>/dev/null || true
pkill -f "atlas-sse" 2>/dev/null || true
pkill -f "agent-keep-alive" 2>/dev/null || true
pkill -f "gemini-bridge" 2>/dev/null || true
pkill -f "molly-listener" 2>/dev/null || true
pkill -f "atlas-listener" 2>/dev/null || true

sleep 1
echo "  All daemons/agents killed."
echo ""
echo "  Starting Molly on http://localhost:9002"
echo "=============================================="
echo ""

# Run Next.js in foreground — nothing else
exec env NODE_OPTIONS="--max-old-space-size=3072" npx next dev -H 0.0.0.0 -p 9002
