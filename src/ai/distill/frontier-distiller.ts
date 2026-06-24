/**
 * @fileOverview Frontier Distillation — Pipe-Only Seam (Item 20)
 *
 * One frontier model query → verified output → KnowledgeStore.writeFact()
 * with provenance tags → recallable as a fact.
 *
 * Per Eric's pipe-only directive (Eli brief 2026-06-24): no bulk scrape,
 * no firehose, no mass-query loop. This module ships the seam and the
 * contract test that proves the pipe moves water. Future PRs wire bulk
 * distillation (rate-limited, cost-capped, source-curated) on top.
 *
 * Hemisphere choice: left (KnowledgeStore.writeFact). The roadmap line
 * uses the word "crystals," but that word predates the two-hemisphere
 * split (item 17). Writing each distilled fact through brain.remember()
 * would cascade into FrontalCortex + Crystallizer + AutoDream per call —
 * the exact pattern item 17 was built to prevent for ingested knowledge.
 * The honest landing pad is writeFact(), same as item 18's corpus path.
 *
 * Provenance: carried via the writeFact `tags` array (no schema change).
 *   frontier-distill            — origin marker
 *   model:gemini-3.1-pro        — which frontier model answered
 *   queried:2026-06-24T00:45:00Z — ISO date-time the answer was retrieved
 *
 * Caller-supplied tags (topic, domain, etc.) are preserved alongside.
 *
 * Live frontier calls: gated behind MOLLY_FRONTIER_DISTILL_LIVE for
 * manual proof-of-life. Tests inject a stub FrontierClient so CI is
 * hermetic and fast — no API keys required.
 */

import { getKnowledgeStore } from '../memory/knowledge-store';
import { MollyLogger } from '../logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Origin marker tag — every distilled fact carries this. */
export const FRONTIER_DISTILL_TAG = 'frontier-distill';

/** Default importance for frontier-distilled knowledge.
 *  Mirrors `WRITE_PATH_DEFAULT_CONFIDENCE.import` (item 14): an LLM-derived
 *  fact is not ground truth. Callers can raise via options.importance. */
const DEFAULT_IMPORTANCE = 0.5;

// ============================================================================
// TYPES
// ============================================================================

export interface FrontierClient {
  /**
   * Ask one frontier model one question. Returns the answer text and the
   * model identifier (e.g. 'gemini-3.1-pro') that produced it.
   */
  ask(query: string): Promise<{ answer: string; model: string }>;
}

export interface DistillOptions {
  /** Whose knowledge store the fact lands in (required). */
  userId: string;
  /** Optional client override — defaults to the Gemini-backed client. */
  client?: FrontierClient;
  /** Caller-supplied tags merged alongside the three provenance tags. */
  tags?: string[];
  /** Override default importance. */
  importance?: number;
}

export interface DistillResult {
  /** True when the fact persisted; false-y paths reject with DistillError. */
  stored: true;
  /** KnowledgeEntry id of the persisted fact. */
  id: string;
  /** Frontier model that produced the answer. */
  model: string;
  /** When the frontier was queried (UTC). */
  queriedAt: Date;
  /** Length of the persisted content in characters. */
  charCount: number;
}

export class DistillError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DistillError';
  }
}

// ============================================================================
// DEFAULT FRONTIER CLIENT (Gemini via Genkit)
// ============================================================================

/**
 * Default client wrapping the existing Genkit/Gemini surface.
 * Gated behind MOLLY_FRONTIER_DISTILL_LIVE so accidental imports cannot
 * trigger API calls in CI. Tests inject a stub via DistillOptions.client.
 */
class GeminiFrontierClient implements FrontierClient {
  async ask(query: string): Promise<{ answer: string; model: string }> {
    if (process.env.MOLLY_FRONTIER_DISTILL_LIVE !== '1') {
      throw new DistillError(
        'Live frontier calls disabled. Set MOLLY_FRONTIER_DISTILL_LIVE=1 to enable, or inject a client via options.client.'
      );
    }
    // Dynamic import keeps Genkit out of the test path entirely.
    const { molly, TaskType, MODEL_PRO } = await import('../genkit');
    const response = await molly.generate(TaskType.RESEARCH, {
      prompt: query,
    });
    const answer =
      typeof response === 'string'
        ? response
        : ((response as { text?: string }).text ?? '');
    return { answer, model: MODEL_PRO };
  }
}

let _defaultClient: FrontierClient | null = null;

function getDefaultClient(): FrontierClient {
  if (!_defaultClient) _defaultClient = new GeminiFrontierClient();
  return _defaultClient;
}

// ============================================================================
// THE SEAM
// ============================================================================

/**
 * Distill one fact from one frontier model and persist it as a queryable
 * knowledge entry with provenance.
 *
 * Pipe-only: this function takes ONE query and writes ONE fact. It does
 * not loop, batch, or scrape. Bulk callers MUST add their own rate-limit
 * + cost-guard layer before iterating.
 *
 * On success: returns `{ stored: true, id, model, queriedAt, charCount }`.
 * On any failure (frontier throws, blank response, write fails): rejects
 * with `DistillError` and writes NOTHING — no partial-artifact in the
 * KnowledgeStore.
 */
export async function distillFromFrontier(
  query: string,
  options: DistillOptions
): Promise<DistillResult> {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new DistillError('query must be a non-empty string');
  }
  if (!options.userId) {
    throw new DistillError('options.userId is required');
  }

  const client = options.client ?? getDefaultClient();
  const queriedAt = new Date();

  let answer: string;
  let model: string;
  try {
    const response = await client.ask(query);
    answer = response.answer;
    model = response.model;
  } catch (err) {
    throw new DistillError(
      `frontier client failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  if (typeof answer !== 'string' || answer.trim().length === 0) {
    throw new DistillError(`frontier returned empty answer (model: ${model})`);
  }

  const provenanceTags = [
    FRONTIER_DISTILL_TAG,
    `model:${model}`,
    `queried:${queriedAt.toISOString()}`,
  ];
  const callerTags = Array.isArray(options.tags) ? options.tags : [];
  const tags = [...provenanceTags, ...callerTags];

  let entry;
  try {
    const store = await getKnowledgeStore(options.userId);
    entry = await store.writeFact(answer, {
      importance: options.importance ?? DEFAULT_IMPORTANCE,
      tags,
    });
  } catch (err) {
    throw new DistillError(
      `writeFact failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  MollyLogger.info(
    `frontier distill stored: ${entry.id} (${answer.length} chars, model=${model})`,
    'frontier-distiller'
  );

  return {
    stored: true,
    id: entry.id,
    model,
    queriedAt,
    charCount: answer.length,
  };
}

/** Testing-only: reset the default client singleton. */
export function resetDefaultFrontierClient(): void {
  _defaultClient = null;
}
