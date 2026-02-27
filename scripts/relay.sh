#!/data/data/com.termux/files/usr/bin/bash
#
# Molly Relay — Process Manager
# ==============================
# Controls the relay process without requiring a reboot.
#
# Usage:
#   relay.sh start   — Start the relay
#   relay.sh stop    — Stop the relay
#   relay.sh restart — Restart the relay
#   relay.sh status  — Check if relay is running
#   relay.sh logs    — Tail the relay log
#

RELAY_SCRIPT="$HOME/molly-relay/termux-relay.py"
LOG_DIR="$HOME/.molly-logs"
LOG_FILE="$LOG_DIR/relay.log"

export MOLLY_RELAY_TOKEN="${MOLLY_RELAY_TOKEN:-molly-local-dev}"
export MOLLY_RELAY_PORT="${MOLLY_RELAY_PORT:-8023}"

relay_pid() {
    pgrep -f "termux-relay.py" 2>/dev/null
}

case "${1:-status}" in
    start)
        PID=$(relay_pid)
        if [ -n "$PID" ]; then
            echo "Relay already running (PID $PID)"
            exit 0
        fi
        mkdir -p "$LOG_DIR"
        nohup python3 "$RELAY_SCRIPT" >> "$LOG_FILE" 2>&1 &
        sleep 1
        PID=$(relay_pid)
        if [ -n "$PID" ]; then
            echo "Relay started (PID $PID) on port $MOLLY_RELAY_PORT"
        else
            echo "Failed to start relay. Check $LOG_FILE"
            exit 1
        fi
        ;;
    stop)
        PID=$(relay_pid)
        if [ -z "$PID" ]; then
            echo "Relay is not running."
            exit 0
        fi
        kill "$PID" 2>/dev/null
        sleep 1
        if [ -z "$(relay_pid)" ]; then
            echo "Relay stopped."
        else
            kill -9 "$PID" 2>/dev/null
            echo "Relay force-stopped."
        fi
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        PID=$(relay_pid)
        if [ -n "$PID" ]; then
            echo "Relay is running (PID $PID)"
            curl -s "http://localhost:$MOLLY_RELAY_PORT/ping" && echo ""
        else
            echo "Relay is not running."
        fi
        ;;
    logs)
        if [ -f "$LOG_FILE" ]; then
            tail -50 "$LOG_FILE"
        else
            echo "No log file found."
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
