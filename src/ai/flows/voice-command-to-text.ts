'use server';

/**
 * @fileOverview Converts voice commands to text for Termux execution.
 *
 * - voiceCommandToText - A function that converts voice commands to text.
 * - VoiceCommandToTextInput - The input type for the voiceCommandTo-text function.
 * - VoiceCommandToTextOutput - The return type for the voiceCommandToText function.
 */

import {ai} from '@/ai/genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {z} from 'genkit';

const VoiceCommandToTextInputSchema = z.object({
  voiceDataUri: z
    .string()
    .describe(
      "The voice command as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});

export type VoiceCommandToTextInput = z.infer<typeof VoiceCommandToTextInputSchema>;

const VoiceCommandToTextOutputSchema = z.object({
  textCommand: z.string().describe('The converted text command for Termux execution.'),
});

export type VoiceCommandToTextOutput = z.infer<typeof VoiceCommandToTextOutputSchema>;

export async function voiceCommandToText(input: VoiceCommandToTextInput): Promise<VoiceCommandToTextOutput> {
  return voiceCommandToTextFlow(input);
}

const voiceCommandToTextPrompt = ai.definePrompt({
  name: 'voiceCommandToTextPrompt',
  model: googleAI.model('gemini-1.5-pro-latest'),
  input: {schema: VoiceCommandToTextInputSchema},
  output: {schema: VoiceCommandToTextOutputSchema},
  prompt: `You are an AI assistant that translates natural language voice commands into executable Termux shell commands.

Your task is to listen to the provided audio and convert it into a single, executable Termux command. The output MUST be a JSON object containing the command.

For example:
- If the user says "list all the files in detail", your output should be {"textCommand": "ls -la"}.
- If they say "update all my packages", your output should be {"textCommand": "pkg update && pkg upgrade -y"}.

Translate the following voice command into a single Termux command:

{{media url=voiceDataUri}}
  `,
});

const voiceCommandToTextFlow = ai.defineFlow(
  {
    name: 'voiceCommandToTextFlow',
    inputSchema: VoiceCommandToTextInputSchema,
    outputSchema: VoiceCommandToTextOutputSchema,
  },
  async input => {
    const {output} = await voiceCommandToTextPrompt(input);
    return output!;
  }
);
