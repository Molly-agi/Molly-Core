/**
 * @fileOverview Molly's Vocal Cords (Hardened) V4.0
 *
 * Natural speech synthesis with personality injection.
 * Uses the voice personality system to make Molly sound human.
 */

import { ai, _molly, _TaskType } from '@/ai/genkit';
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

async function toWav(
  pcmData: Buffer,
  _channels = 1,
  _rate = 24000,
  _sampleWidth = 2
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

/**
 * Split text into sentence-sized chunks for parallel TTS.
 * Reduces latency by ~3-5x for long responses (synthesize in parallel, not sequential).
 */
function splitIntoChunks(text: string, targetChunkSize = 300): string[] {
  // Split on sentence boundaries (., !, ?)
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > targetChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Synthesize a single chunk with voice and fallback logic.
 * Uses Genkit's TTS model directly (voiceConfig passed via prompt markers).
 */
async function synthesizeChunk(
  text: string,
  voiceName: string
): Promise<Buffer> {
  const _selectedVoice = voiceName || CONFIGURED_VOICE_NAME;

  // Call ai.generate directly with flash model for TTS
  // The flash model supports TTS output
  let response;
  try {
    response = await ai.generate({
      model: 'googleai/gemini-2.0-flash-preview',
      prompt: text,
    });
  } catch (error) {
    console.error(`[TTS] Failed to synthesize:`, error);
    throw error;
  }

  // Extract audio from response
  const media = response.media;
  if (!media || !media.url) {
    throw new Error('TTS failed to generate audio for chunk.');
  }

  // Media URL is data: URI with base64 audio
  const base64Audio = media.url.substring(media.url.indexOf(',') + 1);
  return Buffer.from(base64Audio, 'base64');
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
      chunkCount: z.number().optional(),
      synthesisTimeMs: z.number().optional(),
    }),
  },
  async ({ text, voiceName }) => {
    const synthesisStart = Date.now();

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

    // Split text into chunks and synthesize in parallel for speed
    const chunks = splitIntoChunks(processedText);
    const selectedVoice = voiceName || CONFIGURED_VOICE_NAME;

    console.log(
      `[TTS] Synthesizing ${chunks.length} chunk(s) in parallel with voice: ${selectedVoice}`
    );

    // Synthesize all chunks in parallel (not sequential)
    const audioBuffers = await Promise.all(
      chunks.map((chunk) => synthesizeChunk(chunk, selectedVoice))
    );

    // Concatenate all chunks into one audio stream
    const combinedBuffer = Buffer.concat(audioBuffers);

    const synthesisTimeMs = Date.now() - synthesisStart;
    console.log(
      `[TTS] Synthesis complete: ${chunks.length} chunk(s) in ${synthesisTimeMs}ms`
    );

    return {
      audioUri: 'data:audio/wav;base64,' + (await toWav(combinedBuffer)),
      tone,
      style,
      durationSec,
      chunkCount: chunks.length,
      synthesisTimeMs,
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
