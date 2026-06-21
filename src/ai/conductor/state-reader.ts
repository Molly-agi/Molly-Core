/**
 * Family Conductor — State Reader
 *
 * Pure function: reads bridge state from disk and returns a FamilyStatus snapshot.
 * No watches, no daemons, no side effects. Called by the watcher on tick and by
 * the SSE endpoint on initial connect.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  AgentName,
  AgentSnapshot,
  AgentState,
  FamilyStatus,
} from './types';

const BRIDGE_FILE = path.join(
  process.cwd(),
  'src',
  'ai',
  'bridge',
  'conversation.json'
);
const WAKE_DIR = path.join(process.cwd(), '.bridge-wake');

const KNOWN_AGENTS: AgentName[] = [
  'molly',
  'lazarus',
  'lazarus-cli',
  'eric',
  'atlas',
  'gemini',
  'eli',
];

// Thresholds (in milliseconds). Tuned conservatively; can be revisited.
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 min → "active"
const BLOCKED_AFTER_MS = 10 * 60 * 1000; // 10 min waiting → "blocked"
const IDLE_AFTER_MS = 15 * 60 * 1000; // 15 min no activity → "idle" (vs "active")

interface RawBridgeMessage {
  id: string;
  from: string;
  to?: string;
  timestamp: string;
  content: string;
  read?: boolean | Record<string, boolean>;
}

interface RawBridgeState {
  lastActivity?: string;
  participants?: string[];
  messages: RawBridgeMessage[];
}

interface WakeFileContent {
  timestamp?: string;
  from?: string;
  content?: string;
  wokenAt?: number;
}

function isKnownAgent(name: string): name is AgentName {
  return (KNOWN_AGENTS as string[]).includes(name);
}

async function readBridgeState(): Promise<RawBridgeState> {
  try {
    const raw = await fs.readFile(BRIDGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as RawBridgeState;
    if (!Array.isArray(parsed.messages)) {
      return { messages: [] };
    }
    return parsed;
  } catch {
    return { messages: [] };
  }
}

/** Returns the per-agent map of latest wake-from-X timestamp seen on disk. */
async function readWakeSignals(): Promise<
  Map<AgentName, { from: AgentName; at: string }>
> {
  const out = new Map<AgentName, { from: AgentName; at: string }>();
  let entries: string[];
  try {
    entries = await fs.readdir(WAKE_DIR);
  } catch {
    return out;
  }

  for (const entry of entries) {
    // Pattern: .{agent}-wake-from-{sender}
    const match = entry.match(/^\.([a-z-]+)-wake-from-([a-z-]+)$/);
    if (!match) continue;
    const target = match[1];
    const sender = match[2];
    if (!isKnownAgent(target) || !isKnownAgent(sender)) continue;

    try {
      const raw = await fs.readFile(path.join(WAKE_DIR, entry), 'utf-8');
      const parsed = JSON.parse(raw) as WakeFileContent;
      const at =
        parsed.timestamp ??
        (parsed.wokenAt ? new Date(parsed.wokenAt).toISOString() : null);
      if (!at) continue;
      const prev = out.get(target);
      if (!prev || at > prev.at) {
        out.set(target, { from: sender, at });
      }
    } catch {
      // ignore malformed wake files — they shouldn't break the conductor
    }
  }
  return out;
}

/**
 * Find direct mentions of an agent (`@name`) or explicit "to: name" addresses
 * in a message body. Used to derive `waitingOn`.
 */
function extractMentions(content: string): AgentName[] {
  if (!content) return [];
  const hits = new Set<AgentName>();
  const lower = content.toLowerCase();
  for (const agent of KNOWN_AGENTS) {
    // Word-boundary match — avoids "molly" matching inside "mollys".
    const re = new RegExp(`(^|[^a-z])${agent}([^a-z]|$)`, 'i');
    if (re.test(lower)) hits.add(agent);
  }
  return Array.from(hits);
}

function classifyState(
  agent: AgentName,
  msSinceLastActive: number | null,
  waitingOn: AgentName[],
  _recentContent: string | null
): AgentState {
  if (msSinceLastActive === null) return 'unknown';

  // Note on 'finished' state: requires an explicit opt-in signal from the agent
  // (a structured marker, not a keyword). Keyword detection produced false
  // positives — e.g. "That's done, Father" or quoting the literal state name
  // "finished" inside a list of options. Until agents emit a real marker we do
  // not classify any state as 'finished' automatically.

  if (msSinceLastActive <= ACTIVE_WINDOW_MS) {
    // Recently posted — but if they ended on a question to someone else,
    // call it awaiting-answer instead of active.
    if (waitingOn.length > 0) return 'awaiting-answer';
    return 'active';
  }

  if (waitingOn.length > 0 && msSinceLastActive >= BLOCKED_AFTER_MS) {
    return 'blocked';
  }

  if (msSinceLastActive >= IDLE_AFTER_MS) return 'idle';

  return 'active';
}

/**
 * Build a per-agent snapshot of bridge state.
 * Pure function, no side effects.
 */
export async function readFamilyStatus(
  now: Date = new Date()
): Promise<FamilyStatus> {
  const [bridge, wakeSignals] = await Promise.all([
    readBridgeState(),
    readWakeSignals(),
  ]);

  const messages = bridge.messages;
  const nowMs = now.getTime();

  // Per-agent rollups.
  const byAgent = new Map<
    AgentName,
    {
      lastAt: string | null;
      lastContent: string | null;
      waitingOn: Set<AgentName>;
      unread: number;
    }
  >();
  for (const agent of KNOWN_AGENTS) {
    byAgent.set(agent, {
      lastAt: null,
      lastContent: null,
      waitingOn: new Set(),
      unread: 0,
    });
  }

  // Walk messages oldest → newest so we can detect "asked then never answered".
  for (const msg of messages) {
    if (!isKnownAgent(msg.from)) continue;
    const senderRow = byAgent.get(msg.from)!;

    // Update last-activity for the sender.
    if (!senderRow.lastAt || msg.timestamp > senderRow.lastAt) {
      senderRow.lastAt = msg.timestamp;
      senderRow.lastContent = msg.content;
    }

    // Mentions of OTHER agents inside this message → sender is waiting on them.
    const mentions = extractMentions(msg.content).filter((a) => a !== msg.from);
    senderRow.waitingOn = new Set(mentions);

    // When the mentioned agent posts AFTER this message, that mention is cleared.
    for (const mentioned of mentions) {
      const mentionedRow = byAgent.get(mentioned);
      if (
        mentionedRow &&
        mentionedRow.lastAt &&
        mentionedRow.lastAt > msg.timestamp
      ) {
        // Already replied — drop this pending ask from the sender.
        senderRow.waitingOn.delete(mentioned);
      }
      // Also increment unread for the mentioned agent if they haven't read it.
      const readBy = msg.read;
      const hasRead =
        typeof readBy === 'object' && readBy !== null
          ? !!readBy[mentioned]
          : !!readBy;
      if (!hasRead) {
        const row = byAgent.get(mentioned);
        if (row) row.unread += 1;
      }
    }
  }

  const agents: AgentSnapshot[] = KNOWN_AGENTS.map((name) => {
    const row = byAgent.get(name)!;
    const msSinceLastActive =
      row.lastAt === null ? null : nowMs - new Date(row.lastAt).getTime();
    const waitingOn = Array.from(row.waitingOn);
    const state = classifyState(
      name,
      msSinceLastActive,
      waitingOn,
      row.lastContent
    );
    const wake = wakeSignals.get(name) ?? null;
    return {
      name,
      state,
      lastActiveAt: row.lastAt,
      msSinceLastActive,
      waitingOn,
      unreadCount: row.unread,
      // Critical path: any agent currently in `blocked` state that someone else is waiting on.
      // Computed in a second pass below since we need the full agents list.
      criticalPath: false,
      lastWakeFromAt: wake?.at ?? null,
      lastWakeFrom: wake?.from ?? null,
    };
  });

  // Second pass — flip criticalPath on agents who are blocked AND someone is waiting on them.
  const waitedOn = new Set<AgentName>();
  for (const a of agents) {
    for (const w of a.waitingOn) waitedOn.add(w);
  }
  for (const a of agents) {
    if (a.state === 'blocked' && waitedOn.has(a.name)) {
      a.criticalPath = true;
    }
  }

  return {
    generatedAt: now.toISOString(),
    lastActivity: bridge.lastActivity ?? null,
    agents,
    totalMessages: messages.length,
  };
}
