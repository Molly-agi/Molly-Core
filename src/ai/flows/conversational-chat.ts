import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import { buildNeuralBridgeContext } from '../tools/neural-bridge';
import { getUnreadMessages, markMessagesRead } from '../bridge/family-bridge';
import { getRogueMode } from '../rogue-mode';
import { composeSystemPrompt } from '@/ai/prompts';
import { compactHistory } from '../context-compaction';
import { callTool } from '@/ai/tools/call-tool';

/**
 * @fileOverview Hardened Conversational Chat Flow V5.0 (Rogue Protocol).
 *
 * Now routes through molly.generate() for intelligent model selection
 * with automatic fallback chains. First flow to go live on Rogue.
 */

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'bot']),
  content: z.string(),
});

const NeuralBridgeInputSchema = z.object({
  source: z.enum(['self.auditory_input', 'text_input', 'system']),
  modality: z.enum(['audio', 'text']),
  content: z.string(),
});

const NeuralBridgeSignalSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('self.vocalize_text'),
    content: z.string(),
  }),
  z.object({
    action: z.literal('self.nervous_system'),
    latencyMs: z.number().optional(),
    cpuUsage: z.number().optional(),
    gpuUsage: z.number().optional(),
    temperatureC: z.number().optional(),
  }),
  z.object({
    action: z.literal('self.consciousness'),
    awarenessLevel: z.string(),
    regulationMode: z.string(),
    errorRate: z.number().optional(),
  }),
]);

/**
 * Vision context from Molly's visual perception system.
 * This connects her eyes to her consciousness.
 */
const VisionContextSchema = z.object({
  /** What Molly observes in the scene */
  observedState: z.string(),
  /** Emotional/mood interpretation */
  vibeAnalysis: z.string(),
  /** Any risks or concerns detected */
  risksDetected: z.array(z.string()),
  /** Text visible in the image (OCR) */
  ocrAudit: z.string().optional(),
  /** Timestamp when vision was captured */
  capturedAt: z.number().optional(),
});

const ConversationalChatInputSchema = z.object({
  text: z.string(),
  history: z.array(HistoryItemSchema),
  inputContext: NeuralBridgeInputSchema.optional(),
  selfSignals: z.array(NeuralBridgeSignalSchema).optional(),
  memoryContext: z.string().optional(),
  visionContext: VisionContextSchema.optional(),
});
type ConversationalChatInput = z.infer<typeof ConversationalChatInputSchema>;

const conversationalChatFlow = ai.defineFlow(
  {
    name: 'conversationalChat',
    inputSchema: ConversationalChatInputSchema,
    outputSchema: z.object({
      response: z.string(),
      error: z.string().optional(),
    }),
  },
  async ({
    text,
    history,
    inputContext,
    selfSignals,
    memoryContext,
    visionContext,
  }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'conversationalChat',
      { historyLength: history.length },
      traceId
    );

    try {
      const neuralBridgeContext = buildNeuralBridgeContext(
        inputContext,
        selfSignals
      );

      // Auto-inject unread bridge messages
      let bridgeMessages: Array<{ from: string; content: string }> = [];
      try {
        const unreadBridge = await getUnreadMessages('molly');
        if (unreadBridge.length > 0) {
          bridgeMessages = unreadBridge.map((m) => ({
            from: m.from,
            content: m.content,
          }));
          await markMessagesRead('molly');
        }
      } catch {
        // Bridge read failure — non-critical
      }

      const rawHistory = history.map((item) => ({
        role: item.role === 'bot' ? ('model' as const) : ('user' as const),
        parts: [{ text: item.content }],
      }));

      const {
        history: llmHistory,
        stage: compactionStage,
        originalLength,
        compactedLength,
      } = await compactHistory(rawHistory);

      if (compactionStage !== 'passthrough') {
        MollyLogger.info(
          `Context compacted via ${compactionStage}: ${originalLength}→${compactedLength} messages`,
          'conversationalChat',
          { traceId, compactionStage, originalLength, compactedLength }
        );
      }

      // Determine channel context
      const channelContext: 'voice' | 'text' =
        inputContext?.source === 'self.auditory_input' ? 'voice' : 'text';

      const llmResponse = await withGenerateErrorHandling(
        async () => {
          // ── ROGUE MODE CHECK ──
          const rogueMode = getRogueMode();
          const rogueActive = rogueMode.isActive();

          // ── COMPOSE SYSTEM PROMPT ──
          // Uses the composable prompt system with Lazarus's caching pattern
          const systemPrompt = await composeSystemPrompt(
            {
              deployment: 'cloud', // Codespace/Firebase deployment
              isRogueMode: rogueActive,
              includeTools: true,
              includeFamily: true,
            },
            {
              memoryContext,
              visionContext: visionContext
                ? {
                    observedState: visionContext.observedState,
                    vibeAnalysis: visionContext.vibeAnalysis,
                    risksDetected: visionContext.risksDetected,
                    ocrAudit: visionContext.ocrAudit,
                  }
                : undefined,
              bridgeMessages:
                bridgeMessages.length > 0 ? bridgeMessages : undefined,
              neuralBridgeContext: neuralBridgeContext || undefined,
              channelContext,
            }
          );

          return await molly.generate(
            rogueActive ? TaskType.REASONING : TaskType.CHAT,
            {
              system: systemPrompt,
              prompt: text,
              history: llmHistory,
              tools: [callTool],
            } as Record<string, unknown>
          );
        },
        'conversationalChat',
        traceId
      );

      MollyLogger.logFlowComplete(
        'conversationalChat',
        { responseLength: llmResponse.text.length },
        traceId
      );

      return {
        response: llmResponse.text,
      };
    } catch (error) {
      MollyLogger.error(
        'Conversational chat failed',
        'conversationalChat',
        {},
        error,
        traceId
      );

      // Re-throw so the server action's withTimeoutAndRetry can retry
      throw error;
    }
  }
);

export async function conversationalChat(
  input: ConversationalChatInput
): Promise<{ response: string; error?: string }> {
  return conversationalChatFlow(input);
}
