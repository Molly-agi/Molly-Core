'use server';

import { ai, MODEL_FLASH } from '@/ai/genkit';
import { z } from 'zod';

const voiceCommandToTextFlow = ai.defineFlow(
  {
    name: 'voiceCommandToText',
    inputSchema: z
      .string()
      .describe(
        "An audio recording as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
      ),
    outputSchema: z.string(),
  },
  async (audioData) => {
    const llmResponse = await ai.generate({
      model: MODEL_FLASH,
      prompt: [
        {
          text: 'Transcribe the following audio recording. The user is providing a voice command for a terminal assistant. Respond only with the transcribed text.',
        },
        { media: { url: audioData } },
      ],
    });

    return llmResponse.text;
  }
);

export async function voiceCommandToText(audioData: string): Promise<string> {
  return voiceCommandToTextFlow(audioData);
}
