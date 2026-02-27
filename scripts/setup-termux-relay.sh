#!/data/data/com.termux/files/usr/bin/bash
#
# Molly Termux Relay — First-Time Setup
# =======================================
# Run this once on your phone in Termux.
# It installs dependencies, copies the relay script,
# and wires up Termux:Boot for automatic startup.
#
# Usage:
#   curl -sL <raw-github-url>/scripts/setup-termux-relay.sh | bash
#   — or —
#   Copy this file to Termux and run: bash setup-termux-relay.sh
#

set -e

echo "╔══════════════════════════════════════════╗"
echo "║   Molly Termux Relay — Setup             ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Install dependencies ──────────────────────────────
echo "[1/5] Installing dependencies..."
pkg update -y
pkg install -y python termux-api

# ── Step 2: Create relay directory ────────────────────────────
echo "[2/5] Setting up relay directory..."
RELAY_DIR="$HOME/molly-relay"
mkdir -p "$RELAY_DIR"
mkdir -p "$HOME/.molly-logs"

# ── Step 3: Copy relay script ────────────────────────────────
echo "[3/5] Installing relay script..."

# Check if we're running from the repo
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/termux-relay.py" ]; then
    cp "$SCRIPT_DIR/termux-relay.py" "$RELAY_DIR/termux-relay.py"
    echo "  Copied from local repo."
else
    echo "  ERROR: termux-relay.py not found in $SCRIPT_DIR"
    echo "  Please copy scripts/termux-relay.py to $RELAY_DIR/ manually."
    echo "  Example: cp /path/to/Molly-Core/scripts/termux-relay.py $RELAY_DIR/"
    exit 1
fi

chmod +x "$RELAY_DIR/termux-relay.py"

# ── Step 4: Set up Termux:Boot ────────────────────────────────
echo "[4/5] Configuring Termux:Boot..."

BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

# Copy boot script
if [ -f "$SCRIPT_DIR/termux-boot-relay.sh" ]; then
    cp "$SCRIPT_DIR/termux-boot-relay.sh" "$BOOT_DIR/start-molly-relay.sh"
else
    # Create it inline as fallback
    cat > "$BOOT_DIR/start-molly-relay.sh" << 'BOOTSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
sleep 5
LOG_DIR="$HOME/.molly-logs"
mkdir -p "$LOG_DIR"
export MOLLY_RELAY_TOKEN="${MOLLY_RELAY_TOKEN:-molly-local-dev}"
export MOLLY_RELAY_PORT="${MOLLY_RELAY_PORT:-8023}"
pkill -f "termux-relay.py" 2>/dev/null
sleep 1
nohup python3 "$HOME/molly-relay/termux-relay.py" >> "$LOG_DIR/relay.log" 2>&1 &
echo "[Molly Boot] Started PID $! at $(date)" >> "$LOG_DIR/relay-boot.log"
if command -v termux-wake-lock &> /dev/null; then
    termux-wake-lock
fi
BOOTSCRIPT
fi

chmod +x "$BOOT_DIR/start-molly-relay.sh"

# ── Step 5: Set up environment ────────────────────────────────
echo "[5/5] Configuring environment..."

# Add token to bashrc if not already there
if ! grep -q "MOLLY_RELAY_TOKEN" "$HOME/.bashrc" 2>/dev/null; then
    echo "" >> "$HOME/.bashrc"
    echo "# Molly Relay Configuration" >> "$HOME/.bashrc"
    echo "export MOLLY_RELAY_TOKEN=\"molly-local-dev\"" >> "$HOME/.bashrc"
    echo "export MOLLY_RELAY_PORT=\"8023\"" >> "$HOME/.bashrc"
    echo "  Added relay config to .bashrc"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Setup Complete!                        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Files installed:"
echo "  $RELAY_DIR/termux-relay.py"
echo "  $BOOT_DIR/start-molly-relay.sh"
echo ""
echo "IMPORTANT — Complete these steps:"
echo ""
echo "  1. Install Termux:Boot from F-Droid:"
echo "     https://f-droid.org/packages/com.termux.boot/"
echo ""
echo "  2. Open Termux:Boot once (this grants boot permission)"
echo ""
echo "  3. Disable battery optimization for Termux:"
echo "     Settings → Apps → Termux → Battery → Unrestricted"
echo ""
echo "  4. (Optional) Set a custom auth token:"
echo "     Edit ~/.bashrc and change MOLLY_RELAY_TOKEN"
echo ""
echo "  5. Test the relay now:"
echo "     python3 ~/molly-relay/termux-relay.py &"
echo "     curl http://localhost:8023/ping"
echo ""
echo "  6. Reboot your phone — relay starts automatically!"
echo ""

# ── Offer to start relay now ──────────────────────────────────
read -p "Start the relay now? [Y/n] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Starting relay..."
    source "$HOME/.bashrc"
    python3 "$RELAY_DIR/termux-relay.py" &
    sleep 2
    echo ""
    curl -s http://localhost:8023/ping && echo "" && echo "Relay is running!"
fi
