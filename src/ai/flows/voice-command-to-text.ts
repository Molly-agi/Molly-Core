
'use server';

/**
 * @fileOverview Converts voice commands to text for Termux execution.
 *
 * - voiceCommandToText - A function that converts voice commands to text.
 * - VoiceCommandToTextInput - The input type for the voiceCommandTo-text function.
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

const voiceCommandToTextFlow = ai.defineFlow(
  {
    name: 'voiceCommandToTextFlow',
    inputSchema: VoiceCommandToTextInputSchema,
    outputSchema: VoiceCommandToTextOutputSchema,
  },
  async ({ voiceDataUri }) => {
    const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash-latest',
        prompt: [
            { text: `You are an expert at translating natural language into Termux shell commands.
Listen to the audio and provide ONLY the executable command. Do not add any explanation or formatting.

Examples:
- User says "list the files": you output "ls -la"
- User says "update everything": you output "pkg update && pkg upgrade -y"

Translate the following audio:`},
            { media: { url: voiceDataUri } },
        ]
    });
    return { textCommand: response.text.trim() };
  }
);
