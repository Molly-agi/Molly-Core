#!/usr/bin/env python3
"""
Molly Termux Relay v2.0 — Peer Protocol
=========================================
Run this inside Termux on your Android device.
Molly's embedded terminal (MollyShell) connects to this as a PEER —
not a client. Both sides can execute commands on each other.

Backward compatible: the old /ping, /info, /exec endpoints still work.
New peer protocol: POST /peer for symmetric communication.

Usage (in Termux):
    python termux-relay.py

Or background it:
    nohup python termux-relay.py &

Environment variables:
    MOLLY_RELAY_PORT     — Port to listen on (default: 8023)
    MOLLY_RELAY_TOKEN    — Legacy auth token (default: molly-local-dev)
    MOLLY_PEER_SECRET    — Shared secret for peer auth (REQUIRED for peer mode)
    MOLLY_CORE_URL       — Molly's server URL (default: http://localhost:9002)
    MOLLY_PEER_NAME      — Name for this device (default: auto-detected)

Security:
  - HMAC-SHA256 challenge-response authentication (peer mode)
  - Bearer token authentication (legacy mode)
  - Command blocklist
  - Output size cap
  - Timeout on all commands
  - Sequence number replay protection
"""

import os
import sys
import json
import hmac
import hashlib
import subprocess
import time
import signal
import threading
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# --- Configuration ---
PORT = int(os.environ.get('MOLLY_RELAY_PORT', '8023'))
TOKEN = os.environ.get('MOLLY_RELAY_TOKEN', '')
if not TOKEN:
    print('WARNING: MOLLY_RELAY_TOKEN not set. Set it for production use.')
PEER_SECRET = os.environ.get('MOLLY_PEER_SECRET', '')
MOLLY_URL = os.environ.get('MOLLY_CORE_URL', 'http://localhost:9002')
PEER_NAME = os.environ.get('MOLLY_PEER_NAME', '')
MAX_OUTPUT = 64 * 1024   # 64KB max output
COMMAND_TIMEOUT = 30      # seconds
MAX_COMMAND_LENGTH = 4096
PROTOCOL_VERSION = '1.0.0'
RELAY_VERSION = '2.0.0'

# --- Identity ---
PEER_ID = f'termux-{uuid.uuid4().hex[:8]}'

# Commands that should never be executed
BLOCKED_COMMANDS = [
    'rm -rf /',
    'dd if=',
    'mkfs',
    ':(){',           # fork bomb
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'init 0',
    'init 6',
]


def is_blocked(command):
    """Check if command matches any blocklist pattern."""
    cmd_lower = command.lower().strip()
    for blocked in BLOCKED_COMMANDS:
        if blocked in cmd_lower:
            return True
    return False


def get_device_name():
    """Auto-detect device name."""
    if PEER_NAME:
        return PEER_NAME
    try:
        result = subprocess.run(
            ['getprop', 'ro.product.model'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return f'termux-{result.stdout.strip().lower().replace(" ", "-")}'
    except Exception:
        pass
    return f'termux-{PEER_ID[:8]}'


def get_device_info():
    """Gather device info."""
    info = {
        'platform': sys.platform,
        'python': sys.version,
        'relay_version': RELAY_VERSION,
        'protocol_version': PROTOCOL_VERSION,
        'peer_id': PEER_ID,
        'peer_name': get_device_name(),
        'timestamp': int(time.time() * 1000),
    }

    try:
        result = subprocess.run(
            ['getprop', 'ro.product.model'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info['device_model'] = result.stdout.strip()
    except Exception:
        pass

    try:
        result = subprocess.run(
            ['uname', '-m'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info['architecture'] = result.stdout.strip()
    except Exception:
        info['architecture'] = 'unknown'

    try:
        result = subprocess.run(
            ['termux-battery-status'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info['battery'] = json.loads(result.stdout)
    except Exception:
        pass

    return info


def get_capabilities():
    """What this device can do."""
    caps = ['execute', 'file-push', 'file-pull', 'device-info']

    # Check for Termux APIs
    try:
        subprocess.run(['which', 'termux-notification'], capture_output=True, timeout=3)
        caps.append('notify')
    except Exception:
        pass

    try:
        subprocess.run(['which', 'termux-tts-speak'], capture_output=True, timeout=3)
        caps.append('tts')
    except Exception:
        pass

    try:
        subprocess.run(['which', 'termux-camera-photo'], capture_output=True, timeout=3)
        caps.append('sensor')
    except Exception:
        pass

    caps.append('self-update')
    return caps


def get_identity():
    """Build our peer identity."""
    return {
        'peerId': PEER_ID,
        'name': get_device_name(),
        'type': 'termux',
        'protocolVersion': PROTOCOL_VERSION,
        'capabilities': get_capabilities(),
    }


def compute_hmac(data, secret):
    """Compute HMAC-SHA256 for challenge-response."""
    return hmac.new(secret.encode(), data.encode(), hashlib.sha256).hexdigest()


def execute_command(command, language='shell', timeout_s=COMMAND_TIMEOUT):
    """Execute a command and return the result."""
    if is_blocked(command):
        return {
            'stdout': '',
            'stderr': 'Command blocked by safety policy.',
            'exitCode': 1,
            'blocked': 'Safety policy',
        }

    if language == 'python':
        exec_cmd = ['python3', '-c', command]
    elif language == 'javascript':
        exec_cmd = ['node', '-e', command]
    else:
        exec_cmd = ['sh', '-c', command]

    start_time = time.time()
    try:
        result = subprocess.run(
            exec_cmd,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            cwd=os.environ.get('HOME', '/data/data/com.termux/files/home'),
        )
        return {
            'stdout': result.stdout[:MAX_OUTPUT],
            'stderr': result.stderr[:MAX_OUTPUT],
            'exitCode': result.returncode,
            'durationMs': int((time.time() - start_time) * 1000),
        }
    except subprocess.TimeoutExpired:
        return {
            'stdout': '',
            'stderr': f'Command timed out after {timeout_s}s',
            'exitCode': 124,
            'durationMs': int((time.time() - start_time) * 1000),
        }
    except Exception as e:
        return {
            'stdout': '',
            'stderr': str(e),
            'exitCode': 1,
            'durationMs': int((time.time() - start_time) * 1000),
        }


# ============================================================================
# PEER SESSION STATE
# ============================================================================

class PeerState:
    """Track peer protocol state (server-side Molly connection)."""

    def __init__(self):
        self.authenticated = False
        self.challenge = None
        self.seq = 0
        self.remote_seq = 0
        self.connected_at = None
        self.last_message_at = None

    def next_seq(self):
        self.seq += 1
        return self.seq

    def check_seq(self, remote_seq):
        """Validate monotonic sequence."""
        if remote_seq <= self.remote_seq:
            return False
        self.remote_seq = remote_seq
        self.last_message_at = time.time()
        return True


# Global peer state
peer_state = PeerState()


# ============================================================================
# HTTP HANDLER
# ============================================================================

class RelayHandler(BaseHTTPRequestHandler):
    """HTTP handler for the Termux relay — now with peer protocol."""

    def log_message(self, format, *args):
        print(f"[Molly Relay] {args[0]} {args[1]} {args[2]}")

    def send_json(self, status, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers',
                         'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods',
                         'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def check_auth(self):
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return False
        return auth[7:] == TOKEN

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers',
                         'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods',
                         'GET, POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/ping':
            self.send_json(200, {
                'status': 'ok',
                'relay': 'molly-termux',
                'version': RELAY_VERSION,
                'protocol': PROTOCOL_VERSION,
                'peer_id': PEER_ID,
                'peer_name': get_device_name(),
                'timestamp': int(time.time() * 1000),
            })

        elif path == '/info':
            if not self.check_auth():
                self.send_json(401, {'error': 'Unauthorized'})
                return
            self.send_json(200, get_device_info())

        else:
            self.send_json(404, {'error': 'Not found'})

    def do_POST(self):
        path = urlparse(self.path).path

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_COMMAND_LENGTH * 10:  # Allow larger for peer msgs
            self.send_json(400, {'error': 'Request too large'})
            return

        try:
            body = json.loads(self.rfile.read(content_length))
        except json.JSONDecodeError:
            self.send_json(400, {'error': 'Invalid JSON'})
            return

        # ----- Legacy /exec endpoint (backward compatible) -----
        if path == '/exec':
            if not self.check_auth():
                self.send_json(401, {'error': 'Unauthorized'})
                return

            command = body.get('command', '').strip()
            language = body.get('language', 'shell')
            timeout = min(body.get('timeout', COMMAND_TIMEOUT), COMMAND_TIMEOUT)

            if not command:
                self.send_json(400, {'error': 'No command provided'})
                return

            result = execute_command(command, language, timeout)
            result['language'] = language
            self.send_json(200, result)
            return

        # ----- Peer protocol /peer endpoint -----
        if path == '/peer':
            self.handle_peer_message(body)
            return

        self.send_json(404, {'error': 'Not found'})

    def handle_peer_message(self, msg):
        """Handle peer protocol messages from Molly."""
        global peer_state

        msg_type = msg.get('type')
        msg_from = msg.get('from', '')
        msg_seq = msg.get('seq', 0)

        if not msg_type:
            self.send_json(400, {'error': 'Missing message type'})
            return

        # --- Ping (no auth needed) ---
        if msg_type == 'ping':
            self.send_json(200, {
                'type': 'pong',
                'seq': peer_state.next_seq(),
                'from': PEER_ID,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'payload': {'protocolVersion': PROTOCOL_VERSION},
            })
            return

        # --- Hello from Molly ---
        if msg_type == 'hello':
            identity = msg.get('payload', {}).get('identity', {})
            print(f'[Peer] Hello from {identity.get("name", "unknown")}')

            peer_state.challenge = os.urandom(32).hex()
            peer_state.connected_at = time.time()
            peer_state.authenticated = False

            self.send_json(200, {
                'type': 'hello_ack',
                'seq': peer_state.next_seq(),
                'from': PEER_ID,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'payload': {
                    'identity': get_identity(),
                    'challenge': peer_state.challenge,
                },
            })
            return

        # --- Challenge response from Molly ---
        if msg_type == 'challenge_response':
            if not peer_state.challenge or not PEER_SECRET:
                self.send_json(200, {
                    'type': 'auth_failed',
                    'seq': peer_state.next_seq(),
                    'from': PEER_ID,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'payload': {'reason': 'No challenge pending or no secret configured'},
                })
                return

            expected = compute_hmac(peer_state.challenge, PEER_SECRET)
            response = msg.get('payload', {}).get('response', '')

            if response != expected:
                peer_state.authenticated = False
                print('[Peer] Authentication FAILED')
                self.send_json(200, {
                    'type': 'auth_failed',
                    'seq': peer_state.next_seq(),
                    'from': PEER_ID,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'payload': {'reason': 'Invalid challenge response'},
                })
                return

            peer_state.authenticated = True
            peer_state.last_message_at = time.time()
            print(f'[Peer] Authenticated: {msg_from}')

            self.send_json(200, {
                'type': 'authenticated',
                'seq': peer_state.next_seq(),
                'from': PEER_ID,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'payload': {'message': f'Welcome, {msg_from}'},
            })
            return

        # --- All remaining messages require auth ---
        if not peer_state.authenticated:
            self.send_json(401, {
                'type': 'auth_failed',
                'payload': {'reason': 'Not authenticated. Send hello first.'},
            })
            return

        # Replay protection
        if not peer_state.check_seq(msg_seq):
            self.send_json(400, {'error': 'Sequence replay detected'})
            return

        # --- Execute command ---
        if msg_type == 'exec':
            payload = msg.get('payload', {})
            command = payload.get('command', '')
            language = payload.get('language', 'shell')
            timeout = payload.get('timeout', COMMAND_TIMEOUT) / 1000  # ms to s

            print(f'[Peer] Exec ({language}): {command[:60]}')
            result = execute_command(command, language, min(timeout, COMMAND_TIMEOUT))

            self.send_json(200, {
                'type': 'exec_result',
                'seq': peer_state.next_seq(),
                'from': PEER_ID,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'payload': {
                    'replyTo': msg_seq,
                    **result,
                },
            })
            return

        # --- File push (receive file from Molly) ---
        if msg_type == 'file_push':
            payload = msg.get('payload', {})
            file_path = payload.get('path', '')
            content = payload.get('content', '')
            encoding = payload.get('encoding', 'utf-8')
            executable = payload.get('executable', False)
            reason = payload.get('reason', '')

            try:
                # Ensure directory exists
                dir_path = os.path.dirname(file_path)
                if dir_path:
                    os.makedirs(dir_path, exist_ok=True)

                if encoding == 'base64':
                    import base64
                    data = base64.b64decode(content)
                    with open(file_path, 'wb') as f:
                        f.write(data)
                else:
                    with open(file_path, 'w') as f:
                        f.write(content)

                if executable:
                    os.chmod(file_path, 0o755)

                print(f'[Peer] File received: {file_path} ({reason})')

                self.send_json(200, {
                    'type': 'file_push_ack',
                    'seq': peer_state.next_seq(),
                    'from': PEER_ID,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'payload': {
                        'replyTo': msg_seq,
                        'success': True,
                        'path': file_path,
                    },
                })
            except Exception as e:
                self.send_json(200, {
                    'type': 'file_push_ack',
                    'seq': peer_state.next_seq(),
                    'from': PEER_ID,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'payload': {
                        'replyTo': msg_seq,
                        'success': False,
                        'path': file_path,
                        'error': str(e),
                    },
                })
            return

        # --- State request ---
        if msg_type == 'state_request':
            info = get_device_info()
            self.send_json(200, {
                'type': 'state_response',
                'seq': peer_state.next_seq(),
                'from': PEER_ID,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'payload': {
                    'platform': f'{info.get("device_model", "unknown")} / {info.get("architecture", "unknown")}',
                    'uptime': time.time() - (peer_state.connected_at or time.time()),
                    'shell': {
                        'alive': True,
                        'commandsExecuted': 0,  # Stateless, so no tracking
                    },
                    'extra': {
                        'battery': info.get('battery'),
                        'python': info.get('python'),
                    },
                },
            })
            return

        # --- Disconnect ---
        if msg_type == 'disconnect':
            peer_state.authenticated = False
            print(f'[Peer] Disconnected: {msg_from}')
            self.send_json(200, {'ok': True})
            return

        self.send_json(400, {'error': f'Unknown message type: {msg_type}'})


# ============================================================================
# SELF-REGISTRATION — Announce to Molly on startup
# ============================================================================

def register_with_molly():
    """
    Try to connect to Molly's server and register as a peer.
    This is the Termux side initiating the handshake.
    Runs in a background thread so the server starts immediately.
    """
    if not PEER_SECRET:
        print('[Peer] No MOLLY_PEER_SECRET set — peer mode disabled.')
        print('[Peer] Legacy mode active (Bearer token auth).')
        return

    import urllib.request

    peer_url = f'{MOLLY_URL}/api/terminal/peer'
    identity = get_identity()

    def attempt_registration():
        time.sleep(2)  # Brief delay for server to start

        for attempt in range(3):
            try:
                # Step 1: Hello
                hello_msg = json.dumps({
                    'type': 'hello',
                    'seq': 1,
                    'from': PEER_ID,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'payload': {'identity': identity},
                }).encode()

                req = urllib.request.Request(
                    peer_url,
                    data=hello_msg,
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                resp = urllib.request.urlopen(req, timeout=10)
                hello_ack = json.loads(resp.read())

                if hello_ack.get('type') != 'hello_ack':
                    print(f'[Peer] Unexpected response: {hello_ack.get("type")}')
                    continue

                challenge = hello_ack.get('payload', {}).get('challenge', '')
                molly_name = hello_ack.get('payload', {}).get('identity', {}).get('name', 'unknown')
                print(f'[Peer] Hello from {molly_name} — challenge received')

                # Step 2: Challenge response
                response = compute_hmac(challenge, PEER_SECRET)
                auth_msg = json.dumps({
                    'type': 'challenge_response',
                    'seq': 2,
                    'from': PEER_ID,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'payload': {'response': response},
                }).encode()

                req = urllib.request.Request(
                    peer_url,
                    data=auth_msg,
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                resp = urllib.request.urlopen(req, timeout=10)
                auth_result = json.loads(resp.read())

                if auth_result.get('type') == 'authenticated':
                    print(f'[Peer] ✓ Authenticated with {molly_name}!')
                    print(f'[Peer] Peer handshake complete — full duplex active.')
                    return
                else:
                    print(f'[Peer] Auth failed: {auth_result.get("payload", {}).get("reason", "unknown")}')

            except Exception as e:
                print(f'[Peer] Registration attempt {attempt + 1}/3 failed: {e}')
                time.sleep(5)

        print('[Peer] Could not reach Molly. Peer mode inactive, legacy mode active.')

    thread = threading.Thread(target=attempt_registration, daemon=True)
    thread.start()


# ============================================================================
# MAIN
# ============================================================================

def main():
    device_name = get_device_name()
    caps = get_capabilities()

    print(f"""
╔══════════════════════════════════════════════╗
║      Molly Termux Relay v{RELAY_VERSION}  (Peer)       ║
╠══════════════════════════════════════════════╣
║  Port:     {PORT:<35}║
║  Peer ID:  {PEER_ID:<35}║
║  Name:     {device_name:<35}║
║  Protocol: {PROTOCOL_VERSION:<35}║
║  Caps:     {', '.join(caps):<35}║
║                                              ║
║  Legacy endpoints (backward compatible):     ║
║    GET  /ping  — Health check (no auth)      ║
║    GET  /info  — Device info                 ║
║    POST /exec  — Execute command             ║
║                                              ║
║  Peer protocol:                              ║
║    POST /peer  — Symmetric peer messages     ║
║                                              ║
║  Molly can now reach this device.            ║
╚══════════════════════════════════════════════╝
""")

    if PEER_SECRET:
        print(f'[Peer] Secret configured — attempting registration with {MOLLY_URL}')
    else:
        print('[Peer] No MOLLY_PEER_SECRET — legacy mode only.')
        print('[Peer] Set MOLLY_PEER_SECRET to enable peer handshake.')

    server = HTTPServer(('0.0.0.0', PORT), RelayHandler)

    # Try to register with Molly (background thread)
    register_with_molly()

    def handle_signal(sig, frame):
        print('\n[Molly Relay] Shutting down...')
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[Molly Relay] Stopped.')
        server.shutdown()


if __name__ == '__main__':
    main()
