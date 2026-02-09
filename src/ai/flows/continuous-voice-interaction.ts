/**
 * @fileOverview Continuous Voice Interaction Flow (Phase 7B)
 *
 * Enables natural conversation with Molly through voice.
 * Uses VAD for speech detection, semantic memory for context.
 *
 * This is Molly's vocal interface - her ability to listen, understand, remember.
 */

'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import {
  processVoiceCommand,
  type VoiceCommandContext,
} from '../tools/voice-command-processor';
import { MollyLogger, generateTraceId } from '../logger';

const ConversationTurnSchema = z.object({
  userSpeech: z.string().describe('What the user said'),
  mollyResponse: z.string().describe("Molly's response"),
  intent: z.string().describe('Detected intent'),
  confidence: z.number().min(0).max(1),
  memoryUsed: z.boolean(),
  timestamp: z.number(),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

const VoiceInteractionOutputSchema = z.object({
  turns: z.array(ConversationTurnSchema),
  summary: z.string().describe('Conversation summary'),
  memoriesCreated: z.number(),
  memoriesRecalled: z.number(),
  duration: z.number().describe('Total interaction duration in ms'),
});

/**
 * Continuous voice interaction flow
 * Processes a conversation with Molly through voice
 */
export const continuousVoiceInteractionFlow = ai.defineFlow(
  {
    name: 'continuousVoiceInteraction',
    inputSchema: z.object({
      userId: z.string(),
      sessionId: z.string(),
      audioSegments: z
        .array(z.string())
        .describe('Array of base64 audio data segments'),
      synthesizeSpeech: z.boolean().default(true),
      hardwareState: z
        .object({
          temperature: z.number().optional(),
          batteryLevel: z.number().optional(),
          cpuUsage: z.number().optional(),
        })
        .optional(),
    }),
    outputSchema: VoiceInteractionOutputSchema,
  },
  async ({
    userId,
    sessionId,
    audioSegments,
    synthesizeSpeech,
    hardwareState,
  }) => {
    const traceId = generateTraceId();
    const startTime = Date.now();

    MollyLogger.logFlowStart(
      'continuousVoiceInteraction',
      {
        userId,
        sessionId,
        segmentCount: audioSegments.length,
        synthesizeSpeech,
      },
      traceId
    );

    const turns: ConversationTurn[] = [];
    let memoriesCreated = 0;
    let memoriesRecalled = 0;
    const previousCommands: string[] = [];

    const context: VoiceCommandContext = {
      userId,
      sessionId,
      previousCommands,
      hardwareState,
    };

    // Process each audio segment (turn in conversation)
    for (const [index, audioData] of audioSegments.entries()) {
      try {
        MollyLogger.info(
          `Processing conversation turn ${index + 1}/${audioSegments.length}`,
          'continuous-voice-interaction',
          { sessionId },
          traceId
        );

        // Process the voice command
        const result = await processVoiceCommand(
          audioData,
          context,
          synthesizeSpeech
        );

        // Record the turn
        const turn: ConversationTurn = {
          userSpeech: result.transcription,
          mollyResponse: result.response,
          intent: result.intent,
          confidence: result.metadata?.confidence || 0,
          memoryUsed: result.metadata?.memoryRecalled || false,
          timestamp: Date.now(),
        };

        turns.push(turn);

        // Update context with previous command
        previousCommands.push(result.transcription);
        if (previousCommands.length > 3) {
          previousCommands.shift(); // Keep only last 3 for context
        }

        // Track memory operations
        if (result.metadata?.actionTaken === 'memory_stored') {
          memoriesCreated++;
        }
        if (result.metadata?.memoryRecalled) {
          memoriesRecalled++;
        }
      } catch (error) {
        MollyLogger.error(
          'Failed to process conversation turn',
          'continuous-voice-interaction',
          { turnIndex: index },
          error,
          traceId
        );

        // Record failed turn
        turns.push({
          userSpeech: '[inaudible]',
          mollyResponse:
            "I'm having trouble understanding. Could you try again?",
          intent: 'error',
          confidence: 0,
          memoryUsed: false,
          timestamp: Date.now(),
        });
      }
    }

    // Generate conversation summary
    const conversationText = turns
      .map((t) => `User: ${t.userSpeech}\nMolly: ${t.mollyResponse}`)
      .join('\n\n');

    const summaryResponse = await ai.generate({
      model: 'gemini-2.0-flash-exp',
      system:
        'Summarize this voice conversation in 1-2 sentences. Focus on key topics and decisions.',
      prompt: conversationText,
    });

    const duration = Date.now() - startTime;

    MollyLogger.logFlowComplete(
      'continuousVoiceInteraction',
      {
        turns: turns.length,
        memoriesCreated,
        memoriesRecalled,
        duration,
      },
      traceId
    );

    return {
      turns,
      summary: summaryResponse.text,
      memoriesCreated,
      memoriesRecalled,
      duration,
    };
  }
);

/**
 * Execute continuous voice interaction
 */
export async function executeContinuousVoiceInteraction(
  userId: string,
  audioSegments: string[],
  options: {
    sessionId?: string;
    synthesizeSpeech?: boolean;
    hardwareState?: {
      temperature?: number;
      batteryLevel?: number;
      cpuUsage?: number;
    };
  } = {}
) {
  return await continuousVoiceInteractionFlow({
    userId,
    sessionId: options.sessionId || generateTraceId(),
    audioSegments,
    synthesizeSpeech: options.synthesizeSpeech !== false,
    hardwareState: options.hardwareState,
  });
}
