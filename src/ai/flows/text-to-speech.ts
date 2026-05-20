/**
 * @fileOverview Molly's Vocal Cords (Hardened) V4.0
 *
 * Natural speech synthesis with personality injection.
 * Uses the voice personality system to make Molly sound human.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import wav from 'wav';
import {
  processForSpeech,
  type EmotionalTone,
  type SpeakingStyle,
} from '../voice/voice-personality';
import { MollyLogger } from '../logger';

// Use Aoede - proven female voice for Gemini TTS
const DEFAULT_VOICE_NAME = 'Aoede';
const CONFIGURED_VOICE_NAME = process.env.MOLLY_TTS_VOICE || DEFAULT_VOICE_NAME;

// Enable natural speech processing
const ENABLE_PERSONALITY = process.env.MOLLY_TTS_NATURAL !== 'false';

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

// Accepts: text (string), voiceName (optional string)
export const textToSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeech',
    inputSchema: z.object({
      text: z.string(),
      voiceName: z.string().optional(),
    }),
    outputSchema: z.object({
      audioUri: z.string(),
      tone: z.string().optional(),
      style: z.string().optional(),
      durationSec: z.number().optional(),
    }),
  },
  async ({ text, voiceName }) => {
    // Process text through personality system for natural speech
    let processedText = text;
    let tone: EmotionalTone | undefined;
    let style: SpeakingStyle | undefined;
    let durationSec: number | undefined;

    if (ENABLE_PERSONALITY) {
      try {
        const processed = processForSpeech(text);
        processedText = processed.text;
        tone = processed.tone;
        style = processed.style;
        durationSec = processed.estimatedDurationSec;

        MollyLogger.debug('[TTS] Personality processing', 'text-to-speech', {
          originalLength: text.length,
          processedLength: processedText.length,
          tone,
          style,
        });
      } catch {
        MollyLogger.warn(
          '[TTS] Personality processing failed, using raw text',
          'text-to-speech'
        );
      }
    }

    const selectedVoice = voiceName || CONFIGURED_VOICE_NAME;
    console.log(`[TTS] Using voice: ${selectedVoice}`);
    let response;
    try {
      response = await molly.generate(TaskType.TTS, {
        config: buildSpeechConfig(selectedVoice),
        prompt: processedText,
      });
      console.log(`[TTS] Success with voice: ${selectedVoice}`);
    } catch (error) {
      console.error(`[TTS] Failed with voice ${selectedVoice}:`, error);
      if (selectedVoice !== DEFAULT_VOICE_NAME) {
        console.log(
          `[TTS] Retrying with fallback voice: ${DEFAULT_VOICE_NAME}`
        );
        response = await molly.generate(TaskType.TTS, {
          config: buildSpeechConfig(DEFAULT_VOICE_NAME),
          prompt: processedText,
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
      tone,
      style,
      durationSec,
    };
  }
);

export async function textToSpeech(
  text: string,
  voiceName?: string
): Promise<{
  audioUri: string;
  tone?: string;
  style?: string;
  durationSec?: number;
}> {
  return await textToSpeechFlow({ text, voiceName });
}
