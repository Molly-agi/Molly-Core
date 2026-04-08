'use server';

/**
 * Conversational and guidance flows for Molly
 * Works in both server (Codespace) and edge (tablet) environments
 */

import { conversationalChat } from '@/ai/flows/conversational-chat';
import { contextualGuidance } from '@/ai/flows/contextual-ai-guidance';
import { visionaryCoach } from '@/ai/flows/visionary-coach';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';
import { logPacingTelemetry } from '@/ai/tools/pacing-telemetry';
import { getLastLatencyMs, setLastLatencyMs } from '@/ai/tools/latency-cache';
import { MollyLogger } from '@/ai/logger';
import {
  withTimeoutAndRetry,
  TIMEOUT_PRESETS,
  RETRY_PRESETS,
} from '@/ai/tools/timeout-retry';
import { ensureApiKey, checkRateLimit } from './utils';
import {
  getSleepGuard,
  buildNervousSystemSignal,
  buildMemoryContext,
  recordChatResponse,
  ensureNeuralPersistence,
} from './flow-utils';

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
    // Ensure memory persistence is configured for this user
    if (userId) {
      ensureNeuralPersistence(userId);
    }

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
        return { response: String(report.quickFix.result) };
      }
    } catch {
      // Resilience core itself cannot break the response path
    }

    const errMsg = e instanceof Error ? e.message : String(e);
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
