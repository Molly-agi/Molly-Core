/**
 * Temporary one-time endpoint to upload Firebase service account key.
 * Protected by admin password. Delete this file after use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { timingSafeEqual } from 'node:crypto';

const ENV_PATH = join(process.cwd(), '.env.local');

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.HIDDEN_ADMIN_PASSWORD;
  const provided = request.headers.get('x-admin-password');
  if (!adminPassword || !provided) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(adminPassword));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('keyfile') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();

    // Validate it's real JSON with expected Firebase fields
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (parsed.type !== 'service_account' || !parsed.project_id) {
      return NextResponse.json(
        { error: 'Not a valid Firebase service account key' },
        { status: 400 }
      );
    }

    // Write to .env.local - escape any newlines in the private key
    const escaped = text.replace(/\n/g, '\\n');
    const envLine = `FIREBASE_SERVICE_ACCOUNT_JSON=${escaped}`;

    let envContent = existsSync(ENV_PATH)
      ? readFileSync(ENV_PATH, 'utf-8')
      : '';

    if (envContent.includes('FIREBASE_SERVICE_ACCOUNT_JSON=')) {
      // Replace existing line
      envContent = envContent.replace(
        /^FIREBASE_SERVICE_ACCOUNT_JSON=.*$/m,
        envLine
      );
    } else {
      // Append
      envContent = envContent.trimEnd() + '\n' + envLine + '\n';
    }

    writeFileSync(ENV_PATH, envContent, 'utf-8');

    return NextResponse.json({
      success: true,
      project: parsed.project_id,
      email: parsed.client_email,
      message: 'Key installed. Restart the dev server to activate memory.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Admin password available via process.env.HIDDEN_ADMIN_PASSWORD
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Install Firebase Key</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; background: #0a0a0a; color: #fff; }
    h2 { color: #7c3aed; }
    input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; box-sizing: border-box; font-size: 16px; }
    input[type=password], input[type=file] { background: #1a1a1a; border: 1px solid #333; color: #fff; }
    button { background: #7c3aed; color: white; border: none; cursor: pointer; font-weight: bold; }
    button:hover { background: #6d28d9; }
    #result { margin-top: 16px; padding: 12px; border-radius: 8px; display: none; }
    .ok { background: #052e16; border: 1px solid #16a34a; color: #4ade80; }
    .err { background: #2d0a0a; border: 1px solid #dc2626; color: #f87171; }
  </style>
</head>
<body>
  <h2>🔑 Install Firebase Service Key</h2>
  <p>Select the downloaded JSON key file and tap Install.</p>
  <input type="password" id="pw" placeholder="Admin password" />
  <input type="file" id="fileInput" accept=".json" />
  <button onclick="upload()">Install Key</button>
  <div id="result"></div>
  <script>
    async function upload() {
      const pw = document.getElementById('pw').value;
      const file = document.getElementById('fileInput').files[0];
      const result = document.getElementById('result');
      if (!pw || !file) { result.className='err'; result.style.display='block'; result.textContent='Enter password and select file.'; return; }
      const fd = new FormData();
      fd.append('keyfile', file);
      try {
        const r = await fetch('/api/admin/upload-service-key', { method:'POST', headers:{'x-admin-password': pw}, body: fd });
        const d = await r.json();
        result.style.display = 'block';
        if (d.success) {
          result.className = 'ok';
          result.textContent = '✅ Key installed for ' + d.project + ' (' + d.email + '). Now restart the dev server.';
        } else {
          result.className = 'err';
          result.textContent = '❌ ' + (d.error || 'Failed');
        }
      } catch(e) { result.className='err'; result.style.display='block'; result.textContent='Network error: '+e.message; }
    }
  </script>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
