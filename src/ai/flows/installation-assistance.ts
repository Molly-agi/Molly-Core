'use server';

/**
 * @fileOverview An AI agent that assists with software installation in Termux.
 *
 * - installationAssistance - A function that handles the installation assistance process.
 * - InstallationAssistanceInput - The input type for the installationAssistance function.
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

export async function installationAssistance(
  input: InstallationAssistanceInput
): Promise<string> {
  return installationAssistanceFlow(input);
}

const installationAssistanceFlow = ai.defineFlow(
  {
    name: 'installationAssistanceFlow',
    inputSchema: InstallationAssistanceInputSchema,
    outputSchema: z.string(),
  },
  async ({ command, errorMessage }) => {
    const prompt = `You are an AI assistant helping users fix software installation problems in Termux. The user attempted to run an installation command and received an error. Your task is to provide ONLY the single, complete command-line command that will resolve the issue. Do not provide any explanation, preamble, or markdown formatting.

The user's original command was: ${command}
The error was: ${errorMessage || 'None provided.'}

Analyze the error. Common issues are missing dependencies, incorrect package names, or repository problems. Return only the corrected command. For example: "pkg update && pkg install -y correct-package-name"`;

    const response = await ai.generate({ prompt });
    return response.text.trim();
  }
);
