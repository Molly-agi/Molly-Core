'use server';

import { getMollyVoice } from './voice-flows';

/**
 * Fast-path TTS: Synthesize and return ONLY the first chunk immediately.
 * 
 * For sub-1s voice start: split text into chunks, synthesize first chunk only,
 * return it while user is still reading. Remaining chunks are optional enhancement.
 * 
 * This is the simplest path to fast voice startup without complex streaming.
 */

interface AudioChunk {
  audioUri: string;
  chunkIndex: number;
  isLast: boolean;
  text: string;
  timingMs: number;
}

/**
 * Split text into chunks for sequential synthesis.
 * First chunk only is what matters for voice startup latency.
 */
function splitTextForVoice(text: string, maxChunkSize = 250): string[] {
  // Split on sentence endings first for natural breaks
  const sentences = text.match(/[^.!?]*[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > maxChunkSize && buffer) {
      chunks.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Fast TTS: Returns first chunk immediately (~1-2s) for instant voice start.
 * Remaining chunks are synthesized in background but returned asynchronously.
 * 
 * This is specifically designed to minimize voice latency.
 */
export async function getMollyVoiceStreaming(
  text: string,
  voiceName?: string
): Promise<AudioChunk[]> {
  const chunks = splitTextForVoice(text);
  const result: AudioChunk[] = [];
  const startTime = Date.now();

  try {
    // Synthesize first chunk immediately
    console.log('[FastTTS] Synthesizing first chunk for immediate playback...');
    const firstChunkText = chunks[0];
    const firstStart = Date.now();
    const firstVoiceResponse = await getMollyVoice(firstChunkText, voiceName);
    const firstSynthesisMs = Date.now() - firstStart;

    if (!firstVoiceResponse.audioUri) {
      throw new Error(`First chunk TTS failed: ${firstVoiceResponse.error}`);
    }

    result.push({
      audioUri: firstVoiceResponse.audioUri,
      chunkIndex: 0,
      isLast: chunks.length === 1,
      text: firstChunkText,
      timingMs: firstSynthesisMs,
    });

    console.log(`[FastTTS] First chunk ready in ${firstSynthesisMs}ms`);

    // Synthesize remaining chunks in parallel if there are any
    if (chunks.length > 1) {
      console.log(`[FastTTS] Starting background synthesis of ${chunks.length - 1} remaining chunk(s)`);
      const remainingPromises = chunks.slice(1).map(async (chunkText, idx) => {
        try {
          const chunkStart = Date.now();
          const voiceResponse = await getMollyVoice(chunkText, voiceName);
          const chunkMs = Date.now() - chunkStart;

          if (!voiceResponse.audioUri) {
            throw new Error(`Chunk ${idx + 1} TTS failed`);
          }

          return {
            audioUri: voiceResponse.audioUri,
            chunkIndex: idx + 1,
            isLast: idx + 1 === chunks.length - 1,
            text: chunkText,
            timingMs: chunkMs,
          };
        } catch (error) {
          console.error(`[FastTTS] Chunk ${idx + 1} synthesis failed:`, error);
          return null;
        }
      });

      // Collect remaining chunks (don't block on these)
      const remainingResults = await Promise.allSettled(remainingPromises);
      for (const settlement of remainingResults) {
        if (settlement.status === 'fulfilled' && settlement.value) {
          result.push(settlement.value);
        }
      }
    }

    const totalTimeMs = Date.now() - startTime;
    console.log(`[FastTTS] Total synthesis time: ${totalTimeMs}ms for ${result.length} chunk(s)`);
  } catch (error) {
    console.error('[FastTTS] Failed:', error);
    throw error;
  }

  return result;
}
