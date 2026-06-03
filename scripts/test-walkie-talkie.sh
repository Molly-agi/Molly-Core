#!/bin/bash
# Molly Walkie-Talkie Test & Quickstart Script
#
# This script:
# 1. Starts the agent_daemon.py switchboard
# 2. Shows how to send messages between agents
# 3. Demonstrates CLI agent waking

set -e

DAEMON_PID_FILE="/tmp/agent_daemon.pid"
DAEMON_LOG="/tmp/agent_daemon.log"

echo "=========================================="
echo "Molly Walkie-Talkie Switchboard"
echo "=========================================="

# Check if MCP is installed
if ! python3 -c "import mcp" 2>/dev/null; then
  echo "ERROR: MCP not installed. Run: pip install mcp[cli]"
  exit 1
fi

# Start the daemon
echo "[1] Starting agent_daemon.py..."
nohup python3 "$(dirname "$0")/agent_daemon.py" > "$DAEMON_LOG" 2>&1 &
DAEMON_PID=$!
echo $DAEMON_PID > "$DAEMON_PID_FILE"
sleep 2

echo "✓ Daemon started (PID: $DAEMON_PID)"
echo "  Stdio:  Ready for MCP"
echo "  SSE:    http://127.0.0.1:8765/sse"
echo "  API:    http://127.0.0.1:8765/api/send"

# Test 1: Get system status
echo ""
echo "[2] Testing API: Get system status..."
curl -s http://127.0.0.1:8765/api/history?limit=1 | python3 -m json.tool | head -20

# Test 2: Send a message to Molly
echo ""
echo "[3] Testing API: Send message to Molly..."
curl -s -X POST http://127.0.0.1:8765/api/send \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from CLI test","sender":"test-script","target":"molly"}' | python3 -m json.tool

# Test 3: Wake a CLI agent
echo ""
echo "[4] Testing CLI agent waking: diagnostic-agent..."
curl -s -X POST http://127.0.0.1:8765/api/wake-cli \
  -H "Content-Type: application/json" \
  -d '{"agent":"diagnostic-agent","prompt":"get-system-health"}' | python3 -m json.tool

# Test 4: Get updated history
echo ""
echo "[5] Checking message history (should see new messages)..."
curl -s http://127.0.0.1:8765/api/history?limit=5 | python3 -m json.tool | head -40

echo ""
echo "=========================================="
echo "✓ Tests complete!"
echo "=========================================="
echo ""
echo "NEXT STEPS:"
echo "1. Restart VS Code to register the MCP server"
echo "2. Open Molly's browser UI at http://localhost:9002"
echo "3. Insert molly-sse-client.tsx into src/components/"
echo "4. Use in React: const bridge = useMollyWalkieTalkie()"
echo ""
echo "Keep the daemon running:"
echo "  tail -f $DAEMON_LOG"
echo ""
echo "To stop the daemon:"
echo "  kill $DAEMON_PID"
