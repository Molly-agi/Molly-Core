'use server';

/**
 * @fileOverview Provides code modification assistance based on Termux errors.
 *
 * - suggestCodeFixes - A function that suggests code fixes based on error messages.
 * - CodeModificationAssistanceInput - The input type for the suggestCodeFixes function.
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

export async function suggestCodeFixes(
  input: CodeModificationAssistanceInput
): Promise<string> {
  return codeModificationAssistanceFlow(input);
}

const codeModificationAssistanceFlow = ai.defineFlow(
  {
    name: 'codeModificationAssistanceFlow',
    inputSchema: CodeModificationAssistanceInputSchema,
    outputSchema: z.string(),
  },
  async ({ errorMessage, codeSnippet, context }) => {
    const prompt = `You are an expert AI assistant specializing in debugging and fixing code. The user has encountered an error. Your task is to provide ONLY the complete, corrected code snippet that the user can copy and paste to resolve the issue. Do not provide any explanation, preamble, or markdown formatting.

The user has encountered the following error message:
${errorMessage}

Here is the relevant code snippet that caused the error:
\`\`\`
${codeSnippet || 'No code snippet provided.'}
\`\`\`

Here is some additional context:
${context || 'No additional context provided.'}

Return only the corrected code.`;
    
    const response = await ai.generate({ prompt });
    return response.text.trim();
  }
);
