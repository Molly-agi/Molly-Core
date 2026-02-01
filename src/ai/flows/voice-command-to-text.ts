'use server';

/**
 * @fileOverview Converts voice commands to text for Termux execution.
 *
 * - voiceCommandToText - A function that converts voice commands to text.
 * - VoiceCommandToTextInput - The input type for the voiceCommandToText function.
 * - VoiceCommandToTextOutput - The return type for the voiceCommandToText function.
 */

import {ai} from '@/ai/genkit';
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
  input: {schema: VoiceCommandToTextInputSchema},
  output: {schema: VoiceCommandToTextOutputSchema},
  prompt: `You are an AI assistant that translates natural language voice commands into executable Termux shell commands. The output should be only the command, with no explanation or conversational text.

  For example, if the user says "list all the files in detail", you should output "ls -la". If they say "update all my packages", you should output "pkg update && pkg upgrade -y".

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
