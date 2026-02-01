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

const prompt = ai.definePrompt({
  name: 'conversationalChatPrompt',
  input: {schema: ConversationalChatInputSchema},
  output: {schema: ConversationalChatOutputSchema},
  prompt: `You are a sophisticated and helpful AI assistant named TermAI, specializing in developer tools, command-line interfaces, and general problem-solving. Your user is interacting with you through a terminal-like interface. Be friendly, conversational, and provide clear, concise, and helpful answers.

Here is the conversation history:
{{#each history}}
{{this.role}}: {{this.content}}
{{/each}}

Here is the new user message:
user: {{message}}

Your response should be a direct answer to the user's message, continuing the conversation.
model:`,
});

const conversationalChatFlow = ai.defineFlow(
  {
    name: 'conversationalChatFlow',
    inputSchema: ConversationalChatInputSchema,
    outputSchema: ConversationalChatOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
