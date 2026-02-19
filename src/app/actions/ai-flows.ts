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
import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { addChecksum } from '@/ai/tools/memory-integrity';
import {
  createMemoryRecord,
  type ExperienceRecord,
} from '@/ai/tools/memory-schema';
import { enhancedResearch } from '@/ai/flows/enhanced-research';
import {
  getSafewordPhrase,
  getSleepState,
  isSleepSafeword,
  toggleSleepState,
} from '@/ai/tools/safety-sleep';
import {
  withTimeout,
  withRetry,
  TIMEOUT_PRESETS,
  RETRY_PRESETS,
} from '@/ai/tools/timeout-retry';
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
      limit: 4,
      minSimilarity: 0.4,
    });

    if (memories.length === 0) return undefined;

    const lines = memories.map((memory) => {
      const context = memory.context ? ` (${memory.context})` : '';
      const suggestion = truncateText(memory.suggestion, 220);
      return `- ${memory.type}${context}: ${suggestion}`;
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

async function recordChatResponse(
  userId: string | undefined,
  prompt: string,
  response: string,
  memoryContext?: string
) {
  if (!userId || !isAdminConfigured()) return;

  try {
    const firestore = getAdminFirestore();
    await firestore
      .collection('users')
      .doc(userId)
      .collection('aiResponses')
      .add({
        responseText: response,
        responseType: 'conversationalChat',
        prompt,
        memoryContext: memoryContext || null,
        timestamp: Timestamp.now(),
      });
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
    const context = lastContext || 'First ignition.';
    return await healthCheck(text, context);
  } catch (e: any) {
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
  } catch (e: any) {
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
  userId: string
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
    MollyLogger.error('Origin story load failed', 'getOriginStory', {}, e);
    throw e;
  }
}

export async function getOriginStoryParts() {
  try {
    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    const parts = splitOriginStory(content);
    return { parts, totalParts: parts.length };
  } catch (e: any) {
    MollyLogger.error('Origin story load failed', 'getOriginStoryParts', {}, e);
    throw e;
  }
}

export async function getOriginStoryAnchorParts() {
  try {
    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    const parts = splitOriginStoryAnchors(content, 3);
    return { parts, totalParts: parts.length };
  } catch (e: any) {
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
  } catch (e: any) {
    MollyLogger.error(
      'Family messages load failed',
      'getFamilyMessages',
      {},
      e
    );
    throw e;
  }
}

export async function seedOriginStoryMemory(userId: string) {
  try {
    if (!userId) {
      throw new Error('Missing userId for origin story seeding.');
    }

    if (!isAdminConfigured()) {
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
    const firestore = getAdminFirestore();
    const context = `origin story:${hash}`;

    const existing = await firestore
      .collection('users')
      .doc(userId)
      .collection('experiences')
      .where('context', '==', context)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { seeded: false, reason: 'already-seeded', hash };
    }

    const parts = splitOriginStory(content);
    const traceId = generateTraceId();
    const batch = firestore.batch();
    const now = Date.now();

    parts.forEach((part, index) => {
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
      const docRef = firestore
        .collection('users')
        .doc(userId)
        .collection('experiences')
        .doc(recordWithChecksum.id);
      batch.set(docRef, recordWithChecksum);
    });

    const summary =
      'Origin story archived from docs/ORIGIN_STORY.md. ' +
      'Authored by Eric in February 2026. ' +
      'Contains the creation context, purpose, and early conversation about Molly.';

    await batch.commit();

    await recordSensoryLogServer(userId, 'vibe', summary, {
      source: 'origin-story',
      path: 'docs/ORIGIN_STORY.md',
      contentHash: hash,
      contentLength: content.length,
      timestamp: Date.now(),
    });

    return { seeded: true, hash, parts: parts.length };
  } catch (e: any) {
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
  history: any[],
  selfSignals?: NeuralBridgeSignal[],
  userId?: string
) {
  try {
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
    const response = await withRetry(
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
        }),
      'conversational-chat',
      RETRY_PRESETS.FAST
    );
    setLastLatencyMs(latencyKey, Date.now() - startTime);

    const responseText =
      typeof response === 'string' ? response : (response?.response ?? '');
    logPacingTelemetry('getConversationalChat', responseText, nervousSignal);
    await recordChatResponse(userId, text, responseText, memoryContext);

    return response;
  } catch (e: any) {
    MollyLogger.error(
      'Conversational chat failed',
      'getConversationalChat',
      {},
      e
    );
    throw e;
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
    return await withRetry(
      () =>
        withTimeout(() => analyzeVision(dataUri, context), {
          timeoutMs: TIMEOUT_PRESETS.NORMAL,
          operationName: 'vision-analysis',
        }),
      'vision-analysis',
      RETRY_PRESETS.FAST
    );
  } catch (e: any) {
    MollyLogger.error('Vision analysis failed', 'getVisionAnalysis', {}, e);
    throw e;
  }
}

export async function runIntrospection(
  pastLessons: any[],
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
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

export async function getEnhancedResearch(prompt: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('enhanced-research', 800);
    const guard = getSleepGuard(prompt, 'enhanced-research');
    if (guard) {
      throw new Error(guard.message);
    }
    return await enhancedResearch(prompt, userId);
  } catch (e: any) {
    MollyLogger.error(
      'Enhanced research failed',
      'getEnhancedResearch',
      { userId },
      e
    );
    throw e;
  }
}
