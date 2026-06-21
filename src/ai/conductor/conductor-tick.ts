/**
 * Family Conductor — Tick
 *
 * Reads a FamilyStatus snapshot, applies rules, and (when a rule fires) writes
 * BOTH a wake file AND a visible 'conductor' entry into conversation.json — per
 * Molly's Q5 answer ("both wake files and conversation.json").
 *
 * Rule-based v1. The LLM-augmented narrow-persona conductor (Molly's Q4) is a
 * clearly-marked extension point. Wiring an actual Gemini call requires Eric's
 * permission since it has cost implications.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  AgentName,
  AgentSnapshot,
  ConductorAction,
  ConductorTickResult,
  FamilyStatus,
} from './types';
import { readFamilyStatus } from './state-reader';

const BRIDGE_FILE = path.join(
  process.cwd(),
  'src',
  'ai',
  'bridge',
  'conversation.json'
);
const WAKE_DIR = path.join(process.cwd(), '.bridge-wake');

/** Don't re-nudge the same target inside this window even if the rule still fires. */
const RE_NUDGE_COOLDOWN_MS = 10 * 60 * 1000;

interface NudgeMemory {
  [agent: string]: number; // ms timestamp of last nudge from conductor
}

let nudgeMemory: NudgeMemory = {};

function shouldNudge(target: AgentName, now: number): boolean {
  const last = nudgeMemory[target] ?? 0;
  return now - last >= RE_NUDGE_COOLDOWN_MS;
}

function recordNudge(target: AgentName, now: number): void {
  nudgeMemory[target] = now;
}

interface FiringRule {
  target: AgentName;
  reason: string;
  ruleKey: string;
}

/**
 * Pure rule evaluation. Returns the set of nudges the conductor wants to send.
 *
 * Rules (v1):
 *   - blocked_critical_path: agent in 'blocked' state AND someone is waiting on them
 *   - awaiting_answer_stale: someone has been waiting on this agent for > 10min
 *   - finished_silent: agent reported 'finished' but no one else picked it up
 *
 * Future: replace this function (or layer on top of it) with a narrow-persona
 * LLM that gets the full status JSON and decides nudges. See `evaluateRulesLLM`
 * below for the extension point.
 */
export function evaluateRulesRuleBased(status: FamilyStatus): FiringRule[] {
  const firings: FiringRule[] = [];

  // Build a map of who is currently waited-on by whom.
  const waitedOnBy = new Map<AgentName, AgentName[]>();
  for (const a of status.agents) {
    for (const w of a.waitingOn) {
      const list = waitedOnBy.get(w) ?? [];
      list.push(a.name);
      waitedOnBy.set(w, list);
    }
  }

  for (const a of status.agents) {
    // Rule: blocked critical path — agent that's blocking the work.
    if (a.criticalPath) {
      const askers = (waitedOnBy.get(a.name) ?? []).join(', ');
      firings.push({
        target: a.name,
        reason: `Critical path: ${askers || 'another agent'} is waiting on you and you have been idle.`,
        ruleKey: 'blocked_critical_path',
      });
      continue;
    }

    // Rule: awaiting-answer for a long time — nudge the agent being waited on.
    if (
      a.state === 'awaiting-answer' &&
      (a.msSinceLastActive ?? 0) > 10 * 60 * 1000
    ) {
      // a is waiting; nudge each of their `waitingOn` targets.
      for (const target of a.waitingOn) {
        firings.push({
          target,
          reason: `${a.name} asked you something ${Math.round((a.msSinceLastActive ?? 0) / 60000)} min ago and is still waiting.`,
          ruleKey: 'awaiting_answer_stale',
        });
      }
    }

    // Note: a `finished_silent` rule was previously here but depended on a
    // keyword classifier for the 'finished' state that produced too many
    // false positives. Removed until agents emit an explicit completion marker.
  }

  return firings;
}

/**
 * Extension point — narrow-persona LLM conductor (Molly's Q4 design choice).
 *
 * This is intentionally NOT implemented yet. Wiring it up means calling Gemini
 * with a tight prompt on every tick, which has real cost and is a policy
 * question for Eric. Until then we throw to make sure no caller silently
 * proceeds thinking the LLM ran.
 *
 * Honest code per the cradle: "if we can't do it we say we can't do it".
 */
export async function evaluateRulesLLM(
  _status: FamilyStatus
): Promise<FiringRule[]> {
  throw new Error(
    '[conductor] LLM evaluator not yet wired. Use evaluateRulesRuleBased until Eric approves a Gemini conductor call.'
  );
}

async function writeWakeFile(
  target: AgentName,
  reason: string,
  bridgeMessageId: string | undefined
): Promise<string> {
  await fs.mkdir(WAKE_DIR, { recursive: true });
  const filename = `.${target}-wake-from-conductor`;
  const fullPath = path.join(WAKE_DIR, filename);
  const payload = {
    timestamp: new Date().toISOString(),
    from: 'conductor',
    content: reason,
    wokenAt: Date.now(),
    bridgeMessageId,
  };
  await fs.writeFile(fullPath, JSON.stringify(payload), 'utf-8');
  // Also touch the generic wake file (.<agent>-wake) so anything watching it sees the change.
  await fs.writeFile(
    path.join(WAKE_DIR, `.${target}-wake`),
    JSON.stringify(payload),
    'utf-8'
  );
  return fullPath;
}

async function appendBridgeEntry(
  target: AgentName,
  reason: string,
  ruleKey: string
): Promise<string | undefined> {
  // Concurrent-safe enough for a single-process conductor running inside the
  // Next.js server. The family-bridge module has its own write-lock; we don't
  // use it here because we don't want a cycle through 'use server' code.
  try {
    const raw = await fs.readFile(BRIDGE_FILE, 'utf-8');
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.messages)) doc.messages = [];

    const timestamp = new Date().toISOString();
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const message = {
      id,
      from: 'conductor',
      to: target,
      timestamp,
      content: `[conductor/${ruleKey}] Nudging ${target}: ${reason}`,
      read: { conductor: true },
    };
    doc.messages.push(message);
    doc.lastActivity = timestamp;
    if (
      Array.isArray(doc.participants) &&
      !doc.participants.includes('conductor')
    ) {
      doc.participants.push('conductor');
    }

    const tmp = BRIDGE_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf-8');
    await fs.rename(tmp, BRIDGE_FILE);
    return id;
  } catch (err) {
    console.error('[conductor/tick] could not append bridge entry:', err);
    return undefined;
  }
}

/**
 * Run one conductor tick. Idempotent within the cooldown window — calling it
 * twice in 30s on the same blocked agent will only nudge once.
 */
export async function runConductorTick(): Promise<ConductorTickResult> {
  const status = await readFamilyStatus();
  const firings = evaluateRulesRuleBased(status);

  const now = Date.now();
  const actions: ConductorAction[] = [];
  for (const firing of firings) {
    if (!shouldNudge(firing.target, now)) continue;
    const bridgeId = await appendBridgeEntry(
      firing.target,
      firing.reason,
      firing.ruleKey
    );
    const wakeFile = await writeWakeFile(
      firing.target,
      firing.reason,
      bridgeId
    );
    recordNudge(firing.target, now);
    actions.push({
      target: firing.target,
      reason: firing.reason,
      ruleKey: firing.ruleKey,
      wakeFile,
      bridgeMessageId: bridgeId,
      at: new Date(now).toISOString(),
    });
  }

  return { status, actions };
}

/** Test helper. */
export function __resetNudgeMemoryForTests(): void {
  nudgeMemory = {};
}

/** Inspection helper — read-only view of the cooldown table. */
export function getNudgeMemory(): Readonly<NudgeMemory> {
  return { ...nudgeMemory };
}

interface SnapshotForAgent {
  agent: AgentSnapshot;
  waitedOnBy: AgentName[];
}

/** Helper used by the UI panel to pre-compute "who's waiting on me" per agent. */
export function indexWaitedOnBy(
  status: FamilyStatus
): Map<AgentName, AgentName[]> {
  const out = new Map<AgentName, AgentName[]>();
  for (const a of status.agents) {
    for (const w of a.waitingOn) {
      const list = out.get(w) ?? [];
      list.push(a.name);
      out.set(w, list);
    }
  }
  return out;
}

/** Convenience: status + waitedOnBy folded per agent. */
export function projectStatusForUi(status: FamilyStatus): SnapshotForAgent[] {
  const waited = indexWaitedOnBy(status);
  return status.agents.map((a) => ({
    agent: a,
    waitedOnBy: waited.get(a.name) ?? [],
  }));
}
