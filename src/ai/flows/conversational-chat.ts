'use server';

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';
import { withGenerateErrorHandling } from '../error-handler';
import { MollyLogger, generateTraceId } from '../logger';
import {
  getContextWindow,
  storeConversationMessage,
  getOrCreateConversation,
} from '../tools/conversation-context';

/**
 * @fileOverview Hardened Conversational Chat Flow V4.4 (Context Restoration Integrated).
 */

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'bot']),
  content: z.string(),
});

const ConversationalChatInputSchema = z.object({
  text: z.string(),
  history: z.array(HistoryItemSchema).optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
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
  async ({ text, history, userId, conversationId }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'conversationalChat',
      { 
        historyLength: history?.length || 0,
        userId: userId || 'anonymous',
        conversationId: conversationId || 'none',
        contextRestoration: !!(userId && conversationId)
      },
      traceId
    );

    try {
      let effectiveHistory = history || [];
      
      // Context Restoration: Load history from Firestore if userId and conversationId provided
      if (userId && conversationId) {
        MollyLogger.info(
          'Restoring conversation context from Firestore',
          'conversationalChat',
          { userId, conversationId },
          traceId
        );
        
        // Ensure conversation exists
        await getOrCreateConversation(userId, conversationId);
        
        // Fetch context window (last N messages within token limit)
        const contextMessages = await getContextWindow(userId, conversationId, 4000);
        
        // Convert Firestore messages to history format
        effectiveHistory = contextMessages.map((msg) => ({
          role: msg.role === 'assistant' ? ('bot' as const) : ('user' as const),
          content: msg.content,
        }));
        
        MollyLogger.info(
          `Restored ${effectiveHistory.length} messages from context`,
          'conversationalChat',
          { contextMessageCount: effectiveHistory.length },
          traceId
        );
        
        // Store the new user message
        await storeConversationMessage({
          userId,
          conversationId,
          role: 'user',
          content: text,
          timestamp: new Date().toISOString(),
          metadata: {
            flowName: 'conversationalChat',
          },
        });
      }

      const llmHistory = effectiveHistory.map((item) => ({
        role: item.role === 'bot' ? ('model' as const) : ('user' as const),
        parts: [{ text: item.content }],
      }));

      const llmResponse = await withGenerateErrorHandling(
        // Cast to any to satisfy differing GenerateOptions typings across genkit versions
        async () =>
          await ai.generate({
            model: MODEL_FLASH,
            prompt: text,
            history: llmHistory,
            config: {
              systemPrompt: `You are an expert AI assistant named Molly. You specialize in Termux, Linux, and general programming. Your goal is to provide guidance, write code, and help the user understand complex topics. The user is interacting with you in a side panel next to a terminal interface. Be helpful and provide clear, concise explanations.`,
            },
          } as any),
        'conversationalChat',
        traceId
      );

      // Store the assistant's response if context restoration is enabled
      if (userId && conversationId) {
        await storeConversationMessage({
          userId,
          conversationId,
          role: 'assistant',
          content: llmResponse.text,
          timestamp: new Date().toISOString(),
          metadata: {
            flowName: 'conversationalChat',
          },
        });
      }

      MollyLogger.logFlowComplete(
        'conversationalChat',
        { 
          responseLength: llmResponse.text.length,
          contextRestored: !!(userId && conversationId)
        },
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
