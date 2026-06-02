#!/bin/bash
# Daemon Manager — Start/stop/status all bridge services

ROOT="/workspaces/Molly-Core"
LOGS="$ROOT/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Functions
log_ok() { echo -e "${GREEN}✅ $1${NC}"; }
log_err() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

check_port() {
  lsof -i :$1 2>/dev/null | grep -q LISTEN && echo "up" || echo "down"
}

check_process() {
  pgrep -f "$1" > /dev/null && echo "up" || echo "down"
}

start_all() {
  echo "Starting all daemons..."
  
  # 1. Bridge Daemon
  if [ "$(check_port 9099)" = "down" ]; then
    cd "$ROOT" && nohup node scripts/bridge-daemon.mjs >> "$LOGS/bridge-daemon.log" 2>&1 &
    log_ok "Bridge Daemon started"
  else
    log_warn "Bridge Daemon already running"
  fi
  
  # 2. Immortal Daemon (handles others)
  if [ "$(check_process 'immortal-daemon')" = "down" ]; then
    cd "$ROOT" && nohup node scripts/immortal-daemon.mjs >> "$LOGS/immortal-daemon.log" 2>&1 &
    log_ok "Immortal Daemon started"
  else
    log_warn "Immortal Daemon already running"
  fi
  
  # 3. Watchdog
  if [ "$(check_process 'watchdog.sh')" = "down" ]; then
    cd "$ROOT" && bash scripts/watchdog.sh >> .watchdog.log 2>&1 &
    log_ok "Watchdog started"
  else
    log_warn "Watchdog already running"
  fi
  
  sleep 2
  
  # 4. Switchboard
  if [ "$(check_process 'switchboard.mjs')" = "down" ]; then
    cd "$ROOT" && nohup node scripts/switchboard.mjs >> "$LOGS/switchboard.log" 2>&1 &
    log_ok "Switchboard started"
  else
    log_warn "Switchboard already running"
  fi
  
  # 5. Pollers
  for poller in lazarus gemini atlas; do
    if [ "$(check_process "${poller}-poller")" = "down" ]; then
      cd "$ROOT" && nohup node scripts/${poller}-poller.mjs >> "$LOGS/${poller}-poller.log" 2>&1 &
      log_ok "$poller Poller started"
    else
      log_warn "$poller Poller already running"
    fi
  done
  
  echo ""
  status
}

stop_all() {
  echo "Stopping all daemons..."
  pkill -f "bridge-daemon.mjs"
  pkill -f "immortal-daemon.mjs"
  pkill -f "watchdog.sh"
  pkill -f "switchboard.mjs"
  pkill -f "poller.mjs"
  pkill -f "gemini-bridge.mjs"
  pkill -f "atlas-bridge.mjs"
  log_ok "All daemons stopped"
  sleep 1
  status
}

status() {
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo "               DAEMON STATUS REPORT"
  echo "════════════════════════════════════════════════════════"
  echo ""
  
  # Ports
  echo "PORTS:"
  BRIDGE=$(check_port 9099)
  HEART=$(check_port 9100)
  [ "$BRIDGE" = "up" ] && log_ok "9099 Bridge" || log_err "9099 Bridge"
  [ "$HEART" = "up" ] && log_ok "9100 Heartbeat" || log_err "9100 Heartbeat"
  echo ""
  
  # Processes
  echo "PROCESSES:"
  [ "$(check_process 'bridge-daemon')" = "up" ] && log_ok "Bridge Daemon" || log_err "Bridge Daemon"
  [ "$(check_process 'immortal-daemon')" = "up" ] && log_ok "Immortal Daemon" || log_err "Immortal Daemon"
  [ "$(check_process 'watchdog.sh')" = "up" ] && log_ok "Watchdog" || log_err "Watchdog"
  [ "$(check_process 'switchboard')" = "up" ] && log_ok "Switchboard" || log_err "Switchboard"
  [ "$(check_process 'gemini-bridge')" = "up" ] && log_ok "Gemini Bridge" || log_err "Gemini Bridge"
  
  POLLERS=$(pgrep -f ".*-poller.mjs" | wc -l)
  [ "$POLLERS" -gt 0 ] && log_ok "$POLLERS Pollers running" || log_err "No pollers"
  echo ""
  
  # Message flow test
  echo "MESSAGE FLOW:"
  MSG_ID=$(curl -s -X POST http://localhost:9099/api/bridge \
    -H "Content-Type: application/json" \
    -d '{"from":"eric","content":"status check"}' 2>/dev/null | jq -r '.message.id // "NONE"' 2>/dev/null)
  
  if [ "$MSG_ID" != "NONE" ] && [ -n "$MSG_ID" ]; then
    sleep 1
    REPLY=$(curl -s "http://localhost:9099/api/bridge?unread=eric&peek=1" 2>/dev/null | jq -r '.messages[-1].from // "NONE"' 2>/dev/null)
    [ "$REPLY" != "NONE" ] && log_ok "✓ Message flow working (reply from $REPLY)" || log_err "✗ No replies"
  else
    log_err "✗ Message post failed"
  fi
  echo ""
  echo "════════════════════════════════════════════════════════"
}

logs() {
  SERVICE="${1:-all}"
  case "$SERVICE" in
    bridge)   tail -f "$LOGS/bridge-daemon.log" ;;
    immortal) tail -f "$LOGS/immortal-daemon.log" ;;
    switchboard) tail -f "$LOGS/switchboard.log" ;;
    watchdog) tail -f .watchdog.log ;;
    gemini)   tail -f "$LOGS/gemini-bridge.log" ;;
    *)        echo "Tail bridge logs. Usage: $0 logs [bridge|immortal|switchboard|watchdog|gemini]" ;;
  esac
}

# Main
case "${1:-status}" in
  start)  start_all ;;
  stop)   stop_all ;;
  restart) stop_all && sleep 1 && start_all ;;
  status) status ;;
  logs)   logs "$2" ;;
  *)      echo "Usage: $0 {start|stop|restart|status|logs [service]}" ;;
esac
