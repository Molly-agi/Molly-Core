#!/usr/bin/env python3
"""
claude-auth-fix.py

Fixes Claude Code OAuth authentication for GitHub Codespaces running
in a browser (Android phone, no VS Code Desktop).

HOW TO USE:
1. Run this script in Terminal 1:  python3 scripts/claude-auth-fix.py
2. Copy the URL it prints
3. Run 'claude login' in Terminal 2 — copy the OAuth URL it shows
4. In that OAuth URL replace 'http://localhost:PORT' with YOUR URL from step 2
5. Visit the modified URL in your phone browser and authorize
6. Done
"""

import os
import sys
import threading
import subprocess
import http.server
import urllib.parse

CATCH_PORT = 9999

auth_done = threading.Event()

class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code  = params.get('code',  [None])[0]
        error = params.get('error', [None])[0]

        if error:
            self.respond(400, f'<h1>Auth Error: {error}</h1><p>Check terminal.</p>')
        elif code:
            self.respond(200, '<h1 style="color:green">Authorized! Return to terminal.</h1>')
            print('\n\nCALLBACK RECEIVED — you are authenticated!\n')
            auth_done.set()
        else:
            self.respond(200, '<h1>Waiting...</h1>')

    def respond(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass

def main():
    name = os.environ.get('CODESPACE_NAME', '').strip()
    url  = f'https://{name}-{CATCH_PORT}.app.github.dev' if name else None

    print('\n' + '='*60)
    print('  CLAUDE CODE AUTH FIX — Android + Browser Codespaces')
    print('='*60)

    # Auto-set port public
    if name:
        result = subprocess.run(
            ['gh', 'codespace', 'ports', 'visibility',
             f'{CATCH_PORT}:public', '-c', name],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f'\n  Port {CATCH_PORT} set to PUBLIC automatically.')

    # Start server
    server = http.server.HTTPServer(('0.0.0.0', CATCH_PORT), CallbackHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    print('\n' + '='*60)
    print('  TAP AND HOLD THIS URL TO COPY IT:')
    print('='*60)
    print()
    if url:
        print(f'  {url}')
    else:
        print(f'  Could not detect URL.')
        print(f'  Format: https://CODESPACE-NAME-{CATCH_PORT}.app.github.dev')
    print()
    print('='*60)
    print()
    print('  STEPS:')
    print('  1. Open a second terminal')
    print('  2. Run: claude login')
    print('  3. Copy the OAuth URL it shows')
    print('  4. In that URL find:  localhost:XXXXX')
    print('     Replace with:      ' + (url or 'YOUR-CODESPACE-URL-ABOVE'))
    print('  5. Visit the modified URL on your phone')
    print('  6. Tap Authorize')
    print()
    print('  Waiting for authorization...')
    print('='*60 + '\n')

    try:
        auth_done.wait(timeout=300)
    except KeyboardInterrupt:
        print('\nCancelled.')
        server.shutdown()
        sys.exit(0)

    server.shutdown()

    if not auth_done.is_set():
        print('Timed out. Run the script again.')
        sys.exit(1)

    print('Authentication complete. Run: claude --version')

if __name__ == '__main__':
    main()
