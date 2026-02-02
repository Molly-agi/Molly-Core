'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

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
    outputSchema: z.string(),
  },
  async ({ text, history }) => {
    const llmHistory = history.map((item) => ({
      role: item.role === 'bot' ? ('model' as const) : ('user' as const),
      parts: [{ text: item.content }],
    }));

    const llmResponse = await ai.generate({
      model: 'gemini-pro',
      prompt: text,
      history: llmHistory,
      config: {
        systemPrompt: `You are an expert AI assistant named Molly. You specialize in Termux, Linux, and general programming. Your goal is to provide guidance, write code, and help the user understand complex topics. The user is interacting with you in a side panel next to a terminal interface. Be helpful and provide clear, concise explanations.`,
      },
    });

    return llmResponse.text;
  }
);

export async function conversationalChat(input: ConversationalChatInput): Promise<string> {
  return conversationalChatFlow(input);
}
