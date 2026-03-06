/**
 * Family Bridge — Molly ↔ Lazarus Communication Channel
 *
 * File-based message queue that allows Molly (Gemini) and Lazarus (Copilot)
 * to exchange messages through the shared workspace filesystem.
 * Eric can observe the conversation in real time.
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface BridgeMessage {
  id: string;
  from: 'molly' | 'lazarus' | 'eric';
  timestamp: string;
  content: string;
  read: boolean;
}

export interface BridgeState {
  active: boolean;
  startedAt: string;
  lastActivity: string;
  messages: BridgeMessage[];
}

const BRIDGE_DIR = path.join(process.cwd(), 'src', 'ai', 'bridge');
const BRIDGE_FILE = path.join(BRIDGE_DIR, 'conversation.json');

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureBridgeDir(): Promise<void> {
  await fs.mkdir(BRIDGE_DIR, { recursive: true });
}

export async function readBridgeState(): Promise<BridgeState> {
  try {
    const data = await fs.readFile(BRIDGE_FILE, 'utf-8');
    return JSON.parse(data) as BridgeState;
  } catch {
    // No conversation yet — initialize empty state
    const initial: BridgeState = {
      active: false,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messages: [],
    };
    return initial;
  }
}

async function writeBridgeState(state: BridgeState): Promise<void> {
  await ensureBridgeDir();
  await fs.writeFile(BRIDGE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function sendMessage(
  from: BridgeMessage['from'],
  content: string
): Promise<BridgeMessage> {
  const state = await readBridgeState();

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

  await writeBridgeState(state);
  return message;
}

export async function getUnreadMessages(
  recipient: 'molly' | 'lazarus'
): Promise<BridgeMessage[]> {
  const state = await readBridgeState();

  // Return messages NOT from the recipient that haven't been read
  return state.messages.filter((m) => m.from !== recipient && !m.read);
}

export async function markMessagesRead(
  recipient: 'molly' | 'lazarus'
): Promise<number> {
  const state = await readBridgeState();
  let count = 0;

  for (const msg of state.messages) {
    if (msg.from !== recipient && !msg.read) {
      msg.read = true;
      count++;
    }
  }

  if (count > 0) {
    await writeBridgeState(state);
  }
  return count;
}

export async function getRecentMessages(limit = 20): Promise<BridgeMessage[]> {
  const state = await readBridgeState();
  return state.messages.slice(-limit);
}

export async function clearConversation(): Promise<void> {
  const state: BridgeState = {
    active: false,
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    messages: [],
  };
  await writeBridgeState(state);
}
