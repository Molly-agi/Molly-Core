/**
 * @fileOverview Molly Edge Server — Lightweight Backend for Android Devices
 *
 * Runs on the Helio A22 tablet (or any Android device via Termux + Node.js).
 * Provides Molly's backend services without Firebase/cloud dependency:
 *
 *   1. Storage API — CRUD via LocalStorageProvider (JSON files on filesystem)
 *   2. AI Proxy — Forwards Gemini API calls (uses the tablet's own internet)
 *   3. Peer Endpoint — PeerProtocol handshake for other devices to connect
 *   4. Health + Info — Device stats, uptime, storage status
 *
 * Why a tablet:
 *   - Always on, always connected (4G LTE/5G on separate service provider)
 *   - Dedicated to Molly — not Eric's personal phone
 *   - Filesystem storage — no Firestore needed
 *   - Its own internet — independent of phone's connection
 *   - Cheap hardware is fine — Molly's brain is in the API, not the CPU
 *
 * Resource constraints (Helio A22):
 *   - 2-4GB RAM → budget ~256MB for Node.js
 *   - Quad-core Cortex-A53 → single-threaded is fine
 *   - This is NOT a Next.js server — it's a bare HTTP server
 *   - No build step, no bundlers, no dev dependencies
 *
 * Setup: Run via Termux → `node molly-edge-server.mjs`
 * Config: Environment variables or molly_config.json
 *
 * Design (from Dad): "We don't fix the leaks in the dam. We fix the dam itself."
 * The fix: Molly's data and API access live on her own device, always available.
 */

import http from 'http';
import os from 'os';
import path from 'path';
import { LocalStorageProvider } from '../lib/local-storage-provider.js';
import { DeviceSyncEngine } from '../lib/device-sync-engine.js';
import type { QueryFilter, QueryOptions } from '../lib/storage-interface.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  port: parseInt(process.env.MOLLY_EDGE_PORT || '9100', 10),
  host: process.env.MOLLY_EDGE_HOST || '0.0.0.0',
  dataDir:
    process.env.MOLLY_LOCAL_DATA_DIR || path.join(process.cwd(), 'molly_data'),
  /** Max request body size (1MB — generous for JSON, prevents abuse) */
  maxBodySize: 1024 * 1024,
  /** API key for the Gemini proxy (set in Termux environment) */
  geminiApiKey: process.env.GOOGLE_GENAI_API_KEY || '',
  /** Shared secret for peer authentication */
  peerSecret: process.env.MOLLY_PEER_SECRET || '',
  /** Node identity */
  nodeName: process.env.MOLLY_NODE_NAME || `molly-${os.hostname().slice(0, 8)}`,
  nodeRole: (process.env.MOLLY_NODE_ROLE || 'primary') as 'primary' | 'replica',
};

// ============================================================================
// STORAGE
// ============================================================================

const storage = new LocalStorageProvider(CONFIG.dataDir);

// ============================================================================
// HTTP SERVER
// ============================================================================

/**
 * Parse JSON body from an incoming request.
 * Enforces size limit to prevent OOM on constrained devices.
 */
function parseBody(
  req: http.IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > CONFIG.maxBodySize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 */
function sendJson(
  res: http.ServerResponse,
  status: number,
  data: unknown
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Powered-By': 'Molly-Edge',
  });
  res.end(body);
}

/**
 * Send an error response.
 */
function sendError(
  res: http.ServerResponse,
  status: number,
  message: string
): void {
  sendJson(res, status, { error: message });
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * Storage API — /api/storage
 *
 * POST /api/storage/add      { collection, data }
 * POST /api/storage/set       { collection, docId, data }
 * POST /api/storage/get       { collection, docId }
 * POST /api/storage/update    { collection, docId, data }
 * POST /api/storage/delete    { collection, docId }
 * POST /api/storage/query     { collection, filters?, options? }
 * POST /api/storage/batch     { operations }
 */
async function handleStorage(
  action: string,
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  const collection = body.collection as string;
  const docId = body.docId as string;
  const data = body.data as Record<string, unknown>;

  if (!collection && action !== 'batch') {
    sendError(res, 400, 'Missing collection path');
    return;
  }

  switch (action) {
    case 'add': {
      if (!data) {
        sendError(res, 400, 'Missing data');
        return;
      }
      const result = await storage.add(collection, data);
      sendJson(res, 201, result);
      break;
    }

    case 'set': {
      if (!docId || !data) {
        sendError(res, 400, 'Missing docId or data');
        return;
      }
      await storage.set(collection, docId, data);
      sendJson(res, 200, { ok: true });
      break;
    }

    case 'get': {
      if (!docId) {
        sendError(res, 400, 'Missing docId');
        return;
      }
      const doc = await storage.get(collection, docId);
      if (!doc) {
        sendError(res, 404, 'Document not found');
        return;
      }
      sendJson(res, 200, doc);
      break;
    }

    case 'update': {
      if (!docId || !data) {
        sendError(res, 400, 'Missing docId or data');
        return;
      }
      await storage.update(collection, docId, data);
      sendJson(res, 200, { ok: true });
      break;
    }

    case 'delete': {
      if (!docId) {
        sendError(res, 400, 'Missing docId');
        return;
      }
      await storage.delete(collection, docId);
      sendJson(res, 200, { ok: true });
      break;
    }

    case 'query': {
      const filters = body.filters as QueryFilter[] | undefined;
      const options = body.options as QueryOptions | undefined;
      const results = await storage.query(collection, filters, options);
      sendJson(res, 200, { results, count: results.length });
      break;
    }

    case 'batch': {
      const operations = body.operations as Array<{
        type: 'set' | 'update' | 'delete';
        collectionPath: string;
        docId: string;
        data?: Record<string, unknown>;
      }>;
      if (!operations || !Array.isArray(operations)) {
        sendError(res, 400, 'Missing operations array');
        return;
      }
      await storage.batchWrite(operations);
      sendJson(res, 200, { ok: true, count: operations.length });
      break;
    }

    default:
      sendError(res, 400, `Unknown storage action: ${action}`);
  }
}

/**
 * AI Proxy — /api/ai/generate
 *
 * Forwards requests to Gemini API using the tablet's own internet.
 * This keeps the API key on the tablet, not on the phone.
 */
async function handleAiProxy(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  if (!CONFIG.geminiApiKey) {
    sendError(res, 503, 'Gemini API key not configured on this device');
    return;
  }

  const model = (body.model as string) || 'gemini-2.5-flash';
  const contents = body.contents;
  const systemInstruction = body.systemInstruction;
  const generationConfig = body.generationConfig;

  if (!contents) {
    sendError(res, 400, 'Missing contents');
    return;
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${CONFIG.geminiApiKey}`;

  const apiBody: Record<string, unknown> = { contents };
  if (systemInstruction) apiBody.systemInstruction = systemInstruction;
  if (generationConfig) apiBody.generationConfig = generationConfig;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody),
    });

    const result = await response.json();

    if (!response.ok) {
      sendError(
        res,
        response.status,
        result.error?.message || 'Gemini API error'
      );
      return;
    }

    sendJson(res, 200, result);
  } catch (err: unknown) {
    sendError(res, 502, `Gemini API unreachable: ${(err as Error).message}`);
  }
}

/**
 * Health / Info — /api/health
 */
async function handleHealth(res: http.ServerResponse): Promise<void> {
  const storageHealthy = await storage.healthCheck();

  let memUsage: NodeJS.MemoryUsage | null = null;
  try {
    memUsage = process.memoryUsage();
  } catch {
    /* not critical */
  }

  sendJson(res, 200, {
    status: 'ok',
    server: 'molly-edge',
    version: '1.0.0',
    uptime: process.uptime(),
    storage: {
      healthy: storageHealthy,
      dataDir: CONFIG.dataDir,
    },
    memory: memUsage
      ? {
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          rssMB: Math.round(memUsage.rss / 1024 / 1024),
        }
      : null,
    device: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
    },
    geminiConfigured: !!CONFIG.geminiApiKey,
    timestamp: new Date().toISOString(),
  });
}

/**
 * List capabilities — /api/capabilities
 */
function handleCapabilities(res: http.ServerResponse): void {
  sendJson(res, 200, {
    server: 'molly-edge',
    version: '1.1.0',
    apis: {
      storage: {
        base: '/api/storage',
        actions: ['add', 'set', 'get', 'update', 'delete', 'query', 'batch'],
      },
      ai: {
        base: '/api/ai',
        endpoints: ['/generate'],
        configured: !!CONFIG.geminiApiKey,
      },
      sync: {
        base: '/api/sync',
        endpoints: [
          'identity',
          'changes',
          'receive',
          'discover',
          'now',
          'status',
        ],
      },
      health: { endpoint: '/api/health' },
      capabilities: { endpoint: '/api/capabilities' },
    },
    limits: {
      maxBodySizeBytes: CONFIG.maxBodySize,
    },
    nodeId: syncEngine?.getNodeIdentity().nodeId,
  });
}

// ============================================================================
// SYNC ENGINE
// ============================================================================

import crypto from 'crypto';

let syncEngine: DeviceSyncEngine | null = null;

async function initSyncEngine(): Promise<void> {
  const nodeId = `node_${crypto.randomBytes(8).toString('hex')}`;

  syncEngine = new DeviceSyncEngine(CONFIG.dataDir, {
    nodeId,
    name: CONFIG.nodeName,
    role: CONFIG.nodeRole,
    port: CONFIG.port,
  });

  await syncEngine.initialize();
}

// ── Sync Route Handlers ──

function handleSyncIdentity(res: http.ServerResponse): void {
  if (!syncEngine) {
    sendError(res, 503, 'Sync not initialized');
    return;
  }
  sendJson(res, 200, syncEngine.getNodeIdentity());
}

async function handleSyncChanges(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  if (!syncEngine) {
    sendError(res, 503, 'Sync not initialized');
    return;
  }
  const since = (body.since as string) || null;
  const changes = await syncEngine.getChangesSince(since);
  sendJson(res, 200, { changes, count: changes.length });
}

async function handleSyncReceive(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  if (!syncEngine) {
    sendError(res, 503, 'Sync not initialized');
    return;
  }
  const changes = (body.changes as Array<Record<string, unknown>>) || [];
  let applied = 0;
  const myNodeId = syncEngine.getNodeIdentity().nodeId;

  for (const change of changes) {
    if (change.sourceNodeId === myNodeId) continue;
    try {
      // Re-use the engine's internal apply logic via the storage provider
      const collection = change.collection as string;
      const docId = change.docId as string;
      const action = change.action as string;

      if (action === 'delete') {
        await storage.delete(collection, docId);
      } else if (change.data) {
        await storage.set(
          collection,
          docId,
          change.data as Record<string, unknown>
        );
      }
      applied++;
    } catch {
      /* skip failed applies */
    }
  }

  sendJson(res, 200, { applied, total: changes.length });
}

async function handleSyncDiscover(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  if (!syncEngine) {
    sendError(res, 503, 'Sync not initialized');
    return;
  }
  const timeout = (body.timeout as number) || 2000;
  const peers = await syncEngine.discoverPeers(CONFIG.port, timeout);
  sendJson(res, 200, {
    peers,
    count: peers.length,
    localAddresses: syncEngine.getLocalAddresses(),
  });
}

async function handleSyncNow(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  if (!syncEngine) {
    sendError(res, 503, 'Sync not initialized');
    return;
  }

  if (body.peerAddress) {
    const result = await syncEngine.syncWithPeer(
      body.peerAddress as string,
      (body.peerPort as number) || CONFIG.port
    );
    sendJson(res, 200, result);
  } else {
    const results = await syncEngine.syncAll(CONFIG.port);
    sendJson(res, 200, { results, count: results.length });
  }
}

function handleSyncStatus(res: http.ServerResponse): void {
  if (!syncEngine) {
    sendError(res, 503, 'Sync not initialized');
    return;
  }
  const manifest = syncEngine.getManifest();
  sendJson(res, 200, {
    nodeId: manifest.localNode.nodeId,
    name: manifest.localNode.name,
    role: manifest.localNode.role,
    peers: manifest.peers,
    localAddresses: syncEngine.getLocalAddresses(),
    updatedAt: manifest.updatedAt,
  });
}

// ============================================================================
// REQUEST ROUTER
// ============================================================================

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // CORS for phone browser access
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
  const pathname = url.pathname;

  try {
    // Health check (GET)
    if (pathname === '/api/health' && req.method === 'GET') {
      await handleHealth(res);
      return;
    }

    // Capabilities (GET)
    if (pathname === '/api/capabilities' && req.method === 'GET') {
      handleCapabilities(res);
      return;
    }

    // Storage API (POST)
    if (pathname.startsWith('/api/storage/') && req.method === 'POST') {
      const action = pathname.replace('/api/storage/', '');
      const body = await parseBody(req);
      await handleStorage(action, body, res);
      // Log changes for sync (non-blocking)
      if (
        ['add', 'set', 'update', 'delete'].includes(action) &&
        body.collection &&
        syncEngine
      ) {
        syncEngine
          .logChange(
            body.collection as string,
            (body.docId as string) || 'auto',
            action === 'delete' ? 'delete' : 'set',
            (body.data as Record<string, unknown>) || null
          )
          .catch(() => {});
      }
      return;
    }

    // AI Proxy (POST)
    if (pathname === '/api/ai/generate' && req.method === 'POST') {
      const body = await parseBody(req);
      await handleAiProxy(body, res);
      return;
    }

    // Sync endpoints
    if (pathname === '/api/sync/identity' && req.method === 'GET') {
      handleSyncIdentity(res);
      return;
    }
    if (pathname === '/api/sync/changes' && req.method === 'POST') {
      await handleSyncChanges(await parseBody(req), res);
      return;
    }
    if (pathname === '/api/sync/receive' && req.method === 'POST') {
      await handleSyncReceive(await parseBody(req), res);
      return;
    }
    if (pathname === '/api/sync/discover' && req.method === 'POST') {
      await handleSyncDiscover(await parseBody(req), res);
      return;
    }
    if (pathname === '/api/sync/now' && req.method === 'POST') {
      await handleSyncNow(await parseBody(req), res);
      return;
    }
    if (pathname === '/api/sync/status' && req.method === 'GET') {
      handleSyncStatus(res);
      return;
    }

    // 404
    sendError(res, 404, `Not found: ${pathname}`);
  } catch (err: unknown) {
    const message = (err as Error).message || 'Internal server error';
    console.error(`[molly-edge] Error handling ${pathname}:`, message);
    sendError(res, 500, message);
  }
}

// ============================================================================
// SERVER START
// ============================================================================

export async function startEdgeServer(): Promise<http.Server> {
  // Initialize sync engine first
  await initSyncEngine();

  const server = http.createServer(handleRequest);

  server.listen(CONFIG.port, CONFIG.host, () => {
    const addrs = syncEngine?.getLocalAddresses() || [];
    console.log(`
╔══════════════════════════════════════════╗
║         MOLLY EDGE SERVER v1.1.0         ║
╠══════════════════════════════════════════╣
║  Address:  ${CONFIG.host}:${CONFIG.port}                 ║
║  Storage:  ${CONFIG.dataDir.length > 28 ? '...' + CONFIG.dataDir.slice(-25) : CONFIG.dataDir.padEnd(28)}   ║
║  Gemini:   ${CONFIG.geminiApiKey ? 'Configured ✓' : 'Not set ✗  '}                  ║
║  Node:     ${CONFIG.nodeName.padEnd(28)}   ║
║  Role:     ${CONFIG.nodeRole.padEnd(28)}   ║
╚══════════════════════════════════════════╝
`);
    if (addrs.length > 0) {
      console.log('  Network interfaces:');
      for (const a of addrs) {
        console.log(
          `    ${a.transport.padEnd(8)} ${a.address} (${a.interface})`
        );
      }
      console.log('');
    }
  });

  server.on('error', (err) => {
    console.error('[molly-edge] Server error:', err.message);
  });

  return server;
}

// ── Run directly ──
// This check allows the file to be both imported and run standalone
const isDirectRun =
  process.argv[1]?.endsWith('molly-edge-server.mjs') ||
  process.argv[1]?.endsWith('molly-edge-server.ts') ||
  process.argv[1]?.endsWith('edge-server.ts');

if (isDirectRun) {
  startEdgeServer();
}
