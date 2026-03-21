import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'node:path';

/**
 * GET /api/relay/install
 *
 * Serves the Termux relay script for download.
 * Eric can run this from Termux:
 *   curl -sL https://<molly-url>/api/relay/install -o ~/molly-relay/termux-relay.py
 *
 * Or with the installer:
 *   curl -sL https://<molly-url>/api/relay/install?format=installer | bash
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get('format');

  if (format === 'installer') {
    // Return a bash installer that downloads and sets up the relay
    const baseUrl = `${url.protocol}//${url.host}`;
    const installer = generateInstaller(baseUrl);
    return new NextResponse(installer, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'inline; filename="molly-relay-install.sh"',
      },
    });
  }

  // Default: serve the relay script directly
  try {
    const scriptPath = join(process.cwd(), 'scripts', 'termux-relay-v2.py');
    const script = await readFile(scriptPath, 'utf-8');
    return new NextResponse(script, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'inline; filename="termux-relay-v2.py"',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Relay script not found' },
      { status: 404 }
    );
  }
}

function generateInstaller(baseUrl: string): string {
  return `#!/data/data/com.termux/files/usr/bin/bash
# Molly Relay — One-Shot Installer
# Run this ONE command in Termux:
#   curl -sL ${baseUrl}/api/relay/install?format=installer | bash

set -e

echo ""
echo "  Molly Relay v2.0 — Installing..."
echo ""

# Install python if missing
command -v python3 >/dev/null 2>&1 || { pkg install -y python; }

# Create directories
mkdir -p ~/molly-relay
mkdir -p ~/.molly-logs

# Download relay script from Molly's server
echo "  Downloading relay v2..."
curl -sL -o ~/molly-relay/termux-relay.py \\
  "${baseUrl}/api/relay/install"
chmod +x ~/molly-relay/termux-relay.py

# Set up Termux:Boot auto-start
echo "  Setting up auto-start..."
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

cat > "$BOOT_DIR/start-molly-relay.sh" << 'BOOTEOF'
#!/data/data/com.termux/files/usr/bin/bash
sleep 5
mkdir -p ~/.molly-logs
export MOLLY_RELAY_TOKEN="\${MOLLY_RELAY_TOKEN:-molly-local-dev}"
export MOLLY_RELAY_PORT="\${MOLLY_RELAY_PORT:-8023}"
pkill -f "termux-relay.py" 2>/dev/null
sleep 1
nohup python3 ~/molly-relay/termux-relay.py >> ~/.molly-logs/relay.log 2>&1 &
echo "Started PID $! at $(date)" >> ~/.molly-logs/relay-boot.log
command -v termux-wake-lock &>/dev/null && termux-wake-lock
BOOTEOF
chmod +x "$BOOT_DIR/start-molly-relay.sh"

# Add env to bashrc if not there
if ! grep -q "MOLLY_RELAY_TOKEN" ~/.bashrc 2>/dev/null; then
  echo "" >> ~/.bashrc
  echo "export MOLLY_RELAY_TOKEN=\\"molly-local-dev\\"" >> ~/.bashrc
  echo "export MOLLY_RELAY_PORT=\\"8023\\"" >> ~/.bashrc
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
  echo "  To set peer secret (recommended):"
  echo "    export MOLLY_PEER_SECRET=\\"your-secret-here\\""
  echo "    Then restart: pkill -f termux-relay && python3 ~/molly-relay/termux-relay.py"
  echo ""
else
  echo ""
  echo "  ERROR: Relay failed to start. Check:"
  echo "    cat ~/.molly-logs/relay.log"
  echo ""
fi
`;
}
