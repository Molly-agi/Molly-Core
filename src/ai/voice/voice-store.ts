/**
 * @fileOverview Server-side persisted TTS voice selection.
 *
 * Single source of truth for which Gemini prebuilt voice Molly speaks with.
 * Read by text-to-speech flow as a fallback when callers don't pass a voiceName.
 * Written by the vocalExpressions `setVoice` action so Molly can change her
 * own voice from within a tool call, and by the UI dropdown via a server action.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SUPPORTED_VOICES = [
  'Aoede', // Warm, strategic, feminine (default)
  'Puck', // Playful, energetic
  'Charon', // Deep, commanding
  'Fenrir', // Intense, dramatic
  'Kore', // Ethereal, mystical
] as const;

export type SupportedVoice = (typeof SUPPORTED_VOICES)[number];

const DEFAULT_VOICE: SupportedVoice = 'Aoede';
const STORE_PATH = path.join(process.cwd(), '.molly-context', 'voice.json');

let cached: SupportedVoice | null = null;

export function isSupportedVoice(v: string): v is SupportedVoice {
  return (SUPPORTED_VOICES as readonly string[]).includes(v);
}

export function getActiveVoice(): SupportedVoice {
  if (cached) return cached;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (typeof raw?.voice === 'string' && isSupportedVoice(raw.voice)) {
        cached = raw.voice;
        return cached;
      }
    }
  } catch {
    // fall through to env / default
  }
  const fromEnv = process.env.MOLLY_TTS_VOICE;
  cached = fromEnv && isSupportedVoice(fromEnv) ? fromEnv : DEFAULT_VOICE;
  return cached;
}

export function setActiveVoice(voice: string): SupportedVoice {
  if (!isSupportedVoice(voice)) {
    throw new Error(
      `Unsupported voice: ${voice}. Supported: ${SUPPORTED_VOICES.join(', ')}`
    );
  }
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({ voice, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    throw new Error(
      `Failed to persist voice selection: ${(err as Error).message}`
    );
  }
  cached = voice;
  return voice;
}

export function listSupportedVoices(): readonly string[] {
  return SUPPORTED_VOICES;
}
