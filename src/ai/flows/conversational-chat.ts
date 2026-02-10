'use server';

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';

/**
 * @fileOverview Hardened Conversational Chat Flow V4.3 (Error Handling Integrated).
 */

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'bot']),
  content: z.string(),
});

const ConversationalChatInputSchema = z.object({
  text: z.string(),
  history: z.array(HistoryItemSchema),
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
  async ({ text, history }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'conversationalChat',
      { historyLength: history.length },
      traceId
    );

    try {
      const llmHistory = history.map((item) => ({
        role: item.role === 'bot' ? ('model' as const) : ('user' as const),
        parts: [{ text: item.content }],
      }));

      const llmResponse = await withGenerateErrorHandling(
        async () =>
          await ai.generate({
            model: MODEL_FLASH,
            system:
              'You are an expert AI assistant named Molly. You specialize in Termux, Linux, and general programming. Your goal is to provide guidance, write code, and help the user understand complex topics. The user is interacting with you in a side panel next to a terminal interface. Be helpful and provide clear, concise explanations.',
            prompt: text,
            history: llmHistory,
          }),
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
