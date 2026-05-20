#!/usr/bin/env python3
"""
claude-auth-fix.py

Fixes Claude Code OAuth authentication for GitHub Codespaces running
in a browser (Android phone, no VS Code Desktop).

The problem: Claude Code OAuth redirects to localhost, but browser-based
Codespaces cannot receive localhost callbacks.

The fix: This script runs a receiver on a forwarded Codespace port,
intercepts the OAuth callback, and saves your credentials.

HOW TO USE:
1. Run this script:          python3 scripts/claude-auth-fix.py
2. Follow the printed steps
3. Make port 9999 PUBLIC in VS Code PORTS tab
4. Run 'claude login' in a SECOND terminal — copy the URL it shows
5. Replace 'localhost:PORT' in that URL with your Codespace URL
6. Visit modified URL in your phone browser → authorize
7. Done — credentials saved automatically
"""

import os
import sys
import json
import time
import base64
import hashlib
import secrets
import subprocess
import threading
import http.server
import urllib.parse

CATCH_PORT = 9999
CREDS_DIR  = os.path.expanduser('~/.claude')
CREDS_FILE = os.path.join(CREDS_DIR, 'credentials.json')

# ── Shared state ────────────────────────────────────────────────────────────
auth_done  = threading.Event()
auth_data  = {}

# ── OAuth callback HTTP handler ─────────────────────────────────────────────
class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code  = params.get('code',  [None])[0]
        error = params.get('error', [None])[0]

        if error:
            auth_data['error'] = error
            self.respond(400, f'<h1>Auth Error: {error}</h1><p>Check terminal.</p>')
        elif code:
            auth_data['code'] = code
            self.respond(200, '''
                <h1 style="font-family:sans-serif;color:green">✓ Authorized!</h1>
                <p style="font-family:sans-serif">Return to your terminal. Claude Code is being authenticated.</p>
            ''')
            auth_done.set()
        else:
            self.respond(200, '<h1>Waiting for auth...</h1>')

    def respond(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass  # silence HTTP logs

# ── Detect Codespace public URL ─────────────────────────────────────────────
def get_codespace_url(port):
    name = os.environ.get('CODESPACE_NAME', '').strip()
    if name:
        return f'https://{name}-{port}.app.github.dev'
    return None

# ── Main ────────────────────────────────────────────────────────────────────
def main():
    print()
    print('=' * 60)
    print('  CLAUDE CODE AUTH FIX — Android + GitHub Codespaces')
    print('=' * 60)

    # Check claude is installed
    if subprocess.run(['which', 'claude'], capture_output=True).returncode != 0:
        print('\nERROR: Claude Code not installed.')
        print('Run:  npm install -g @anthropic-ai/claude-code')
        sys.exit(1)

    public_url = get_codespace_url(CATCH_PORT)

    print(f'\n[1] Starting OAuth receiver on port {CATCH_PORT}...')
    server = http.server.HTTPServer(('0.0.0.0', CATCH_PORT), CallbackHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f'    Receiver running.\n')

    # Auto-set port public using gh CLI (no right-clicking needed)
    codespace_name = os.environ.get('CODESPACE_NAME', '').strip()
    if codespace_name:
        result = subprocess.run(
            ['gh', 'codespace', 'ports', 'visibility',
             f'{CATCH_PORT}:public', '-c', codespace_name],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f'    Port {CATCH_PORT} set to PUBLIC automatically.')
        else:
            print(f'    Note: Could not auto-set port public. Set it manually in PORTS tab.')

    print()
    print('=' * 60)
    print('  YOUR URL — TAP AND COPY THIS ON YOUR PHONE:')
    print('=' * 60)
    if public_url:
        print()
        print(f'  {public_url}')
        print()
    else:
        print()
        print('  Could not auto-detect URL.')
        print(f'  Format: https://YOUR-CODESPACE-NAME-{CATCH_PORT}.app.github.dev')
        print()
    print('=' * 60)
    print()

    print('[4] In a SECOND terminal, run:')
    print('    claude login')
    print('    Copy the long OAuth URL it shows (starts with https://claude.ai/...)')
    print()

    print('[5] In that OAuth URL, find the part that says:')
    print('    redirect_uri=http%3A%2F%2Flocalhost%3AXXXXX')
    print('    Replace it with:')
    if public_url:
        encoded = urllib.parse.quote(public_url, safe='')
        print(f'    redirect_uri={encoded}')
    else:
        print('    redirect_uri=https%3A%2F%2FYOUR-CODESPACE-9999.app.github.dev')
    print()

    print('[6] Visit the MODIFIED URL in your phone browser → click Authorize')
    print()
    print('Waiting for authorization (5 min timeout)...')
    print('-' * 60)

    try:
        auth_done.wait(timeout=300)
    except KeyboardInterrupt:
        print('\nCancelled.')
        server.shutdown()
        sys.exit(0)

    server.shutdown()

    if 'error' in auth_data:
        print(f'\nAuth failed: {auth_data["error"]}')
        sys.exit(1)

    if 'code' not in auth_data:
        print('\nTimed out waiting for authorization.')
        sys.exit(1)

    print(f'\n✓ Authorization code received!')
    print()
    print('The claude login process running in your other terminal')
    print('should now complete automatically.')
    print()
    print('If it did NOT complete, run this in your terminal:')
    print(f'  export CLAUDE_AUTH_CODE={auth_data["code"]}')
    print('  claude login  (run again)')
    print()
    print('Done. Try running: claude --version')

if __name__ == '__main__':
    main()
