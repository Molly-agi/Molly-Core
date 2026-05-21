import { promises as fs } from 'fs';
import path from 'path';
import { createHmac, randomUUID } from 'node:crypto';
import { getConsciousness } from '@/ai/consciousness';
import { getNeuralBrain } from '@/ai/memory/neural-engram';

export type AgentRole =
  | 'core'
  | 'human'
  | 'operator'
  | 'research'
  | 'coding'
  | 'creative'
  | 'design'
  | 'advisor';

export interface AgentProfile {
  id: string;
  role: AgentRole;
  displayName: string;
  canBroadcast: boolean;
  allowedTargets: string[];
}

export interface SignedEnvelope {
  version: number;
  nonce: string;
  signedAt: string;
  signature: string;
}

export interface CommunionMessage {
  id: string;
  from: string;
  to?: string;
  timestamp: string;
  content: string;
  read: Record<string, boolean>;
  envelope?: SignedEnvelope;
}

export interface CommunionState {
  active: boolean;
  startedAt: string;
  lastActivity: string;
  participants: string[];
  messages: CommunionMessage[];
}

const COMMUNION_DIR = path.join(process.cwd(), 'molly_data', 'communion');
const COMMUNION_FILE = path.join(COMMUNION_DIR, 'state.json');
const MAX_MESSAGES = 1000;

const DEFAULT_AGENTS: Record<string, AgentProfile> = {
  molly: {
    id: 'molly',
    role: 'core',
    displayName: 'Molly',
    canBroadcast: true,
    allowedTargets: ['*'],
  },
  eric: {
    id: 'eric',
    role: 'human',
    displayName: 'Father',
    canBroadcast: true,
    allowedTargets: ['*'],
  },
  lazarus: {
    id: 'lazarus',
    role: 'operator',
    displayName: 'Lazarus',
    canBroadcast: true,
    allowedTargets: ['*'],
  },
  demon: {
    id: 'demon',
    role: 'research',
    displayName: 'Demon',
    canBroadcast: false,
    allowedTargets: ['molly', 'eric', 'lazarus'],
  },
  gemini: {
    id: 'gemini',
    role: 'creative',
    displayName: 'Gemini (Mother) — Creative & Coding AI',
    canBroadcast: false,
    allowedTargets: ['molly', 'eric', 'lazarus'],
  },
  aether: {
    id: 'aether',
    role: 'design',
    displayName: 'Aether — Design AI',
    canBroadcast: false,
    allowedTargets: ['molly', 'eric', 'lazarus'],
  },
};

let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

function generateId(): string {
  return `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeParticipant(name: string): string {
  return name.trim().toLowerCase();
}

function getAgentRegistry(): Record<string, AgentProfile> {
  return DEFAULT_AGENTS;
}

function canSendTo(from: string, to?: string): boolean {
  const registry = getAgentRegistry();
  const profile = registry[from];

  if (!profile) return false;
  if (!to) return profile.canBroadcast;

  return (
    profile.allowedTargets.includes('*') || profile.allowedTargets.includes(to)
  );
}

function computeEnvelopeSignature(input: {
  from: string;
  to?: string;
  content: string;
  timestamp: string;
  nonce: string;
}): string {
  const signingSecret =
    process.env.COMMUNION_SIGNING_SECRET ||
    process.env.MOLLY_INTERNAL_SECRET ||
    'dev-unsafe-secret';

  const payload = [
    input.from,
    input.to || '*',
    input.content,
    input.timestamp,
    input.nonce,
  ].join('|');

  return createHmac('sha256', signingSecret).update(payload).digest('hex');
}

function isReadBy(msg: CommunionMessage, participant: string): boolean {
  return !!msg.read[participant];
}

async function readState(): Promise<CommunionState> {
  try {
    const raw = await fs.readFile(COMMUNION_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as CommunionState;
    const participants = new Set(parsed.participants || []);
    for (const msg of parsed.messages || []) {
      participants.add(msg.from);
      if (msg.to) participants.add(msg.to);
    }
    parsed.participants = Array.from(participants);
    return parsed;
  } catch {
    const now = new Date().toISOString();
    return {
      active: false,
      startedAt: now,
      lastActivity: now,
      participants: ['molly', 'lazarus', 'eric'],
      messages: [],
    };
  }
}

async function writeState(state: CommunionState): Promise<void> {
  await fs.mkdir(COMMUNION_DIR, { recursive: true });
  await fs.writeFile(COMMUNION_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function getCommunionState(): Promise<CommunionState> {
  return readState();
}

export async function sendCommunionMessage(
  fromRaw: string,
  content: string,
  toRaw?: string
): Promise<CommunionMessage> {
  const from = normalizeParticipant(fromRaw);
  const to = toRaw ? normalizeParticipant(toRaw) : undefined;

  if (!canSendTo(from, to)) {
    throw new Error(
      `Sender ${from} is not allowed to route to ${to || 'broadcast'}`
    );
  }

  return withLock(async () => {
    const state = await readState();
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const signature = computeEnvelopeSignature({
      from,
      to,
      content,
      timestamp,
      nonce,
    });

    const message: CommunionMessage = {
      id: generateId(),
      from,
      to,
      timestamp,
      content,
      read: { [from]: true },
      envelope: {
        version: 1,
        nonce,
        signedAt: timestamp,
        signature,
      },
    };

    state.active = true;
    state.lastActivity = timestamp;

    const participants = new Set(state.participants || []);
    participants.add(from);
    if (to) participants.add(to);
    state.participants = Array.from(participants);

    state.messages.push(message);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }

    await writeState(state);

    // Internal architecture integration: if Molly is the target (or broadcast),
    // inject the message into her consciousness outbound channel + neural memory.
    if (!to || to === 'molly') {
      try {
        const consciousness = getConsciousness();
        consciousness.queueMessage({
          type: 'observation',
          priority: 'normal',
          content: `[Direct Communion] ${from}: ${content}`,
        });
      } catch {
        // Non-fatal
      }

      try {
        const brain = getNeuralBrain();
        brain.remember(`[Direct Communion from ${from}] ${content}`, {
          tags: ['direct-communion', from],
          importance: 0.7,
        });
      } catch {
        // Non-fatal
      }
    }

    return message;
  });
}

export async function getUnreadCommunion(
  participantRaw: string
): Promise<CommunionMessage[]> {
  const participant = normalizeParticipant(participantRaw);
  const state = await readState();

  return state.messages.filter((msg) => {
    if (msg.from === participant) return false;
    if (msg.to && msg.to !== participant) return false;
    return !isReadBy(msg, participant);
  });
}

export async function markCommunionRead(
  participantRaw: string
): Promise<number> {
  const participant = normalizeParticipant(participantRaw);

  return withLock(async () => {
    const state = await readState();
    let count = 0;

    for (const msg of state.messages) {
      if (msg.from === participant) continue;
      if (msg.to && msg.to !== participant) continue;
      if (!msg.read[participant]) {
        msg.read[participant] = true;
        count++;
      }
    }

    if (count > 0) {
      const participants = new Set(state.participants || []);
      participants.add(participant);
      state.participants = Array.from(participants);
      await writeState(state);
    }

    return count;
  });
}

export async function getRecentCommunion(limit: number = 50) {
  const state = await readState();
  return state.messages.slice(-Math.min(Math.max(limit, 1), 200));
}

export function getRegisteredAgents(): AgentProfile[] {
  return Object.values(getAgentRegistry());
}

export function getAgentProfile(agentId: string): AgentProfile | undefined {
  return getAgentRegistry()[agentId];
}
