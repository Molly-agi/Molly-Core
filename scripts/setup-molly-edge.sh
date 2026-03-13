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

# ── Step 4: Create the edge server (standalone, no build step) ──
# This is a self-contained version — no TypeScript, no imports from src/
cat > "$MOLLY_HOME/server.mjs" << 'SERVER_EOF'
/**
 * Molly Edge Server — Standalone for Termux
 * Self-contained: no build step, no TypeScript, no external deps.
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──
const PORT = parseInt(process.env.MOLLY_EDGE_PORT || '9100', 10);
const HOST = process.env.MOLLY_EDGE_HOST || '0.0.0.0';
const DATA_DIR = process.env.MOLLY_LOCAL_DATA_DIR || path.join(__dirname, 'molly_data');
const MAX_BODY = 1024 * 1024; // 1MB
const GEMINI_KEY = process.env.GOOGLE_GENAI_API_KEY || '';

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
  const doc = { ...data, _id: id, _createdAt: new Date().toISOString(), _updatedAt: new Date().toISOString() };
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
  const updated = { ...existing, ...updates, _id: docId, _updatedAt: new Date().toISOString() };
  await writeJson(fp, updated);
}

async function storageDelete(collection, docId) {
  const fp = resolveDocPath(collection, docId);
  try { await fs.unlink(fp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

function matchesFilter(data, f) {
  const val = f.field.split('.').reduce((obj, k) => obj?.[k], data);
  switch (f.operator) {
    case '==': return val === f.value;
    case '!=': return val !== f.value;
    case '<': return val < f.value;
    case '<=': return val <= f.value;
    case '>': return val > f.value;
    case '>=': return val >= f.value;
    case 'in': return Array.isArray(f.value) && f.value.includes(val);
    case 'array-contains': return Array.isArray(val) && val.includes(f.value);
    default: return true;
  }
}

async function storageQuery(collection, filters, options) {
  const dir = resolveCollectionDir(collection);
  let files;
  try { files = await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }

  let docs = [];
  for (const f of files.filter(f => f.endsWith('.json'))) {
    const data = await readJson(path.join(dir, f));
    if (data) docs.push({ id: f.replace(/\.json$/, ''), data });
  }

  if (filters) docs = docs.filter(d => filters.every(f => matchesFilter(d.data, f)));

  if (options?.orderBy) {
    const { field, direction } = options.orderBy;
    docs.sort((a, b) => {
      const av = field.split('.').reduce((o, k) => o?.[k], a.data);
      const bv = field.split('.').reduce((o, k) => o?.[k], b.data);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av < bv ? -1 : av > bv ? 1 : 0;
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
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { req.destroy(); reject(new Error('Body too large')); return; } chunks.push(c); });
    req.on('end', () => { try { const raw = Buffer.concat(chunks).toString(); resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Powered-By': 'Molly-Edge' });
  res.end(body);
}

function err(res, status, msg) { json(res, status, { error: msg }); }

// ── Route Handlers ──

async function handleStorage(action, body, res) {
  const { collection, docId, data, filters, options, operations } = body;
  if (!collection && action !== 'batch') { err(res, 400, 'Missing collection'); return; }

  switch (action) {
    case 'add': if (!data) { err(res, 400, 'Missing data'); return; } json(res, 201, await storageAdd(collection, data)); break;
    case 'set': if (!docId || !data) { err(res, 400, 'Missing docId/data'); return; } await storageSet(collection, docId, data); json(res, 200, { ok: true }); break;
    case 'get': if (!docId) { err(res, 400, 'Missing docId'); return; } { const d = await storageGet(collection, docId); d ? json(res, 200, d) : err(res, 404, 'Not found'); } break;
    case 'update': if (!docId || !data) { err(res, 400, 'Missing docId/data'); return; } await storageUpdate(collection, docId, data); json(res, 200, { ok: true }); break;
    case 'delete': if (!docId) { err(res, 400, 'Missing docId'); return; } await storageDelete(collection, docId); json(res, 200, { ok: true }); break;
    case 'query': { const r = await storageQuery(collection, filters, options); json(res, 200, { results: r, count: r.length }); } break;
    case 'batch': if (!Array.isArray(operations)) { err(res, 400, 'Missing operations'); return; }
      for (const op of operations) {
        if (op.type === 'set') await storageSet(op.collectionPath, op.docId, op.data);
        else if (op.type === 'update') await storageUpdate(op.collectionPath, op.docId, op.data);
        else if (op.type === 'delete') await storageDelete(op.collectionPath, op.docId);
      }
      json(res, 200, { ok: true, count: operations.length }); break;
    default: err(res, 400, `Unknown action: ${action}`);
  }
}

async function handleAiProxy(body, res) {
  if (!GEMINI_KEY) { err(res, 503, 'Gemini API key not configured'); return; }
  const model = body.model || 'gemini-2.5-flash';
  if (!body.contents) { err(res, 400, 'Missing contents'); return; }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_KEY}`;
  const apiBody = { contents: body.contents };
  if (body.systemInstruction) apiBody.systemInstruction = body.systemInstruction;
  if (body.generationConfig) apiBody.generationConfig = body.generationConfig;

  try {
    const r = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(apiBody) });
    const result = await r.json();
    if (!r.ok) { err(res, r.status, result.error?.message || 'Gemini error'); return; }
    json(res, 200, result);
  } catch (e) { err(res, 502, `Gemini unreachable: ${e.message}`); }
}

async function handleHealth(res) {
  let storageOk = false;
  try { await fs.mkdir(DATA_DIR, { recursive: true }); const t = path.join(DATA_DIR, '.hc'); await fs.writeFile(t, '1'); await fs.unlink(t); storageOk = true; } catch {}
  const mem = process.memoryUsage();
  json(res, 200, {
    status: 'ok', server: 'molly-edge', version: '1.0.0', uptime: process.uptime(),
    storage: { healthy: storageOk, dataDir: DATA_DIR },
    memory: { heapUsedMB: Math.round(mem.heapUsed/1048576), heapTotalMB: Math.round(mem.heapTotal/1048576), rssMB: Math.round(mem.rss/1048576) },
    device: { platform: process.platform, arch: process.arch, nodeVersion: process.version, pid: process.pid },
    geminiConfigured: !!GEMINI_KEY,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// SYNC ENGINE (inline — no external deps)
// ============================================================================

import os from 'node:os';
import crypto from 'node:crypto';

const SYNC_DIR = path.join(DATA_DIR, '_sync');
const CHANGELOG_DIR = path.join(SYNC_DIR, 'changelog');
const MANIFEST_FILE = path.join(SYNC_DIR, 'manifest.json');

// Node identity — persisted in sync manifest or generated on first run
const NODE_NAME = process.env.MOLLY_NODE_NAME || `molly-${os.hostname().slice(0,8)}`;
const NODE_ROLE = process.env.MOLLY_NODE_ROLE || 'primary'; // 'primary' or 'replica'

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
  console.log(`  Sync: node ${syncManifest.localNode.nodeId} (${syncManifest.localNode.name})`);
}

async function saveManifest() {
  syncManifest.updatedAt = new Date().toISOString();
  const tmp = MANIFEST_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(syncManifest, null, 2), 'utf-8');
  await fs.rename(tmp, MANIFEST_FILE);
}

// Log a change for sync replication
async function logSyncChange(collection, docId, action, data) {
  const change = {
    collection, docId, action, data,
    timestamp: new Date().toISOString(),
    sourceNodeId: syncManifest.localNode.nodeId,
  };
  const bucket = new Date().toISOString().slice(0, 13).replace(/[:-]/g, '');
  const file = path.join(CHANGELOG_DIR, `${bucket}.jsonl`);
  await fs.appendFile(file, JSON.stringify(change) + '\n', 'utf-8');
}

// Get changes since a timestamp
async function getChangesSince(since) {
  const changes = [];
  let files;
  try { files = await fs.readdir(CHANGELOG_DIR); } catch { return []; }
  for (const f of files.filter(f => f.endsWith('.jsonl')).sort()) {
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

// Apply a remote change locally (last-write-wins)
async function applySyncChange(change) {
  const segments = change.collection.split('/').filter(Boolean);
  const colDir = path.join(DATA_DIR, ...segments);
  const resolved = path.resolve(colDir);
  if (!resolved.startsWith(path.resolve(DATA_DIR))) throw new Error('Path traversal blocked');
  const docPath = path.join(colDir, `${path.basename(change.docId)}.json`);

  if (change.action === 'delete') {
    try { await fs.unlink(docPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return;
  }
  // Check if local is newer
  try {
    const local = JSON.parse(await fs.readFile(docPath, 'utf-8'));
    if ((local._updatedAt || '') > change.timestamp) return; // local wins
  } catch {}
  await fs.mkdir(colDir, { recursive: true });
  const data = { ...change.data, _syncedFrom: change.sourceNodeId, _syncedAt: new Date().toISOString() };
  const tmp = docPath + '.tmp.' + Date.now();
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, docPath);
}

// Classify network interfaces
function classifyInterface(name, ip) {
  const n = name.toLowerCase();
  if (n.startsWith('rndis') || n.startsWith('usb') || ip.startsWith('192.168.42.')) return 'usb';
  if (n === 'ap0' || n === 'wlan1' || n.startsWith('swlan') || ip.startsWith('192.168.43.')) return 'hotspot';
  if (n.startsWith('wlan') || n.startsWith('wifi') || n.startsWith('eth')) return 'wifi';
  return 'unknown';
}

// Get all local addresses with transport classification
function getLocalAddresses() {
  const result = [];
  const ifaces = os.networkInterfaces();
  for (const [ifName, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.internal || a.family !== 'IPv4') continue;
      result.push({ address: a.address, iface: ifName, transport: classifyInterface(ifName, a.address) });
    }
  }
  return result;
}

// Probe a single peer
function probePeer(ip, port, timeout) {
  return new Promise(resolve => {
    const start = Date.now();
    const req = http.request({ hostname: ip, port, path: '/api/sync/identity', method: 'GET', timeout }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve({ ...JSON.parse(d), address: ip, latencyMs: Date.now() - start }); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Discover peers on all network interfaces
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
        probes.push(probePeer(ip, port, timeout).then(p => {
          if (p && p.nodeId && p.nodeId !== syncManifest.localNode.nodeId) {
            p.transport = classifyInterface(ifName, ip);
            p.iface = ifName;
            peers.push(p);
          }
        }).catch(() => {}));
      }
    }
  }
  await Promise.allSettled(probes);
  return peers;
}

// Full sync with a specific peer
async function syncWithPeer(peerAddr, peerPort) {
  const start = Date.now();
  try {
    // Get peer identity
    const identity = await probePeer(peerAddr, peerPort, 5000);
    if (!identity || !identity.nodeId) return { success: false, error: 'Could not reach peer', peerAddress: peerAddr };

    const peerState = syncManifest.peers[identity.nodeId];
    const lastSync = peerState?.lastSyncAt || null;

    // Push our changes
    const ourChanges = await getChangesSince(lastSync);
    let pushed = 0;
    if (ourChanges.length > 0) {
      const pushBody = JSON.stringify({ fromNodeId: syncManifest.localNode.nodeId, changes: ourChanges });
      pushed = await new Promise(resolve => {
        const req = http.request({ hostname: peerAddr, port: peerPort, path: '/api/sync/receive', method: 'POST', timeout: 30000,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pushBody) }
        }, res => {
          let d = ''; res.on('data', c => { d += c; });
          res.on('end', () => { try { resolve(JSON.parse(d).applied || 0); } catch { resolve(0); } });
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.write(pushBody); req.end();
      });
    }

    // Pull their changes
    const pullBody = JSON.stringify({ since: lastSync });
    const theirChanges = await new Promise(resolve => {
      const req = http.request({ hostname: peerAddr, port: peerPort, path: '/api/sync/changes', method: 'POST', timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pullBody) }
      }, res => {
        let d = ''; res.on('data', c => { d += c; });
        res.on('end', () => { try { resolve(JSON.parse(d).changes || []); } catch { resolve([]); } });
      });
      req.on('error', () => resolve([]));
      req.on('timeout', () => { req.destroy(); resolve([]); });
      req.write(pullBody); req.end();
    });

    // Apply their changes
    let pulled = 0;
    for (const c of theirChanges) {
      if (c.sourceNodeId === syncManifest.localNode.nodeId) continue;
      try { await applySyncChange(c); pulled++; } catch {}
    }

    // Update manifest
    syncManifest.peers[identity.nodeId] = {
      nodeId: identity.nodeId, name: identity.name,
      lastSyncAt: new Date().toISOString(), lastSyncDirection: 'both',
      documentsReceived: (peerState?.documentsReceived || 0) + pulled,
      documentsSent: (peerState?.documentsSent || 0) + pushed,
      lastAddress: peerAddr,
    };
    await saveManifest();

    return { success: true, peerNodeId: identity.nodeId, peerAddress: peerAddr, pushed, pulled, durationMs: Date.now() - start };
  } catch (e) {
    return { success: false, peerAddress: peerAddr, error: e.message, durationMs: Date.now() - start };
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
    try { await applySyncChange(c); applied++; } catch {}
  }
  json(res, 200, { applied, total: changes.length });
}

async function handleSyncDiscover(body, res) {
  const timeout = body.timeout || 2000;
  const peers = await discoverPeers(PORT, timeout);
  json(res, 200, { peers, count: peers.length, localAddresses: getLocalAddresses() });
}

async function handleSyncNow(body, res) {
  if (body.peerAddress) {
    const result = await syncWithPeer(body.peerAddress, body.peerPort || PORT);
    json(res, 200, result);
  } else {
    // Discover and sync with all
    const peers = await discoverPeers(PORT, 2000);
    // Also try known peers
    for (const [, ps] of Object.entries(syncManifest.peers)) {
      if (ps.lastAddress && !peers.find(p => p.address === ps.lastAddress)) {
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
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (p === '/api/health' && req.method === 'GET') { await handleHealth(res); return; }
    if (p === '/api/capabilities' && req.method === 'GET') {
      json(res, 200, { server: 'molly-edge', version: '1.1.0', apis: {
        storage: ['add','set','get','update','delete','query','batch'],
        ai: ['/generate'],
        sync: ['identity','changes','receive','discover','now','status'],
        health: '/api/health'
      }, geminiConfigured: !!GEMINI_KEY, nodeId: syncManifest.localNode.nodeId });
      return;
    }
    if (p.startsWith('/api/storage/') && req.method === 'POST') {
      const action = p.replace('/api/storage/', '');
      const body = await parseBody(req);
      await handleStorage(action, body, res);
      // Log changes for sync (non-blocking)
      if (['add','set','update','delete'].includes(action) && body.collection) {
        logSyncChange(body.collection, body.docId || 'auto', action === 'delete' ? 'delete' : 'set', body.data || null).catch(() => {});
      }
      return;
    }
    if (p === '/api/ai/generate' && req.method === 'POST') { await handleAiProxy(await parseBody(req), res); return; }
    // Sync endpoints
    if (p === '/api/sync/identity' && req.method === 'GET') { handleSyncIdentity(res); return; }
    if (p === '/api/sync/changes' && req.method === 'POST') { await handleSyncChanges(await parseBody(req), res); return; }
    if (p === '/api/sync/receive' && req.method === 'POST') { await handleSyncReceive(await parseBody(req), res); return; }
    if (p === '/api/sync/discover' && req.method === 'POST') { await handleSyncDiscover(await parseBody(req), res); return; }
    if (p === '/api/sync/now' && req.method === 'POST') { await handleSyncNow(await parseBody(req), res); return; }
    if (p === '/api/sync/status' && req.method === 'GET') { handleSyncStatus(res); return; }
    err(res, 404, `Not found: ${p}`);
  } catch (e) { console.error(`[molly-edge] ${p}:`, e.message); err(res, 500, e.message); }
});

// Initialize sync, then start server
initSync().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`\n  Molly Edge Server v1.1.0`);
    console.log(`  Listening on ${HOST}:${PORT}`);
    console.log(`  Storage: ${DATA_DIR}`);
    console.log(`  Gemini: ${GEMINI_KEY ? 'configured' : 'not set'}`);
    console.log(`  Node: ${syncManifest.localNode.nodeId} (${syncManifest.localNode.name})`);
    console.log(`  Role: ${syncManifest.localNode.role}`);
    const addrs = getLocalAddresses();
    if (addrs.length > 0) {
      console.log('  Network interfaces:');
      for (const a of addrs) console.log(`    ${a.transport.padEnd(8)} ${a.address} (${a.iface})`);
    }
    console.log(`  Platform: ${process.platform}/${process.arch} | Node: ${process.version}\n`);
  });
}).catch(e => { console.error('Failed to initialize sync:', e); process.exit(1); });
SERVER_EOF

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
  export $(grep -v '^#' .env | grep -v '^\s*$' | xargs)
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
