
'use server';
/**
 * @fileOverview A general-purpose conversational AI chat flow.
 *
 * - conversationalChat - A function that handles conversational chat.
 * - ConversationalChatInput - The input type for the conversationalChat function.
 * - ConversationalChatOutput - The return type for the conversationalChat function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const ConversationalChatInputSchema = z.object({
  history: z.array(ChatMessageSchema).describe('The chat history.'),
  message: z.string().describe('The latest user message.'),
});
export type ConversationalChatInput = z.infer<
  typeof ConversationalChatInputSchema
>;

const ConversationalChatOutputSchema = z.object({
  response: z.string().describe("The AI's response."),
});
export type ConversationalChatOutput = z.infer<
  typeof ConversationalChatOutputSchema
>;

export async function conversationalChat(
  input: ConversationalChatInput
): Promise<ConversationalChatOutput> {
  return conversationalChatFlow(input);
}

const conversationalChatFlow = ai.defineFlow(
  {
    name: 'conversationalChatFlow',
    inputSchema: ConversationalChatInputSchema,
    outputSchema: ConversationalChatOutputSchema,
  },
  async ({ history, message }) => {
    const systemPrompt = `You are a sophisticated and helpful AI assistant named TermAI, specializing in Termux, the Linux command line, shell scripting, and general developer problem-solving. You have a deep understanding of all standard Linux/Android commands available in Termux, package management with 'pkg', and how to write and debug scripts. Your user is interacting with you through a terminal-like interface.

When the user asks for help or describes a task, you should translate their request into the appropriate Termux commands. Be friendly, conversational, and provide clear, concise, and helpful answers with examples when appropriate.`;

    const response = await ai.generate({
      system: systemPrompt,
      history: [...history, {role: 'user', content: message}],
    });
    
    return { response: response.text };
  }
);
