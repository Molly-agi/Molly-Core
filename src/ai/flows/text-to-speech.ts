/**
 * @fileOverview Molly's Vocal Cords (Hardened) V3.6.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import wav from 'wav';

// Use Aoede - proven female voice for Gemini TTS
const DEFAULT_VOICE_NAME = 'Aoede';
const CONFIGURED_VOICE_NAME = process.env.MOLLY_TTS_VOICE || DEFAULT_VOICE_NAME;

function buildSpeechConfig(voiceName: string) {
  return {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName },
      },
    },
  };
}

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

    const bufs = [] as Buffer[];
    writer.on('error', reject);
    writer.on('data', function (d: Buffer) {
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
    console.log(`[TTS] Using voice: ${CONFIGURED_VOICE_NAME}`);
    let response;
    try {
      response = await molly.generate(TaskType.TTS, {
        config: buildSpeechConfig(CONFIGURED_VOICE_NAME),
        prompt: text,
      });
      console.log(`[TTS] Success with voice: ${CONFIGURED_VOICE_NAME}`);
    } catch (error) {
      console.error(`[TTS] Failed with voice ${CONFIGURED_VOICE_NAME}:`, error);
      if (CONFIGURED_VOICE_NAME !== DEFAULT_VOICE_NAME) {
        console.log(
          `[TTS] Retrying with fallback voice: ${DEFAULT_VOICE_NAME}`
        );
        response = await molly.generate(TaskType.TTS, {
          config: buildSpeechConfig(DEFAULT_VOICE_NAME),
          prompt: text,
        });
        console.log(`[TTS] Success with fallback voice: ${DEFAULT_VOICE_NAME}`);
      } else {
        throw error;
      }
    }

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

export async function textToSpeech(
  text: string
): Promise<{ audioUri: string }> {
  return await textToSpeechFlow(text);
}
