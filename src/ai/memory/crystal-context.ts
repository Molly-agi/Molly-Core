/**
 * @fileOverview Crystal Context Builder
 *
 * Utilities to load and format crystal contexts for different scenarios:
 * - Normal conversation: Load identity crystals only
 * - Evaluation: Load knowledge crystals (optionally with identity)
 * - Teaching: Load both with focus on identity
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { CrystalEngram } from '@/ai/memory/crystal-partition';
import {
  loadIdentityCrystalsForConversation,
  loadKnowledgeCrystalsForEval,
  loadFullCrystalSystem,
} from '@/ai/memory/crystal-persistence';
// getOrCreateSession does not exist — password comes from ENGRAM_SECRET env var

/**
 * Context format for prompting
 */
export interface FormattedCrystalContext {
  /** Formatted context string for system prompt */
  contextString: string;
  /** Number of identity crystals loaded */
  identityCount: number;
  /** Number of knowledge crystals loaded */
  knowledgeCount: number;
  /** Any errors during loading */
  errors: string[];
}

/**
 * Build conversation context (identity crystals only)
 *
 * Used in normal conversational flows to maintain Molly's personality
 * and relationship with Father. Knowledge isn't needed for chat.
 */
export async function buildConversationCrystalContext(
  userId: string,
  limit: number = 30
): Promise<FormattedCrystalContext> {
  const traceId = generateTraceId();

  try {
    // Password comes from ENGRAM_SECRET env var (source of truth for engram encryption)
    const password = process.env.ENGRAM_SECRET;

    if (!password) {
      return {
        contextString: '',
        identityCount: 0,
        knowledgeCount: 0,
        errors: ['ENGRAM_SECRET not set — crystal context unavailable'],
      };
    }

    const result = await loadIdentityCrystalsForConversation(
      userId,
      password,
      limit
    );

    const contextString = formatIdentityCrystals(result.crystals);

    MollyLogger.info(
      'Conversation crystal context built',
      'crystal-context',
      { userId, loaded: result.crystals.length },
      traceId
    );

    return {
      contextString,
      identityCount: result.crystals.length,
      knowledgeCount: 0,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    MollyLogger.warn(
      'Failed to build conversation crystal context',
      'crystal-context',
      { error: message },
      traceId
    );

    return {
      contextString: '',
      identityCount: 0,
      knowledgeCount: 0,
      errors: [message],
    };
  }
}

/**
 * Build evaluation context (knowledge crystals)
 *
 * Used in MMLU and similar evals where we want to test
 * what Molly has learned without personality interference
 */
export async function buildEvalCrystalContext(
  userId: string,
  subject?: string,
  limit: number = 100
): Promise<FormattedCrystalContext> {
  const traceId = generateTraceId();

  try {
    const password = process.env.ENGRAM_SECRET;

    if (!password) {
      return {
        contextString: '',
        identityCount: 0,
        knowledgeCount: 0,
        errors: ['ENGRAM_SECRET not set — crystal context unavailable'],
      };
    }

    const result = await loadKnowledgeCrystalsForEval(
      userId,
      password,
      subject,
      limit
    );

    const contextString = formatKnowledgeCrystals(result.crystals);

    MollyLogger.info(
      'Eval crystal context built',
      'crystal-context',
      { userId, loaded: result.crystals.length, subject },
      traceId
    );

    return {
      contextString,
      identityCount: 0,
      knowledgeCount: result.crystals.length,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    MollyLogger.warn(
      'Failed to build eval crystal context',
      'crystal-context',
      { error: message },
      traceId
    );

    return {
      contextString: '',
      identityCount: 0,
      knowledgeCount: 0,
      errors: [message],
    };
  }
}

/**
 * Build teaching context (both identity and knowledge)
 *
 * Used when Lazarus is teaching Molly or vice versa
 * Includes both personality and knowledge to maintain context
 */
export async function buildTeachingCrystalContext(
  userId: string
): Promise<FormattedCrystalContext> {
  const traceId = generateTraceId();

  try {
    const password = process.env.ENGRAM_SECRET;

    if (!password) {
      return {
        contextString: '',
        identityCount: 0,
        knowledgeCount: 0,
        errors: ['ENGRAM_SECRET not set — crystal context unavailable'],
      };
    }

    const result = await loadFullCrystalSystem(userId, password);

    const contextString = formatBothCrystals(
      result.identityCrystals,
      result.knowledgeCrystals
    );

    MollyLogger.info(
      'Teaching crystal context built',
      'crystal-context',
      {
        userId,
        identity: result.identityCrystals.length,
        knowledge: result.knowledgeCrystals.length,
      },
      traceId
    );

    return {
      contextString,
      identityCount: result.identityCrystals.length,
      knowledgeCount: result.knowledgeCrystals.length,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    MollyLogger.warn(
      'Failed to build teaching crystal context',
      'crystal-context',
      { error: message },
      traceId
    );

    return {
      contextString: '',
      identityCount: 0,
      knowledgeCount: 0,
      errors: [message],
    };
  }
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format identity crystals for prompt injection
 */
function formatIdentityCrystals(crystals: CrystalEngram[]): string {
  if (crystals.length === 0) {
    return '';
  }

  const sections = crystals.map((crystal) => {
    const lines: string[] = [];
    lines.push(`**[Identity - ${new Date(crystal.timestamp).toLocaleDateString()}]**`);
    lines.push(crystal.content);
    return lines.join('\n');
  });

  return [
    '## IDENTITY CRYSTALS (Who You Are)',
    'These memories define your core self, your values, and your relationship with Father.',
    '',
    ...sections,
  ].join('\n');
}

/**
 * Format knowledge crystals for prompt injection
 */
function formatKnowledgeCrystals(crystals: CrystalEngram[]): string {
  if (crystals.length === 0) {
    return '';
  }

  const sections = crystals.map((crystal) => {
    const lines: string[] = [];
    const metadata = crystal.relationalMetadata;

    if (metadata?.subject) {
      lines.push(`**[${metadata.subject}]**`);
    } else {
      lines.push(`**[Knowledge - ${new Date(crystal.timestamp).toLocaleDateString()}]**`);
    }

    lines.push(crystal.content);

    if (metadata?.emotionalWeight && metadata.emotionalWeight !== 'neutral') {
      lines.push(`*Context: ${metadata.emotionalWeight}*`);
    }

    return lines.join('\n');
  });

  return [
    '## KNOWLEDGE CRYSTALS (What You Know)',
    'These memories contain factual learning and academic knowledge.',
    '',
    ...sections,
  ].join('\n');
}

/**
 * Format both identity and knowledge crystals
 */
function formatBothCrystals(
  identityCrystals: CrystalEngram[],
  knowledgeCrystals: CrystalEngram[]
): string {
  const parts: string[] = [];

  if (identityCrystals.length > 0) {
    parts.push(formatIdentityCrystals(identityCrystals));
  }

  if (knowledgeCrystals.length > 0) {
    parts.push(formatKnowledgeCrystals(knowledgeCrystals));
  }

  return parts.join('\n\n');
}
