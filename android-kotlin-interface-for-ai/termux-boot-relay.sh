#!/data/data/com.termux/files/usr/bin/bash
#
# Molly Termux Relay — Auto-start on boot
# =========================================
# Place this file in ~/.termux/boot/
# Requires Termux:Boot app installed from F-Droid.
#
# On device boot, Termux:Boot runs all scripts in ~/.termux/boot/
# This starts the relay server so Molly's browser can connect
# immediately — zero manual steps.
#
# Setup:
#   1. Install Termux:Boot from F-Droid
#   2. Open Termux:Boot once (grants boot permission)
#   3. Run: bash setup-termux-relay.sh
#   4. Reboot phone — relay starts automatically
#

# Wait for network to come up
sleep 5

# Ensure Python is available
if ! command -v python3 &> /dev/null; then
    echo "[Molly Boot] Python3 not found. Run setup-termux-relay.sh first."
    exit 1
fi

# Start the relay in the background with a log file
LOG_DIR="$HOME/.molly-logs"
mkdir -p "$LOG_DIR"

export MOLLY_RELAY_TOKEN="${MOLLY_RELAY_TOKEN:-molly-local-dev}"
export MOLLY_RELAY_PORT="${MOLLY_RELAY_PORT:-8023}"

echo "[Molly Boot] Starting relay on port $MOLLY_RELAY_PORT at $(date)" >> "$LOG_DIR/relay-boot.log"

# Kill any existing relay first
pkill -f "termux-relay.py" 2>/dev/null
sleep 1

# Start relay in background
nohup python3 "$HOME/molly-relay/termux-relay.py" \
    >> "$LOG_DIR/relay.log" 2>&1 &

echo "[Molly Boot] Relay PID: $!" >> "$LOG_DIR/relay-boot.log"
echo "[Molly Boot] Relay started successfully." >> "$LOG_DIR/relay-boot.log"

# Optional: acquire a wakelock so the relay survives doze mode
if command -v termux-wake-lock &> /dev/null; then
    termux-wake-lock
    echo "[Molly Boot] Wake lock acquired." >> "$LOG_DIR/relay-boot.log"
fi
