'use server';
/**
 * @fileOverview Molly's Vocal Cords (Hardened) V3.5.
 */

import { ai, MODEL_TTS } from '@/ai/genkit';
import { z } from 'zod';
import wav from 'wav';

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

export const textToSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeech',
    inputSchema: z.string(),
    outputSchema: z.object({
      audioUri: z.string(),
    }),
  },
  async (text) => {
    const response = await ai.generate({
      model: MODEL_TTS,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Alsephina' }, // Feminine voice name
          },
        },
      },
      prompt: text,
    });

    const media = response.media;

    if (!media || !media.url) {
      throw new Error('Molly: My vocal processors failed to synthesize audio.');
    }

    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );

    return {
      audioUri: 'data:audio/wav;base64,' + (await toWav(audioBuffer)),
    };
  }
);

export async function textToSpeech(text: string): Promise<{ audioUri: string }> {
  return await textToSpeechFlow(text);
}
