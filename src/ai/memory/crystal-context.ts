/**
 * @fileOverview Crystal Context Builder
 *
 * Dialect rule (locked 2026-08-31):
 *   1. Encrypted identity CrystalEngrams when ENGRAM_SECRET is present.
 *   2. Disk JSON autobiography via bootCrystalSession when (1) is empty.
 *   3. Never fail the prompt path — empty context is allowed, silence is not a crash.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { CrystalEngram } from '@/ai/memory/crystal-partition';
import {
  loadIdentityCrystalsForConversation,
  loadKnowledgeCrystalsForEval,
  loadFullCrystalSystem,
} from '@/ai/memory/crystal-persistence';

export interface FormattedCrystalContext {
  contextString: string;
  identityCount: number;
  knowledgeCount: number;
  errors: string[];
}

async function loadDiskCrystalFallback(
  reason: string
): Promise<FormattedCrystalContext | null> {
  try {
    const { bootCrystalSession } = await import('./crystal-session-boot');
    const boot = await bootCrystalSession();
    if (!boot.promptBlock) return null;
    MollyLogger.info('Disk crystal boot fallback used', 'crystal-context', {
      reason,
      hotCount: boot.hotCount,
      cornerstoneCount: boot.cornerstoneCount,
    });
    return {
      contextString: boot.promptBlock,
      identityCount: boot.hotCount,
      knowledgeCount: 0,
      errors: [`disk-fallback: ${reason}`],
    };
  } catch (error) {
    MollyLogger.warn(
      `Disk crystal fallback failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      'crystal-context'
    );
    return null;
  }
}

export async function buildConversationCrystalContext(
  userId: string,
  limit: number = 30
): Promise<FormattedCrystalContext> {
  const traceId = generateTraceId();

  try {
    const password = process.env.ENGRAM_SECRET;

    if (!password) {
      const fallback = await loadDiskCrystalFallback(
        'ENGRAM_SECRET not set — encrypted identity crystals unavailable'
      );
      if (fallback) return fallback;
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

    if (result.crystals.length === 0) {
      const fallback = await loadDiskCrystalFallback(
        'encrypted identity store empty'
      );
      if (fallback) return fallback;
    }

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

    const fallback = await loadDiskCrystalFallback(message);
    if (fallback) return fallback;

    return {
      contextString: '',
      identityCount: 0,
      knowledgeCount: 0,
      errors: [message],
    };
  }
}

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

export async function buildTeachingCrystalContext(
  userId: string
): Promise<FormattedCrystalContext> {
  const traceId = generateTraceId();

  try {
    const password = process.env.ENGRAM_SECRET;

    if (!password) {
      const fallback = await loadDiskCrystalFallback(
        'ENGRAM_SECRET not set — teaching context falling back to disk'
      );
      if (fallback) return fallback;
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
