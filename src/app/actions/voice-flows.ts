'use server';

/**
 * Voice interaction flows for Molly
 * Works in both server (Codespace) and edge (tablet) environments
 */

import { conversationalChat } from '@/ai/flows/conversational-chat';
import { voiceCommandToText } from '@/ai/flows/voice-command-to-text';
import { textToTermuxCommand } from '@/ai/flows/text-to-termux-command';
import { textToSpeech } from '@/ai/flows/text-to-speech';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';
import { logPacingTelemetry } from '@/ai/tools/pacing-telemetry';
import { getLastLatencyMs, setLastLatencyMs } from '@/ai/tools/latency-cache';
import { MollyLogger } from '@/ai/logger';
import {
  getSafewordPhrase,
  getSleepState,
  isSleepSafeword,
  toggleSleepState,
} from '@/ai/tools/safety-sleep';
import { withTimeoutAndRetry, TIMEOUT_PRESETS, RETRY_PRESETS } from '@/ai/tools/timeout-retry';
import { ensureApiKey, checkRateLimit } from './utils';
import {
  getAudioMimeType,
  buildNervousSystemSignal,
  buildMemoryContext,
  recordChatResponse,
  ensureNeuralPersistence,
} from './flow-utils';

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
    // Ensure memory persistence is configured for this user
    ensureNeuralPersistence(userId);

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
    const chatResponse = await withTimeoutAndRetry(
      () =>
        conversationalChat({
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
        }),
      'voice-conversational-chat',
      TIMEOUT_PRESETS.NORMAL,
      RETRY_PRESETS.FAST
    );
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

/**
 * Get Molly's voice audio for the given text, with optional voiceName override.
 */
export async function getMollyVoice(
  text: string,
  voiceName?: string
): Promise<{ audioUri: string; error?: string }> {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-speech', 500);
    return await textToSpeech(text, voiceName);
  } catch (e: unknown) {
    MollyLogger.error('Text to speech failed', 'getMollyVoice', {}, e);
    return {
      audioUri: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
