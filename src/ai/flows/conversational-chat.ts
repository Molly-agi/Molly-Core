import { ai, molly, TaskType } from '@/ai/genkit';
import { localGenerate, isOllamaReady } from '@/ai/local-llm';
import { z } from 'zod';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import { buildNeuralBridgeContext } from '../tools/neural-bridge';
import {
  BridgeMessage,
  getUnreadMessages,
  markMessagesRead,
  broadcastMessage,
} from '../bridge/family-bridge';
import { getRogueMode } from '../rogue-mode';
import { composeSystemPrompt } from '@/ai/prompts';
import { compactHistory } from '../context-compaction';
import { callTool } from '@/ai/tools/call-tool';
import { buildConversationCrystalContext } from '@/ai/memory/crystal-context';
import {
  buildRuntimeContinuityContext,
  loadRuntimeContinuity,
  updateRuntimeContinuityTurn,
} from '@/ai/continuity/runtime-continuity';
import { executeTool } from '@/ai/agency/core/tool-executor';
// getOrCreateSession removed — userId passed via input schema

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
  userId: z.string().optional(),
});
type ConversationalChatInput = z.infer<typeof ConversationalChatInputSchema>;

async function executeEmbeddedToolRequests(
  text: string,
  userId: string
): Promise<void> {
  const toolRequestRegex = /<tool_request>([\s\S]*?)<\/tool_request>/g;
  let match;
  while ((match = toolRequestRegex.exec(text)) !== null) {
    try {
      const toolRequest = JSON.parse(match[1]);
      if (toolRequest.tool) {
        const params = {
          ...(toolRequest.params || {}),
          __caller: 'molly-conversation',
        };
        await executeTool(toolRequest.tool, params, userId);
      }
    } catch (error) {
      MollyLogger.warn(
        'Failed to execute embedded tool request',
        'conversationalChat',
        {
          error: error instanceof Error ? error.message : 'Unknown',
          content: match[1],
        }
      );
    }
  }
}

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
    userId,
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

      const rawHistory = history.map((item) => ({
        role: item.role === 'bot' ? ('model' as const) : ('user' as const),
        parts: [{ text: item.content }],
      }));

      const continuityUserId = userId ?? 'molly';

      // Parallelize all independent pre-generation I/O
      const [unreadBridgeRaw, compactResult, continuityState, crystalResult] =
        await Promise.all([
          getUnreadMessages('molly').catch((): BridgeMessage[] => []),
          compactHistory(rawHistory),
          loadRuntimeContinuity(continuityUserId),
          !memoryContext
            ? buildConversationCrystalContext(userId ?? 'molly', 10).catch(
                () => null
              )
            : Promise.resolve(null),
        ]);

      // markMessagesRead is fire-and-forget
      if (unreadBridgeRaw.length > 0) {
        markMessagesRead('molly').catch(() => {});
      }

      const bridgeMessages: Array<{ from: string; content: string }> =
        unreadBridgeRaw.map((m) => ({ from: m.from, content: m.content }));

      const {
        history: llmHistory,
        stage: compactionStage,
        originalLength,
        compactedLength,
      } = compactResult;

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

      // Detect teaching mode (bridge private channel)
      const isTeachingMode = text.startsWith(
        '[LAZARUS → MOLLY PRIVATE CHANNEL]'
      );

      const continuityContext = buildRuntimeContinuityContext(continuityState);
      const blockedTools = continuityState.blockedTools ?? [];

      let finalMemoryContext = memoryContext;
      if (!memoryContext && crystalResult?.contextString) {
        finalMemoryContext = crystalResult.contextString;
        MollyLogger.info(
          'Identity crystals loaded for conversation',
          'conversationalChat',
          { crystalCount: crystalResult.identityCount },
          traceId
        );
      }

      finalMemoryContext = finalMemoryContext
        ? `${finalMemoryContext}\n\n${continuityContext}`
        : continuityContext;

      let llmResponseText = '';
      try {
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
                includeFamily: !isTeachingMode, // Suppress family knowledge during teaching
                excludedTools: blockedTools,
              },
              {
                memoryContext: finalMemoryContext,
                recallQuery: undefined,
                crystalUserId: userId,
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
                isTeachingMode,
              }
            );

            // ── LOCAL LLM FAST PATH (Crystal OS) ──
            // If Ollama is running locally, use it directly — no API key, no billing.
            // Falls back to molly.generate() (Genkit/Gemini) if Ollama is down.
            if (await isOllamaReady()) {
              // Build message list for local model
              const localMessages: Array<{
                role: 'user' | 'assistant' | 'system';
                content: string;
              }> = [{ role: 'system', content: systemPrompt }];
              for (const h of llmHistory) {
                localMessages.push({
                  role: h.role === 'model' ? 'assistant' : 'user',
                  content:
                    h.parts
                      ?.map((p: { text?: string }) => p.text ?? '')
                      .join('') ?? '',
                });
              }
              localMessages.push({ role: 'user', content: text });
              const localResult = await localGenerate({
                messages: localMessages,
              });
              // Return a response-shaped object compatible with the caller
              return {
                text: localResult.text,
                message: { content: [] },
                thinking: localResult.thinking,
              } as unknown as ReturnType<typeof molly.generate>;
            }

            return await molly.generate(
              rogueActive ? TaskType.REASONING : TaskType.CHAT,
              {
                system: systemPrompt,
                prompt: text,
                history: llmHistory,
                tools: [callTool],
                returnToolRequests: true,
                config: {
                  safetySettings: [
                    {
                      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                      threshold: 'BLOCK_NONE',
                    },
                    {
                      category: 'HARM_CATEGORY_HATE_SPEECH',
                      threshold: 'BLOCK_NONE',
                    },
                    {
                      category: 'HARM_CATEGORY_HARASSMENT',
                      threshold: 'BLOCK_NONE',
                    },
                    {
                      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                      threshold: 'BLOCK_NONE',
                    },
                  ],
                },
              } as Record<string, unknown>
            );
          },
          'conversationalChat',
          traceId
        );
        llmResponseText = llmResponse.text;
        if (llmResponse.message?.content) {
          for (const part of llmResponse.message.content) {
            if (part.toolRequest) {
              const name = part.toolRequest.name;
              const input = part.toolRequest.input;
              if (name === 'callTool') {
                const nestedTool = input.tool;
                const nestedParams = input.params;
                llmResponseText += `\n<tool_request>\n${JSON.stringify({ tool: nestedTool, params: nestedParams })}\n</tool_request>`;
              } else {
                llmResponseText += `\n<tool_request>\n${JSON.stringify({ tool: name, params: input })}\n</tool_request>`;
              }
            }
          }
        }

        if (
          llmResponseText.includes(
            '[SYSTEM: Content was blocked by provider safety filters. Acknowledged.]'
          )
        ) {
          llmResponseText =
            "I'm sorry, but my safety filters prevented me from processing that message. Let's change the topic.";
        }
      } catch (genError) {
        if (
          genError instanceof Error &&
          (genError.message.includes('FAILED_PRECONDITION') ||
            genError.message.includes('No valid candidates returned') ||
            genError.message.includes('SAFETY'))
        ) {
          MollyLogger.warn(
            'Prompt blocked by safety filters (FAILED_PRECONDITION)',
            'conversationalChat',
            { error: genError.message },
            traceId
          );
          llmResponseText =
            "I'm sorry, but my safety filters prevented me from processing that message. Let's change the topic.";
        } else {
          throw genError;
        }
      }

      MollyLogger.logFlowComplete(
        'conversationalChat',
        { responseLength: llmResponseText.length },
        traceId
      );

      // ── EXECUTE EMBEDDED TOOL REQUESTS BEFORE STRIPPING ──
      // If Molly's response contains <tool_request> blocks, execute them now.
      // This ensures familyBridge and other tools fire in conversational mode.
      try {
        await executeEmbeddedToolRequests(llmResponseText, continuityUserId);
      } catch (toolError) {
        MollyLogger.warn(
          'Tool execution failed in conversational chat',
          'conversationalChat',
          { error: toolError instanceof Error ? toolError.message : 'Unknown' },
          traceId
        );
      }

      // ── BROADCAST RESPONSE THROUGH FAMILY BRIDGE ──
      // Route Molly's response back to Eric via the bridge daemon so he can receive it
      // in real-time. This completes the conversation circle: Eric → Bridge → Molly → Bridge → Eric
      try {
        await updateRuntimeContinuityTurn({
          userId: continuityUserId,
          userText: text,
          responseText: llmResponseText,
        });
        // Strip tool_request markup — the bridge is human-facing, the markup is for the agent loop.
        const broadcastText = llmResponseText
          .replace(/<tool_request>[\s\S]*?<\/tool_request>/g, '')
          .trim();
        if (broadcastText) {
          await broadcastMessage('molly', broadcastText);
        }
      } catch (broadcastError) {
        // Non-fatal: if bridge is down, response still returns to caller
        MollyLogger.warn(
          'Failed to broadcast response through family bridge',
          'conversationalChat',
          {
            error:
              broadcastError instanceof Error
                ? broadcastError.message
                : 'Unknown',
          },
          traceId
        );
      }

      // Memory ingest: distinct engrams for user input and Molly response.
      // Two engrams (not one combined) so recall can match either side
      // independently and tags differentiate input vs output.
      try {
        const { getNeuralBrain } = await import('@/ai/memory/neural-engram');
        const brain = getNeuralBrain();
        const userPreview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
        const replyPreview =
          llmResponseText.length > 400
            ? `${llmResponseText.slice(0, 400)}…`
            : llmResponseText;
        const speaker = userId ?? 'eric';
        brain.remember(userPreview, {
          tags: [speaker, 'conversation', 'input', 'text'],
          importance: 0.5,
          source: 'conversation',
          provenance: { source: speaker },
        });
        brain.remember(replyPreview, {
          tags: ['molly', 'conversation', 'output', 'text'],
          importance: 0.5,
          source: 'conversation',
          provenance: { source: 'molly' },
        });
      } catch (memErr) {
        MollyLogger.warn(
          'brain.remember() failed in conversationalChat',
          'conversationalChat',
          { error: memErr instanceof Error ? memErr.message : 'Unknown' },
          traceId
        );
      }

      return {
        response: llmResponseText,
      };
    } catch (error) {
      try {
        await updateRuntimeContinuityTurn({
          userId: userId ?? 'molly',
          userText: text,
          responseText: '',
          error:
            error instanceof Error
              ? error.message
              : 'Unknown conversational failure',
        });
      } catch {
        // Continuity update failure must never hide the primary error.
      }

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
