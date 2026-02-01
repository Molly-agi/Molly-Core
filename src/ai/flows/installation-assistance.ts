'use server';

/**
 * @fileOverview An AI agent that assists with software installation in Termux, automatically resolving dependency issues and other common installation problems.
 *
 * - installationAssistance - A function that handles the installation assistance process.
 * - InstallationAssistanceInput - The input type for the installationAssistance function.
 * - InstallationAssistanceOutput - The return type for the installationAssistance function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InstallationAssistanceInputSchema = z.object({
  command: z
    .string()
    .describe('The installation command to be executed in Termux.'),
  errorMessage: z
    .string()
    .optional()
    .describe('The error message encountered during installation, if any.'),
});
export type InstallationAssistanceInput = z.infer<
  typeof InstallationAssistanceInputSchema
>;

const InstallationAssistanceOutputSchema = z.object({
  suggestedFix: z
    .string()
    .describe(
      'A suggested fix for the installation problem, or instructions on how to proceed.'
    ),
  additionalDependencies: z
    .array(z.string())
    .optional()
    .describe(
      'A list of additional dependencies that need to be installed, if any.'
    ),
  confirmationRequired: z
    .boolean()
    .describe(
      'Whether or not user confirmation is required before applying the suggested fix.'
    ),
});
export type InstallationAssistanceOutput = z.infer<
  typeof InstallationAssistanceOutputSchema
>;

export async function installationAssistance(
  input: InstallationAssistanceInput
): Promise<InstallationAssistanceOutput> {
  return installationAssistanceFlow(input);
}

const installationAssistancePrompt = ai.definePrompt({
  name: 'installationAssistancePrompt',
  input: {schema: InstallationAssistanceInputSchema},
  output: {schema: InstallationAssistanceOutputSchema},
  prompt: `You are an AI assistant helping users install software in Termux.

The user is trying to install software using the following command:
{{command}}

If there was an error, the error message is:
{{errorMessage}}

Based on the command and the error message, suggest a fix for the installation problem.

If additional dependencies are required, list them in the additionalDependencies field.

Indicate whether user confirmation is required before applying the fix.

Format your response as a JSON object matching the following schema:
${JSON.stringify(InstallationAssistanceOutputSchema.shape)}`,
});

const installationAssistanceFlow = ai.defineFlow(
  {
    name: 'installationAssistanceFlow',
    inputSchema: InstallationAssistanceInputSchema,
    outputSchema: InstallationAssistanceOutputSchema,
  },
  async input => {
    const {output} = await installationAssistancePrompt(input);
    return output!;
  }
);
