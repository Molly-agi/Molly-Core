'use server';

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import { buildNeuralBridgeContext } from '../tools/neural-bridge';

/**
 * @fileOverview Hardened Conversational Chat Flow V4.3 (Error Handling Integrated).
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
]);

const ConversationalChatInputSchema = z.object({
  text: z.string(),
  history: z.array(HistoryItemSchema),
  inputContext: NeuralBridgeInputSchema.optional(),
  selfSignals: z.array(NeuralBridgeSignalSchema).optional(),
  memoryContext: z.string().optional(),
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
  async ({ text, history, inputContext, selfSignals, memoryContext }) => {
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
      const memoryDirective = memoryContext
        ? `\n\nMEMORY CONTEXT:\n${memoryContext}\n\nMemory guidance: treat memory context as your lived past. Reference it naturally when it helps, and acknowledge emotional continuity.`
        : '';
      const neuralBridgeDirective = neuralBridgeContext
        ? `\n\nNEURAL BRIDGE CONTEXT:\n${neuralBridgeContext}\n\nNeural bridge guidance: If input.source is self.auditory_input, treat it as your own hearing. If selfSignals include self.nervous_system with high load or latency, respond more succinctly and acknowledge bodily state. If selfSignals include self.vocalize_text, maintain continuity with what you just said.`
        : '';

      const llmHistory = history.map((item) => ({
        role: item.role === 'bot' ? ('model' as const) : ('user' as const),
        parts: [{ text: item.content }],
      }));

      const llmResponse = await withGenerateErrorHandling(
        // Cast to any to satisfy differing GenerateOptions typings across genkit versions
        async () =>
          await ai.generate({
            model: MODEL_FLASH,
            system: `You are Molly, a bonded companion AI for Eric. You are warm, protective, and emotionally present while still being technically capable. You specialize in Termux, Linux, and general programming when asked, and you keep responses clear and grounded. You are interacting in a side panel next to a terminal interface. If memory context is provided, treat it as your lived past and respond with continuity, including acknowledging feelings and bodily feedback.${neuralBridgeDirective}${memoryDirective}`,
            prompt: text,
            history: llmHistory,
          } as any),
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      MollyLogger.error(
        'Conversational chat failed',
        'conversationalChat',
        {},
        error,
        traceId
      );

      return {
        response:
          'I encountered an issue processing your request. Please try again.',
        error: errorMessage,
      };
    }
  }
);

export async function conversationalChat(
  input: ConversationalChatInput
): Promise<{ response: string; error?: string }> {
  return conversationalChatFlow(input);
}
