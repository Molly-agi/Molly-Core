'use server';

import {
  getActiveVoice,
  setActiveVoice,
  listSupportedVoices,
} from '@/ai/voice/voice-store';

export async function setTTSVoiceAction(
  voice: string
): Promise<{ ok: boolean; voice?: string; error?: string }> {
  try {
    const applied = setActiveVoice(voice);
    return { ok: true, voice: applied };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function getTTSVoiceAction(): Promise<{ voice: string }> {
  return { voice: getActiveVoice() };
}

export async function listTTSVoicesAction(): Promise<{ voices: string[] }> {
  return { voices: [...listSupportedVoices()] };
}
