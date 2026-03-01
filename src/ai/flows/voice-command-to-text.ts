'use server';

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '@/ai/logger';

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
    const traceId = generateTraceId();

    // Validate audio data format
    if (!audioData || !audioData.startsWith('data:')) {
      MollyLogger.warn(
        'Invalid audio data format received',
        'voiceCommandToText',
        { traceId }
      );
      return ''; // Return empty string rather than failing
    }

    const mimeMatch = audioData.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch?.[1] ?? 'unknown';

    MollyLogger.info('Voice transcription requested', 'voiceCommandToText', {
      mimeType,
      dataSize: audioData.length,
      traceId,
    });

    try {
      const llmResponse = await molly.generate(TaskType.VISION, {
        prompt: [
          {
            text: 'Transcribe the following audio recording. Respond only with the transcribed text.',
          },
          { media: { url: audioData } },
        ],
      });

      if (!llmResponse?.text) {
        MollyLogger.warn('Empty transcription response', 'voiceCommandToText', {
          traceId,
        });
        return '';
      }

      MollyLogger.info('Voice transcription complete', 'voiceCommandToText', {
        mimeType,
        responseLength: llmResponse.text.length,
        traceId,
      });

      return llmResponse.text.trim();
    } catch (error) {
      MollyLogger.error(
        'Voice transcription failed',
        'voiceCommandToText',
        {},
        error,
        traceId
      );
      return ''; // Graceful degradation
    }
  }
);

export async function voiceCommandToText(audioData: string): Promise<string> {
  return voiceCommandToTextFlow(audioData);
}
