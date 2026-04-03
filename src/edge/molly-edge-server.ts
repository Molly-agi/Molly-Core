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

import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import {
  promises as fsPromises,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { getStorageRouter } from '../lib/storage-router.js';
import { DeviceSyncEngine } from '../lib/device-sync-engine.js';
import type { QueryFilter, QueryOptions } from '../lib/storage-interface.js';

const SERVER_VERSION = '2.1.0';

// ============================================================================
// CHAT INTERFACE — Served at / for tablet access
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

// Auto-resize textarea
input.addEventListener('input',()=>{
  input.style.height='auto';
  input.style.height=Math.min(input.scrollHeight,120)+'px';
  sendBtn.disabled=!input.value.trim()||sending;
});

// Load persona from storage (set by migration import)
async function loadPersona(){
  try{
    const r=await fetch('/api/storage/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'migration',docId:'persona'})});
    if(r.ok){const d=await r.json();systemPrompt=d.data?.systemPrompt||'';statusEl.textContent='Online';}
    else{statusEl.textContent='Online (no persona loaded)';}
  }catch{statusEl.textContent='Online (default mode)';}
  // Load chat history from storage
  try{
    const r=await fetch('/api/storage/get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'chat',docId:'history'})});
    if(r.ok){const d=await r.json();if(d.data?.messages){history=d.data.messages;history.forEach(m=>addMsg(m.role==='user'?'user':'molly',m.content,false));}}
  }catch{}
  sendBtn.disabled=!input.value.trim();
}

// Check health
async function checkHealth(){
  try{const r=await fetch('/api/health');if(r.ok){const d=await r.json();if(d.geminiConfigured)statusEl.textContent='Online';else statusEl.textContent='Online (no API key)';}}
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
  sending=true;
  sendBtn.disabled=true;
  input.value='';
  input.style.height='auto';
  addMsg('user',text);
  history.push({role:'user',content:text});

  // Build Gemini API request
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
  sending=false;
  sendBtn.disabled=!input.value.trim();
}

sendBtn.addEventListener('click',sendMessage);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});

checkHealth();
loadPersona();
</script>
</body>
</html>`;

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

// Shared promise — resolved once on first use; subsequent calls are instant
const storagePromise = getStorageRouter();

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
  const storage = await storagePromise;

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
      syncEngine?.logChange(collection, result.id, 'set', data).catch((err) => {
        console.error(
          '[molly-edge] Sync log failed for add:',
          err instanceof Error ? err.message : String(err)
        );
      });
      sendJson(res, 201, result);
      break;
    }

    case 'set': {
      if (!docId || !data) {
        sendError(res, 400, 'Missing docId or data');
        return;
      }
      await storage.set(collection, docId, data);
      syncEngine?.logChange(collection, docId, 'set', data).catch((err) => {
        console.error(
          '[molly-edge] Sync log failed for set:',
          err instanceof Error ? err.message : String(err)
        );
      });
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
      syncEngine?.logChange(collection, docId, 'set', data).catch((err) => {
        console.error(
          '[molly-edge] Sync log failed for set:',
          err instanceof Error ? err.message : String(err)
        );
      });
      sendJson(res, 200, { ok: true });
      break;
    }

    case 'delete': {
      if (!docId) {
        sendError(res, 400, 'Missing docId');
        return;
      }
      await storage.delete(collection, docId);
      syncEngine?.logChange(collection, docId, 'delete', null).catch((err) => {
        console.error(
          '[molly-edge] Sync log failed for delete:',
          err instanceof Error ? err.message : String(err)
        );
      });
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
      const operations = body.operations as unknown;
      if (!Array.isArray(operations)) {
        sendError(res, 400, 'Missing operations array');
        return;
      }
      // Validate and coerce to BatchOperation[]
      const validOps = [];
      for (const op of operations) {
        if (!op || typeof op !== 'object') continue;
        if (!('type' in op) || !('collectionPath' in op) || !('docId' in op))
          continue;
        if (
          (op.type === 'set' || op.type === 'update') &&
          typeof op.data !== 'object'
        )
          continue;
        validOps.push(op as import('../lib/storage-interface').BatchOperation);
      }
      if (validOps.length !== operations.length) {
        sendError(res, 400, 'Invalid batch operation(s)');
        return;
      }
      await storage.batchWrite(validOps);
      // Log each batch operation for sync
      for (const op of validOps) {
        syncEngine
          ?.logChange(
            op.collectionPath,
            op.docId,
            op.type === 'delete' ? 'delete' : 'set',
            op.type === 'delete'
              ? null
              : (op as { data?: unknown }).data || null
          )
          .catch((err) => {
            console.error(
              '[molly-edge] Sync log failed for batch:',
              err instanceof Error ? err.message : String(err)
            );
          });
      }
      sendJson(res, 200, { ok: true, count: validOps.length });
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
  const storage = await storagePromise;
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
    version: SERVER_VERSION,
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
    version: SERVER_VERSION,
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
      system: {
        base: '/api/system',
        endpoints: ['/update', '/exec', '/dropper', '/server-code'],
      },
      migration: {
        base: '/api/migration',
        endpoints: ['/import'],
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

import crypto from 'node:crypto';

let syncEngine: DeviceSyncEngine | null = null;

/**
 * Load or generate a persistent node ID.
 * The ID is stored in the data directory so it survives restarts.
 */
function getOrCreateNodeId(): string {
  const nodeIdPath = path.join(CONFIG.dataDir, '.node_id');

  try {
    // Try to read existing node ID
    if (existsSync(nodeIdPath)) {
      const existingId = readFileSync(nodeIdPath, 'utf-8').trim();
      if (existingId && existingId.startsWith('node_')) {
        return existingId;
      }
    }
  } catch {
    // Fall through to generate new ID
  }

  // Generate new node ID and persist it
  const newId = `node_${crypto.randomBytes(8).toString('hex')}`;
  try {
    // Ensure data directory exists
    if (!existsSync(CONFIG.dataDir)) {
      mkdirSync(CONFIG.dataDir, { recursive: true });
    }
    writeFileSync(nodeIdPath, newId, 'utf-8');
  } catch (err) {
    console.error('[molly-edge] Failed to persist node ID:', err);
  }

  return newId;
}

async function initSyncEngine(): Promise<void> {
  const nodeId = getOrCreateNodeId();

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
  const storage = await storagePromise;

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
// MIGRATION IMPORT — /api/migration/import
// ============================================================================

/**
 * Import a migration package exported from the Codespace.
 * Stores persona, memories, config, and family data in local storage
 * so the chat interface (and all local operations) can use Molly's identity.
 *
 * POST /api/migration/import  { version, sections: { persona?, memories?, config?, family? } }
 */
async function handleMigrationImport(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  const sections = body.sections as Record<string, unknown> | undefined;
  if (!sections) {
    sendError(res, 400, 'Missing sections in migration package');
    return;
  }

  const imported: string[] = [];
  const storage = await storagePromise;

  // ── Persona ──
  if (sections.persona) {
    const persona = sections.persona as Record<string, unknown>;
    await storage.set('migration', 'persona', {
      identity: persona.identity || null,
      principles: persona.principles || null,
      systemPrompt: (persona.systemPrompt as string) || '',
      memoryManifest: persona.memoryManifest || null,
      growthPhilosophy: persona.growthPhilosophy || null,
      importedAt: new Date().toISOString(),
    });
    imported.push('persona');
  }

  // ── Memories ──
  if (sections.memories) {
    const memories = sections.memories as {
      records?: Array<Record<string, unknown>>;
    };
    if (memories.records && Array.isArray(memories.records)) {
      let count = 0;
      for (const record of memories.records) {
        const id = (record.id as string) || `mem_${Date.now()}_${count}`;
        await storage.set('users/default/experiences', id, {
          ...record,
          importedAt: new Date().toISOString(),
        });
        count++;
      }
      imported.push(`memories (${count} records)`);
    }
  }

  // ── Config ──
  if (sections.config) {
    await storage.set(
      'migration',
      'config',
      sections.config as Record<string, unknown>
    );
    imported.push('config');
  }

  // ── Family ──
  if (sections.family) {
    await storage.set(
      'migration',
      'family',
      sections.family as Record<string, unknown>
    );
    imported.push('family');
  }

  console.log(`[molly-edge] Migration import complete: ${imported.join(', ')}`);
  sendJson(res, 200, {
    ok: true,
    imported,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// SYSTEM MANAGEMENT — Self-update, shell exec, dropper, server-code
// ============================================================================

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
async function handleSystemUpdate(
  body: Record<string, unknown>,
  res: http.ServerResponse
): Promise<void> {
  const log: string[] = [];
  const serverFile = path.join(CONFIG.dataDir, '..', 'server.mjs');

  try {
    if (body.code) {
      const code = body.code as string;
      if (typeof code !== 'string' || code.length < 100) {
        sendError(res, 400, 'Code too short — refusing to replace server');
        return;
      }
      try {
        await fsPromises.copyFile(serverFile, serverFile + '.bak');
        log.push('Backed up current server.mjs');
      } catch {
        log.push('No existing server.mjs to back up');
      }
      const tmp = serverFile + '.tmp.' + Date.now();
      await fsPromises.writeFile(tmp, code, 'utf-8');
      await fsPromises.rename(tmp, serverFile);
      log.push(`Wrote new server.mjs (${code.length} bytes)`);
    } else if (body.url) {
      const url = body.url as string;
      log.push(`Fetching from ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) {
        sendError(
          res,
          502,
          `Failed to fetch: ${resp.status} ${resp.statusText}`
        );
        return;
      }
      const code = await resp.text();
      if (code.length < 100) {
        sendError(res, 502, 'Downloaded code too short — refusing update');
        return;
      }
      try {
        await fsPromises.copyFile(serverFile, serverFile + '.bak');
        log.push('Backed up current server.mjs');
      } catch {
        log.push('No existing server.mjs to back up');
      }
      const tmp = serverFile + '.tmp.' + Date.now();
      await fsPromises.writeFile(tmp, code, 'utf-8');
      await fsPromises.rename(tmp, serverFile);
      log.push(`Wrote new server.mjs (${code.length} bytes)`);
    }

    if (body.restart !== false) {
      log.push('Scheduling restart in 1 second...');
      sendJson(res, 200, { ok: true, log, restarting: true });
      setTimeout(() => {
        console.log('[molly-edge] Restarting...');
        const child = spawn('node', [serverFile], {
          detached: true,
          stdio: 'ignore',
          env: process.env as NodeJS.ProcessEnv,
        });
        child.unref();
        process.exit(0);
      }, 1000);
      return;
    }

    sendJson(res, 200, { ok: true, log, restarting: false });
  } catch (err: unknown) {
    sendError(res, 500, `Update failed: ${(err as Error).message}`);
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
function handleSystemExec(
  body: Record<string, unknown>,
  res: http.ServerResponse
): void {
  const command = body.command as string;
  if (!command || typeof command !== 'string') {
    sendError(res, 400, 'Missing command');
    return;
  }
  const timeout = (body.timeout as number) || 30000;

  exec(
    command,
    { timeout, maxBuffer: 1024 * 512, cwd: CONFIG.dataDir },
    (error, stdout, stderr) => {
      sendJson(res, 200, {
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
 *
 * GET /api/system/dropper?host=<this-server-ip>&port=9100
 */
function handleDropperGenerator(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`
  );
  const sourceHost =
    url.searchParams.get('host') ||
    req.headers.host?.split(':')[0] ||
    'localhost';
  const sourcePort = url.searchParams.get('port') || String(CONFIG.port);
  const sourceUrl = `http://${sourceHost}:${sourcePort}`;

  const dropper = `#!/data/data/com.termux/files/usr/bin/bash
# Molly Edge Server — Bootstrap Dropper
# Generated by ${CONFIG.nodeName}
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
 * Returns the current server file so other devices can pull it.
 * Used by the dropper and by device-to-device replication.
 */
async function handleServerCodeServe(res: http.ServerResponse): Promise<void> {
  const serverFile = path.join(CONFIG.dataDir, '..', 'server.mjs');
  try {
    const code = await fsPromises.readFile(serverFile, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': Buffer.byteLength(code),
    });
    res.end(code);
  } catch (err: unknown) {
    sendError(res, 500, `Cannot read server file: ${(err as Error).message}`);
  }
}

// ============================================================================
// CHAT HTML — /
// ============================================================================

function handleChatPage(res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(CHAT_HTML),
  });
  res.end(CHAT_HTML);
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
    // Chat page (GET /)
    if (pathname === '/' && req.method === 'GET') {
      handleChatPage(res);
      return;
    }

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
      // Note: sync logging is handled inside handleStorage() — no duplicate logging here
      return;
    }

    // AI Proxy (POST)
    if (pathname === '/api/ai/generate' && req.method === 'POST') {
      const body = await parseBody(req);
      await handleAiProxy(body, res);
      return;
    }

    // Migration Import (POST)
    if (pathname === '/api/migration/import' && req.method === 'POST') {
      const body = await parseBody(req);
      await handleMigrationImport(body, res);
      return;
    }

    // System Management endpoints
    if (pathname === '/api/system/update' && req.method === 'POST') {
      const body = await parseBody(req);
      await handleSystemUpdate(body, res);
      return;
    }
    if (pathname === '/api/system/exec' && req.method === 'POST') {
      const body = await parseBody(req);
      handleSystemExec(body, res);
      return;
    }
    if (pathname === '/api/system/dropper' && req.method === 'GET') {
      handleDropperGenerator(req, res);
      return;
    }
    if (pathname === '/api/system/server-code' && req.method === 'GET') {
      await handleServerCodeServe(res);
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
║         MOLLY EDGE SERVER v${SERVER_VERSION}         ║
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

  // Auto-sync with peers every 5 minutes
  const SYNC_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    if (!syncEngine) return;
    try {
      const results = await syncEngine.syncAll(CONFIG.port);
      const successful = results.filter((r) => r.success);
      if (successful.length > 0) {
        const totalPushed = successful.reduce((s, r) => s + r.pushed, 0);
        const totalPulled = successful.reduce((s, r) => s + r.pulled, 0);
        console.log(
          `[molly-edge] Auto-sync: ${successful.length} peer(s), pushed ${totalPushed}, pulled ${totalPulled}`
        );
      }
    } catch {
      // Non-critical — peers may be offline
    }
  }, SYNC_INTERVAL_MS);

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
