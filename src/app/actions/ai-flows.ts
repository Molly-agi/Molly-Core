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
import { MollyLogger } from '@/ai/logger';
import { enhancedResearch } from '@/ai/flows/enhanced-research';
import {
  withTimeout,
  withRetry,
  TIMEOUT_PRESETS,
  RETRY_PRESETS,
} from '@/ai/tools/timeout-retry';
import { ensureApiKey, checkRateLimit, fetchLastContext } from './utils';

function getAudioMimeType(dataUri: string): string {
  const match = dataUri.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? 'unknown';
}

// ============================================
// HEALTH & DIAGNOSTICS
// ============================================

export async function getHealthCheck(text: string, userId: string) {
  try {
    ensureApiKey();
    await checkRateLimit('health-check', 300);
    const lastContext = await fetchLastContext(userId);
    return await healthCheck(text, lastContext);
  } catch (e: any) {
    MollyLogger.error(
      '[CRITICAL] Health Check Failed',
      'getHealthCheck',
      { userId },
      e
    );
    throw e;
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

    MollyLogger.info('Voice transcribed', 'processVoiceInteraction', {
      userId,
      transcription: transcription.substring(0, 50),
    });

    // Step 2: Get conversational response from Molly
    const chatResponse = await conversationalChat({
      text: transcription,
      history: [],
    });

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

export async function getMollyVoice(text: string) {
  try {
    ensureApiKey();
    await checkRateLimit('text-to-speech', 500);
    return await textToSpeech(text);
  } catch (e: any) {
    MollyLogger.error('Text to speech failed', 'getMollyVoice', {}, e);
    throw e;
  }
}

// ============================================
// CONVERSATIONAL & GUIDANCE
// ============================================

export async function getConversationalChat(text: string, history: any[]) {
  try {
    ensureApiKey();
    await checkRateLimit('conversational-chat', 800);
    return await withRetry(
      () => conversationalChat({ text, history }),
      'conversational-chat',
      RETRY_PRESETS.FAST
    );
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
