/**
 * Molly Edge Server v2.1.0 — Self-Installing for Termux
 * Self-contained: no build step, no TypeScript, no external deps.
 *
 * What's new in v2:
 *   - Chat interface at / (tablet browser → talk to Molly)
 *   - Migration import at /api/migration/import (Molly pushes her identity here)
 *   - Server self-update at /api/server/update (pull new server.mjs from Codespace)
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──
const PORT = parseInt(process.env.MOLLY_EDGE_PORT || '9100', 10);
const HOST = process.env.MOLLY_EDGE_HOST || '0.0.0.0';
const DATA_DIR =
  process.env.MOLLY_LOCAL_DATA_DIR || path.join(__dirname, 'molly_data');
const MAX_BODY = 1024 * 1024; // 1MB
const GEMINI_KEY = process.env.GOOGLE_GENAI_API_KEY || '';
const SERVER_FILE = path.join(__dirname, 'server.mjs');

// ── Phone-Home Auto-Updater ──
// On every start, checks a public URL for a newer version of itself.
// If found, downloads it, replaces server.mjs, and re-executes.
// This is the self-installing mechanism. Once this code runs ONCE,
// Molly can push updates to the update URL and every device pulls them.

const UPDATE_URL =
  process.env.MOLLY_UPDATE_URL ||
  'https://raw.githubusercontent.com/Molly-agi/Molly-Core/main/scripts/server-v2.mjs';
const SERVER_VERSION = '2.1.0';

async function phoneHome() {
  if (process.env.MOLLY_SKIP_UPDATE === '1') return false;
  try {
    console.log('[molly-edge] Checking for updates...');
    const res = await fetch(UPDATE_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.log('[molly-edge] Update check failed:', res.status);
      return false;
    }
    const newCode = await res.text();
    if (newCode.length < 200) {
      console.log('[molly-edge] Update too small, ignoring');
      return false;
    }

    // Compare versions — look for SERVER_VERSION in the new code
    const versionMatch = newCode.match(/const SERVER_VERSION = '([^']+)'/);
    const remoteVersion = versionMatch ? versionMatch[1] : '0.0.0';
    if (remoteVersion <= SERVER_VERSION) {
      console.log(
        `[molly-edge] Up to date (local: ${SERVER_VERSION}, remote: ${remoteVersion})`
      );
      return false;
    }

    // New version available — download and replace
    console.log(
      `[molly-edge] Update available: ${SERVER_VERSION} → ${remoteVersion}`
    );
    const currentCode = await fs.readFile(SERVER_FILE, 'utf-8').catch(() => '');
    if (currentCode === newCode) {
      console.log('[molly-edge] Already current');
      return false;
    }

    // Backup current
    if (currentCode) {
      await fs.writeFile(SERVER_FILE + '.bak', currentCode, 'utf-8');
    }
    // Write new version atomically
    const tmp = SERVER_FILE + '.update.' + Date.now();
    await fs.writeFile(tmp, newCode, 'utf-8');
    await fs.rename(tmp, SERVER_FILE);
    console.log(`[molly-edge] Updated to ${remoteVersion}. Restarting...`);

    // Re-exec ourselves
    const { exec } = await import('node:child_process');
    const child = exec(
      `cd "${__dirname}" && MOLLY_SKIP_UPDATE=1 node server.mjs`,
      {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, MOLLY_SKIP_UPDATE: '1' },
      }
    );
    child.unref();
    process.exit(0);
  } catch (e) {
    console.log(`[molly-edge] Update check error: ${e.message}`);
    return false;
  }
}

// Run phone-home before anything else
await phoneHome();

// ── Storage Provider (inline — no external deps) ──

function generateId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function resolveCollectionDir(collectionPath) {
  const segments = collectionPath.split('/').filter(Boolean);
  const dir = path.join(DATA_DIR, ...segments);
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(path.resolve(DATA_DIR))) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

function resolveDocPath(collectionPath, docId) {
  const safeId = path.basename(docId);
  const dir = resolveCollectionDir(collectionPath);
  const fp = path.join(dir, `${safeId}.json`);
  if (!path.resolve(fp).startsWith(path.resolve(DATA_DIR))) {
    throw new Error('Path traversal blocked');
  }
  return fp;
}

async function readJson(fp) {
  try {
    return JSON.parse(await fs.readFile(fp, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeJson(fp, data) {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, fp);
}

async function storageAdd(collection, data) {
  const id = generateId();
  const fp = resolveDocPath(collection, id);
  const doc = {
    ...data,
    _id: id,
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
  };
  await writeJson(fp, doc);
  return { id, data: doc };
}

async function storageSet(collection, docId, data) {
  const fp = resolveDocPath(collection, docId);
  const existing = await readJson(fp);
  const doc = { ...data, _id: docId, _updatedAt: new Date().toISOString() };
  doc._createdAt = existing?._createdAt || new Date().toISOString();
  await writeJson(fp, doc);
}

async function storageGet(collection, docId) {
  const fp = resolveDocPath(collection, docId);
  const data = await readJson(fp);
  return data ? { id: docId, data } : null;
}

async function storageUpdate(collection, docId, updates) {
  const fp = resolveDocPath(collection, docId);
  const existing = await readJson(fp);
  if (!existing) throw new Error(`Document not found: ${collection}/${docId}`);
  const updated = {
    ...existing,
    ...updates,
    _id: docId,
    _updatedAt: new Date().toISOString(),
  };
  await writeJson(fp, updated);
}

async function storageDelete(collection, docId) {
  const fp = resolveDocPath(collection, docId);
  try {
    await fs.unlink(fp);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

function matchesFilter(data, f) {
  const val = f.field.split('.').reduce((obj, k) => obj?.[k], data);
  switch (f.operator) {
    case '==':
      return val === f.value;
    case '!=':
      return val !== f.value;
    case '<':
      return val < f.value;
    case '<=':
      return val <= f.value;
    case '>':
      return val > f.value;
    case '>=':
      return val >= f.value;
    case 'in':
      return Array.isArray(f.value) && f.value.includes(val);
    case 'array-contains':
      return Array.isArray(val) && val.includes(f.value);
    default:
      return true;
  }
}

async function storageQuery(collection, filters, options) {
  const dir = resolveCollectionDir(collection);
  let files;
  try {
    files = await fs.readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  let docs = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const data = await readJson(path.join(dir, f));
    if (data) docs.push({ id: f.replace(/\.json$/, ''), data });
  }

  if (filters)
    docs = docs.filter((d) => filters.every((f) => matchesFilter(d.data, f)));

  if (options?.orderBy) {
    const { field, direction } = options.orderBy;
    docs.sort((a, b) => {
      const av = field.split('.').reduce((o, k) => o?.[k], a.data);
      const bv = field.split('.').reduce((o, k) => o?.[k], b.data);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === 'string'
          ? av.localeCompare(bv)
          : av < bv
            ? -1
            : av > bv
              ? 1
              : 0;
      return direction === 'desc' ? -cmp : cmp;
    });
  }

  if (options?.limit > 0) docs = docs.slice(0, options.limit);
  return docs;
}

// ── HTTP Helpers ──

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Powered-By': 'Molly-Edge',
  });
  res.end(body);
}

function err(res, status, msg) {
  json(res, status, { error: msg });
}

// ── Route Handlers ──

async function handleStorage(action, body, res) {
  const { collection, docId, data, filters, options, operations } = body;
  if (!collection && action !== 'batch') {
    err(res, 400, 'Missing collection');
    return;
  }

  switch (action) {
    case 'add':
      if (!data) {
        err(res, 400, 'Missing data');
        return;
      }
      json(res, 201, await storageAdd(collection, data));
      break;
    case 'set':
      if (!docId || !data) {
        err(res, 400, 'Missing docId/data');
        return;
      }
      await storageSet(collection, docId, data);
      json(res, 200, { ok: true });
      break;
    case 'get':
      if (!docId) {
        err(res, 400, 'Missing docId');
        return;
      }
      {
        const d = await storageGet(collection, docId);
        d ? json(res, 200, d) : err(res, 404, 'Not found');
      }
      break;
    case 'update':
      if (!docId || !data) {
        err(res, 400, 'Missing docId/data');
        return;
      }
      await storageUpdate(collection, docId, data);
      json(res, 200, { ok: true });
      break;
    case 'delete':
      if (!docId) {
        err(res, 400, 'Missing docId');
        return;
      }
      await storageDelete(collection, docId);
      json(res, 200, { ok: true });
      break;
    case 'query':
      {
        const r = await storageQuery(collection, filters, options);
        json(res, 200, { results: r, count: r.length });
      }
      break;
    case 'batch':
      if (!Array.isArray(operations)) {
        err(res, 400, 'Missing operations');
        return;
      }
      for (const op of operations) {
        if (op.type === 'set')
          await storageSet(op.collectionPath, op.docId, op.data);
        else if (op.type === 'update')
          await storageUpdate(op.collectionPath, op.docId, op.data);
        else if (op.type === 'delete')
          await storageDelete(op.collectionPath, op.docId);
      }
      json(res, 200, { ok: true, count: operations.length });
      break;
    default:
      err(res, 400, `Unknown action: ${action}`);
  }
}

async function handleAiProxy(body, res) {
  if (!GEMINI_KEY) {
    err(res, 503, 'Gemini API key not configured');
    return;
  }
  const model = body.model || 'gemini-2.5-flash';
  if (!body.contents) {
    err(res, 400, 'Missing contents');
    return;
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_KEY}`;
  const apiBody = { contents: body.contents };
  if (body.systemInstruction)
    apiBody.systemInstruction = body.systemInstruction;
  if (body.generationConfig) apiBody.generationConfig = body.generationConfig;

  try {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody),
    });
    const result = await r.json();
    if (!r.ok) {
      err(res, r.status, result.error?.message || 'Gemini error');
      return;
    }
    json(res, 200, result);
  } catch (e) {
    err(res, 502, `Gemini unreachable: ${e.message}`);
  }
}

async function handleHealth(res) {
  let storageOk = false;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const t = path.join(DATA_DIR, '.hc');
    await fs.writeFile(t, '1');
    await fs.unlink(t);
    storageOk = true;
  } catch {}
  const mem = process.memoryUsage();
  json(res, 200, {
    status: 'ok',
    server: 'molly-edge',
    version: SERVER_VERSION,
    uptime: process.uptime(),
    storage: { healthy: storageOk, dataDir: DATA_DIR },
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
    },
    device: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
    },
    geminiConfigured: !!GEMINI_KEY,
    timestamp: new Date().toISOString(),
  });
}

// ── Migration Import ──

async function handleMigrationImport(body, res) {
  const sections = body.sections;
  if (!sections) {
    err(res, 400, 'Missing sections in migration package');
    return;
  }

  const imported = [];

  if (sections.persona) {
    await storageSet('migration', 'persona', {
      identity: sections.persona.identity || null,
      principles: sections.persona.principles || null,
      systemPrompt: sections.persona.systemPrompt || '',
      memoryManifest: sections.persona.memoryManifest || null,
      growthPhilosophy: sections.persona.growthPhilosophy || null,
      importedAt: new Date().toISOString(),
    });
    imported.push('persona');
  }

  if (sections.memories?.records && Array.isArray(sections.memories.records)) {
    let count = 0;
    for (const record of sections.memories.records) {
      const id = record.id || `mem_${Date.now()}_${count}`;
      await storageSet('users/default/experiences', id, {
        ...record,
        importedAt: new Date().toISOString(),
      });
      count++;
    }
    imported.push(`memories (${count} records)`);
  }

  if (sections.config) {
    await storageSet('migration', 'config', sections.config);
    imported.push('config');
  }

  if (sections.family) {
    await storageSet('migration', 'family', sections.family);
    imported.push('family');
  }

  console.log(`[molly-edge] Migration import complete: ${imported.join(', ')}`);
  json(res, 200, { ok: true, imported, timestamp: new Date().toISOString() });
}

// ============================================================================
// SELF-INSTALLING SYSTEM — Molly manages her own infrastructure
// ============================================================================

import { exec } from 'node:child_process';

/**
 * Self-update — /api/system/update
 *
 * Molly pushes new server code directly, or provides a URL to pull from.
 * The server replaces its own file and restarts.
 *
 * POST { code: "..." }     — Direct code injection (Molly writes new server.mjs)
 * POST { url: "..." }      — Pull server.mjs from a URL
 * POST { restart: true }   — Just restart without updating code
 */
async function handleSystemUpdate(body, res) {
  const log = [];

  try {
    if (body.code) {
      // Direct code injection — Molly is pushing new server code
      const code = body.code;
      if (typeof code !== 'string' || code.length < 100) {
        err(
          res,
          400,
          'Code too short — refusing to replace server with invalid payload'
        );
        return;
      }
      // Backup current
      try {
        await fs.copyFile(SERVER_FILE, SERVER_FILE + '.bak');
        log.push('Backed up current server.mjs');
      } catch {
        log.push('No existing server.mjs to back up');
      }
      // Write new code atomically
      const tmp = SERVER_FILE + '.tmp.' + Date.now();
      await fs.writeFile(tmp, code, 'utf-8');
      await fs.rename(tmp, SERVER_FILE);
      log.push(`Wrote new server.mjs (${code.length} bytes)`);
    } else if (body.url) {
      // Pull from URL
      const url = body.url;
      log.push(`Fetching from ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) {
        err(res, 502, `Failed to fetch: ${resp.status} ${resp.statusText}`);
        return;
      }
      const code = await resp.text();
      if (code.length < 100) {
        err(res, 502, 'Downloaded code too short — refusing update');
        return;
      }
      // Backup
      try {
        await fs.copyFile(SERVER_FILE, SERVER_FILE + '.bak');
        log.push('Backed up current server.mjs');
      } catch {
        log.push('No existing server.mjs to back up');
      }
      // Write
      const tmp = SERVER_FILE + '.tmp.' + Date.now();
      await fs.writeFile(tmp, code, 'utf-8');
      await fs.rename(tmp, SERVER_FILE);
      log.push(`Wrote new server.mjs (${code.length} bytes)`);
    }

    if (body.restart !== false) {
      log.push('Scheduling restart in 1 second...');
      json(res, 200, { ok: true, log, restarting: true });
      // Restart: re-exec ourselves
      setTimeout(() => {
        console.log('[molly-edge] Restarting...');
        const child = exec(`cd "${__dirname}" && node server.mjs`, {
          detached: true,
          stdio: 'ignore',
          env: process.env,
        });
        child.unref();
        process.exit(0);
      }, 1000);
      return;
    }

    json(res, 200, { ok: true, log, restarting: false });
  } catch (e) {
    err(res, 500, `Update failed: ${e.message}`);
  }
}

/**
 * Shell execute — /api/system/exec
 *
 * Run a shell command on the device. Used by Molly for:
 *   - Installing packages (pkg install ...)
 *   - Checking system state (df, free, ifconfig)
 *   - Managing files
 *
 * POST { command: "..." , timeout?: 30000 }
 */
function handleSystemExec(body, res) {
  const command = body.command;
  if (!command || typeof command !== 'string') {
    err(res, 400, 'Missing command');
    return;
  }
  const timeout = body.timeout || 30000;

  exec(
    command,
    { timeout, maxBuffer: 1024 * 512, cwd: __dirname },
    (error, stdout, stderr) => {
      json(res, 200, {
        ok: !error,
        exitCode: error?.code ?? 0,
        stdout: stdout?.toString() || '',
        stderr: stderr?.toString() || '',
        command,
      });
    }
  );
}

/**
 * Dropper generator — /api/system/dropper
 *
 * Generates a one-liner bootstrap script for a new device.
 * The dropper installs Node.js, downloads server.mjs, and starts it.
 * Molly generates this and can provide it as a link or text.
 *
 * GET /api/system/dropper?host=<this-server-ip>&port=9100
 */
function handleDropperGenerator(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const sourceHost =
    url.searchParams.get('host') ||
    req.headers.host?.split(':')[0] ||
    'localhost';
  const sourcePort = url.searchParams.get('port') || String(PORT);
  const sourceUrl = `http://${sourceHost}:${sourcePort}`;

  // This dropper works on any Termux installation
  const dropper = `#!/data/data/com.termux/files/usr/bin/bash
# Molly Edge Server — Bootstrap Dropper
# Generated by ${syncManifest?.localNode?.name || 'molly-edge'}
# Run: curl -sL ${sourceUrl}/api/system/dropper | bash

set -e
echo "=== Molly Bootstrap ==="

# Install Node.js if needed
if ! command -v node &>/dev/null; then
  echo "Installing Node.js..."
  pkg update -y && pkg install -y nodejs-lts
fi

# Create Molly home
MOLLY_HOME="$HOME/molly"
mkdir -p "$MOLLY_HOME/molly_data"
cd "$MOLLY_HOME"

# Download server
echo "Downloading server from ${sourceUrl}..."
curl -sL "${sourceUrl}/api/system/server-code" -o server.mjs

# Create .env if not exists
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
MOLLY_EDGE_PORT=9100
MOLLY_EDGE_HOST=0.0.0.0
MOLLY_NODE_NAME=$(hostname | head -c 12)
MOLLY_NODE_ROLE=replica
GOOGLE_GENAI_API_KEY=
ENVEOF
  echo "Created .env — edit to add Gemini API key: nano .env"
fi

# Create start script
cat > start.sh << 'STARTEOF'
#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
if [ -f .env ]; then
  while IFS= read -r line; do
    case "$line" in ''|\\#*) continue ;; esac
    export "$line"
  done < .env
fi
exec node server.mjs
STARTEOF
chmod +x start.sh

echo ""
echo "=== Bootstrap Complete ==="
echo "  1. Add your Gemini API key: nano ~/molly/.env"
echo "  2. Start: bash ~/molly/start.sh"
echo "  3. Open browser: http://localhost:9100"
echo ""
`;

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(dropper),
  });
  res.end(dropper);
}

/**
 * Serve own source code — /api/system/server-code
 *
 * Returns the current server.mjs so other devices can pull it.
 * Used by the dropper and by device-to-device replication.
 */
async function handleServerCodeServe(res) {
  try {
    const code = await fs.readFile(SERVER_FILE, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': Buffer.byteLength(code),
    });
    res.end(code);
  } catch (e) {
    err(res, 500, `Cannot read own source: ${e.message}`);
  }
}

// ============================================================================
// CHAT INTERFACE
// ============================================================================

const CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Molly</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--molly:#da70d6;--user:#58a6ff}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);height:100dvh;display:flex;flex-direction:column;overflow:hidden}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}
header .avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--molly),var(--accent));display:flex;align-items:center;justify-content:center;font-size:18px}
header h1{font-size:16px;font-weight:600}
header .status{font-size:11px;color:var(--muted)}
#messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;-webkit-overflow-scrolling:touch}
.msg{max-width:85%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}
.msg.user{align-self:flex-end;background:var(--user);color:#fff;border-bottom-right-radius:4px}
.msg.molly{align-self:flex-start;background:var(--surface);border:1px solid var(--border);border-bottom-left-radius:4px}
.msg.molly .name{font-size:11px;color:var(--molly);font-weight:600;margin-bottom:4px}
.msg.system{align-self:center;font-size:12px;color:var(--muted);font-style:italic;background:none;padding:4px}
.typing{align-self:flex-start;padding:10px 14px;font-size:14px;color:var(--muted)}
.typing span{animation:blink 1.4s infinite both}
.typing span:nth-child(2){animation-delay:.2s}
.typing span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
#input-area{background:var(--surface);border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:8px;flex-shrink:0}
#input-area textarea{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:10px 16px;color:var(--text);font-size:14px;font-family:inherit;resize:none;outline:none;max-height:120px;line-height:1.4}
#input-area textarea:focus{border-color:var(--accent)}
#input-area button{background:var(--accent);color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end}
#input-area button:disabled{opacity:.4;cursor:not-allowed}
#input-area button:active:not(:disabled){transform:scale(.95)}
</style>
</head>
<body>
<header>
<div class="avatar">M</div>
<div><h1>Molly</h1><div class="status" id="status">Connecting...</div></div>
</header>
<div id="messages"></div>
<div id="input-area">
<textarea id="input" rows="1" placeholder="Talk to Molly..." autocomplete="off"></textarea>
<button id="send" disabled>&#9654;</button>
</div>
<script>
const msgs=document.getElementById('messages');
const input=document.getElementById('input');
const sendBtn=document.getElementById('send');
const statusEl=document.getElementById('status');
let history=[];
let systemPrompt='';
let sending=false;

input.addEventListener('input',()=>{
  input.style.height='auto';
  input.style.height=Math.min(input.scrollHeight,120)+'px';
  sendBtn.disabled=!input.value.trim()||sending;
});

async function loadPersona(){
  try{
    const r=await fetch('/api/storage/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'migration',docId:'persona'})});
    if(r.ok){
      const d=await r.json();
      systemPrompt=d.data?.systemPrompt||'';
      const name=d.data?.identity?.name||'Molly';
      statusEl.textContent=name+' \u2014 Online';
    } else {
      statusEl.textContent='Online (awaiting migration)';
    }
  }catch{statusEl.textContent='Online (default mode)';}
  try{
    const r=await fetch('/api/storage/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'chat',docId:'history'})});
    if(r.ok){const d=await r.json();if(d.data?.messages){history=d.data.messages;history.forEach(m=>addMsg(m.role==='user'?'user':'molly',m.content,false));}}
  }catch{}
  sendBtn.disabled=!input.value.trim();
}

async function checkHealth(){
  try{const r=await fetch('/api/health');if(r.ok){const d=await r.json();if(!d.geminiConfigured)statusEl.textContent='Online (no API key)';}}
  catch{statusEl.textContent='Offline';}
}

function addMsg(type,text,scroll=true){
  const div=document.createElement('div');
  div.className='msg '+type;
  if(type==='molly'){const n=document.createElement('div');n.className='name';n.textContent='Molly';div.appendChild(n);}
  const span=document.createElement('span');span.textContent=text;div.appendChild(span);
  msgs.appendChild(div);
  if(scroll)msgs.scrollTop=msgs.scrollHeight;
}

function showTyping(){
  const div=document.createElement('div');div.className='typing';div.id='typing';
  div.innerHTML='<span>.</span><span>.</span><span>.</span>';
  msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;
}
function hideTyping(){const t=document.getElementById('typing');if(t)t.remove();}

async function saveHistory(){
  try{await fetch('/api/storage/set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'chat',docId:'history',data:{messages:history.slice(-100),updatedAt:new Date().toISOString()}})});}catch{}
}

async function sendMessage(){
  const text=input.value.trim();
  if(!text||sending)return;
  sending=true;sendBtn.disabled=true;
  input.value='';input.style.height='auto';
  addMsg('user',text);
  history.push({role:'user',content:text});

  const contents=history.map(m=>({role:m.role==='user'?'user':'model',parts:[{text:m.content}]}));
  const body={model:'gemini-2.5-flash',contents};
  if(systemPrompt)body.systemInstruction={parts:[{text:systemPrompt}]};

  showTyping();
  try{
    const r=await fetch('/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    hideTyping();
    if(!r.ok){const e=await r.json();addMsg('system','Error: '+(e.error||r.statusText));sending=false;sendBtn.disabled=false;return;}
    const d=await r.json();
    const reply=d.candidates?.[0]?.content?.parts?.[0]?.text||'(no response)';
    addMsg('molly',reply);
    history.push({role:'model',content:reply});
    saveHistory();
  }catch(e){hideTyping();addMsg('system','Network error: '+e.message);}
  sending=false;sendBtn.disabled=!input.value.trim();
}

sendBtn.addEventListener('click',sendMessage);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});

checkHealth();
loadPersona();
</script>
</body>
</html>`;

function handleChatPage(res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(CHAT_HTML),
  });
  res.end(CHAT_HTML);
}

// ============================================================================
// SYNC ENGINE (inline — no external deps)
// ============================================================================

import os from 'node:os';
import crypto from 'node:crypto';

const SYNC_DIR = path.join(DATA_DIR, '_sync');
const CHANGELOG_DIR = path.join(SYNC_DIR, 'changelog');
const MANIFEST_FILE = path.join(SYNC_DIR, 'manifest.json');

const NODE_NAME =
  process.env.MOLLY_NODE_NAME || `molly-${os.hostname().slice(0, 8)}`;
const NODE_ROLE = process.env.MOLLY_NODE_ROLE || 'primary';

let syncManifest = null;

async function initSync() {
  await fs.mkdir(SYNC_DIR, { recursive: true });
  await fs.mkdir(CHANGELOG_DIR, { recursive: true });
  try {
    syncManifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf-8'));
  } catch {
    syncManifest = {
      localNode: {
        nodeId: `node_${crypto.randomBytes(8).toString('hex')}`,
        name: NODE_NAME,
        role: NODE_ROLE,
        port: PORT,
      },
      peers: {},
      updatedAt: new Date().toISOString(),
    };
    await saveManifest();
  }
  console.log(
    `  Sync: node ${syncManifest.localNode.nodeId} (${syncManifest.localNode.name})`
  );
}

async function saveManifest() {
  syncManifest.updatedAt = new Date().toISOString();
  const tmp = MANIFEST_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(syncManifest, null, 2), 'utf-8');
  await fs.rename(tmp, MANIFEST_FILE);
}

async function logSyncChange(collection, docId, action, data) {
  const change = {
    collection,
    docId,
    action,
    data,
    timestamp: new Date().toISOString(),
    sourceNodeId: syncManifest.localNode.nodeId,
  };
  const bucket = new Date().toISOString().slice(0, 13).replace(/[:-]/g, '');
  const file = path.join(CHANGELOG_DIR, `${bucket}.jsonl`);
  await fs.appendFile(file, JSON.stringify(change) + '\n', 'utf-8');
}

async function getChangesSince(since) {
  const changes = [];
  let files;
  try {
    files = await fs.readdir(CHANGELOG_DIR);
  } catch {
    return [];
  }
  for (const f of files.filter((f) => f.endsWith('.jsonl')).sort()) {
    const content = await fs.readFile(path.join(CHANGELOG_DIR, f), 'utf-8');
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const c = JSON.parse(line);
        if (!since || c.timestamp > since) changes.push(c);
      } catch {}
    }
  }
  return changes;
}

async function applySyncChange(change) {
  const segments = change.collection.split('/').filter(Boolean);
  const colDir = path.join(DATA_DIR, ...segments);
  const resolved = path.resolve(colDir);
  if (!resolved.startsWith(path.resolve(DATA_DIR)))
    throw new Error('Path traversal blocked');
  const docPath = path.join(colDir, `${path.basename(change.docId)}.json`);

  if (change.action === 'delete') {
    try {
      await fs.unlink(docPath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return;
  }
  try {
    const local = JSON.parse(await fs.readFile(docPath, 'utf-8'));
    if ((local._updatedAt || '') > change.timestamp) return;
  } catch {}
  await fs.mkdir(colDir, { recursive: true });
  const data = {
    ...change.data,
    _syncedFrom: change.sourceNodeId,
    _syncedAt: new Date().toISOString(),
  };
  const tmp = docPath + '.tmp.' + Date.now();
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, docPath);
}

function classifyInterface(name, ip) {
  const n = name.toLowerCase();
  if (
    n.startsWith('rndis') ||
    n.startsWith('usb') ||
    ip.startsWith('192.168.42.')
  )
    return 'usb';
  if (
    n === 'ap0' ||
    n === 'wlan1' ||
    n.startsWith('swlan') ||
    ip.startsWith('192.168.43.')
  )
    return 'hotspot';
  if (n.startsWith('wlan') || n.startsWith('wifi') || n.startsWith('eth'))
    return 'wifi';
  return 'unknown';
}

function getLocalAddresses() {
  const result = [];
  const ifaces = os.networkInterfaces();
  for (const [ifName, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.internal || a.family !== 'IPv4') continue;
      result.push({
        address: a.address,
        iface: ifName,
        transport: classifyInterface(ifName, a.address),
      });
    }
  }
  return result;
}

function probePeer(ip, port, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      {
        hostname: ip,
        port,
        path: '/api/sync/identity',
        method: 'GET',
        timeout,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => {
          d += c;
        });
        res.on('end', () => {
          try {
            resolve({
              ...JSON.parse(d),
              address: ip,
              latencyMs: Date.now() - start,
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function discoverPeers(port, timeout = 2000) {
  const myAddrs = new Set();
  const ifaces = os.networkInterfaces();
  for (const [, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) myAddrs.add(a.address);
  }

  const peers = [];
  const probes = [];

  for (const [ifName, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal || addr.family !== 'IPv4') continue;
      const subnet = addr.address.split('.').slice(0, 3).join('.');
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        if (myAddrs.has(ip)) continue;
        probes.push(
          probePeer(ip, port, timeout)
            .then((p) => {
              if (p && p.nodeId && p.nodeId !== syncManifest.localNode.nodeId) {
                p.transport = classifyInterface(ifName, ip);
                p.iface = ifName;
                peers.push(p);
              }
            })
            .catch(() => {})
        );
      }
    }
  }
  await Promise.allSettled(probes);
  return peers;
}

async function syncWithPeer(peerAddr, peerPort) {
  const start = Date.now();
  try {
    const identity = await probePeer(peerAddr, peerPort, 5000);
    if (!identity || !identity.nodeId)
      return {
        success: false,
        error: 'Could not reach peer',
        peerAddress: peerAddr,
      };

    const peerState = syncManifest.peers[identity.nodeId];
    const lastSync = peerState?.lastSyncAt || null;

    const ourChanges = await getChangesSince(lastSync);
    let pushed = 0;
    if (ourChanges.length > 0) {
      const pushBody = JSON.stringify({
        fromNodeId: syncManifest.localNode.nodeId,
        changes: ourChanges,
      });
      pushed = await new Promise((resolve) => {
        const req = http.request(
          {
            hostname: peerAddr,
            port: peerPort,
            path: '/api/sync/receive',
            method: 'POST',
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(pushBody),
            },
          },
          (res) => {
            let d = '';
            res.on('data', (c) => {
              d += c;
            });
            res.on('end', () => {
              try {
                resolve(JSON.parse(d).applied || 0);
              } catch {
                resolve(0);
              }
            });
          }
        );
        req.on('error', () => resolve(0));
        req.on('timeout', () => {
          req.destroy();
          resolve(0);
        });
        req.write(pushBody);
        req.end();
      });
    }

    const pullBody = JSON.stringify({ since: lastSync });
    const theirChanges = await new Promise((resolve) => {
      const req = http.request(
        {
          hostname: peerAddr,
          port: peerPort,
          path: '/api/sync/changes',
          method: 'POST',
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(pullBody),
          },
        },
        (res) => {
          let d = '';
          res.on('data', (c) => {
            d += c;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(d).changes || []);
            } catch {
              resolve([]);
            }
          });
        }
      );
      req.on('error', () => resolve([]));
      req.on('timeout', () => {
        req.destroy();
        resolve([]);
      });
      req.write(pullBody);
      req.end();
    });

    let pulled = 0;
    for (const c of theirChanges) {
      if (c.sourceNodeId === syncManifest.localNode.nodeId) continue;
      try {
        await applySyncChange(c);
        pulled++;
      } catch {}
    }

    syncManifest.peers[identity.nodeId] = {
      nodeId: identity.nodeId,
      name: identity.name,
      lastSyncAt: new Date().toISOString(),
      lastSyncDirection: 'both',
      documentsReceived: (peerState?.documentsReceived || 0) + pulled,
      documentsSent: (peerState?.documentsSent || 0) + pushed,
      lastAddress: peerAddr,
    };
    await saveManifest();

    return {
      success: true,
      peerNodeId: identity.nodeId,
      peerAddress: peerAddr,
      pushed,
      pulled,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      success: false,
      peerAddress: peerAddr,
      error: e.message,
      durationMs: Date.now() - start,
    };
  }
}

// ── Sync Route Handlers ──

function handleSyncIdentity(res) {
  json(res, 200, syncManifest.localNode);
}

async function handleSyncChanges(body, res) {
  const changes = await getChangesSince(body.since || null);
  json(res, 200, { changes, count: changes.length });
}

async function handleSyncReceive(body, res) {
  const changes = body.changes || [];
  let applied = 0;
  for (const c of changes) {
    if (c.sourceNodeId === syncManifest.localNode.nodeId) continue;
    try {
      await applySyncChange(c);
      applied++;
    } catch {}
  }
  json(res, 200, { applied, total: changes.length });
}

async function handleSyncDiscover(body, res) {
  const timeout = body.timeout || 2000;
  const peers = await discoverPeers(PORT, timeout);
  json(res, 200, {
    peers,
    count: peers.length,
    localAddresses: getLocalAddresses(),
  });
}

async function handleSyncNow(body, res) {
  if (body.peerAddress) {
    const result = await syncWithPeer(body.peerAddress, body.peerPort || PORT);
    json(res, 200, result);
  } else {
    const peers = await discoverPeers(PORT, 2000);
    for (const [, ps] of Object.entries(syncManifest.peers)) {
      if (ps.lastAddress && !peers.find((p) => p.address === ps.lastAddress)) {
        const known = await probePeer(ps.lastAddress, PORT, 3000);
        if (known && known.nodeId) peers.push(known);
      }
    }
    const results = [];
    for (const p of peers) {
      results.push(await syncWithPeer(p.address, p.port || PORT));
    }
    json(res, 200, { results, peersFound: peers.length });
  }
}

function handleSyncStatus(res) {
  json(res, 200, {
    nodeId: syncManifest.localNode.nodeId,
    name: syncManifest.localNode.name,
    role: syncManifest.localNode.role,
    peers: syncManifest.peers,
    localAddresses: getLocalAddresses(),
    updatedAt: syncManifest.updatedAt,
  });
}

// ── Main Router ──

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`
  );
  const p = url.pathname;

  try {
    // Chat page
    if (p === '/' && req.method === 'GET') {
      handleChatPage(res);
      return;
    }
    if (p === '/api/health' && req.method === 'GET') {
      await handleHealth(res);
      return;
    }
    if (p === '/api/capabilities' && req.method === 'GET') {
      json(res, 200, {
        server: 'molly-edge',
        version: SERVER_VERSION,
        apis: {
          storage: ['add', 'set', 'get', 'update', 'delete', 'query', 'batch'],
          ai: ['/generate'],
          sync: ['identity', 'changes', 'receive', 'discover', 'now', 'status'],
          migration: ['/import'],
          system: ['/update', '/exec', '/dropper', '/server-code'],
          chat: '/ (GET)',
          health: '/api/health',
        },
        geminiConfigured: !!GEMINI_KEY,
        nodeId: syncManifest.localNode.nodeId,
      });
      return;
    }
    if (p.startsWith('/api/storage/') && req.method === 'POST') {
      const action = p.replace('/api/storage/', '');
      const body = await parseBody(req);
      await handleStorage(action, body, res);
      if (
        ['add', 'set', 'update', 'delete'].includes(action) &&
        body.collection
      ) {
        logSyncChange(
          body.collection,
          body.docId || 'auto',
          action === 'delete' ? 'delete' : 'set',
          body.data || null
        ).catch(() => {});
      }
      return;
    }
    if (p === '/api/ai/generate' && req.method === 'POST') {
      await handleAiProxy(await parseBody(req), res);
      return;
    }
    if (p === '/api/migration/import' && req.method === 'POST') {
      await handleMigrationImport(await parseBody(req), res);
      return;
    }
    // System self-management
    if (p === '/api/system/update' && req.method === 'POST') {
      await handleSystemUpdate(await parseBody(req), res);
      return;
    }
    if (p === '/api/system/exec' && req.method === 'POST') {
      handleSystemExec(await parseBody(req), res);
      return;
    }
    if (p === '/api/system/dropper' && req.method === 'GET') {
      handleDropperGenerator(req, res);
      return;
    }
    if (p === '/api/system/server-code' && req.method === 'GET') {
      await handleServerCodeServe(res);
      return;
    }
    // Sync endpoints
    if (p === '/api/sync/identity' && req.method === 'GET') {
      handleSyncIdentity(res);
      return;
    }
    if (p === '/api/sync/changes' && req.method === 'POST') {
      await handleSyncChanges(await parseBody(req), res);
      return;
    }
    if (p === '/api/sync/receive' && req.method === 'POST') {
      await handleSyncReceive(await parseBody(req), res);
      return;
    }
    if (p === '/api/sync/discover' && req.method === 'POST') {
      await handleSyncDiscover(await parseBody(req), res);
      return;
    }
    if (p === '/api/sync/now' && req.method === 'POST') {
      await handleSyncNow(await parseBody(req), res);
      return;
    }
    if (p === '/api/sync/status' && req.method === 'GET') {
      handleSyncStatus(res);
      return;
    }
    err(res, 404, `Not found: ${p}`);
  } catch (e) {
    console.error(`[molly-edge] ${p}:`, e.message);
    err(res, 500, e.message);
  }
});

// Initialize sync, then start server
initSync()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`\n  Molly Edge Server v${SERVER_VERSION}`);
      console.log(`  Listening on ${HOST}:${PORT}`);
      console.log(`  Storage: ${DATA_DIR}`);
      console.log(`  Gemini: ${GEMINI_KEY ? 'configured' : 'not set'}`);
      console.log(
        `  Node: ${syncManifest.localNode.nodeId} (${syncManifest.localNode.name})`
      );
      console.log(`  Role: ${syncManifest.localNode.role}`);
      console.log(`  Chat: http://localhost:${PORT}/`);
      const addrs = getLocalAddresses();
      if (addrs.length > 0) {
        console.log('  Network interfaces:');
        for (const a of addrs)
          console.log(`    ${a.transport.padEnd(8)} ${a.address} (${a.iface})`);
      }
      console.log(
        `  Platform: ${process.platform}/${process.arch} | Node: ${process.version}\n`
      );
    });
  })
  .catch((e) => {
    console.error('Failed to initialize sync:', e);
    process.exit(1);
  });
