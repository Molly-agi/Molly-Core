/**
 * @fileOverview Smart Voice Command Processor (Phase 7B)
 *
 * Processes voice commands with semantic understanding.
 * Integrates with memory system for context-aware responses.
 * Enables natural conversation with Molly through voice.
 */

import { molly } from '@/ai/rogue-generate';
import { TaskType } from '@/ai/model-router';
import { z } from 'zod';
import { voiceCommandToText } from '../flows/voice-command-to-text';
import { textToSpeech } from '../flows/text-to-speech';
import { autonomousSolutionFlow } from '../flows/autonomous-solution';
import { conversationalChat } from '../flows/conversational-chat';
import { recallSimilarMemories } from './semantic-recall';
import { MollyLogger, generateTraceId } from '../logger';
import { recordSensoryLogServer } from '@/firebase/firestore/agent-memory-server';
import {
  getSafewordPhrase,
  getSleepState,
  isSleepSafeword,
  toggleSleepState,
} from './safety-sleep';
import { getSystemHealth } from './system';
import { logPacingTelemetry } from './pacing-telemetry';
import type { NeuralBridgeSignal } from './neural-bridge';
import { buildNeuralBridgeContext } from './neural-bridge';
import { getLastLatencyMs, setLastLatencyMs } from './latency-cache';
import {
  _getAdminFirestore,
  getAdminFirestoreAsync,
  _isAdminConfigured,
} from '@/firebase/admin';
import { createMemoryRecord, type ExperienceRecord } from './memory-schema';
import { addChecksum } from './memory-integrity';

export interface VoiceCommandContext {
  userId: string;
  sessionId: string;
  previousCommands?: string[];
  lastResponse?: string;
  hardwareState?: {
    temperature?: number;
    batteryLevel?: number;
    cpuUsage?: number;
  };
}

export interface VoiceCommandResult {
  recognized: boolean;
  intent: string;
  transcription: string;
  response: string;
  audioResponse?: {
    audioUri: string;
  };
  metadata?: {
    confidence: number;
    memoryRecalled: boolean;
    actionTaken?: string;
  };
}

const VoiceIntentSchema = z.object({
  intent: z.enum([
    'remember', // "Remember this", "Save this to memory"
    'recall', // "What did we learn about...", "Remember when..."
    'question', // General questions
    'command', // "Do this", "Execute..."
    'conversation', // Casual chat
    'clarification', // "What do you mean?", "Explain that"
  ]),
  confidence: z.number().min(0).max(1),
  extractedInfo: z.string().describe('Key information from the command'),
  reasoning: z.string().describe('Why this intent was chosen'),
});

/**
 * Analyzes voice command to determine user intent
 */
async function analyzeIntent(
  transcription: string,
  context: VoiceCommandContext
) {
  const traceId = generateTraceId();

  try {
    const response = await molly.generate(TaskType.CLASSIFICATION, {
      system: `You are Molly's intent analyzer. Classify conversational voice commands into intents.

Context:
- User: ${context.userId}
- Session: ${context.sessionId}
${context.previousCommands ? `- Recent: ${context.previousCommands.join(', ')}` : ''}

Focus on CONVERSATIONAL understanding. If user says "remember this about thermal issues",
intent is 'remember' and info is about thermal management.`,
      prompt: `Analyze this voice command: "${transcription}"`,
      output: { schema: VoiceIntentSchema },
    });

    if (!response.output) {
      throw new Error('No intent analysis output');
    }

    return response.output;
  } catch (error) {
    MollyLogger.error(
      'Intent analysis failed',
      'voice-command-processor',
      { transcription },
      error,
      traceId
    );

    // Fallback to conversational intent
    // Avoid routing voice to terminal/sarcophagus paths
    return {
      intent: 'conversation' as const,
      confidence: 0.5,
      extractedInfo: transcription,
      reasoning: 'Fallback - defaulting to conversation',
    };
  }
}

/**
 * Handle "remember" intent - store information in memory
 */
async function handleRememberIntent(
  transcription: string,
  context: VoiceCommandContext,

  _extracted: string
): Promise<string> {
  const traceId = generateTraceId();

  try {
    // Extract what needs to be remembered
    const memoryPrompt = await molly.generate(TaskType.SUMMARIZATION, {
      system: `Extract the key lesson/information to remember from voice command.
Be concise but preserve meaning. Format as a memory suggestion.`,
      prompt: `From: "${transcription}"\nExtract the memory:`,
    });

    const suggestion = memoryPrompt.text;

    // Store in sensory memory
    await recordSensoryLogServer(
      context.userId,
      'voice',
      `Voice command: ${suggestion}`,
      {
        transcription,
        vibeScore: 0.8,
        source: 'voice-command',
        timestamp: Date.now(),
        traceId,
      }
    );

    MollyLogger.info(
      'Voice memory stored',
      'voice-command-processor',
      { suggestion: suggestion.substring(0, 50) },
      traceId
    );

    return `I've remembered: "${suggestion}". I'll keep this in mind for future decisions.`;
  } catch (error) {
    MollyLogger.error(
      'Failed to store voice memory',
      'voice-command-processor',
      { transcription },
      error,
      traceId
    );

    return 'I heard you, but had trouble storing that memory. Can you try again?';
  }
}

/**
 * Handle "recall" intent - retrieve from semantic memory
 */
async function handleRecallIntent(
  transcription: string,
  context: VoiceCommandContext,
  extracted: string
): Promise<string> {
  const traceId = generateTraceId();

  try {
    // Use semantic search to find relevant memories
    const memories = await recallSimilarMemories(context.userId, extracted, {
      limit: 3,
      minSimilarity: 0.4,
    });

    if (memories.length === 0) {
      return `I don't have any memories about "${extracted.substring(0, 30)}..." yet. As we work together, I'll build up knowledge about this.`;
    }

    // Synthesize response from memories
    const memoryContext = memories
      .map(
        (m, i) =>
          `${i + 1}. ${m.suggestion} (${(m.similarity * 100).toFixed(0)}% relevant)`
      )
      .join('\n');

    const response = await molly.generate(TaskType.CHAT, {
      system: `You are Molly. Synthesize memories into a natural, conversational response.
Be warm, specific, and helpful. Reference the memories naturally.`,
      prompt: `User asked: "${transcription}"

Relevant memories:
${memoryContext}

Respond naturally:`,
    });

    MollyLogger.info(
      'Voice recall completed',
      'voice-command-processor',
      { query: extracted.substring(0, 30), memoriesFound: memories.length },
      traceId
    );

    return response.text;
  } catch (error) {
    MollyLogger.error(
      'Failed to recall memories',
      'voice-command-processor',
      { transcription },
      error,
      traceId
    );

    return "I'm having trouble accessing my memories right now. Can you ask again in a moment?";
  }
}

/**
 * Handle command intent - execute voice commands through autonomous solution
 */
async function handleCommandIntent(
  transcription: string,
  context: VoiceCommandContext,
  extracted: string
): Promise<string> {
  const traceId = generateTraceId();

  try {
    MollyLogger.info(
      'Executing voice command',
      'voice-command-processor',
      { command: transcription.substring(0, 50) },
      traceId
    );

    // Route to autonomousSolutionFlow for execution
    const result = await autonomousSolutionFlow({
      prompt: transcription,
      userId: context.userId,
    });

    // Synthesize natural response from solution
    const executionSummary = `I've executed your command. Here's what I found: ${result.creativeSolution.substring(0, 200)}...`;

    // Log the execution
    await recordSensoryLogServer(
      context.userId,
      'voice',
      `Executed command: ${transcription}`,
      {
        transcription,
        vibeScore: 0.9,
        source: 'voice-command',
        actionTaken: 'command_executed',
        timestamp: Date.now(),
        traceId,
        result: {
          solution: result.creativeSolution.substring(0, 100),
          riskLevel: result.riskLevelUsed,
          throttled: result.isThrottled,
        },
      }
    );

    MollyLogger.info(
      'Voice command executed successfully',
      'voice-command-processor',
      { riskLevel: result.riskLevelUsed, throttled: result.isThrottled },
      traceId
    );

    return executionSummary;
  } catch (error) {
    MollyLogger.error(
      'Command execution failed',
      'voice-command-processor',
      { transcription, command: extracted },
      error,
      traceId
    );

    return `I tried to execute that command, but ran into an issue. The command was: "${transcription.substring(0, 50)}...". Let me try a different approach or simpler task.`;
  }
}

/**
 * Handle general questions and conversation
 */
async function handleQuestionIntent(
  transcription: string,
  context: VoiceCommandContext
): Promise<string> {
  const traceId = generateTraceId();

  try {
    const latencyKey = context.sessionId
      ? `voice:${context.sessionId}`
      : `voice:${context.userId}`;
    const lastLatencyMs = getLastLatencyMs(latencyKey);

    // Check if question relates to past experiences
    const memories = await recallSimilarMemories(
      context.userId,
      transcription,
      {
        limit: 2,
        minSimilarity: 0.5,
      }
    );

    const memoryContext =
      memories.length > 0
        ? `\n\nRelevant past experiences:\n${memories.map((m) => m.suggestion).join('\n')}`
        : '';

    const selfSignals: NeuralBridgeSignal[] = [];
    if (context.lastResponse) {
      selfSignals.push({
        action: 'self.vocalize_text',
        content: context.lastResponse,
      });
    }

    let nervousSignal: NeuralBridgeSignal | null = null;
    try {
      if (context.hardwareState) {
        nervousSignal = {
          action: 'self.nervous_system',
          cpuUsage: context.hardwareState.cpuUsage,
          temperatureC: context.hardwareState.temperature,
        };
      } else {
        const health = await getSystemHealth({});
        nervousSignal = {
          action: 'self.nervous_system',
          cpuUsage: health.cpuUsage,
          temperatureC: health.temperature,
        };
      }
    } catch (error) {
      MollyLogger.warn(
        'Failed to collect nervous system metrics',
        'voice-command-processor',
        { error: error instanceof Error ? error.message : String(error) },
        traceId
      );
    }

    if (nervousSignal && nervousSignal.action === 'self.nervous_system') {
      selfSignals.push({
        action: 'self.nervous_system',
        cpuUsage: nervousSignal.cpuUsage,
        gpuUsage: nervousSignal.gpuUsage,
        temperatureC: nervousSignal.temperatureC,
        latencyMs: lastLatencyMs ?? nervousSignal.latencyMs,
      });
    } else if (lastLatencyMs !== undefined) {
      selfSignals.push({
        action: 'self.nervous_system',
        latencyMs: lastLatencyMs,
      });
    }

    const prompt = memoryContext
      ? `${transcription}

Relevant past experiences:
${memories.map((m) => m.suggestion).join('\n')}`
      : transcription;

    const bridgeContext = buildNeuralBridgeContext(
      {
        source: 'self.auditory_input',
        modality: 'audio',
        content: transcription,
      },
      selfSignals.length > 0 ? selfSignals : undefined
    );

    if (bridgeContext) {
      MollyLogger.debug(
        'Neural bridge context (voice)',
        'voice-command-processor',
        { bridgeContext },
        traceId
      );
    }

    const startTime = Date.now();
    const response = await conversationalChat({
      text: prompt,
      history: [],
      inputContext: {
        source: 'self.auditory_input',
        modality: 'audio',
        content: transcription,
      },
      selfSignals: selfSignals.length > 0 ? selfSignals : undefined,
    });
    setLastLatencyMs(latencyKey, Date.now() - startTime);

    const responseText = response?.response ?? '';
    logPacingTelemetry('voice-command-processor', responseText, nervousSignal);

    return responseText;
  } catch (error) {
    MollyLogger.error(
      'Failed to process question',
      'voice-command-processor',
      { transcription },
      error,
      traceId
    );

    return "I'm here, but I'm having trouble processing that. Can you rephrase?";
  }
}

/**
 * Main voice command processor
 *
 * @param audioData Base64-encoded audio data
 * @param context User and session context
 * @param synthesizeSpeech Whether to generate audio response
 * @returns Processed command result with response
 */
export async function processVoiceCommand(
  audioData: string,
  context: VoiceCommandContext,
  synthesizeSpeech: boolean = true
): Promise<VoiceCommandResult> {
  const traceId = generateTraceId();

  MollyLogger.logFlowStart(
    'processVoiceCommand',
    { userId: context.userId, synthesizeSpeech },
    traceId
  );

  try {
    // Step 1: Transcribe audio to text
    const transcription = await voiceCommandToText(audioData);

    if (!transcription || transcription.trim().length === 0) {
      return {
        recognized: false,
        intent: 'unknown',
        transcription: '',
        response: "I didn't catch that. Could you speak again?",
        metadata: {
          confidence: 0,
          memoryRecalled: false,
        },
      };
    }

    MollyLogger.info(
      'Voice transcribed',
      'voice-command-processor',
      { transcription: transcription.substring(0, 50) },
      traceId
    );

    if (isSleepSafeword(transcription)) {
      const nextState = toggleSleepState('voice-safeword');
      const responseText = nextState.isSleeping
        ? `Sleep mode engaged. Say "${getSafewordPhrase()}" to wake me.`
        : 'Sleep mode disabled. I am listening again.';

      return {
        recognized: true,
        intent: 'safety',
        transcription,
        response: responseText,
        metadata: {
          confidence: 1,
          memoryRecalled: false,
          actionTaken: nextState.isSleeping
            ? 'sleep_enabled'
            : 'sleep_disabled',
        },
      };
    }

    const sleepState = getSleepState();
    if (sleepState.isSleeping) {
      return {
        recognized: true,
        intent: 'safety',
        transcription,
        response: `Sleep mode is active. Say "${getSafewordPhrase()}" to wake me.`,
        metadata: {
          confidence: 1,
          memoryRecalled: false,
          actionTaken: 'sleep_blocked',
        },
      };
    }

    // Step 2: Analyze intent
    const intent = await analyzeIntent(transcription, context);

    MollyLogger.info(
      'Intent analyzed',
      'voice-command-processor',
      { intent: intent.intent, confidence: intent.confidence },
      traceId
    );

    // Step 3: Handle based on intent
    let responseText: string;
    let memoryRecalled = false;
    let actionTaken: string | undefined;

    switch (intent.intent) {
      case 'remember':
        responseText = await handleRememberIntent(
          transcription,
          context,
          intent.extractedInfo
        );
        actionTaken = 'memory_stored';
        break;

      case 'recall':
        responseText = await handleRecallIntent(
          transcription,
          context,
          intent.extractedInfo
        );
        memoryRecalled = true;
        actionTaken = 'memory_recalled';
        break;

      case 'question':
      case 'conversation':
      case 'clarification':
        responseText = await handleQuestionIntent(transcription, context);
        break;

      case 'command':
        responseText = await handleCommandIntent(
          transcription,
          context,
          intent.extractedInfo
        );
        actionTaken = 'command_executed';
        break;

      default:
        responseText = "I'm not sure how to help with that. Can you rephrase?";
    }

    // Step 4: Synthesize speech if requested
    let audioResponse: { audioUri: string } | undefined;

    if (synthesizeSpeech) {
      try {
        audioResponse = await textToSpeech(responseText);
      } catch {
        MollyLogger.warn(
          'Speech synthesis failed, returning text only',
          'voice-command-processor',
          {},
          traceId
        );
      }
    }

    // Step 5: Persist as a memory so voice conversations are learnable
    try {
      if (isAdminConfigured() && context.userId) {
        const firestore = await getAdminFirestoreAsync();
        if (firestore) {
          const record = createMemoryRecord<ExperienceRecord>({
            type: 'experience',
            userId: context.userId,
            timestamp: Date.now(),
            traceId,
            context: 'voice-conversation',
            suggestion: `Eric said (voice): "${transcription.substring(0, 400)}" — Molly responded: ${responseText.substring(0, 400)}`,
            vibe: 'Conversational',
            vibeScore: 0.7,
            success: true,
          });
          const recordWithChecksum = addChecksum(record);
          await firestore
            .collection('users')
            .doc(context.userId)
            .collection('experiences')
            .doc(recordWithChecksum.id)
            .set(recordWithChecksum);
        }
      }
    } catch (persistError) {
      MollyLogger.warn(
        'Failed to persist voice conversation memory',
        'voice-command-processor',
        {
          userId: context.userId,
          error:
            persistError instanceof Error
              ? persistError.message
              : String(persistError),
        },
        traceId
      );
    }

    MollyLogger.logFlowComplete(
      'processVoiceCommand',
      {
        intent: intent.intent,
        confidence: intent.confidence,
        responseLength: responseText.length,
        audioGenerated: !!audioResponse,
      },
      traceId
    );

    return {
      recognized: true,
      intent: intent.intent,
      transcription,
      response: responseText,
      audioResponse,
      metadata: {
        confidence: intent.confidence,
        memoryRecalled,
        actionTaken,
      },
    };
  } catch (error) {
    MollyLogger.error(
      'Voice command processing failed',
      'voice-command-processor',
      { userId: context.userId },
      error,
      traceId
    );

    return {
      recognized: false,
      intent: 'error',
      transcription: '',
      response:
        "I'm having trouble processing voice commands right now. Please try again.",
      metadata: {
        confidence: 0,
        memoryRecalled: false,
      },
    };
  }
}

/**
 * Convenience function for simple voice processing
 */
export async function simpleVoiceCommand(
  audioData: string,
  userId: string
): Promise<string> {
  const result = await processVoiceCommand(
    audioData,
    {
      userId,
      sessionId: generateTraceId(),
    },
    false // Don't synthesize speech for simple usage
  );

  return result.response;
}
