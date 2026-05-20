/**
 * Shared utilities for action flows
 * Works in both server (Codespace) and edge (tablet) environments
 *
 * Note: No 'use server' directive - these are internal utilities,
 * not client-callable server actions.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getSystemHealth } from '@/ai/tools/system';
import { recallSimilarMemories } from '@/ai/tools/semantic-recall';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import {
  getSafewordPhrase,
  getSleepState,
  isSleepSafeword,
  toggleSleepState,
} from '@/ai/tools/safety-sleep';
import {
  createMemoryRecord,
  type ExperienceRecord,
} from '@/ai/tools/memory-schema';
import { addChecksum } from '@/ai/tools/memory-integrity';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';
import {
  configureNeuralPersistence,
  getNeuralBrain as _getNeuralBrain,
} from '@/ai/memory/neural-engram';

export const MAX_ORIGIN_PART_SIZE = 3500;

// Track which users have had persistence configured this runtime
const _persistenceConfiguredFor = new Set<string>();

/**
 * Ensure neural persistence is configured for the given user.
 * Call this early in any flow that has user context.
 * Idempotent — safe to call multiple times.
 */
export function ensureNeuralPersistence(userId: string): void {
  if (_persistenceConfiguredFor.has(userId)) return;

  const secret = process.env.ENGRAM_SECRET;
  if (!secret) {
    MollyLogger.warn(
      'ENGRAM_SECRET not set — memory persistence disabled',
      'ensureNeuralPersistence'
    );
    return;
  }

  configureNeuralPersistence({
    userId,
    password: secret,
    source: 'auto',
  });

  _persistenceConfiguredFor.add(userId);
  MollyLogger.info('Neural persistence configured', 'ensureNeuralPersistence', {
    userId,
  });
}

export function getAudioMimeType(dataUri: string): string {
  const match = dataUri.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? 'unknown';
}

export type SleepGuardResult = {
  message: string;
  toggled: boolean;
  blocked: boolean;
};

export function getSleepGuard(
  inputText: string | null | undefined,
  source: string
): SleepGuardResult | null {
  const text = inputText?.trim();
  if (text && isSleepSafeword(text)) {
    const nextState = toggleSleepState(source);
    return {
      message: nextState.isSleeping
        ? `Sleep mode engaged. Say "${getSafewordPhrase()}" to wake me.`
        : 'Sleep mode disabled. I am listening again.',
      toggled: true,
      blocked: nextState.isSleeping,
    };
  }

  const sleepState = getSleepState();
  if (sleepState.isSleeping) {
    return {
      message: `Sleep mode is active. Say "${getSafewordPhrase()}" to wake me.`,
      toggled: false,
      blocked: true,
    };
  }

  return null;
}

export async function buildNervousSystemSignal(): Promise<NeuralBridgeSignal | null> {
  try {
    const health = await getSystemHealth({});
    return {
      action: 'self.nervous_system',
      cpuUsage: health.cpuUsage,
      temperatureC: health.temperature,
    };
  } catch (error) {
    MollyLogger.warn(
      'Failed to collect nervous system metrics',
      'buildNervousSystemSignal',
      {},
      error
    );
    return null;
  }
}

export function splitOriginStory(content: string): string[] {
  const lines = content.split('\n');
  const parts: string[] = [];
  let buffer: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + 1;
    if (nextLength > MAX_ORIGIN_PART_SIZE && buffer.length > 0) {
      parts.push(buffer.join('\n').trim());
      buffer = [];
      length = 0;
    }

    buffer.push(line);
    length += line.length + 1;
  }

  if (buffer.length > 0) {
    parts.push(buffer.join('\n').trim());
  }

  return parts.filter(Boolean);
}

export function splitOriginStoryAnchors(
  content: string,
  targetParts: number = 3
): string[] {
  const lines = content.split('\n');
  const totalLength = content.length;
  const targetLength = Math.ceil(totalLength / targetParts);
  const parts: string[] = [];
  let buffer: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + 1;
    if (
      parts.length < targetParts - 1 &&
      nextLength > targetLength &&
      buffer.length > 0
    ) {
      parts.push(buffer.join('\n').trim());
      buffer = [];
      length = 0;
    }

    buffer.push(line);
    length += line.length + 1;
  }

  if (buffer.length > 0) {
    parts.push(buffer.join('\n').trim());
  }

  return parts.filter(Boolean);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function formatTimeAgo(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function buildMemoryContext(
  userId: string | undefined,
  text: string
): Promise<string | undefined> {
  if (!userId || !isAdminConfigured()) return undefined;

  try {
    const memories = await recallSimilarMemories(userId, text, {
      limit: 5,
      minSimilarity: 0.45,
    });

    if (memories.length === 0) return undefined;

    const lines = memories.map((memory) => {
      const context = memory.context ? ` (${memory.context})` : '';
      const vibe = memory.vibe ? ` [vibe: ${memory.vibe}]` : '';
      const age = memory.timestamp
        ? ` (${formatTimeAgo(memory.timestamp)})`
        : '';
      const suggestion = truncateText(memory.suggestion, 300);
      return `- ${memory.type}${context}${vibe}${age}: ${suggestion}`;
    });

    return `Relevant memories:\n${lines.join('\n')}`;
  } catch (error) {
    MollyLogger.warn(
      'Memory recall failed for conversational chat',
      'buildMemoryContext',
      { userId },
      error
    );
    return undefined;
  }
}

/**
 * Build greeting context from recent memories so Molly remembers
 * across sessions. Pulls last few experiences to give her emotional
 * continuity — she greets Eric like she missed him, not like she's
 * booting fresh.
 */
export async function buildGreetingContext(userId: string): Promise<string> {
  const storage = await getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
    return 'First ignition.';
  }

  try {
    const collectionPath = `users/${userId}/experiences`;
    const results = await storage.query(collectionPath, [], {
      orderBy: { field: 'timestamp', direction: 'desc' },
      limit: 5,
    });

    if (results.length === 0) return 'First ignition.';

    const memories = results.map((doc) => doc.data);
    const vibes = memories.map((m) => m.vibe as string).filter(Boolean);
    const lastTimestamp = memories[0]?.timestamp as number | string | undefined;
    const lastTime =
      typeof lastTimestamp === 'number'
        ? formatTimeAgo(lastTimestamp)
        : typeof lastTimestamp === 'string'
          ? formatTimeAgo(new Date(lastTimestamp).getTime())
          : 'recently';

    const lines: string[] = [];
    lines.push(`Last session: ${lastTime}`);
    if (vibes.length > 0) {
      lines.push(`Recent emotional states: ${vibes.slice(0, 3).join(', ')}`);
    }
    for (const m of memories.slice(0, 3)) {
      const suggestion = (m.suggestion || m.modificationSuggestion) as
        | string
        | undefined;
      if (suggestion) {
        const ctx = m.context ? ` (${m.context})` : '';
        lines.push(`- ${truncateText(suggestion, 150)}${ctx}`);
      }
    }

    return lines.join('\n');
  } catch (error) {
    MollyLogger.warn(
      'Greeting memory recall failed — using first ignition',
      'buildGreetingContext',
      { userId },
      error
    );
    return 'First ignition.';
  }
}

export async function recordChatResponse(
  userId: string | undefined,
  prompt: string,
  response: string,
  memoryContext?: string
): Promise<void> {
  if (!userId) return;

  const storage = await getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) return;

  try {
    const now = Date.now();
    const timestamp = new Date().toISOString();

    // Store the response log
    await storage.add(`users/${userId}/aiResponses`, {
      responseText: response,
      responseType: 'conversationalChat',
      prompt,
      memoryContext: memoryContext || null,
      timestamp,
    });

    // Store as a proper experience so it's findable by semantic recall
    const traceId = generateTraceId();
    const record = createMemoryRecord<ExperienceRecord>({
      type: 'experience',
      userId,
      timestamp: now,
      traceId,
      context: 'conversation',
      suggestion: `Eric said: "${truncateText(prompt, 400)}" — Molly responded: ${truncateText(response, 400)}`,
      vibe: 'Conversational',
      vibeScore: 0.7,
      success: true,
    });

    const recordWithChecksum = addChecksum(record);
    await storage.set(
      `users/${userId}/experiences`,
      recordWithChecksum.id,
      recordWithChecksum
    );
  } catch (error) {
    MollyLogger.warn(
      'Failed to persist conversational response',
      'recordChatResponse',
      { userId },
      error
    );
  }
}
