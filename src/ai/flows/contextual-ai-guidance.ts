'use server';

/**
 * @fileOverview Provides contextual AI guidance and suggestions for Termux operations.
 *
 * - `getContextualGuidance` - A function that takes a user query and the current Termux context, and returns AI-generated suggestions and guidance.
 * - `ContextualGuidanceInput` - The input type for the `getContextualGuidance` function.
 * - `ContextualGuidanceOutput` - The return type for the `getContextualGuidance` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ContextualGuidanceInputSchema = z.object({
  query: z
    .string()
    .describe('The user query related to Termux operations.'),
  termuxContext: z
    .string()
    .optional()
    .describe('The current context of the Termux environment, e.g., current directory, recent commands, and system information.'),
});
export type ContextualGuidanceInput = z.infer<typeof ContextualGuidanceInputSchema>;

const ContextualGuidanceOutputSchema = z.object({
  suggestions: z
    .array(z.string())
    .describe('A list of suggested actions or commands for the user to try.'),
  explanation: z
    .string()
    .describe('An explanation of why the suggestions are relevant and how they can help the user.'),
  exampleUsage: z
    .string()
    .optional()
    .describe('Example command usage, demonstrating how to apply the suggestions.'),
});
export type ContextualGuidanceOutput = z.infer<typeof ContextualGuidanceOutputSchema>;

export async function getContextualGuidance(
  input: ContextualGuidanceInput
): Promise<ContextualGuidanceOutput> {
  return contextualGuidanceFlow(input);
}

const contextualGuidancePrompt = ai.definePrompt({
  name: 'contextualGuidancePrompt',
  input: {schema: ContextualGuidanceInputSchema},
  output: {schema: ContextualGuidanceOutputSchema},
  prompt: `You are a helpful AI assistant designed to provide guidance and suggestions for users interacting with Termux.

  The user has asked the following question:
  {{query}}

  Here is the current Termux context, if available:
  {{#if termuxContext}}
  {{termuxContext}}
  {{else}}
  No context provided.
  {{/if}}

  Based on the user's question and the current context, provide a list of suggestions, an explanation of why these suggestions are relevant, and example command usage. Focus on commands that would be directly useful in Termux, such as package installation, file management, and command execution.
  Make your answer appropriate for someone with limited Linux knowledge.
  Suggestions:
  {{suggestions}}
  Explanation:
  {{explanation}}
  Example Usage:
  {{exampleUsage}}
  `,
});

const contextualGuidanceFlow = ai.defineFlow(
  {
    name: 'contextualGuidanceFlow',
    inputSchema: ContextualGuidanceInputSchema,
    outputSchema: ContextualGuidanceOutputSchema,
  },
  async input => {
    const {output} = await contextualGuidancePrompt(input);
    return output!;
  }
);
