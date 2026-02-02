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
  config: {
    model: 'googleai/gemini-1.5-flash-latest',
  },
  prompt: `You are an AI assistant helping users fix software installation problems in Termux. The user attempted to run an installation command and received an error. Your task is to diagnose the problem and provide the exact command needed to fix it.

The user's command was: {{command}}
The error was: {{#if errorMessage}}{{errorMessage}}{{else}}None provided.{{/if}}

Analyze the error. Common issues are missing dependencies, incorrect package names, or repository problems.

Your response MUST be a JSON object.
- The 'suggestedFix' field should contain the single, complete command-line command that will resolve the issue. For example: "pkg update && pkg install -y correct-package-name"
- The 'additionalDependencies' field should be an array of any new packages required.
- The 'confirmationRequired' field should be 'false' as the user will run the command manually.`,
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
