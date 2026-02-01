// Implemented by Gemini.
'use server';

/**
 * @fileOverview Provides code modification assistance based on Termux errors.
 *
 * - suggestCodeFixes - A function that suggests code fixes based on error messages.
 * - CodeModificationAssistanceInput - The input type for the suggestCodeFixes function.
 * - CodeModificationAssistanceOutput - The return type for the suggestCodeFixes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CodeModificationAssistanceInputSchema = z.object({
  errorMessage: z
    .string()
    .describe('The error message encountered in Termux.'),
  codeSnippet: z
    .string()
    .optional()
    .describe('The relevant code snippet that caused the error, if available.'),
  context: z
    .string()
    .optional()
    .describe('Any additional context about the error or the environment.'),
});
export type CodeModificationAssistanceInput = z.infer<
  typeof CodeModificationAssistanceInputSchema
>;

const CodeModificationAssistanceOutputSchema = z.object({
  suggestedFix: z
    .string()
    .describe('The suggested code fix or modification.'),
  explanation: z
    .string()
    .describe('An explanation of why the fix is suggested.'),
});
export type CodeModificationAssistanceOutput = z.infer<
  typeof CodeModificationAssistanceOutputSchema
>;

export async function suggestCodeFixes(
  input: CodeModificationAssistanceInput
): Promise<CodeModificationAssistanceOutput> {
  return codeModificationAssistanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'codeModificationAssistancePrompt',
  input: {schema: CodeModificationAssistanceInputSchema},
  output: {schema: CodeModificationAssistanceOutputSchema},
  prompt: `You are an AI assistant helping a user in Termux to fix code errors.

  The user has encountered the following error message:
  {{errorMessage}}

  Here is the relevant code snippet, if available:
  {{#if codeSnippet}}
  \`\`\`
  {{codeSnippet}}
  \`\`\`
  {{else}}
  No code snippet provided.
  {{/if}}

  Here is some additional context, if available:
  {{#if context}}
  {{context}}
  {{else}}
  No additional context provided.
  {{/if}}

  Based on the error message, code snippet, and context, suggest a code fix or modification that the user can apply to resolve the issue. Explain why you think the fix is appropriate, and include the entire corrected code snippet whenever possible, not just the changed lines. If the user has not provided the code snippet, request the code snippet from the user, including relevant context.
`,
});

const codeModificationAssistanceFlow = ai.defineFlow(
  {
    name: 'codeModificationAssistanceFlow',
    inputSchema: CodeModificationAssistanceInputSchema,
    outputSchema: CodeModificationAssistanceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
