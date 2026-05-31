#!/data/data/com.termux/files/usr/bin/bash
# Molly Relay v2.0 — One-Shot Installer
#
# OPTION 1 — From Molly's server (when running):
#   curl -sL https://<molly-url>/api/relay/install?format=installer | bash
#
# OPTION 2 — Direct script (this file must be accessible):
#   curl -sL <this-url> | bash
#
# That's it. It downloads everything, sets up auto-boot, and starts the relay.

set -e

echo ""
echo "  Molly Relay v2.0 — Installing..."
echo ""

# Install python + curl if missing
command -v curl >/dev/null 2>&1 || { pkg install -y curl; }
command -v python3 >/dev/null 2>&1 || { pkg install -y python; }

# Create directories
mkdir -p ~/molly-relay
mkdir -p ~/.molly-logs

# Download relay v2 script
echo "  Downloading relay v2..."
# Try Molly's server first, fall back to codespace URL
MOLLY_SERVER="${MOLLY_CORE_URL:-}"
if [ -n "$MOLLY_SERVER" ]; then
  curl -sL -o ~/molly-relay/termux-relay.py \
    "${MOLLY_SERVER}/api/relay/install" && echo "  Downloaded from Molly's server"
else
  echo "  Set MOLLY_CORE_URL to download automatically."
  echo "  Example: export MOLLY_CORE_URL=https://your-molly-app.web.app"
  exit 1
fi
chmod +x ~/molly-relay/termux-relay.py

# Set up Termux:Boot auto-start
echo "  Setting up auto-start..."
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

cat > "$BOOT_DIR/start-molly-relay.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
sleep 5
mkdir -p ~/.molly-logs
export MOLLY_RELAY_TOKEN="${MOLLY_RELAY_TOKEN:-molly-local-dev}"
export MOLLY_RELAY_PORT="${MOLLY_RELAY_PORT:-8023}"
pkill -f "termux-relay.py" 2>/dev/null
sleep 1
nohup python3 ~/molly-relay/termux-relay.py >> ~/.molly-logs/relay.log 2>&1 &
echo "Started PID $! at $(date)" >> ~/.molly-logs/relay-boot.log
command -v termux-wake-lock &>/dev/null && termux-wake-lock
EOF
chmod +x "$BOOT_DIR/start-molly-relay.sh"

# Add env to bashrc if not there
if ! grep -q "MOLLY_RELAY_TOKEN" ~/.bashrc 2>/dev/null; then
  echo "" >> ~/.bashrc
  echo "export MOLLY_RELAY_TOKEN=\"molly-local-dev\"" >> ~/.bashrc
  echo "export MOLLY_RELAY_PORT=\"8023\"" >> ~/.bashrc
fi

# Kill any old relay
pkill -f "termux-relay.py" 2>/dev/null || true
sleep 1

# Start relay now
echo "  Starting relay..."
nohup python3 ~/molly-relay/termux-relay.py >> ~/.molly-logs/relay.log 2>&1 &
RELAY_PID=$!
sleep 2

# Verify
if kill -0 $RELAY_PID 2>/dev/null; then
  echo ""
  echo "  DONE! Relay v2.0 running on port 8023 (PID $RELAY_PID)"
  echo ""
  echo "  Features: Peer Protocol, HMAC-SHA256 auth, command safety"
  echo "  Auto-starts on boot (install Termux:Boot from F-Droid)"
  echo "  Disable battery optimization for Termux in Android settings"
  echo ""
else
  echo ""
  echo "  ERROR: Relay failed to start. Check ~/.molly-logs/relay.log"
  echo ""
fi
