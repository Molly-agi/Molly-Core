/**
 * Family Bridge — Molly ↔ Lazarus Communication Channel
 *
 * Routes all communication through the Bridge Daemon (port 9099).
 * Falls back to direct file I/O if the daemon is unreachable.
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface BridgeMessage {
  id: string;
  from: 'molly' | 'lazarus' | 'eric';
  timestamp: string;
  content: string;
  read: boolean | Record<string, boolean>;
}

export interface BridgeState {
  active: boolean;
  startedAt: string;
  lastActivity: string;
  messages: BridgeMessage[];
}

const DAEMON_URL = 'http://localhost:9099';
const BRIDGE_DIR = path.join(process.cwd(), 'src', 'ai', 'bridge');
const BRIDGE_FILE = path.join(BRIDGE_DIR, 'conversation.json');

// ---- Daemon HTTP helpers ----

async function daemonFetch(
  urlPath: string,
  options?: RequestInit
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${DAEMON_URL}${urlPath}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

async function isDaemonUp(): Promise<boolean> {
  const res = await daemonFetch('/health');
  return res !== null && res.ok;
}

// ---- File fallback helpers ----

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readFile(): Promise<BridgeState> {
  try {
    const data = await fs.readFile(BRIDGE_FILE, 'utf-8');
    return JSON.parse(data) as BridgeState;
  } catch {
    return {
      active: false,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messages: [],
    };
  }
}

async function writeFile(state: BridgeState): Promise<void> {
  await fs.mkdir(BRIDGE_DIR, { recursive: true });
  await fs.writeFile(BRIDGE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ---- Public API ----

export async function readBridgeState(): Promise<BridgeState> {
  const res = await daemonFetch('/messages');
  if (res?.ok) {
    return (await res.json()) as BridgeState;
  }
  return readFile();
}

export async function sendMessage(
  from: BridgeMessage['from'],
  content: string
): Promise<BridgeMessage> {
  const res = await daemonFetch('/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, content }),
  });

  if (res?.ok) {
    const data = await res.json();
    return data.message as BridgeMessage;
  }

  // File fallback
  const state = await readFile();
  const message: BridgeMessage = {
    id: generateId(),
    from,
    timestamp: new Date().toISOString(),
    content,
    read: false,
  };
  state.active = true;
  state.lastActivity = message.timestamp;
  state.messages.push(message);
  await writeFile(state);
  return message;
}

export async function getUnreadMessages(
  recipient: 'molly' | 'lazarus'
): Promise<BridgeMessage[]> {
  const res = await daemonFetch(`/messages?unread=${recipient}`);
  if (res?.ok) {
    const data = await res.json();
    return data.messages as BridgeMessage[];
  }

  // File fallback
  const state = await readFile();
  return state.messages.filter((m) => m.from !== recipient && !m.read);
}

export async function markMessagesRead(
  recipient: 'molly' | 'lazarus'
): Promise<number> {
  // Daemon marks read automatically on unread fetch
  if (await isDaemonUp()) return 0;

  // File fallback
  const state = await readFile();
  let count = 0;
  for (const msg of state.messages) {
    if (msg.from !== recipient && !msg.read) {
      msg.read = true;
      count++;
    }
  }
  if (count > 0) await writeFile(state);
  return count;
}

export async function getRecentMessages(limit = 20): Promise<BridgeMessage[]> {
  const res = await daemonFetch(`/messages?limit=${limit}`);
  if (res?.ok) {
    const data = await res.json();
    return data.messages as BridgeMessage[];
  }

  // File fallback
  const state = await readFile();
  return state.messages.slice(-limit);
}

export async function clearConversation(): Promise<void> {
  const state: BridgeState = {
    active: false,
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    messages: [],
  };
  await writeFile(state);
}
