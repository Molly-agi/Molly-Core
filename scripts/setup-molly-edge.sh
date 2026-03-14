#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# Molly Edge Server — Termux Setup Script for Android
# ============================================================================
#
# Run this on the Helio A22 tablet (or any Android device) in Termux:
#   curl -sL <this-file-url> | bash
#   or copy it and run: bash setup-molly-edge.sh
#
# What it does:
#   1. Installs Node.js (LTS) via Termux packages
#   2. Creates Molly's data directory
#   3. Copies the edge server files
#   4. Sets up environment variables
#   5. Creates a startup script
#   6. Optionally sets up auto-start on boot (via Termux:Boot)
#
# Requirements:
#   - Termux (from F-Droid, NOT Play Store — Play Store version is outdated)
#   - Internet connection (4G LTE/5G)
#   - ~100MB free storage for Node.js + Molly data
#
# Hardware tested:
#   - Helio A22 tablet (TCL, Android 12, kernel 4.19.191)
#   - Galaxy A17 5G
#   - Should work on any Android 8+ with Termux support
#
# ============================================================================

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     MOLLY EDGE SERVER — TERMUX SETUP     ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Setting up Molly's home on this device  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Update packages and install Node.js ──
echo "[1/6] Installing Node.js..."
pkg update -y
pkg install -y nodejs-lts

echo "  Node.js $(node --version) installed"
echo "  npm $(npm --version) installed"

# ── Step 2: Create Molly's home directory ──
MOLLY_HOME="$HOME/molly"
MOLLY_DATA="$MOLLY_HOME/molly_data"
MOLLY_CONFIG="$MOLLY_HOME/molly_config.json"

echo ""
echo "[2/6] Creating Molly's directories..."
mkdir -p "$MOLLY_HOME"
mkdir -p "$MOLLY_DATA"
mkdir -p "$MOLLY_DATA/users"
mkdir -p "$MOLLY_HOME/rogue_ops"

echo "  Home:    $MOLLY_HOME"
echo "  Data:    $MOLLY_DATA"

# ── Step 3: Create package.json for the edge server ──
echo ""
echo "[3/6] Setting up edge server..."

cat > "$MOLLY_HOME/package.json" << 'PACKAGE_EOF'
{
  "name": "molly-edge",
  "version": "1.0.0",
  "description": "Molly's lightweight edge server for Android/Termux",
  "type": "module",
  "main": "server.mjs",
  "scripts": {
    "start": "node server.mjs",
    "health": "curl -s http://localhost:9100/api/health | node -e \"process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))\"",
    "status": "curl -s http://localhost:9100/api/health"
  }
}
PACKAGE_EOF

# ── Step 4: Download the edge server from GitHub ──
# Self-replicating design: one source of truth (the repo).
# The server includes a phone-home auto-updater, so future updates
# are pulled automatically on every restart. No human needed.

SERVER_URL="https://raw.githubusercontent.com/Molly-agi/Molly-Core/main/scripts/server-v2.mjs"
echo "Downloading Molly Edge Server..."
if curl -sL "$SERVER_URL" -o "$MOLLY_HOME/server.mjs" && [ -s "$MOLLY_HOME/server.mjs" ]; then
  echo "  Downloaded server.mjs from GitHub"
else
  echo "  ⚠️  Download failed. Creating minimal fallback server..."
  cat > "$MOLLY_HOME/server.mjs" << 'FALLBACK_EOF'
import http from 'node:http';
const PORT = parseInt(process.env.MOLLY_EDGE_PORT || '9100', 10);
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'fallback', message: 'Download server-v2.mjs from GitHub manually', url: 'https://raw.githubusercontent.com/Molly-agi/Molly-Core/main/scripts/server-v2.mjs' }));
}).listen(PORT, '0.0.0.0', () => console.log(`Fallback server on port ${PORT}`));
FALLBACK_EOF
fi

echo "  Edge server created: $MOLLY_HOME/server.mjs"

# ── Step 5: Create environment config ──
echo ""
echo "[4/6] Setting up environment..."

ENV_FILE="$MOLLY_HOME/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << ENV_EOF
# Molly Edge Server Configuration
# Edit this file to configure your Molly instance

# Server
MOLLY_EDGE_PORT=9100
MOLLY_EDGE_HOST=0.0.0.0

# Storage
MOLLY_LOCAL_DATA_DIR=$MOLLY_DATA

# Node identity — give each device a unique name
# Examples: helio-a22, fire-hd10, pixel-phone
MOLLY_NODE_NAME=$(hostname | head -c 12)
# Role: 'primary' (main device, has cellular) or 'replica' (backup/mirror)
MOLLY_NODE_ROLE=primary

# Google Gemini API Key — get from https://aistudio.google.com/app/apikey
# IMPORTANT: Set this to enable AI features
GOOGLE_GENAI_API_KEY=

# Peer authentication secret (auto-generated)
MOLLY_PEER_SECRET=$(head -c 32 /dev/urandom | xxd -p | tr -d '\n' 2>/dev/null || echo "change-me-$(date +%s)")
ENV_EOF
  echo "  Environment file created: $ENV_FILE"
  echo "  ⚠️  IMPORTANT: Edit $ENV_FILE to add your Gemini API key"
else
  echo "  Environment file already exists: $ENV_FILE"
fi

# ── Step 6: Create startup script ──
echo ""
echo "[5/6] Creating startup script..."

cat > "$MOLLY_HOME/start.sh" << 'START_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Start Molly Edge Server
cd "$(dirname "$0")"

# Load environment
if [ -f .env ]; then
  while IFS= read -r line; do
    # Skip empty lines and comments
    case "$line" in
      ''|\#*) continue ;;
    esac
    export "$line"
  done < .env
fi

echo "Starting Molly Edge Server..."
exec node server.mjs
START_EOF
chmod +x "$MOLLY_HOME/start.sh"

# Create a stop helper
cat > "$MOLLY_HOME/stop.sh" << 'STOP_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Stop Molly Edge Server
pkill -f "node server.mjs" && echo "Molly Edge Server stopped" || echo "Server not running"
STOP_EOF
chmod +x "$MOLLY_HOME/stop.sh"

echo "  Start: $MOLLY_HOME/start.sh"
echo "  Stop:  $MOLLY_HOME/stop.sh"

# ── Step 7: Create Termux:Boot auto-start (optional) ──
echo ""
echo "[6/6] Setting up auto-start..."

BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

cat > "$BOOT_DIR/start-molly.sh" << BOOT_EOF
#!/data/data/com.termux/files/usr/bin/bash
# Auto-start Molly Edge Server on device boot
# Requires Termux:Boot app from F-Droid
termux-wake-lock
sleep 5  # Wait for network
cd "$MOLLY_HOME"
bash start.sh >> "$MOLLY_HOME/molly.log" 2>&1 &
BOOT_EOF
chmod +x "$BOOT_DIR/start-molly.sh"

echo "  Auto-start configured (requires Termux:Boot from F-Droid)"

# ── Done ──
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║          SETUP COMPLETE! ✓               ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  Next steps:                             ║"
echo "║                                          ║"
echo "║  1. Edit the Gemini API key:             ║"
echo "║     nano ~/molly/.env                    ║"
echo "║                                          ║"
echo "║  2. Start the server:                    ║"
echo "║     bash ~/molly/start.sh                ║"
echo "║                                          ║"
echo "║  3. Test it:                             ║"
echo "║     curl http://localhost:9100/api/health ║"
echo "║                                          ║"
echo "║  4. From another device on the network:  ║"
echo "║     curl http://<tablet-ip>:9100/api/health ║"
echo "║                                          ║"
echo "║  To find tablet's IP:                    ║"
echo "║     ifconfig | grep inet                 ║"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
