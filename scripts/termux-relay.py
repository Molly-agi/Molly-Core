#!/usr/bin/env python3
"""
Molly Termux Relay Server
==========================
Run this inside Termux on your Android device.
Molly's web frontend connects to this relay to execute commands.

Usage (in Termux):
    pip install flask
    python termux-relay.py

Or background it:
    nohup python termux-relay.py &

The server listens on 0.0.0.0:8023 so Molly's browser (same device
or same LAN) can reach it.

Security:
  - Bearer token authentication (set MOLLY_RELAY_TOKEN env var)
  - Command blocklist (dangerous commands rejected)
  - Output size cap (prevents OOM from huge outputs)
  - Timeout on all commands (prevents hangs)
"""

import os
import sys
import json
import subprocess
import time
import hashlib
import signal
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# --- Configuration ---
PORT = int(os.environ.get('MOLLY_RELAY_PORT', '8023'))
TOKEN = os.environ.get('MOLLY_RELAY_TOKEN', 'molly-local-dev')
MAX_OUTPUT = 64 * 1024  # 64KB max output
COMMAND_TIMEOUT = 30     # seconds
MAX_COMMAND_LENGTH = 4096

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

# Commands that are allowed read-only (no auth needed for status)
SAFE_STATUS_COMMANDS = ['uname', 'whoami', 'pwd', 'date', 'uptime']


def is_blocked(command: str) -> bool:
    """Check if command matches any blocklist pattern."""
    cmd_lower = command.lower().strip()
    for blocked in BLOCKED_COMMANDS:
        if blocked in cmd_lower:
            return True
    return False


def get_device_info() -> dict:
    """Gather device info for the handshake."""
    info = {
        'platform': sys.platform,
        'python': sys.version,
        'relay_version': '1.0.0',
        'timestamp': int(time.time() * 1000),
    }
    
    # Try to get Android-specific info via Termux APIs
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


class RelayHandler(BaseHTTPRequestHandler):
    """HTTP handler for the Termux relay."""
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[Molly Relay] {args[0]} {args[1]} {args[2]}")
    
    def send_json(self, status: int, data: dict):
        """Send JSON response."""
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)
    
    def check_auth(self) -> bool:
        """Verify bearer token."""
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return False
        return auth[7:] == TOKEN
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests."""
        path = urlparse(self.path).path
        
        if path == '/ping':
            # Health check — no auth needed
            self.send_json(200, {
                'status': 'ok',
                'relay': 'molly-termux',
                'version': '1.0.0',
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
        """Handle POST requests (command execution)."""
        path = urlparse(self.path).path
        
        if path != '/exec':
            self.send_json(404, {'error': 'Not found'})
            return
        
        if not self.check_auth():
            self.send_json(401, {'error': 'Unauthorized'})
            return
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_COMMAND_LENGTH:
            self.send_json(400, {'error': 'Command too long'})
            return
        
        try:
            body = json.loads(self.rfile.read(content_length))
        except json.JSONDecodeError:
            self.send_json(400, {'error': 'Invalid JSON'})
            return
        
        command = body.get('command', '').strip()
        language = body.get('language', 'shell')
        timeout = min(body.get('timeout', COMMAND_TIMEOUT), COMMAND_TIMEOUT)
        
        if not command:
            self.send_json(400, {'error': 'No command provided'})
            return
        
        if is_blocked(command):
            self.send_json(403, {
                'error': 'Command blocked by safety policy',
                'stdout': '',
                'stderr': 'This command is blocked for safety.',
                'exitCode': 1,
            })
            return
        
        # Build the actual command based on language
        if language == 'python':
            exec_cmd = ['python3', '-c', command]
        elif language == 'javascript':
            exec_cmd = ['node', '-e', command]
        else:
            exec_cmd = ['sh', '-c', command]
        
        # Execute
        start_time = time.time()
        try:
            result = subprocess.run(
                exec_cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.environ.get('HOME', '/data/data/com.termux/files/home'),
            )
            
            stdout = result.stdout[:MAX_OUTPUT]
            stderr = result.stderr[:MAX_OUTPUT]
            
            self.send_json(200, {
                'stdout': stdout,
                'stderr': stderr,
                'exitCode': result.returncode,
                'durationMs': int((time.time() - start_time) * 1000),
                'language': language,
            })
        
        except subprocess.TimeoutExpired:
            self.send_json(200, {
                'stdout': '',
                'stderr': f'Command timed out after {timeout}s',
                'exitCode': 124,
                'durationMs': int((time.time() - start_time) * 1000),
                'language': language,
            })
        
        except Exception as e:
            self.send_json(500, {
                'stdout': '',
                'stderr': str(e),
                'exitCode': 1,
                'durationMs': int((time.time() - start_time) * 1000),
                'language': language,
            })


def main():
    print(f"""
╔══════════════════════════════════════════════╗
║        Molly Termux Relay Server v1.0        ║
╠══════════════════════════════════════════════╣
║  Port:  {PORT:<37}║
║  Token: {TOKEN[:8] + '...' if len(TOKEN) > 8 else TOKEN:<37}║
║                                              ║
║  Endpoints:                                  ║
║    GET  /ping  — Health check (no auth)      ║
║    GET  /info  — Device info                 ║
║    POST /exec  — Execute command             ║
║                                              ║
║  Molly can now reach this device.            ║
╚══════════════════════════════════════════════╝
""")
    
    server = HTTPServer(('0.0.0.0', PORT), RelayHandler)
    
    # Graceful shutdown
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
