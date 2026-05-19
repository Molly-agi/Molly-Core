#!/usr/bin/env node
/**
 * claude-login-android.mjs
 *
 * Fully automated Claude Code OAuth for Android + GitHub Codespaces.
 * Zero copy-paste. Zero right-clicking. Zero manual steps.
 *
 * HOW IT WORKS:
 *   1. Finds your Codespace public URL automatically
 *   2. Makes the port public automatically
 *   3. Serves an HTML page with ONE big button — you just tap it
 *   4. Completes the full OAuth + PKCE token exchange automatically
 *   5. Writes your credentials to ~/.claude/ automatically
 *
 * USAGE:
 *   node scripts/claude-login-android.mjs
 *
 *   Then visit the URL it prints in your phone browser.
 *   Tap the button. Done.
 */

import { execSync, exec } from 'child_process';
import { createServer } from 'http';
import { parse as parseUrl } from 'url';
import { createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import https from 'https';

// ── Config ──────────────────────────────────────────────────────────────────
const PORT          = 9999;
const CREDS_DIR     = join(homedir(), '.claude');
const CREDS_FILE    = join(CREDS_DIR, 'credentials.json');
const CONFIG_FILE   = join(homedir(), '.claude.json');

// Anthropic OAuth endpoints (extracted from @anthropic-ai/claude-code package)
const AUTH_ENDPOINT  = 'https://claude.ai/oauth/authorize';
const TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const CLIENT_ID      = 'claude-code-cli';

// ── PKCE helpers ─────────────────────────────────────────────────────────────
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generateVerifier() { return b64url(randomBytes(32)); }
function generateChallenge(verifier) {
  return b64url(createHash('sha256').update(verifier).digest());
}
function generateState() { return b64url(randomBytes(16)); }

// ── Detect Codespace URL ─────────────────────────────────────────────────────
function getCodespaceUrl(port) {
  const name = process.env.CODESPACE_NAME || '';
  if (name) return `https://${name}-${port}.app.github.dev`;

  // Fallback: try reading from gh CLI
  try {
    const info = execSync('gh codespace view --json name -q .name 2>/dev/null', {
      encoding: 'utf8', timeout: 5000
    }).trim();
    if (info) return `https://${info}-${port}.app.github.dev`;
  } catch {}
  return null;
}

// ── Make port public ─────────────────────────────────────────────────────────
function makePortPublic(port) {
  const name = process.env.CODESPACE_NAME || '';
  if (!name) return;
  try {
    execSync(
      `gh codespace ports visibility ${port}:public -c ${name} 2>/dev/null`,
      { timeout: 8000 }
    );
    console.log(`  ✓ Port ${port} set to public automatically`);
  } catch {
    console.log(`  ⚠ Could not auto-set port public — set it manually in PORTS tab`);
  }
}

// ── Token exchange ───────────────────────────────────────────────────────────
function exchangeCode(code, verifier, redirectUri) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri:  redirectUri,
    }).toString();

    const url = new URL(TOKEN_ENDPOINT);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Bad token response: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Save credentials ─────────────────────────────────────────────────────────
function saveCredentials(tokenData) {
  mkdirSync(CREDS_DIR, { recursive: true });

  // Write credentials.json
  const creds = {
    type:          'oauth',
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at:    tokenData.expires_in
                     ? Date.now() + tokenData.expires_in * 1000
                     : null,
    scope:         tokenData.scope || '',
    saved_at:      Date.now(),
  };
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));

  // Also write .claude.json config if it doesn't exist
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify({
      hasCompletedOnboarding: true,
      primaryApiKeySource: 'oauth',
    }, null, 2));
  }

  console.log(`\n  ✓ Credentials saved to ${CREDS_FILE}`);
}

// ── HTML landing page ─────────────────────────────────────────────────────────
function buildPage(authUrl, status = 'waiting') {
  const messages = {
    waiting:  { title: 'Tap to Connect Claude Code', btn: '🔑 Connect Claude Code', btnUrl: authUrl, color: '#7c3aed' },
    success:  { title: '✅ Claude Code Connected!',  btn: 'You can close this tab', btnUrl: '#',    color: '#16a34a' },
    error:    { title: '❌ Auth Failed',              btn: 'Retry',                   btnUrl: authUrl, color: '#dc2626' },
  };
  const m = messages[status] || messages.waiting;

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Claude Code Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1e293b;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    h1 { font-size: 1.5rem; margin-bottom: 12px; }
    p  { color: #94a3b8; margin-bottom: 32px; font-size: 0.95rem; line-height: 1.6; }
    .btn {
      display: block;
      background: ${m.color};
      color: white;
      text-decoration: none;
      padding: 18px 24px;
      border-radius: 12px;
      font-size: 1.1rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .btn:active { opacity: 0.8; }
    .note { margin-top: 20px; font-size: 0.8rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${m.title}</h1>
    <p>This authenticates Claude Code in your GitHub Codespace.<br>
       Your Pro account will be used — no API fees.</p>
    <a class="btn" href="${m.btnUrl}">${m.btn}</a>
    <p class="note">After tapping, authorize on the Claude page,<br>then return here.</p>
  </div>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  CLAUDE CODE LOGIN — Fully Automated (Android + Codespaces)');
  console.log('='.repeat(60) + '\n');

  // 1. Get our public URL
  const baseUrl     = getCodespaceUrl(PORT);
  const redirectUri = baseUrl || `http://localhost:${PORT}`;

  if (!baseUrl) {
    console.log('⚠ Could not detect Codespace URL. Using localhost fallback.');
    console.log('  You may need to manually set port ' + PORT + ' to public.\n');
  } else {
    console.log(`  Codespace URL detected: ${baseUrl}\n`);
    makePortPublic(PORT);
  }

  // 2. Generate PKCE
  const verifier   = generateVerifier();
  const challenge  = generateChallenge(verifier);
  const state      = generateState();

  // 3. Build auth URL
  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          redirectUri,
    scope:                 'openid profile email',
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });
  const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

  // 4. Start HTTP server
  let resolved = false;
  const server = createServer(async (req, res) => {
    const { pathname, query } = parseUrl(req.url, true);

    // Serve landing page
    if (pathname === '/' || pathname === '') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(buildPage(authUrl, 'waiting'));
      return;
    }

    // OAuth callback
    if (pathname === '/callback' || pathname === '/') {
      const code  = query.code;
      const error = query.error;

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buildPage(authUrl, 'error'));
        console.log(`\n  ✗ Auth error: ${error}`);
        return;
      }

      if (code && !resolved) {
        resolved = true;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buildPage(authUrl, 'success'));

        console.log('\n  ✓ Authorization code received! Exchanging for token...');

        try {
          const tokenData = await exchangeCode(code, verifier, redirectUri);

          if (tokenData.error) {
            throw new Error(`${tokenData.error}: ${tokenData.error_description}`);
          }

          saveCredentials(tokenData);

          console.log('\n' + '='.repeat(60));
          console.log('  ✅ CLAUDE CODE IS NOW AUTHENTICATED!');
          console.log('='.repeat(60));
          console.log('\n  Run: claude --version');
          console.log('  Then: claude\n');

          setTimeout(() => { server.close(); process.exit(0); }, 1000);
        } catch (err) {
          console.error(`\n  ✗ Token exchange failed: ${err.message}`);
          console.error('  The OAuth endpoints may differ from expected.');
          console.error('  Try running: claude login  (in a separate terminal)');
          setTimeout(() => { server.close(); process.exit(1); }, 1000);
        }
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Server running on port ${PORT}`);
    console.log('\n' + '='.repeat(60));
    console.log('  OPEN THIS URL IN YOUR PHONE BROWSER:');
    console.log('='.repeat(60));
    console.log(`\n  ${baseUrl || `http://localhost:${PORT}`}\n`);
    console.log('='.repeat(60));
    console.log('\n  You will see ONE button. Tap it. Done.\n');
  });

  // Timeout after 10 minutes
  setTimeout(() => {
    if (!resolved) {
      console.log('\n  Timed out after 10 minutes.');
      server.close();
      process.exit(1);
    }
  }, 600_000);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
