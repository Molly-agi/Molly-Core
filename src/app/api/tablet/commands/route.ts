/**
 * Tablet Command Queue API
 *
 * This is the bridge between Molly's brain (Codespace) and her tablet body (browser).
 *
 * POST /api/tablet/commands       — Queue a command for the tablet to execute
 * GET  /api/tablet/commands       — Tablet polls for pending commands
 * PATCH /api/tablet/commands      — Tablet reports command results
 *
 * Flow:
 *   1. Molly (or a flow) POSTs a command: { type, payload }
 *   2. Tablet browser polls GET, receives pending commands
 *   3. Tablet browser executes locally (IndexedDB, fetch, etc.)
 *   4. Tablet browser PATCHes results back: { id, result }
 */

import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────
interface TabletCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  createdAt: number;
  completedAt?: number;
}

interface TabletDevice {
  id: string;
  name: string;
  lastSeen: number;
  fingerprint?: string;
  capabilities?: string[];
}

// ── In-memory state (resets on Codespace restart — fine for now) ──
const commandQueue: TabletCommand[] = [];
const connectedDevices: Map<string, TabletDevice> = new Map();
let commandCounter = 0;

// Keep last 200 commands max
function pruneQueue() {
  if (commandQueue.length > 200) {
    commandQueue.splice(0, commandQueue.length - 200);
  }
}

// ── GET: Tablet polls for pending commands ─────────────────────
export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get('deviceId');
  const includeCompleted = request.nextUrl.searchParams.get('all') === 'true';

  // Register/update device heartbeat
  if (deviceId) {
    const existing = connectedDevices.get(deviceId);
    connectedDevices.set(deviceId, {
      id: deviceId,
      name: existing?.name || deviceId,
      lastSeen: Date.now(),
      fingerprint:
        existing?.fingerprint ||
        request.nextUrl.searchParams.get('fp') ||
        undefined,
      capabilities: existing?.capabilities,
    });
  }

  const commands = includeCompleted
    ? commandQueue.slice(-50)
    : commandQueue.filter((c) => c.status === 'pending');

  return NextResponse.json(
    {
      commands,
      deviceCount: connectedDevices.size,
      devices: Array.from(connectedDevices.values()),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// ── POST: Queue a command for the tablet ───────────────────────
export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  const body = await request.json();
  const { type, payload } = body;

  if (!type) {
    return NextResponse.json(
      { error: 'Missing required field: type' },
      { status: 400 }
    );
  }

  // Valid command types
  const validTypes = [
    'db.create', // Create an IndexedDB database/store
    'db.put', // Write a record
    'db.get', // Read a record
    'db.getAll', // Read all records from a store
    'db.delete', // Delete a record
    'db.clear', // Clear a store
    'db.listStores', // List all object stores in a database
    'storage.set', // Set localStorage key
    'storage.get', // Get localStorage key
    'storage.list', // List all localStorage keys
    'cache.add', // Add URL to Service Worker cache
    'cache.list', // List cached URLs
    'fetch.get', // Fetch a URL from the tablet's network
    'fetch.post', // POST to a URL from the tablet's network
    'device.info', // Get device info (screen, memory, connection)
    'device.notify', // Show a notification
    'eval.safe', // Execute a sandboxed JS expression
    'ping', // Heartbeat check
    'termux.launch', // Launch Termux via Android intent with a command
    'termux.exec', // Execute command via Termux localhost API
    'termux.install', // Install packages via Termux
    'termux.bootstrap', // Full bootstrap: install Node, download server, start
    'termux.status', // Check if Termux API is reachable
    'shell.exec', // Execute via any localhost terminal API (Linux/Unix)
    'shell.status', // Check if shell API is reachable
  ];

  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid command type. Valid: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }

  const command: TabletCommand = {
    id: `cmd_${Date.now()}_${++commandCounter}`,
    type,
    payload: payload || {},
    status: 'pending',
    createdAt: Date.now(),
  };

  commandQueue.push(command);
  pruneQueue();

  return NextResponse.json(
    { success: true, command },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}

// ── PATCH: Tablet reports command results ──────────────────────
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, result, status, deviceId } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required field: id' },
      { status: 400 }
    );
  }

  const command = commandQueue.find((c) => c.id === id);
  if (!command) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 });
  }

  command.status = status === 'failed' ? 'failed' : 'completed';
  command.result = result;
  command.completedAt = Date.now();

  // Update device heartbeat
  if (deviceId) {
    const existing = connectedDevices.get(deviceId);
    if (existing) {
      existing.lastSeen = Date.now();
    }
  }

  return NextResponse.json(
    { success: true, command },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
