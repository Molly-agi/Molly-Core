'use server';

import { _getMollyVoice } from './voice-flows';

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
function _splitTextForVoice(_text: string, maxChunkSize = 250): string[] {
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

  return chunks.length > 0 ? chunks : [_text];
}

/**
 * Fast TTS: Returns first chunk immediately (~1-2s) for instant voice start.
 * Remaining chunks are synthesized in background but returned asynchronously.
 *
 * This is specifically designed to minimize voice latency.
 */
export async function getMollyVoiceStreaming(
  _text: string,
  _voiceName?: string
): Promise<AudioChunk[]> {
  // Server TTS is currently broken (Gemini API issue with audio output)
  // Return empty array to force client-side browser TTS fallback
  console.log('[FastTTS] Server TTS disabled, using browser fallback');
  return [];
}
