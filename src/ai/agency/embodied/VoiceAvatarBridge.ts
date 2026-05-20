/**
 * @fileOverview Translates Molly's voice emotional signals into per-frame
 * avatar expression hints. Connects three existing voice modules:
 *
 *   - EmotionalSignal (theory-of-mind)  → CognitiveMood + morph deltas
 *   - EmotionalTone   (voice-personality) → morph deltas
 *   - Speaking state  (useTTS/useGeminiLive isVocalizing) → jaw animation
 *
 * Browser-safe — pure data transforms, no Node.js modules.
 */

import type {
  EmotionalSignal,
  EmotionalState,
} from '@/ai/agency/cognition/theory-of-mind';
import type { EmotionalTone } from '@/ai/voice/voice-personality';
import type { CognitiveMood, FacialMorphOverrides } from './AvatarStateBridge';

export interface VoiceAvatarFrame {
  mood: CognitiveMood;
  /** Morph overrides derived from voice emotion — merged on top of base morphs. */
  morphDeltas: Partial<FacialMorphOverrides>;
  /** 0–1 jaw open value while Molly is speaking. */
  speakingIntensity: number;
}

const EMOTION_TO_MOOD: Partial<Record<EmotionalState, CognitiveMood>> = {
  excited: 'SUCCESS_FOUND',
  happy: 'SUCCESS_FOUND',
  satisfied: 'SUCCESS_FOUND',
  focused: 'ANALYTICAL',
  curious: 'ANALYTICAL',
  impatient: 'ANALYTICAL',
  frustrated: 'SHOCK',
  stressed: 'SHOCK',
  // neutral/tired remain DEFAULT
};

const TONE_MORPHS: Partial<
  Record<EmotionalTone, Partial<FacialMorphOverrides>>
> = {
  warm: { mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
  excited: { mouthSmileLeft: 0.5, mouthSmileRight: 0.5, browInnerUp: 0.3 },
  playful: { mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },
  curious: { browInnerUp: 0.4, browDownLeft: 0.1, browDownRight: 0.1 },
  concerned: { browDownLeft: 0.5, browDownRight: 0.5 },
  thoughtful: { browDownLeft: 0.25, browDownRight: 0.25 },
  confident: { mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },
  apologetic: { browInnerUp: 0.4, browDownLeft: 0.2, browDownRight: 0.2 },
};

// Jaw oscillation while speaking: frequency (Hz) and max amplitude
const SPEAK_FREQ = 8.5;
const SPEAK_AMP = 0.55;

export class VoiceAvatarBridge {
  private mood: CognitiveMood = 'DEFAULT';
  private morphDeltas: Partial<FacialMorphOverrides> = {};
  private speaking = false;
  private speakingStartTime: number | null = null;

  /**
   * Call when VoiceEmotionHub or inferEmotionFromVoice produces a new signal.
   * The signal's state updates the cognitive mood; intensity scales the deltas.
   */
  onEmotionalSignal(signal: EmotionalSignal): void {
    this.mood = EMOTION_TO_MOOD[signal.state] ?? 'DEFAULT';
    const baseMorphs = TONE_MORPHS[signal.state as EmotionalTone] ?? {};
    // Scale morph deltas by signal intensity
    this.morphDeltas = Object.fromEntries(
      Object.entries(baseMorphs).map(([k, v]) => [
        k,
        (v as number) * signal.intensity,
      ])
    ) as Partial<FacialMorphOverrides>;
  }

  /**
   * Call when VoicePersonality.detectEmotionalTone() produces a tone for
   * Molly's outgoing response text.
   */
  onEmotionalTone(tone: EmotionalTone): void {
    this.morphDeltas = TONE_MORPHS[tone] ?? {};
  }

  /**
   * Call when useTTS.isVocalizing or useGeminiLive audio playback changes.
   * elapsedTime should be THREE.Clock.getElapsedTime() for sync with MollyMesh.
   */
  setSpeaking(speaking: boolean, elapsedTime: number): void {
    if (speaking && !this.speaking) {
      this.speakingStartTime = elapsedTime;
    }
    this.speaking = speaking;
  }

  getFrame(elapsedTime: number): VoiceAvatarFrame {
    let speakingIntensity = 0;
    if (this.speaking && this.speakingStartTime !== null) {
      const t = elapsedTime - this.speakingStartTime;
      // Sine-wave jaw oscillation — simple but reads as natural speech rhythm
      speakingIntensity = (Math.sin(t * SPEAK_FREQ) * 0.5 + 0.5) * SPEAK_AMP;
    }

    return {
      mood: this.mood,
      morphDeltas: this.morphDeltas,
      speakingIntensity,
    };
  }

  reset(): void {
    this.mood = 'DEFAULT';
    this.morphDeltas = {};
    this.speaking = false;
    this.speakingStartTime = null;
  }
}
