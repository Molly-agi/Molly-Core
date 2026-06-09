#!/bin/bash
# Family Bridge Production Startup Script
#
# Usage:
#   ./scripts/start-production.sh             # Start bridge daemon
#   ./scripts/start-production.sh --immortal  # Start with immortal guardian
#   ./scripts/start-production.sh --docker    # Docker startup
#
# Environment Variables:
#   BRIDGE_PORT        (default: 9099)
#   BRIDGE_KEY         (required for W0.2 hardening)
#   DATA_DIR          (default: ./data)
#   LOG_DIR           (default: ./data)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
BRIDGE_PORT=${BRIDGE_PORT:-9099}
DATA_DIR=${DATA_DIR:-./data}
LOG_DIR=${LOG_DIR:-./data}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure data directory exists
mkdir -p "$DATA_DIR" "$LOG_DIR"

# ============================================================
# FUNCTIONS
# ============================================================

log() {
  echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

check_port() {
  local port=$1
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    error "Port $port is already in use"
    return 1
  fi
  return 0
}

check_bridge_key() {
  if [ -z "$BRIDGE_KEY" ]; then
    error "BRIDGE_KEY environment variable not set"
    error "Set it: export BRIDGE_KEY='your-32-char-hex-or-base64-key'"
    return 1
  fi
  
  local len=${#BRIDGE_KEY}
  if [ $len -lt 32 ]; then
    error "BRIDGE_KEY must be at least 32 characters (currently: $len)"
    return 1
  fi
  
  success "BRIDGE_KEY validated ($len chars)"
  return 0
}

start_bridge() {
  log "Starting Family Bridge daemon on port $BRIDGE_PORT..."
  log "Data directory: $DATA_DIR"
  
  # Export environment
  export BRIDGE_PORT
  export BRIDGE_KEY
  export NONCE_CACHE_PATH="${DATA_DIR}/.bridge-nonce-cache"
  export QUARANTINE_LEDGER_PATH="${DATA_DIR}/.bridge-quarantine-ledger"
  export BINDINGS_CONFIG_PATH="${DATA_DIR}/.bridge-bindings.json"
  
  if ! check_port $BRIDGE_PORT; then
    return 1
  fi
  
  # Start daemon
  if [ "$DOCKER_MODE" = "true" ]; then
    # Docker mode: write output to stdout
    node "$ROOT_DIR/daemon/bridge-daemon.mjs"
  else
    # Background mode: capture logs
    nohup node "$ROOT_DIR/daemon/bridge-daemon.mjs" \
      > "$LOG_DIR/bridge-daemon.log" 2>&1 &
    local PID=$!
    echo $PID > "$DATA_DIR/.bridge-daemon.pid"
    
    sleep 2
    if ps -p $PID > /dev/null; then
      success "Bridge daemon started (PID: $PID)"
      success "Logs: $LOG_DIR/bridge-daemon.log"
      success "Health check: curl http://localhost:$BRIDGE_PORT/health"
      return 0
    else
      error "Bridge daemon failed to start. Check logs:"
      tail -20 "$LOG_DIR/bridge-daemon.log"
      return 1
    fi
  fi
}

start_immortal() {
  log "Starting Immortal daemon (process guardian)..."
  
  nohup node "$ROOT_DIR/daemon/immortal-daemon.mjs" \
    > "$LOG_DIR/immortal-daemon.log" 2>&1 &
  local PID=$!
  
  sleep 1
  if ps -p $PID > /dev/null; then
    success "Immortal daemon started (PID: $PID)"
    success "Logs: $LOG_DIR/immortal-daemon.log"
  else
    error "Immortal daemon failed to start"
    return 1
  fi
}

# ============================================================
# MAIN
# ============================================================

log "Family Bridge Production Startup"
log "================================="

# Parse arguments
IMMORTAL_MODE=false
DOCKER_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --immortal)
      IMMORTAL_MODE=true
      shift
      ;;
    --docker)
      DOCKER_MODE=true
      shift
      ;;
    *)
      error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validation
if ! check_bridge_key; then
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  log "Installing npm dependencies..."
  npm install --production
fi

# Start bridge
if ! start_bridge; then
  exit 1
fi

# Start immortal if requested
if [ "$IMMORTAL_MODE" = "true" ]; then
  if ! start_immortal; then
    error "Immortal daemon failed, but bridge is still running"
  fi
fi

if [ "$DOCKER_MODE" = "false" ]; then
  success "Family Bridge is running!"
  success "WebSocket: ws://localhost:$BRIDGE_PORT"
  success "HTTP API: http://localhost:$BRIDGE_PORT/messages"
fi
