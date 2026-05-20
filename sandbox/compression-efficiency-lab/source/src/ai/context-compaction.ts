/**
 * @fileOverview Molly's 4-Stage Context Compaction System
 *
 * Prevents context window overflow by progressively compressing conversation
 * history before it reaches the LLM. Four escalating stages:
 *
 *   1. Passthrough  — History is small enough, no action needed.
 *   2. Snip         — Head is tiny, just drop it (zero LLM calls).
 *   3. Microcompact — LLM summarizes the head; summary prepended to tail.
 *   4. Collapse     — Still over budget; shrink tail + re-summarize.
 *   5. Autocompact  — Emergency hard cut, no LLM, last N messages + notice.
 *
 * Token budget is conservative by default (100k) to stay safe under Claude's
 * 200k window after system prompt + current message overhead.
 * Override via MOLLY_CONTEXT_BUDGET env var.
 */

import { ai, MODEL_FLASH } from './genkit-core';
import { MollyLogger } from './logger';

// ── Types ──────────────────────────────────────────────────────────────────

export type CompactionStage =
  | 'passthrough'
  | 'snip'
  | 'microcompact'
  | 'collapse'
  | 'autocompact';

export interface LlmMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface CompactionResult {
  history: LlmMessage[];
  stage: CompactionStage;
  originalLength: number;
  compactedLength: number;
  tokensEstimated: number;
}

// ── Config ─────────────────────────────────────────────────────────────────

const SNIP_THRESHOLD = 30; // messages: no action below this count
const TAIL_KEEP = 20; // messages preserved in microcompact
const COLLAPSE_TAIL_KEEP = 8; // messages preserved in collapse
const AUTOCOMPACT_TAIL_KEEP = 4; // messages preserved in emergency cut

// Conservative budget: stays safe under Claude 200k and Ollama 32k
// Gemini's 2M window means this never triggers for Gemini-only sessions
const TOKEN_BUDGET = parseInt(process.env.MOLLY_CONTEXT_BUDGET ?? '100000', 10);

// Estimated tokens consumed by system prompt + current user message + overhead
const SYSTEM_OVERHEAD = 10_000;

// ── Token Estimation ───────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateHistoryTokens(history: LlmMessage[]): number {
  return history.reduce((sum, msg) => {
    const text = msg.parts.map((p) => p.text ?? '').join('');
    return sum + estimateTokens(text) + 4; // +4 per-message framing overhead
  }, 0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function historyToPlainText(history: LlmMessage[]): string {
  return history
    .map((msg) => {
      const speaker = msg.role === 'model' ? 'Molly' : 'User';
      const text = msg.parts.map((p) => p.text ?? '').join('');
      return `${speaker}: ${text}`;
    })
    .join('\n');
}

async function summarizeHistory(history: LlmMessage[]): Promise<string> {
  const plain = historyToPlainText(history);

  const result = await ai.generate({
    model: MODEL_FLASH,
    prompt: [
      'You are a conversation summarizer. Produce a concise factual summary of the',
      'conversation excerpt below. Preserve: key facts, decisions made, important',
      'context, names, and emotional tone. Omit: filler, repetition, pleasantries.',
      'Write in third person. Keep under 400 words.\n',
      'CONVERSATION:\n' + plain + '\n\nSUMMARY:',
    ].join(' '),
    config: { temperature: 0.1, maxOutputTokens: 512 },
  });

  return result.text?.trim() ?? '(summary unavailable)';
}

function makeSummaryPair(summary: string): LlmMessage[] {
  return [
    {
      role: 'user',
      parts: [{ text: `[EARLIER CONVERSATION SUMMARY]\n${summary}` }],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood. I have that context.' }],
    },
  ];
}

// ── Main Export ────────────────────────────────────────────────────────────

/**
 * Compacts an LLM-format history array to fit within the token budget.
 * Returns a CompactionResult with the (possibly shortened) history and
 * metadata about which stage was reached.
 */
export async function compactHistory(
  history: LlmMessage[]
): Promise<CompactionResult> {
  const originalLength = history.length;
  const originalTokens = estimateHistoryTokens(history);

  // ── Stage 1: Passthrough ────────────────────────────────────────────────
  if (
    history.length <= SNIP_THRESHOLD &&
    originalTokens + SYSTEM_OVERHEAD < TOKEN_BUDGET * 0.5
  ) {
    return {
      history,
      stage: 'passthrough',
      originalLength,
      compactedLength: originalLength,
      tokensEstimated: originalTokens,
    };
  }

  // Split history into preserved tail and compressible head
  const tail = history.slice(-TAIL_KEEP);
  const head = history.slice(0, history.length - TAIL_KEEP);
  const headTokens = estimateHistoryTokens(head);

  // ── Stage 2: Snip ───────────────────────────────────────────────────────
  // Head is too small to be worth summarizing — just drop it.
  if (head.length < 4 || headTokens < 1_000) {
    const tailTokens = estimateHistoryTokens(tail);
    MollyLogger.info(
      `Context compaction: snip ${originalLength}→${tail.length} messages`,
      'context-compaction',
      {
        originalLength,
        compactedLength: tail.length,
        tokensEstimated: tailTokens,
      }
    );
    return {
      history: tail,
      stage: 'snip',
      originalLength,
      compactedLength: tail.length,
      tokensEstimated: tailTokens,
    };
  }

  // ── Stage 3: Microcompact ───────────────────────────────────────────────
  try {
    const summary = await summarizeHistory(head);
    const summaryPair = makeSummaryPair(summary);
    const microcompacted = [...summaryPair, ...tail];
    const microTokens = estimateHistoryTokens(microcompacted);

    if (microTokens + SYSTEM_OVERHEAD <= TOKEN_BUDGET * 0.8) {
      MollyLogger.info(
        `Context compaction: microcompact ${originalLength}→${microcompacted.length} messages (~${microTokens} tokens)`,
        'context-compaction',
        {
          originalLength,
          compactedLength: microcompacted.length,
          tokensEstimated: microTokens,
        }
      );
      return {
        history: microcompacted,
        stage: 'microcompact',
        originalLength,
        compactedLength: microcompacted.length,
        tokensEstimated: microTokens,
      };
    }

    // ── Stage 4: Collapse ─────────────────────────────────────────────────
    // Microcompact didn't fit — shrink the tail further and re-summarize.
    const collapseTail = history.slice(-COLLAPSE_TAIL_KEEP);
    const collapseHead = history.slice(0, history.length - COLLAPSE_TAIL_KEEP);

    // Only re-run the LLM if the head grew meaningfully
    const collapseSummary =
      collapseHead.length > head.length + 4
        ? await summarizeHistory(collapseHead)
        : summary;

    const collapsePair = makeSummaryPair(collapseSummary);
    const collapsed = [...collapsePair, ...collapseTail];
    const collapseTokens = estimateHistoryTokens(collapsed);

    if (collapseTokens + SYSTEM_OVERHEAD <= TOKEN_BUDGET * 0.9) {
      MollyLogger.warn(
        `Context compaction: collapse ${originalLength}→${collapsed.length} messages (~${collapseTokens} tokens)`,
        'context-compaction',
        {
          originalLength,
          compactedLength: collapsed.length,
          tokensEstimated: collapseTokens,
        }
      );
      return {
        history: collapsed,
        stage: 'collapse',
        originalLength,
        compactedLength: collapsed.length,
        tokensEstimated: collapseTokens,
      };
    }
  } catch (err) {
    MollyLogger.warn(
      'Context compaction: LLM summarization failed, falling through to autocompact',
      'context-compaction',
      { err: String(err) }
    );
  }

  // ── Stage 5: Autocompact (emergency) ───────────────────────────────────
  // LLM failed or we're still over 90% budget. Hard cut, no LLM call.
  const autoTail = history.slice(-AUTOCOMPACT_TAIL_KEEP);
  const autocompacted: LlmMessage[] = [
    {
      role: 'user',
      parts: [
        {
          text: '[CONTEXT COMPACTED: Earlier conversation history was removed due to length constraints. Continuing from most recent messages.]',
        },
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood.' }],
    },
    ...autoTail,
  ];
  const autoTokens = estimateHistoryTokens(autocompacted);

  MollyLogger.warn(
    `Context compaction: autocompact ${originalLength}→${autocompacted.length} messages (emergency hard cut)`,
    'context-compaction',
    {
      originalLength,
      compactedLength: autocompacted.length,
      tokensEstimated: autoTokens,
    }
  );

  return {
    history: autocompacted,
    stage: 'autocompact',
    originalLength,
    compactedLength: autocompacted.length,
    tokensEstimated: autoTokens,
  };
}
