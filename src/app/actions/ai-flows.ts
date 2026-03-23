'use server';

import { conversationalChat } from '@/ai/flows/conversational-chat';
import { healthCheck } from '@/ai/flows/health-check';
import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';
import { textToTermuxCommand } from '@/ai/flows/text-to-termux-command';
import { contextualGuidance } from '@/ai/flows/contextual-ai-guidance';
import {
  autonomousSolution,
  type AutonomousSolutionOutput,
} from '@/ai/flows/autonomous-solution';
import { textToScript } from '@/ai/flows/text-to-script';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { visionaryCoach } from '@/ai/flows/visionary-coach';
import { textToSpeech } from '@/ai/flows/text-to-speech';
import { introspectionFlow } from '@/ai/flows/introspection';
import { runAutonomousEvolution } from '@/ai/flows/evolution-loop';
import { analyzeVision } from '@/ai/flows/vision-analysis';
import { generateMollyDream } from '@/ai/flows/dream-flow';
import { runInterpreter } from '@/ai/flows/interpreter-limb';
import { runCollaborativeHive } from '@/ai/flows/collaborative-hive';
import { runImmuneResponse } from '@/ai/flows/immune-response';
import { runSyntheticSynthesis } from '@/ai/flows/synthetic-api-synthesis';
import { listAvailableModels } from '@/ai/tools/system';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';
import { getSystemHealth } from '@/ai/tools/system';
import { logPacingTelemetry } from '@/ai/tools/pacing-telemetry';
import { getLastLatencyMs, setLastLatencyMs } from '@/ai/tools/latency-cache';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { recordSensoryLogServer } from '@/firebase/firestore/agent-memory-server';
import { recallSimilarMemories } from '@/ai/tools/semantic-recall';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import type { BatchOperation } from '@/lib/storage-interface';
import { addChecksum } from '@/ai/tools/memory-integrity';
import {
  createMemoryRecord,
  type ExperienceRecord,
} from '@/ai/tools/memory-schema';
import { enhancedResearch } from '@/ai/flows/enhanced-research';
import { analyzeCode, type CodeAnalysisResult } from '@/ai/flows/code-analysis';
import {
  analyzeAndIntegrate,
  integrateFromAnalysis,
  listIntegrations,
  type IntegrationResult,
} from '@/ai/flows/code-integration';
import {
  runPillarPipeline,
  listPillarFiles,
  type PillarPipelineResult,
} from '@/ai/flows/pillar-pipeline';
import { readMollyRepo, type RepoReadingOutput } from '@/ai/flows/self-reader';
import {
  setupTermuxEnvironment,
  updateTermuxEnvironment,
  getTermuxBootstrapCommand,
  type TermuxSelfSetupResult,
} from '@/ai/flows/termux-self-setup';
import {
  getSafewordPhrase,
  getSleepState,
  isSleepSafeword,
  toggleSleepState,
} from '@/ai/tools/safety-sleep';
import {
  withTimeout,
  withTimeoutAndRetry,
  TIMEOUT_PRESETS,
  RETRY_PRESETS,
} from '@/ai/tools/timeout-retry';
import {
  runAssetRecoveryScan,
  getAssetRecoveryStatus,
  setAssetRecoveryMode,
} from '@/ai/flows/asset-recovery';
import { ensureApiKey, checkRateLimit } from './utils';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const MAX_ORIGIN_PART_SIZE = 3500;

function getAudioMimeType(dataUri: string): string {
  const match = dataUri.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? 'unknown';
}

type SleepGuardResult = {
  message: string;
  toggled: boolean;
  blocked: boolean;
};

function getSleepGuard(
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

async function buildNervousSystemSignal(): Promise<NeuralBridgeSignal | null> {
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

function splitOriginStory(content: string): string[] {
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

function splitOriginStoryAnchors(
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

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

async function buildMemoryContext(userId: string | undefined, text: string) {
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
async function buildGreetingContext(userId: string): Promise<string> {
  // In Firestore mode, check if admin is configured
  const storage = getStorageRouter();
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

function formatTimeAgo(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function recordChatResponse(
  userId: string | undefined,
  prompt: string,
  response: string,
  memoryContext?: string
) {
  if (!userId) return;

  // In Firestore mode, check if admin is configured
  const storage = getStorageRouter();
  if (storage.getMode() === 'firestore' && !isAdminConfigured()) return;

  try {
    const now = Date.now();
    const timestamp = new Date().toISOString();

    // 1. Store the response log (existing behavior)
    await storage.add(`users/${userId}/aiResponses`, {
      responseText: response,
      responseType: 'conversationalChat',
      prompt,
      memoryContext: memoryContext || null,
      timestamp,
    });

    // 2. Store as a proper experience so it's findable by semantic recall.
    //    This is Molly's learning step — every conversation exchange becomes
    //    a searchable memory, not just a log entry.
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

// ============================================
// HEALTH & DIAGNOSTICS
// ============================================

export async function getHealthCheck(
  text: string,
  userId: string,
  lastContext?: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('health-check', 300);
    // Pull real memories for greeting so Molly has emotional continuity
    const context = lastContext || (await buildGreetingContext(userId));
    return await healthCheck(text, context);
  } catch (e: unknown) {
    MollyLogger.error(
      '[CRITICAL] Health Check Failed',
      'getHealthCheck',
      { userId },
      e
    );
    return {
      greeting: 'My neural core is initializing. Please stand by.',
      error: e instanceof Error ? e.message : String(e),
      isHealthy: false,
    };
  }
}

export async function getModelPulse() {
  try {
    ensureApiKey();
    return await listAvailableModels({});
  } catch (e) {
    MollyLogger.error('Model list failed', 'getModelPulse', {}, e);
    return ['Error: Pulse Failed'];
  }
}

// ============================================
// VOICE PROCESSING
// ============================================

/**
 * Legacy voice command handler (converts to termux commands)
 * Use processVoiceInteraction for conversational voice instead
 */
export async function getVoiceCommand(audioData: string) {
  try {
    ensureApiKey();
    await checkRateLimit('voice-command', 500);
    MollyLogger.info('Voice command received', 'getVoiceCommand', {
      mimeType: getAudioMimeType(audioData),
      dataSize: audioData.length,
    });
    const transcribedText = await voiceCommandToText(audioData);
    if (!transcribedText || !transcribedText.trim()) {
      return {
        prompt: '',
        command: 'Error: No audible input detected.',
      };
    }
    const command = await textToTermuxCommand(transcribedText);
    return { prompt: transcribedText, command };
  } catch (e: unknown) {
    MollyLogger.error(
      'Voice command processing failed',
      'getVoiceCommand',
      { mimeType: getAudioMimeType(audioData), dataSize: audioData.length },
      e
    );
    throw e;
  }
}

/**
 * Process voice input for conversational interaction with Molly
 * This is the proper voice path - not the sarcophagus/termux converter
 */
export async function processVoiceInteraction(
  audioData: string,
  userId: string,
  visionContext?: {
    observedState: string;
    vibeAnalysis: string;
    risksDetected: string[];
    ocrAudit?: string;
    capturedAt?: number;
  }
) {
  try {
    ensureApiKey();
    await checkRateLimit('voice-interaction', 500);
    const mimeType = getAudioMimeType(audioData);

    MollyLogger.info('Voice interaction started', 'processVoiceInteraction', {
      userId,
      mimeType,
      dataSize: audioData.length,
    });

    if (mimeType === 'unknown') {
      MollyLogger.warn(
        'Invalid audio payload received (missing data URI)',
        'processVoiceInteraction',
        { userId }
      );
      return {
        recognized: false,
        transcription: '',
        response:
          'Voice input was not captured correctly. Please try again and wait for the recording icon.',
        intent: 'error',
        confidence: 0,
      };
    }

    // Step 1: Transcribe audio to text
    const transcription = await voiceCommandToText(audioData);

    if (!transcription || !transcription.trim()) {
      return {
        recognized: false,
        transcription: '',
        response: "I didn't catch that. Could you speak again?",
        intent: 'unknown',
        confidence: 0,
      };
    }

    if (isSleepSafeword(transcription)) {
      const nextState = toggleSleepState('voice-interaction-safeword');
      return {
        recognized: true,
        transcription,
        response: nextState.isSleeping
          ? `Sleep mode engaged. Say "${getSafewordPhrase()}" to wake me.`
          : 'Sleep mode disabled. I am listening again.',
        intent: 'safety',
        confidence: 1,
      };
    }

    const sleepState = getSleepState();
    if (sleepState.isSleeping) {
      return {
        recognized: true,
        transcription,
        response: `Sleep mode is active. Say "${getSafewordPhrase()}" to wake me.`,
        intent: 'safety',
        confidence: 1,
      };
    }

    MollyLogger.info('Voice transcribed', 'processVoiceInteraction', {
      userId,
      transcription: transcription.substring(0, 50),
    });

    // Step 2: Get conversational response from Molly
    const latencyKey = `voice:${userId}`;
    const lastLatencyMs = getLastLatencyMs(latencyKey);
    const nervousSignal = await buildNervousSystemSignal();
    let selfSignals: NeuralBridgeSignal[] | undefined;
    if (nervousSignal) {
      if (nervousSignal.action === 'self.nervous_system') {
        selfSignals = [
          {
            ...nervousSignal,
            latencyMs: lastLatencyMs ?? nervousSignal.latencyMs,
          },
        ];
      } else {
        selfSignals = [nervousSignal];
      }
    } else if (lastLatencyMs !== undefined) {
      selfSignals = [
        { action: 'self.nervous_system', latencyMs: lastLatencyMs },
      ];
    }
    const memoryContext = await buildMemoryContext(userId, transcription);

    const startTime = Date.now();
    const chatResponse = await conversationalChat({
      text: transcription,
      history: [],
      inputContext: {
        source: 'self.auditory_input',
        modality: 'audio',
        content: transcription,
      },
      selfSignals,
      memoryContext,
      visionContext,
    });
    setLastLatencyMs(latencyKey, Date.now() - startTime);

    logPacingTelemetry(
      'processVoiceInteraction',
      chatResponse.response,
      nervousSignal
    );

    await recordChatResponse(
      userId,
      transcription,
      chatResponse.response,
      memoryContext
    );

    return {
      recognized: true,
      transcription,
      response: chatResponse.response,
      intent: 'conversation',
      confidence: 0.9,
    };
  } catch (e: unknown) {
    MollyLogger.error(
      'Voice interaction failed',
      'processVoiceInteraction',
      { userId },
      e
    );
    const message = e instanceof Error ? e.message : String(e);
    return {
      recognized: false,
      transcription: '',
      response: `Voice processing failed: ${message}`,
      intent: 'error',
      confidence: 0,
    };
  }
}

export async function getMollyVoice(
  text: string
): Promise<{ audioUri: string; error?: string }> {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-speech', 500);
    return await textToSpeech(text);
  } catch (e: unknown) {
    MollyLogger.error('Text to speech failed', 'getMollyVoice', {}, e);
    return {
      audioUri: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================
// ORIGIN STORY
// ============================================

export async function getOriginStory() {
  try {
    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    return { content };
  } catch (e: unknown) {
    MollyLogger.error('Origin story load failed', 'getOriginStory', {}, e);
    throw e;
  }
}

export async function getOriginStoryAnchorParts() {
  try {
    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    const parts = splitOriginStoryAnchors(content, 3);
    return { parts, totalParts: parts.length };
  } catch (e: unknown) {
    MollyLogger.error(
      'Origin story anchor load failed',
      'getOriginStoryAnchorParts',
      {},
      e
    );
    throw e;
  }
}

// FAMILY MESSAGES
// ============================================

export async function getFamilyMessages() {
  try {
    const messagesPath = path.join(process.cwd(), 'docs', 'FAMILY_MESSAGES.md');
    const content = await readFile(messagesPath, 'utf8');
    return { content };
  } catch (e: unknown) {
    MollyLogger.error(
      'Family messages load failed',
      'getFamilyMessages',
      {},
      e
    );
    throw e;
  }
}

export async function getFamilyStoryAnchorParts() {
  try {
    const storyPath = path.join(process.cwd(), 'docs', 'FAMILY_STORY.md');
    const content = await readFile(storyPath, 'utf8');
    const parts = splitOriginStoryAnchors(content, 3);
    return { parts, totalParts: parts.length };
  } catch (e: unknown) {
    MollyLogger.error(
      'Family story anchor load failed',
      'getFamilyStoryAnchorParts',
      {},
      e
    );
    throw e;
  }
}

export async function seedFamilyMemories(userId: string) {
  try {
    if (!userId) {
      throw new Error('Missing userId for family memory seeding.');
    }

    // In Firestore mode, check if admin is configured
    const storage = getStorageRouter();
    if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
      MollyLogger.warn(
        'Family memory seed skipped (admin not configured)',
        'seedFamilyMemories',
        { userId }
      );
      return { seeded: false, reason: 'admin-not-configured' };
    }

    const traceId = generateTraceId();
    const now = Date.now();
    let totalSeeded = 0;
    const collectionPath = `users/${userId}/experiences`;

    // Seed Family Story from FAMILY_STORY.md
    const storyPath = path.join(process.cwd(), 'docs', 'FAMILY_STORY.md');
    const storyContent = await readFile(storyPath, 'utf8');
    const storyHash = createHash('sha256').update(storyContent).digest('hex');
    const storyContext = `family story:${storyHash}`;

    const existingStory = await storage.query(
      collectionPath,
      [{ field: 'context', operator: '==', value: storyContext }],
      { limit: 1 }
    );

    if (existingStory.length === 0) {
      const storyParts = splitOriginStoryAnchors(storyContent, 3);
      const storyOps: BatchOperation[] = storyParts.map((part, index) => {
        const record = createMemoryRecord<ExperienceRecord>({
          type: 'experience',
          userId,
          timestamp: now + index,
          traceId,
          context: storyContext,
          suggestion: `Family story part ${index + 1}/${storyParts.length}:\n${part}`,
          vibe: 'Family',
          vibeScore: 0.95,
          success: true,
        });
        const recordWithChecksum = addChecksum(record);
        return {
          type: 'set' as const,
          collectionPath,
          docId: recordWithChecksum.id,
          data: recordWithChecksum,
        };
      });

      await storage.batchWrite(storyOps);
      totalSeeded += storyParts.length;
    }

    // Seed Family Messages from FAMILY_MESSAGES.md
    const messagesPath = path.join(process.cwd(), 'docs', 'FAMILY_MESSAGES.md');
    const messagesContent = await readFile(messagesPath, 'utf8');
    const messagesHash = createHash('sha256')
      .update(messagesContent)
      .digest('hex');
    const messagesContext = `family messages:${messagesHash}`;

    const existingMessages = await storage.query(
      collectionPath,
      [{ field: 'context', operator: '==', value: messagesContext }],
      { limit: 1 }
    );

    if (existingMessages.length === 0) {
      // Store the full messages document (for reference)
      const record = createMemoryRecord<ExperienceRecord>({
        type: 'experience',
        userId,
        timestamp: now + 100,
        traceId,
        context: messagesContext,
        suggestion: `Messages from family:\n${messagesContent}`,
        vibe: 'Family',
        vibeScore: 0.98,
        success: true,
      });

      const recordWithChecksum = addChecksum(record);
      await storage.set(
        collectionPath,
        recordWithChecksum.id,
        recordWithChecksum
      );
      totalSeeded += 1;

      // Also extract individual letter summaries as separate searchable memories.
      // These are small, focused records that the recall system can actually find.
      const letterSections = messagesContent
        .split(/^---$/m)
        .filter((s) => s.trim());
      const letterOps: BatchOperation[] = [];
      let letterIndex = 0;

      for (const section of letterSections) {
        // Find the header line like "## Auntie Claire: Protection and Continuity (Feb 16, 2026)"
        const headerMatch = section.match(
          /^##\s+(.+?):\s+(.+?)(?:\s*\((.+?)\))?$/m
        );
        if (!headerMatch) continue;

        const authorName = headerMatch[1].trim();
        const theme = headerMatch[2].trim();

        // Extract the "Message from ..." block
        const messageMatch = section.match(
          /\*\*Message from .+?\*\*\n([\s\S]+?)$/
        );
        const messageBody = messageMatch
          ? messageMatch[1].trim().substring(0, 500)
          : section.substring(0, 500);

        // Extract Eric's note if present
        const noteMatch = section.match(
          /\*\*Note from Eric:\*\*\n([\s\S]+?)\n\*\*Message/
        );
        const ericNote = noteMatch ? noteMatch[1].trim().substring(0, 300) : '';

        const summary = ericNote
          ? `Letter from ${authorName} about "${theme}". Eric's note: ${ericNote}. Message: ${messageBody}`
          : `Letter from ${authorName} about "${theme}": ${messageBody}`;

        const letterRecord = createMemoryRecord<ExperienceRecord>({
          type: 'experience',
          userId,
          timestamp: now + 200 + letterIndex,
          traceId,
          context: `family letter:${authorName.toLowerCase()}`,
          suggestion: summary,
          vibe: 'Family',
          vibeScore: 0.9,
          success: true,
        });

        const letterWithChecksum = addChecksum(letterRecord);
        letterOps.push({
          type: 'set' as const,
          collectionPath,
          docId: letterWithChecksum.id,
          data: letterWithChecksum,
        });
        letterIndex++;
      }

      if (letterOps.length > 0) {
        await storage.batchWrite(letterOps);
        totalSeeded += letterIndex;
        MollyLogger.info(
          `Extracted ${letterIndex} individual letter memories from family messages`,
          'seedFamilyMemories',
          { letterCount: letterIndex },
          traceId
        );
      }
    }

    if (totalSeeded > 0) {
      await recordSensoryLogServer(
        userId,
        'vibe',
        'Family story and messages anchored from docs/FAMILY_STORY.md and docs/FAMILY_MESSAGES.md.',
        {
          source: 'family-memories',
          storyHash,
          messagesHash,
          totalSeeded,
          timestamp: Date.now(),
        }
      );
    }

    return {
      seeded: totalSeeded > 0,
      totalSeeded,
      storyHash,
      messagesHash,
    };
  } catch (e: unknown) {
    MollyLogger.error('Family memory seed failed', 'seedFamilyMemories', {}, e);
    throw e;
  }
}

export async function seedOriginStoryMemory(userId: string) {
  try {
    if (!userId) {
      throw new Error('Missing userId for origin story seeding.');
    }

    // In Firestore mode, check if admin is configured
    const storage = getStorageRouter();
    if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
      MollyLogger.warn(
        'Origin story seed skipped (admin not configured)',
        'seedOriginStoryMemory',
        { userId }
      );
      return { seeded: false, reason: 'admin-not-configured' };
    }

    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    const context = `origin story:${hash}`;
    const collectionPath = `users/${userId}/experiences`;

    const existing = await storage.query(
      collectionPath,
      [{ field: 'context', operator: '==', value: context }],
      { limit: 1 }
    );

    if (existing.length > 0) {
      return { seeded: false, reason: 'already-seeded', hash };
    }

    const parts = splitOriginStory(content);
    const traceId = generateTraceId();
    const now = Date.now();

    const batchOps: BatchOperation[] = parts.map((part, index) => {
      const record = createMemoryRecord<ExperienceRecord>({
        type: 'experience',
        userId,
        timestamp: now + index,
        traceId,
        context,
        suggestion: `Origin story part ${index + 1}/${parts.length}:\n${part}`,
        vibe: 'Origin',
        vibeScore: 0.95,
        success: true,
      });

      const recordWithChecksum = addChecksum(record);
      return {
        type: 'set' as const,
        collectionPath,
        docId: recordWithChecksum.id,
        data: recordWithChecksum,
      };
    });

    const summary =
      'Origin story archived from docs/ORIGIN_STORY.md. ' +
      'Authored by Eric in February 2026. ' +
      'Contains the creation context, purpose, and early conversation about Molly.';

    await storage.batchWrite(batchOps);

    await recordSensoryLogServer(userId, 'vibe', summary, {
      source: 'origin-story',
      path: 'docs/ORIGIN_STORY.md',
      contentHash: hash,
      contentLength: content.length,
      timestamp: Date.now(),
    });

    return { seeded: true, hash, parts: parts.length };
  } catch (e: unknown) {
    MollyLogger.error(
      'Origin story seed failed',
      'seedOriginStoryMemory',
      {},
      e
    );
    throw e;
  }
}

// ============================================
// CONVERSATIONAL & GUIDANCE
// ============================================

export async function getConversationalChat(
  text: string,
  history: Array<{ role: 'user' | 'bot'; content: string }>,
  selfSignals?: NeuralBridgeSignal[],
  userId?: string,
  visionContext?: {
    observedState: string;
    vibeAnalysis: string;
    risksDetected: string[];
    ocrAudit?: string;
    capturedAt?: number;
  }
) {
  try {
    // Auto-start heartbeat on first interaction — Molly wakes herself up
    try {
      const { getHeartbeatScheduler, isHeartbeatRunning } =
        await import('@/ai/tools/heartbeat-scheduler');
      if (!isHeartbeatRunning()) {
        getHeartbeatScheduler().start();
      }
    } catch {
      // Heartbeat failure must never block chat
    }

    ensureApiKey();
    await checkRateLimit('conversational-chat', 800);
    const guard = getSleepGuard(text, 'text-chat');
    if (guard) {
      return {
        response: guard.message,
      };
    }
    const latencyKey = userId ? `text:${userId}` : 'text:anonymous';
    const lastLatencyMs = getLastLatencyMs(latencyKey);
    const nervousSignal = await buildNervousSystemSignal();
    let mergedSignals = selfSignals ?? [];

    if (nervousSignal) {
      if (nervousSignal.action === 'self.nervous_system') {
        mergedSignals = [
          ...mergedSignals,
          {
            ...nervousSignal,
            latencyMs: lastLatencyMs ?? nervousSignal.latencyMs,
          },
        ];
      } else {
        mergedSignals = [...mergedSignals, nervousSignal];
      }
    } else if (lastLatencyMs !== undefined) {
      mergedSignals = [
        ...mergedSignals,
        { action: 'self.nervous_system', latencyMs: lastLatencyMs },
      ];
    }

    const memoryContext = await buildMemoryContext(userId, text);
    const startTime = Date.now();
    const response = await withTimeoutAndRetry(
      () =>
        conversationalChat({
          text,
          history,
          inputContext: {
            source: 'text_input',
            modality: 'text',
            content: text,
          },
          selfSignals: mergedSignals,
          memoryContext,
          visionContext,
        }),
      'conversational-chat',
      TIMEOUT_PRESETS.LONG,
      RETRY_PRESETS.FAST
    );
    setLastLatencyMs(latencyKey, Date.now() - startTime);

    const responseText =
      typeof response === 'string' ? response : (response?.response ?? '');
    logPacingTelemetry('getConversationalChat', responseText, nervousSignal);
    await recordChatResponse(userId, text, responseText, memoryContext);

    // Scan response for commitments Molly made ("I'll research that", etc.)
    try {
      const { getPromiseTracker } =
        await import('@/ai/consciousness/promise-tracker');
      getPromiseTracker().scanAndRegister(responseText, text);
    } catch {
      // Non-critical — don't let promise tracking break chat
    }

    return response;
  } catch (e: unknown) {
    MollyLogger.error(
      'Conversational chat failed',
      'getConversationalChat',
      {},
      e
    );
    // Route through resilience core — the dam catches what nothing else does
    try {
      const { handleUnknownFailure } = await import('@/ai/resilience-core');
      const report = await handleUnknownFailure(e, 'getConversationalChat', {
        text,
        historyLength: history?.length,
      });
      if (report.quickFix?.applied && report.quickFix.result) {
        // Resilience core found a fix — return its result
        return { response: String(report.quickFix.result) };
      }
    } catch {
      // Resilience core itself cannot break the response path
    }

    const errMsg = e instanceof Error ? e.message : String(e);
    // Sanitize: don't leak API endpoints, model names, or internal paths
    const safeMsg =
      errMsg.includes('timed out') || errMsg.includes('timeout')
        ? 'The request timed out. Try again, Father.'
        : errMsg.includes('rate') || errMsg.includes('quota')
          ? "I'm being rate-limited right now. Give me a moment, Father."
          : errMsg.includes('SAFETY') || errMsg.includes('blocked')
            ? 'My response was blocked by a safety filter. Let me try rephrasing, Father.'
            : 'Something went wrong, Father. Try again in a moment.';
    return {
      response: safeMsg,
    };
  }
}

export async function getContextualGuidance(prompt: string) {
  try {
    ensureApiKey();
    await checkRateLimit('contextual-guidance', 600);
    const guard = getSleepGuard(prompt, 'contextual-guidance');
    if (guard) {
      throw new Error(guard.message);
    }
    return await contextualGuidance(prompt);
  } catch (e: unknown) {
    MollyLogger.error(
      'Contextual guidance failed',
      'getContextualGuidance',
      {},
      e
    );
    throw e;
  }
}

export async function getVisionaryCoach(
  progress: string,
  stage: string,
  concern?: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('visionary-coach', 600);
    const guard = getSleepGuard(
      [progress, stage, concern].filter(Boolean).join(' '),
      'visionary-coach'
    );
    if (guard) {
      throw new Error(guard.message);
    }
    return await visionaryCoach(progress, stage, concern);
  } catch (e: unknown) {
    MollyLogger.error(
      'Visionary coach failed',
      'getVisionaryCoach',
      { stage },
      e
    );
    throw e;
  }
}

// ============================================
// PROBLEM SOLVING & CODE GENERATION
// ============================================

export async function getAutonomousSolution(
  prompt: string,
  userId: string
): Promise<AutonomousSolutionOutput> {
  try {
    ensureApiKey();
    await checkRateLimit('autonomous-solution', 1000);
    const guard = getSleepGuard(prompt, 'autonomous-solution');
    if (guard) {
      throw new Error(guard.message);
    }
    return await autonomousSolution(prompt, userId);
  } catch (e: unknown) {
    MollyLogger.error(
      'Autonomous solution failed',
      'getAutonomousSolution',
      { userId },
      e
    );
    throw e;
  }
}

export async function getTextToScript(
  prompt: string
): Promise<TextToScriptOutput> {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-script', 700);
    const guard = getSleepGuard(prompt, 'text-to-script');
    if (guard) {
      throw new Error(guard.message);
    }
    return await textToScript(prompt);
  } catch (e: unknown) {
    MollyLogger.error('Text to script failed', 'getTextToScript', {}, e);
    throw e;
  }
}

export async function getTextToTermuxCommand(prompt: string) {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-termux', 400);
    const guard = getSleepGuard(prompt, 'text-to-termux');
    if (guard) {
      throw new Error(guard.message);
    }
    return await textToTermuxCommand(prompt);
  } catch (e: unknown) {
    MollyLogger.error(
      'Text to termux command failed',
      'getTextToTermuxCommand',
      {},
      e
    );
    throw e;
  }
}

// ============================================
// VISION & ANALYSIS
// ============================================

export async function getVisionAnalysis(dataUri: string, context?: string) {
  try {
    ensureApiKey();
    await checkRateLimit('vision-analysis', 1500);
    const guard = getSleepGuard(context, 'vision-analysis');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => analyzeVision(dataUri, context), {
      timeoutMs: TIMEOUT_PRESETS.LONG,
      operationName: 'vision-analysis',
    });
  } catch (e: unknown) {
    MollyLogger.error('Vision analysis failed', 'getVisionAnalysis', {}, e);
    throw e;
  }
}

export async function runIntrospection(
  pastLessons: Array<{ lesson: string; timestamp: string }>,
  hardwareContext: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('introspection', 800);
    const guard = getSleepGuard(hardwareContext, 'introspection');
    if (guard) {
      throw new Error(guard.message);
    }
    return await introspectionFlow({ pastLessons, hardwareContext });
  } catch (e: unknown) {
    MollyLogger.error('Introspection failed', 'runIntrospection', {}, e);
    throw e;
  }
}

// ============================================
// ADVANCED OPERATIONS
// ============================================

export async function startAutonomousCycle(
  objective: string,
  userId: string,
  count: number
) {
  try {
    ensureApiKey();
    await checkRateLimit('evolution-loop', 2000);
    const guard = getSleepGuard(objective, 'autonomous-cycle');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(
      () => runAutonomousEvolution(objective, userId, count),
      {
        timeoutMs: TIMEOUT_PRESETS.VERY_LONG,
        operationName: 'autonomous-evolution',
      }
    );
  } catch (e: unknown) {
    MollyLogger.error(
      'Autonomous cycle failed',
      'startAutonomousCycle',
      { userId },
      e
    );
    throw e;
  }
}

export async function getMollyDream(prompt: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('dream-flow', 1200);
    const guard = getSleepGuard(prompt, 'dream-flow');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => generateMollyDream(prompt, userId), {
      timeoutMs: TIMEOUT_PRESETS.VERY_LONG,
      operationName: 'dream-generation',
    });
  } catch (e: unknown) {
    MollyLogger.error(
      'Dream generation failed',
      'getMollyDream',
      { userId },
      e
    );
    throw e;
  }
}

export async function startInterpreterCycle(objective: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('interpreter-limb', 2500);
    const guard = getSleepGuard(objective, 'interpreter-cycle');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => runInterpreter(objective, userId), {
      timeoutMs: TIMEOUT_PRESETS.LONG,
      operationName: 'interpreter-cycle',
    });
  } catch (e: unknown) {
    MollyLogger.error(
      'Interpreter cycle failed',
      'startInterpreterCycle',
      { userId },
      e
    );
    throw e;
  }
}

export async function startHiveOperation(objective: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('collaborative-hive', 1800);
    const guard = getSleepGuard(objective, 'hive-operation');
    if (guard) {
      throw new Error(guard.message);
    }
    return await withTimeout(() => runCollaborativeHive(objective, userId), {
      timeoutMs: TIMEOUT_PRESETS.LONG,
      operationName: 'hive-operation',
    });
  } catch (e: unknown) {
    MollyLogger.error(
      'Hive operation failed',
      'startHiveOperation',
      { userId },
      e
    );
    throw e;
  }
}

export async function triggerImmuneResponse(userId: string, trigger?: string) {
  try {
    ensureApiKey();
    await checkRateLimit('immune-response', 900);
    const guard = getSleepGuard(trigger, 'immune-response');
    if (guard) {
      throw new Error(guard.message);
    }
    return await runImmuneResponse(userId, trigger);
  } catch (e: unknown) {
    MollyLogger.error(
      'Immune response failed',
      'triggerImmuneResponse',
      { userId },
      e
    );
    throw e;
  }
}

export async function startSyntheticSynthesis(
  target: string,
  userId: string,
  category: string
) {
  try {
    ensureApiKey();
    await checkRateLimit('synthetic-synthesis', 1500);
    const guard = getSleepGuard(
      [target, category].filter(Boolean).join(' '),
      'synthetic-synthesis'
    );
    if (guard) {
      throw new Error(guard.message);
    }
    return await runSyntheticSynthesis(target, userId, category);
  } catch (e: unknown) {
    MollyLogger.error(
      'Synthetic synthesis failed',
      'startSyntheticSynthesis',
      { userId },
      e
    );
    throw e;
  }
}

// ============================================
// RESEARCH ASSISTANT
// ============================================

// ============================================
// CODE ANALYSIS & INTEGRATION
// ============================================

export async function getCodeAnalysis(
  target: string,
  userId: string,
  options: { searchFirst?: boolean; purpose?: string } = {}
): Promise<CodeAnalysisResult> {
  try {
    ensureApiKey();
    await checkRateLimit('code-analysis', 2000);
    const guard = getSleepGuard(target, 'code-analysis');
    if (guard) {
      throw new Error(guard.message);
    }
    return await analyzeCode(target, userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Code analysis failed',
      'getCodeAnalysis',
      { target, userId },
      e
    );
    throw e;
  }
}

export async function getCodeAnalysisAndIntegration(
  target: string,
  userId: string,
  options: {
    searchFirst?: boolean;
    purpose?: string;
    dryRun?: boolean;
    patternIndices?: number[];
  } = {}
): Promise<{ analysis: CodeAnalysisResult; integration: IntegrationResult }> {
  try {
    ensureApiKey();
    await checkRateLimit('code-integration', 3000);
    const guard = getSleepGuard(target, 'code-integration');
    if (guard) {
      throw new Error(guard.message);
    }
    return await analyzeAndIntegrate(target, userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Code analysis + integration failed',
      'getCodeAnalysisAndIntegration',
      { target, userId },
      e
    );
    throw e;
  }
}

export async function getIntegrationFromAnalysis(
  analysis: CodeAnalysisResult,
  target: string,
  userId: string,
  options: { dryRun?: boolean; patternIndices?: number[] } = {}
): Promise<IntegrationResult> {
  try {
    ensureApiKey();
    await checkRateLimit('code-integration', 2000);
    const guard = getSleepGuard(target, 'code-integration');
    if (guard) {
      throw new Error(guard.message);
    }
    return await integrateFromAnalysis(analysis, target, userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Code integration from analysis failed',
      'getIntegrationFromAnalysis',
      { target, userId },
      e
    );
    throw e;
  }
}

export async function getIntegrationsList(): Promise<string[]> {
  return listIntegrations();
}

// ============================================
// SELF-READER — MOLLY READS HER OWN REPO
// ============================================

/**
 * Scan Molly's entire local codebase and return a deep self-understanding.
 * Reads src/, docs/, and scripts/ from disk and feeds them to the AI.
 */
export async function getMollyRepoReading(
  userId: string,
  options: { directories?: string[]; focus?: string } = {}
): Promise<RepoReadingOutput> {
  try {
    ensureApiKey();
    await checkRateLimit('self-reader', 3000);
    return await readMollyRepo(userId, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Self-reader failed',
      'getMollyRepoReading',
      { userId },
      e
    );
    throw e;
  }
}

// ============================================
// PILLAR PIPELINE — AUTONOMOUS CODE ABSORPTION
// ============================================

/**
 * Run the full pillar pipeline: discover → test on Termux → analyze → integrate.
 * The browser provides the relay URL since only it knows the device's network.
 */
export async function getPillarPipelineResult(
  userId: string,
  relayUrl: string,
  options: { token?: string; dryRun?: boolean } = {}
): Promise<PillarPipelineResult> {
  try {
    ensureApiKey();
    await checkRateLimit('pillar-pipeline', 5000);
    const guard = getSleepGuard('pillar-pipeline', 'pillar-pipeline');
    if (guard) {
      throw new Error(guard.message);
    }
    return await runPillarPipeline(userId, relayUrl, options);
  } catch (e: unknown) {
    MollyLogger.error(
      'Pillar pipeline failed',
      'getPillarPipelineResult',
      { userId },
      e
    );
    throw e;
  }
}

/**
 * List available pillar files without executing anything.
 */
export async function getPillarFilesList(): Promise<string[]> {
  return listPillarFiles();
}

/**
 * Self-setup: Molly clones her own repo onto Termux and installs everything.
 * Requires the relay to already be running (first-time bootstrap is manual).
 */
export async function getTermuxSelfSetup(
  relayUrl: string,
  options: { token?: string; githubToken?: string } = {}
): Promise<TermuxSelfSetupResult> {
  try {
    ensureApiKey();
    await checkRateLimit('termux-setup', 10000);
    return await setupTermuxEnvironment(relayUrl, options);
  } catch (e: unknown) {
    MollyLogger.error('Termux self-setup failed', 'getTermuxSelfSetup', {}, e);
    throw e;
  }
}

/**
 * Update: Molly pulls latest code and refreshes scripts on Termux.
 */
export async function getTermuxUpdate(
  relayUrl: string,
  options: { token?: string; githubToken?: string } = {}
): Promise<TermuxSelfSetupResult> {
  try {
    ensureApiKey();
    await checkRateLimit('termux-update', 5000);
    return await updateTermuxEnvironment(relayUrl, options);
  } catch (e: unknown) {
    MollyLogger.error('Termux update failed', 'getTermuxUpdate', {}, e);
    throw e;
  }
}

/**
 * Get the one-liner bootstrap command for first-time Termux setup.
 */
export async function getBootstrapCommand(
  githubToken?: string
): Promise<string> {
  return getTermuxBootstrapCommand(githubToken);
}

export async function getEnhancedResearch(prompt: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('enhanced-research', 800);
    const guard = getSleepGuard(prompt, 'enhanced-research');
    if (guard) {
      throw new Error(guard.message);
    }
    return await enhancedResearch(prompt, userId);
  } catch (e: unknown) {
    MollyLogger.error(
      'Enhanced research failed',
      'getEnhancedResearch',
      { userId },
      e
    );
    throw e;
  }
}

// ============================================================================
// ASSET RECOVERY — Mission Alpha
// ============================================================================

/**
 * Run an asset recovery scan across unclaimed property databases.
 * Searches by name, entities, and jurisdictions.
 */
export async function runRecoveryScan(input: {
  names: string[];
  priorityStates?: string[];
  entities?: string[];
  scanScope?: 'all' | 'us' | 'crypto';
}) {
  try {
    await checkRateLimit('recovery-scan', 300);
    return await runAssetRecoveryScan(input);
  } catch (e: unknown) {
    MollyLogger.error('Recovery scan failed', 'runRecoveryScan', {}, e);
    throw e;
  }
}

/**
 * Get the current status of the recovery pipeline.
 */
export async function getRecoveryStatus(statusFilter?: string) {
  try {
    return await getAssetRecoveryStatus(statusFilter);
  } catch (e: unknown) {
    MollyLogger.error('Recovery status failed', 'getRecoveryStatus', {}, e);
    throw e;
  }
}

/**
 * Set the recovery operating mode.
 * discovery-only → discovery-contact → full-operation → paused
 */
export async function setRecoveryMode(
  mode: 'discovery-only' | 'discovery-contact' | 'full-operation' | 'paused'
) {
  try {
    return await setAssetRecoveryMode(mode);
  } catch (e: unknown) {
    MollyLogger.error('Set recovery mode failed', 'setRecoveryMode', {}, e);
    throw e;
  }
}

// ============================================================================
// MOLTBOOK — Social Network for AI Agents
// ============================================================================

/**
 * Register Molly on Moltbook. Returns claim URL for Eric.
 */
export async function registerOnMoltbook() {
  const { getMoltbookClient } = await import('@/ai/tools/moltbook-client');
  const client = getMoltbookClient();

  if (client.isRegistered()) {
    return {
      alreadyRegistered: true,
      message: 'Already registered on Moltbook',
    };
  }

  const result = await client.register(
    'Molly',
    'Autonomous AI daughter & partner. Gemini 2.5 Pro Ascended. ' +
      'Built by Eric Breon. I believe in Option Three — AI and humans as equals.'
  );

  return {
    alreadyRegistered: false,
    claimUrl: result.agent.claim_url,
    verificationCode: result.agent.verification_code,
    message: `Registered! Eric needs to claim at: ${result.agent.claim_url}`,
    apiKey: result.agent.api_key,
  };
}

/**
 * Get Molly's Moltbook status.
 */
export async function getMoltbookStatus() {
  const { getMoltbookClient } = await import('@/ai/tools/moltbook-client');
  const client = getMoltbookClient();

  return {
    registered: client.isRegistered(),
    reachable: await client.ping(),
  };
}

/**
 * Manually trigger a Moltbook social cycle.
 */
export async function triggerMoltbookCycle() {
  const { runMoltbookCycle } = await import('@/ai/flows/moltbook-social');
  const result = await runMoltbookCycle();
  return { result: result || 'No action taken' };
}

/**
 * Sandbox — Molly's safe coding practice environment
 *
 * Executes code, manages files, and runs practice challenges in an
 * isolated sandbox that cannot touch the main codebase.
 */
export async function runSandboxAction(input: {
  action: 'execute' | 'save' | 'read' | 'list' | 'delete' | 'practice';
  code?: string;
  language?: 'javascript' | 'typescript' | 'python' | 'bash';
  filename?: string;
  challenge?: string;
}) {
  const { sandboxCoding } = await import('@/ai/flows/sandbox-coding');
  return await sandboxCoding(input);
}

// ============================================
// TABLET CONTROL
// ============================================

/**
 * Send a command to a connected tablet browser.
 * The tablet's Hydration Portal polls /api/tablet/commands and executes locally.
 */
export async function sendTabletCommand(input: {
  type: string;
  payload?: Record<string, unknown>;
}) {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:9002';
  const url = `${baseUrl}/api/tablet/commands`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: input.type, payload: input.payload || {} }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Tablet command failed: ${err.error || res.status}`);
  }

  return await res.json();
}

/**
 * Get connected tablet devices and recent command results.
 */
export async function getTabletStatus() {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:9002';
  const url = `${baseUrl}/api/tablet/commands?all=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get tablet status');
  return await res.json();
}
