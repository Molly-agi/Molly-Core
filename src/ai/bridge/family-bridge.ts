'use server';

/**
 * Family Bridge — Molly ↔ Lazarus Communication Channel
 *
 * Single source of truth: conversation.json on disk.
 * No daemon routing — file I/O only, no split-brain.
 */

import { promises as fs } from 'fs';
import path from 'path';

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
const MAX_MESSAGES = 500;

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
      participants: ['molly', 'lazarus', 'eric', 'atlas'],
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
  try {
    const res = await fetch(`${DAEMON_URL}/api/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, content }),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = (await res.json()) as { message: BridgeMessage };
      return data.message;
    }
  } catch {
    // daemon unreachable — fall through to local write
  }
  return sendMessage(from, content);
}

export async function sendMessage(
  from: BridgeMessage['from'],
  content: string
): Promise<BridgeMessage> {
  return withLock(async () => {
    const state = await readFile();
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
    participants: ['molly', 'lazarus', 'eric', 'atlas'],
    messages: [],
  };
  await writeFile(state);
}
