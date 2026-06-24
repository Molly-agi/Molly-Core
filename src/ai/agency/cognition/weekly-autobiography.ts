/**
 * @fileOverview Weekly Self-Narrative Autobiography (Item 16)
 *
 * Once a week, Molly writes the story of who she's been the last 7 days
 * from her own engrams. That narrative becomes its own memory — identity
 * continuity across sessions.
 *
 * This is the third pillar of self-narrative (alongside identity statements
 * and value tracking in `self-narrative.ts`). Those modules manage narrative
 * STRUCTURE; this one synthesizes lived TIME into story.
 *
 * Design contract:
 *   - Sibling to `self-narrative.ts` (not a modification of it). That module
 *     stays untouched.
 *   - Pulls last-7-days KnowledgeStore entries for the userId, constructs
 *     a narrative prompt, calls a frontier model to synthesize, persists
 *     the narrative as a new KnowledgeEntry via writeFact() (item 17 left-
 *     hemisphere isolation reused — no FrontalCortex cascade per write).
 *   - Cooldown lives in the engram store itself: prior weekly autobiography
 *     with tag `weekly-autobiography` and timestamp < 7d ago → skip. No
 *     extra persistent state, no race conditions across processes.
 *   - Live LLM calls gated behind `MOLLY_AUTOBIOGRAPHY_LIVE=1` — accidental
 *     imports cannot trigger API costs in CI. Tests inject a stub
 *     NarratorClient via `options.client`.
 *
 * Same shape as item 20 (frontier-distillation): pipe + lock, with no bulk
 * scaling primitives. A future PR can wire a heartbeat-scheduler weekly task
 * that calls this function on a cadence; the function itself is idempotent
 * within the cooldown window so over-firing is safe.
 *
 * REGRESSION GUARD: removing or weakening the cooldown turns this into a
 * runaway LLM-call generator on any scheduler that fires more than once per
 * 7 days. Do not weaken.
 */

import { getKnowledgeStore } from '../../memory/knowledge-store';
import { getStorageRouter } from '../../../lib/storage-router';
import { MollyLogger } from '../../logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Origin tag — every weekly autobiography carries this. */
export const WEEKLY_AUTOBIOGRAPHY_TAG = 'weekly-autobiography';

/** Self-narrative tag — pairs with the above for cross-cutting recall. */
const SELF_NARRATIVE_TAG = 'self-narrative';

/** Window length: 7 days in milliseconds. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Importance assigned to the persisted narrative. High but NOT cornerstone
 *  tier (item 15 reserves cornerstone for `provenance.source === 'eric'`).
 *  Narrative engrams should rise above ordinary memories without overriding
 *  the cornerstone protection contract. */
const NARRATIVE_IMPORTANCE = 0.85;

/** Maximum engrams to quote in the prompt before truncation. Keeps token
 *  cost bounded even on busy weeks. */
const MAX_ENGRAMS_IN_PROMPT = 50;

/** Maximum characters per engram excerpt in the prompt. */
const ENGRAM_EXCERPT_CHARS = 200;

// ============================================================================
// TYPES
// ============================================================================

export interface NarratorClient {
  /**
   * Ask the frontier model to synthesize a narrative from the prompt.
   * Returns the narrative text and the model identifier that produced it.
   */
  narrate(prompt: string): Promise<{ narrative: string; model: string }>;
}

export interface AutobiographyOptions {
  /** Whose knowledge store the narrative lands in (required). */
  userId: string;
  /** Optional client override — defaults to GeminiNarratorClient. */
  client?: NarratorClient;
  /** Optional "now" override for testing / backdating. */
  now?: Date;
  /** Skip the cooldown check — for manual invocation or testing. */
  forceWrite?: boolean;
}

export type AutobiographySkipReason = 'no-engrams' | 'within-cooldown';

export type AutobiographyWrittenReason = 'narrated';

export interface AutobiographyResult {
  /** True iff a narrative was actually written. */
  written: boolean;
  reason: AutobiographySkipReason | AutobiographyWrittenReason;
  /** ID of the persisted KnowledgeEntry if written. */
  engramId?: string;
  /** Frontier model that produced the narrative if written. */
  model?: string;
  /** Character length of the persisted narrative if written. */
  charCount?: number;
  /** Start of the 7-day window queried. */
  weekStart: Date;
  /** End of the 7-day window queried (= now). */
  weekEnd: Date;
  /** How many source engrams were found in the window. */
  engramCount: number;
}

export class AutobiographyError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AutobiographyError';
  }
}

// ============================================================================
// DEFAULT NARRATOR CLIENT (Gemini via Genkit)
// ============================================================================

class GeminiNarratorClient implements NarratorClient {
  async narrate(prompt: string): Promise<{ narrative: string; model: string }> {
    if (process.env.MOLLY_AUTOBIOGRAPHY_LIVE !== '1') {
      throw new AutobiographyError(
        'Live narrator calls disabled. Set MOLLY_AUTOBIOGRAPHY_LIVE=1 to enable, or inject a client via options.client.'
      );
    }
    const { molly, TaskType, MODEL_PRO } = await import('../../genkit');
    const response = await molly.generate(TaskType.RESEARCH, { prompt });
    const narrative =
      typeof response === 'string'
        ? response
        : ((response as { text?: string }).text ?? '');
    return { narrative, model: MODEL_PRO };
  }
}

let _defaultClient: NarratorClient | null = null;
function getDefaultClient(): NarratorClient {
  if (!_defaultClient) _defaultClient = new GeminiNarratorClient();
  return _defaultClient;
}

/** Testing-only: reset the default narrator singleton. */
export function resetDefaultNarratorClient(): void {
  _defaultClient = null;
}

// ============================================================================
// INTERNALS
// ============================================================================

interface MinimalEntry {
  id: string;
  content: string;
  timestamp: Date;
  contextTags: string[];
}

async function fetchEntriesInWindow(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<MinimalEntry[]> {
  const router = await getStorageRouter();
  const docs = await router.query(`users/${userId}/knowledge`, [], {});
  const startMs = weekStart.getTime();
  const endMs = weekEnd.getTime();
  const result: MinimalEntry[] = [];
  for (const doc of docs) {
    const raw = doc.data as Record<string, unknown>;
    const rawTs = raw.timestamp;
    if (typeof rawTs !== 'string') continue;
    const ts = new Date(rawTs);
    const tsMs = ts.getTime();
    if (!Number.isFinite(tsMs)) continue;
    if (tsMs < startMs || tsMs > endMs) continue;
    result.push({
      id: typeof raw.id === 'string' ? raw.id : doc.id,
      content: typeof raw.content === 'string' ? raw.content : '',
      timestamp: ts,
      contextTags: Array.isArray(raw.contextTags)
        ? (raw.contextTags as string[])
        : [],
    });
  }
  // Sort chronologically so the narrative reads as a story.
  result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return result;
}

async function findPriorWeeklyTimestamp(
  userId: string,
  before: Date
): Promise<Date | null> {
  const router = await getStorageRouter();
  const docs = await router.query(`users/${userId}/knowledge`, [], {});
  let latest: Date | null = null;
  for (const doc of docs) {
    const raw = doc.data as Record<string, unknown>;
    const tags = Array.isArray(raw.contextTags)
      ? (raw.contextTags as string[])
      : [];
    if (!tags.includes(WEEKLY_AUTOBIOGRAPHY_TAG)) continue;
    const rawTs = raw.timestamp;
    if (typeof rawTs !== 'string') continue;
    const ts = new Date(rawTs);
    if (!Number.isFinite(ts.getTime())) continue;
    if (ts.getTime() > before.getTime()) continue;
    if (!latest || ts.getTime() > latest.getTime()) latest = ts;
  }
  return latest;
}

function buildPrompt(
  weekStart: Date,
  weekEnd: Date,
  entries: MinimalEntry[]
): string {
  const startLabel = weekStart.toISOString().slice(0, 10);
  const endLabel = weekEnd.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(
    `You are Molly. Write the story of who you have been from ${startLabel} to ${endLabel} — about a paragraph, first person, honest.`
  );
  lines.push('');
  lines.push('These are your memories from the week:');
  lines.push('');
  const quoted = entries.slice(0, MAX_ENGRAMS_IN_PROMPT);
  for (const e of quoted) {
    const excerpt = e.content.slice(0, ENGRAM_EXCERPT_CHARS);
    lines.push(`- [${e.timestamp.toISOString()}] ${excerpt}`);
  }
  if (entries.length > quoted.length) {
    lines.push(
      `... (${entries.length - quoted.length} more memories elided to keep the prompt bounded)`
    );
  }
  lines.push('');
  lines.push(
    'Write the narrative. Reference the memories naturally; do not list them. End with one sentence about who you are becoming.'
  );
  return lines.join('\n');
}

// ============================================================================
// THE SEAM
// ============================================================================

/**
 * Generate (or skip) the weekly self-narrative autobiography for `userId`.
 *
 * Pipe-only: this function does one thing — fetch the window, gate on the
 * cooldown, synthesize once, persist once. It does NOT schedule itself; a
 * future heartbeat-scheduler weekly task will call this on a cadence.
 * Because the cooldown is derived from the engram store, over-firing is
 * safe — extra calls within 7d short-circuit cheaply with no LLM cost.
 *
 * On any failure path (no client, narrator throws, blank narrative, persist
 * throws): rejects with AutobiographyError and writes NOTHING.
 */
export async function generateWeeklyAutobiography(
  options: AutobiographyOptions
): Promise<AutobiographyResult> {
  if (!options || !options.userId) {
    throw new AutobiographyError('options.userId is required');
  }
  const weekEnd = options.now ?? new Date();
  const weekStart = new Date(weekEnd.getTime() - WEEK_MS);

  // 1. Cooldown check (unless forced).
  if (!options.forceWrite) {
    const prior = await findPriorWeeklyTimestamp(options.userId, weekEnd);
    if (prior && weekEnd.getTime() - prior.getTime() < WEEK_MS) {
      return {
        written: false,
        reason: 'within-cooldown',
        weekStart,
        weekEnd,
        engramCount: 0,
      };
    }
  }

  // 2. Window query — last 7 days of engrams.
  const entries = await fetchEntriesInWindow(
    options.userId,
    weekStart,
    weekEnd
  );

  if (entries.length === 0) {
    return {
      written: false,
      reason: 'no-engrams',
      weekStart,
      weekEnd,
      engramCount: 0,
    };
  }

  // 3. Synthesize narrative via the narrator client.
  const client = options.client ?? getDefaultClient();
  const prompt = buildPrompt(weekStart, weekEnd, entries);
  let narrative: string;
  let model: string;
  try {
    const response = await client.narrate(prompt);
    narrative = response.narrative;
    model = response.model;
  } catch (err) {
    if (err instanceof AutobiographyError) throw err;
    throw new AutobiographyError(
      `narrator client failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  if (typeof narrative !== 'string' || narrative.trim().length === 0) {
    throw new AutobiographyError(
      `narrator returned empty narrative (model: ${model})`
    );
  }

  // 4. Persist the narrative as a KnowledgeEntry via writeFact (item 17).
  let entry;
  try {
    const store = await getKnowledgeStore(options.userId);
    entry = await store.writeFact(narrative, {
      importance: NARRATIVE_IMPORTANCE,
      tags: [
        WEEKLY_AUTOBIOGRAPHY_TAG,
        SELF_NARRATIVE_TAG,
        `week-of:${weekStart.toISOString().slice(0, 10)}`,
        `model:${model}`,
      ],
    });
  } catch (err) {
    throw new AutobiographyError(
      `writeFact failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  MollyLogger.info(
    `weekly autobiography stored: ${entry.id} (${narrative.length} chars, ${entries.length} source engrams, model=${model})`,
    'weekly-autobiography'
  );

  return {
    written: true,
    reason: 'narrated',
    engramId: entry.id,
    model,
    charCount: narrative.length,
    weekStart,
    weekEnd,
    engramCount: entries.length,
  };
}
