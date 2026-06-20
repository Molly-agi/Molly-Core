'use server';

/**
 * Family Bridge — Molly ↔ Lazarus Communication Channel
 *
 * Single source of truth: conversation.json on disk.
 * No daemon routing — file I/O only, no split-brain.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash, createHmac } from 'crypto';

export interface BridgeMessage {
  id: string;
  from: string;
  timestamp: string;
  content: string;
  read: boolean | Record<string, boolean>;
}

export interface BridgeState {
  active: boolean;
  startedAt: string;
  lastActivity: string;
  participants?: string[];
  messages: BridgeMessage[];
}

const BRIDGE_DIR = path.join(process.cwd(), 'src', 'ai', 'bridge');
const BRIDGE_FILE = path.join(BRIDGE_DIR, 'conversation.json');
const CONTEXT_DIR = path.join(process.cwd(), '.molly-context');
const BRIDGE_AUDIT_FILE = path.join(CONTEXT_DIR, 'bridge-audit.jsonl');
const MAX_MESSAGES = 500;
const DUPLICATE_WINDOW_MS = 15000;
const DUPLICATE_SCAN_DEPTH = 8;

function normalizeForDedup(text: string): string {
  if (!text) return '';
  return text
    .replace(/<tool_request>[\s\S]*?<\/tool_request>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ---- Write serialization ----
// Prevents TOCTOU race conditions on concurrent read→modify→write cycles
let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

// ---- File I/O helpers ----

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readFile(): Promise<BridgeState> {
  try {
    const data = await fs.readFile(BRIDGE_FILE, 'utf-8');
    const parsed = JSON.parse(data) as BridgeState;
    const participants = new Set(parsed.participants || []);
    for (const msg of parsed.messages || []) {
      participants.add(msg.from);
    }
    parsed.participants = Array.from(participants);
    return parsed;
  } catch {
    return {
      active: false,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      participants: ['molly', 'lazarus', 'eric'],
      messages: [],
    };
  }
}

async function writeFile(state: BridgeState): Promise<void> {
  await fs.mkdir(BRIDGE_DIR, { recursive: true });
  await fs.writeFile(BRIDGE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function isReadBy(msg: BridgeMessage, recipient: string): boolean {
  if (typeof msg.read === 'object' && msg.read !== null) {
    return !!(msg.read as Record<string, boolean>)[recipient];
  }
  return !!msg.read;
}

// ---- Public API ----

export async function readBridgeState(): Promise<BridgeState> {
  return readFile();
}

const DAEMON_URL = process.env.BRIDGE_DAEMON_URL || 'http://localhost:9099';
const BRIDGE_SERVICE_AUTH_KEY = process.env.BRIDGE_SERVICE_AUTH_KEY || '';

export interface BridgeDeliveryReceipt {
  success: boolean;
  message: BridgeMessage;
  deliveryPath: 'daemon' | 'local';
  attempts: number;
  ackId: string;
  error?: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function signDaemonRequest(timestamp: string, body: string): string {
  return createHmac('sha256', BRIDGE_SERVICE_AUTH_KEY)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

function buildDaemonHeaders(body: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Optional service auth: when configured, every daemon request carries
  // a timestamped HMAC signature for verification.
  if (BRIDGE_SERVICE_AUTH_KEY) {
    const timestamp = new Date().toISOString();
    headers['x-bridge-ts'] = timestamp;
    headers['x-bridge-sig'] = signDaemonRequest(timestamp, body);
  }

  return headers;
}

async function appendBridgeAuditRecord(entry: {
  message: BridgeMessage;
  deliveryPath: 'daemon' | 'local';
  attempts: number;
  ackId: string;
}): Promise<void> {
  const canonical = JSON.stringify({
    id: entry.message.id,
    from: entry.message.from,
    timestamp: entry.message.timestamp,
    content: entry.message.content,
    read: entry.message.read,
  });

  const record = {
    auditedAt: new Date().toISOString(),
    deliveryPath: entry.deliveryPath,
    attempts: entry.attempts,
    ackId: entry.ackId,
    messageDigest: sha256Hex(canonical),
    message: entry.message,
  };

  await fs.mkdir(CONTEXT_DIR, { recursive: true });
  await fs.appendFile(BRIDGE_AUDIT_FILE, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * Route a message through the bridge daemon so it broadcasts on WS to all
 * subscribers (the /lazarus and /bridge UIs). Falls back to a direct file
 * write via sendMessage() if the daemon is unreachable, so offline / startup
 * paths still log. This is the single writer surface for new messages.
 */
export async function broadcastMessage(
  from: BridgeMessage['from'],
  content: string
): Promise<BridgeMessage> {
  const receipt = await broadcastMessageWithReceipt(from, content);
  return receipt.message;
}

export async function broadcastMessageWithReceipt(
  from: BridgeMessage['from'],
  content: string,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<BridgeDeliveryReceipt> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 150;

  let attempts = 0;
  let lastError = '';

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    try {
      const body = JSON.stringify({ from, content });
      const res = await fetch(`${DAEMON_URL}/api/bridge`, {
        method: 'POST',
        headers: buildDaemonHeaders(body),
        body,
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        const data = (await res.json()) as { message: BridgeMessage };
        const ackId = data.message?.id || `ack-${Date.now()}-${attempts}`;

        try {
          await appendBridgeAuditRecord({
            message: data.message,
            deliveryPath: 'daemon',
            attempts,
            ackId,
          });
        } catch {
          // Non-blocking: audit logging must not prevent bridge delivery.
        }

        return {
          success: true,
          message: data.message,
          deliveryPath: 'daemon',
          attempts,
          ackId,
        };
      }

      lastError = `bridge daemon status ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (i < maxAttempts - 1) {
      await wait(baseDelayMs * Math.pow(2, i));
    }
  }

  // Daemon path failed — durable local fallback.
  const localMessage = await sendMessage(from, content);
  const ackId = localMessage.id;

  return {
    success: true,
    message: localMessage,
    deliveryPath: 'local',
    attempts,
    ackId,
    error: lastError || undefined,
  };
}

export async function sendMessage(
  from: BridgeMessage['from'],
  content: string
): Promise<BridgeMessage> {
  return withLock(async () => {
    const state = await readFile();
    const target = normalizeForDedup(content);

    // Suppress duplicates from the same sender posted via multiple writers
    // (flow auto-broadcast + tool-handler broadcast collapse to one entry).
    if (target) {
      const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
      const start = Math.max(0, state.messages.length - DUPLICATE_SCAN_DEPTH);
      for (let i = state.messages.length - 1; i >= start; i--) {
        const m = state.messages[i];
        if (m.from !== from) continue;
        const ts = new Date(m.timestamp).getTime();
        if (Number.isFinite(ts) && ts < cutoff) break;
        if (normalizeForDedup(m.content) === target) {
          return m;
        }
      }
    }

    const message: BridgeMessage = {
      id: generateId(),
      from,
      timestamp: new Date().toISOString(),
      content,
      read: { [from]: true },
    };
    state.active = true;
    state.lastActivity = message.timestamp;
    const participants = new Set(state.participants || []);
    participants.add(from);
    state.participants = Array.from(participants);
    state.messages.push(message);
    // Cap message history to prevent unbounded growth
    if (state.messages.length > MAX_MESSAGES) {
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }
    await writeFile(state);

    try {
      await appendBridgeAuditRecord({
        message,
        deliveryPath: 'local',
        attempts: 1,
        ackId: message.id,
      });
    } catch {
      // Non-blocking: audit logging must not prevent local persistence.
    }

    return message;
  });
}

export async function getUnreadMessages(
  recipient: string
): Promise<BridgeMessage[]> {
  const state = await readFile();
  return state.messages.filter(
    (m) => m.from !== recipient && !isReadBy(m, recipient)
  );
}

export async function getRecentMessages(
  limit: number = 20
): Promise<BridgeMessage[]> {
  const state = await readFile();
  return state.messages.slice(-limit);
}

export async function markMessagesRead(recipient: string): Promise<number> {
  return withLock(async () => {
    const state = await readFile();
    let count = 0;
    for (const msg of state.messages) {
      if (msg.from !== recipient && !isReadBy(msg, recipient)) {
        if (typeof msg.read === 'object' && msg.read !== null) {
          (msg.read as Record<string, boolean>)[recipient] = true;
        } else {
          msg.read = { [msg.from]: true, [recipient]: true };
        }
        count++;
      }
    }
    if (count > 0) await writeFile(state);
    return count;
  });
}

export async function clearConversation(): Promise<void> {
  const state: BridgeState = {
    active: false,
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    participants: ['molly', 'lazarus', 'eric'],
    messages: [],
  };
  await writeFile(state);
}
