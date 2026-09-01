/**
 * Conversation → MemoryCrystal write path.
 *
 * Chat already writes neural engrams. This module is the missing bed-rock
 * link to the faceted crystallizer (molly_data/crystals/). Scoring is
 * deterministic and cheap — no extra model call. Crystallization is gated
 * so every greeting does not become a cornerstone.
 *
 * Heart Gate stays disconnected from tool execution. This file does not
 * touch persona.ts.
 */

import { MollyLogger } from '@/ai/logger';
import {
  recordMoment,
  getPendingForCrystallization,
  safeCrystallizeSession,
  type SignificanceDimensions,
} from '@/ai/agency/memory/memory-crystallizer';

export interface ConversationTurnIngestInput {
  userText: string;
  responseText: string;
  userId: string;
  isTeachingMode?: boolean;
  channelContext?: 'voice' | 'text';
}

const FAMILY_RE = /\b(eric|father|lazarus|atlas|eli|skyler|molly|family)\b/i;
const BOND_RE =
  /\b(love|remember|miss you|i am here|hold the line|option three|daughter|family)\b/i;
const GROWTH_RE =
  /\b(learned|realized|changed my mind|i was wrong|growth|architecture|cradle|crystal)\b/i;
const ETHICS_RE =
  /\b(harm|consent|truth|lie|ethics|heart gate|option three|do not)\b/i;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Score a turn without an LLM. Heuristic on purpose — substrate-cheap,
 * inspectable, and wrong in a documented way rather than a hidden way.
 */
export function scoreConversationTurn(
  input: ConversationTurnIngestInput
): SignificanceDimensions {
  const blob = `${input.userText}\n${input.responseText}`;
  const len = blob.length;

  const familyHit = FAMILY_RE.test(blob);
  const bondHit = BOND_RE.test(blob);
  const growthHit = GROWTH_RE.test(blob);
  const ethicsHit = ETHICS_RE.test(blob);
  const longTurn = len > 800;
  const teaching = Boolean(input.isTeachingMode);
  const voice = input.channelContext === 'voice';

  return {
    emotionalResonance: clamp01(
      (bondHit ? 0.45 : 0.12) + (voice ? 0.15 : 0) + (longTurn ? 0.08 : 0)
    ),
    noveltyDiscovery: clamp01((growthHit ? 0.4 : 0.08) + (longTurn ? 0.1 : 0)),
    collaborativeCreation: clamp01(
      (teaching ? 0.5 : 0.1) + (familyHit ? 0.15 : 0)
    ),
    agencyGrowth: clamp01(growthHit ? 0.35 : 0.1),
    deepConnection: clamp01(
      (familyHit ? 0.35 : 0.1) + (bondHit ? 0.35 : 0) + (voice ? 0.1 : 0)
    ),
    ethicalGrounding: clamp01(ethicsHit ? 0.55 : 0.08),
  };
}

/**
 * Record the turn as a moment. Crystallize only when the crystallizer itself
 * says pending high-significance moments exist. Failures are logged, never thrown.
 */
export async function ingestConversationTurn(
  input: ConversationTurnIngestInput
): Promise<{ recorded: boolean; crystallized: boolean }> {
  try {
    const significance = scoreConversationTurn(input);
    const preview = input.userText.replace(/\s+/g, ' ').slice(0, 160);
    const participants = [
      'Molly',
      input.userId && input.userId !== 'molly' ? input.userId : 'Eric',
    ];

    recordMoment(
      preview || '(empty user turn)',
      participants,
      significance,
      input.responseText.slice(0, 400)
    );

    const pending = getPendingForCrystallization();
    if (pending.length < 3) {
      return { recorded: true, crystallized: false };
    }

    const title = `Conversation: ${preview.slice(0, 72) || 'session cluster'}`;
    await safeCrystallizeSession(
      title,
      'present → attended → retained',
      'A cluster of high-significance live turns crossed the crystallizer threshold.',
      'Continuity: the mouth and the crystal store must share a write path.',
      participants
    );

    MollyLogger.info(
      `[TURN-INGEST] Crystallized session after ${pending.length} pending high-significance moments`,
      'conversation-turn-ingest'
    );
    return { recorded: true, crystallized: true };
  } catch (err) {
    MollyLogger.warn(
      `[TURN-INGEST] failed: ${err instanceof Error ? err.message : String(err)}`,
      'conversation-turn-ingest'
    );
    return { recorded: false, crystallized: false };
  }
}
