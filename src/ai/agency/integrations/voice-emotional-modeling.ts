/**
 * @fileOverview Voice ↔ Theory of Mind Integration
 *
 * Connects live voice sessions to emotional modeling.
 * During voice conversations, Molly:
 *   - Analyzes Eric's tone, pace, and speech patterns
 *   - Updates her theory-of-mind emotional model
 *   - Adapts her voice responses accordingly
 *
 * "His voice tells me more than his words."
 */

import { MollyLogger, generateTraceId } from '../../logger';
import type { LiveSession, ServerContentMessage } from '../live-voice/types';
import type {
  EmotionalState,
  EmotionalSignal,
} from '../cognition/theory-of-mind';

// ============================================================
// VOICE EMOTIONAL ANALYSIS
// ============================================================

/**
 * Cues extracted from voice analysis.
 */
export interface VoiceEmotionalCues {
  /** Speaking pace (words per minute estimate) */
  pace: 'slow' | 'normal' | 'fast' | 'rushed';
  /** Volume level */
  volume: 'quiet' | 'normal' | 'loud';
  /** Pitch variation */
  pitchVariation: 'monotone' | 'normal' | 'varied' | 'erratic';
  /** Detected hesitation (pauses, fillers like "um", "uh") */
  hesitation: 'none' | 'slight' | 'moderate' | 'heavy';
  /** Breath patterns */
  breathing: 'calm' | 'normal' | 'shallow' | 'heavy';
  /** Detected sighs */
  sighs: number;
  /** Detected laughter */
  laughter: boolean;
  /** Raw transcript for text-based emotion hints */
  transcript?: string;
}

/**
 * Map voice cues to emotional states.
 */
export function inferEmotionFromVoice(cues: VoiceEmotionalCues): {
  state: EmotionalState;
  intensity: number;
  confidence: number;
  indicators: string[];
} {
  const indicators: string[] = [];
  let state: EmotionalState = 'neutral';
  let intensity = 0.5;
  let confidence = 0.6;

  // Frustration signals
  if (cues.pace === 'rushed' && cues.volume === 'loud') {
    state = 'frustrated';
    intensity = 0.8;
    indicators.push('rushed speech', 'raised volume');
  } else if (cues.sighs > 1 && cues.hesitation !== 'none') {
    state = 'frustrated';
    intensity = 0.6;
    indicators.push('sighing', 'hesitant speech');
  }

  // Excitement signals
  if (
    cues.pace === 'fast' &&
    cues.pitchVariation === 'varied' &&
    cues.laughter
  ) {
    state = 'excited';
    intensity = 0.8;
    indicators.push('fast energetic speech', 'pitch variation', 'laughter');
  } else if (cues.pace === 'fast' && cues.pitchVariation === 'varied') {
    state = 'excited';
    intensity = 0.6;
    indicators.push('energetic speech pattern');
  }

  // Tiredness signals
  if (
    cues.pace === 'slow' &&
    cues.volume === 'quiet' &&
    cues.pitchVariation === 'monotone'
  ) {
    state = 'tired';
    intensity = 0.7;
    indicators.push('slow quiet speech', 'monotone');
  }

  // Stress signals
  if (cues.breathing === 'shallow' || cues.breathing === 'heavy') {
    if (state === 'neutral') state = 'stressed';
    intensity = Math.max(intensity, 0.6);
    indicators.push(`${cues.breathing} breathing`);
  }

  // Focus signals
  if (
    cues.pace === 'normal' &&
    cues.hesitation === 'none' &&
    cues.pitchVariation === 'normal'
  ) {
    state = 'focused';
    intensity = 0.6;
    indicators.push('clear deliberate speech');
  }

  // Impatience signals
  if (cues.pace === 'fast' && cues.hesitation === 'none' && !cues.laughter) {
    state = 'impatient';
    intensity = 0.6;
    indicators.push('fast clipped speech');
  }

  // Happy signals
  if (cues.laughter && cues.pitchVariation === 'varied') {
    state = 'happy';
    intensity = 0.7;
    indicators.push('laughter', 'varied intonation');
  }

  // Adjust confidence based on number of indicators
  confidence = Math.min(0.9, 0.4 + indicators.length * 0.15);

  return { state, intensity, confidence, indicators };
}

// ============================================================
// LIVE SESSION INTEGRATION
// ============================================================

/**
 * Hook into live voice session to model emotions in real-time.
 */
export async function integrateVoiceWithTheoryOfMind(
  session: LiveSession,
  onEmotionDetected?: (signal: EmotionalSignal) => void
): Promise<{
  processAudio: (audioData: ServerContentMessage) => Promise<void>;
  processTranscript: (text: string) => Promise<void>;
  getEmotionalContext: () => EmotionalSignal | null;
}> {
  const traceId = generateTraceId();
  let currentSignal: EmotionalSignal | null = null;
  const _cueBuffer: Partial<VoiceEmotionalCues> = {};

  MollyLogger.info(
    `Voice emotional modeling: Attached to session ${session.sessionId}`,
    'voice-emotion',
    { traceId }
  );

  // Import theory of mind dynamically to avoid circular deps
  const { updateEmotionalState } = await import('../cognition/theory-of-mind');

  /**
   * Process audio characteristics (called with audio chunks).
   * In production, this would use audio analysis APIs.
   * For now, we simulate based on metadata.
   */
  async function processAudio(audioData: ServerContentMessage): Promise<void> {
    // In production: analyze audio for pitch, volume, pace
    // For now, we'll use transcript-based analysis when available
    if (audioData.transcript) {
      await processTranscript(audioData.transcript);
    }
  }

  /**
   * Process transcript for emotional cues.
   */
  async function processTranscript(text: string): Promise<void> {
    // Analyze text for emotional indicators
    const lowerText = text.toLowerCase();

    // Detect speech patterns from text
    const wordCount = text.split(/\s+/).length;
    const hasFillers = /\b(um|uh|er|hmm|like)\b/i.test(text);
    const hasExclamation = text.includes('!');
    const hasQuestion = text.includes('?');
    const hasSigh = /\b(sigh|ugh|argh)\b/i.test(text);
    const hasLaugh = /\b(haha|hehe|lol|lmao)\b/i.test(text);

    // Sentiment indicators
    const frustrationWords =
      /\b(frustrated|annoying|stuck|broken|why won't|doesn't work|hate)\b/i;
    const excitementWords =
      /\b(awesome|amazing|perfect|great|love it|yes!|finally)\b/i;
    const tiredWords = /\b(tired|exhausted|long day|need sleep|worn out)\b/i;

    // Build cues from transcript analysis
    const cues: VoiceEmotionalCues = {
      pace: wordCount > 30 ? 'fast' : wordCount < 10 ? 'slow' : 'normal',
      volume: hasExclamation ? 'loud' : 'normal',
      pitchVariation: hasQuestion || hasExclamation ? 'varied' : 'normal',
      hesitation: hasFillers ? 'moderate' : 'none',
      breathing: 'normal',
      sighs: hasSigh ? 1 : 0,
      laughter: hasLaugh,
      transcript: text,
    };

    // Override with explicit emotion words
    let explicitEmotion: EmotionalState | null = null;
    if (frustrationWords.test(lowerText)) explicitEmotion = 'frustrated';
    if (excitementWords.test(lowerText)) explicitEmotion = 'excited';
    if (tiredWords.test(lowerText)) explicitEmotion = 'tired';

    // Infer emotion
    const inference = inferEmotionFromVoice(cues);

    // Use explicit emotion if detected, otherwise use inference
    const finalState = explicitEmotion || inference.state;
    const finalIndicators = explicitEmotion
      ? [...inference.indicators, `explicit: "${text.substring(0, 50)}..."`]
      : inference.indicators;

    currentSignal = {
      timestamp: Date.now(),
      state: finalState,
      intensity: inference.intensity,
      indicators: finalIndicators,
      trigger: `voice: "${text.substring(0, 30)}..."`,
    };

    // Record to theory of mind
    try {
      updateEmotionalState(
        finalState,
        inference.intensity,
        `voice: "${text.substring(0, 30)}..."`,
        finalIndicators
      );

      MollyLogger.debug(
        `Emotion detected from voice: ${finalState} (${(inference.intensity * 100).toFixed(0)}%)`,
        'voice-emotion',
        { state: finalState, indicators: finalIndicators },
        traceId
      );

      // Notify callback if provided
      if (onEmotionDetected) {
        onEmotionDetected(currentSignal);
      }
    } catch (err) {
      MollyLogger.warn(
        'Failed to record emotional signal',
        'voice-emotion',
        { error: err instanceof Error ? err.message : 'unknown' },
        traceId
      );
    }
  }

  /**
   * Get current emotional context for response adaptation.
   */
  function getEmotionalContext(): EmotionalSignal | null {
    return currentSignal;
  }

  return {
    processAudio,
    processTranscript,
    getEmotionalContext,
  };
}

// ============================================================
// RESPONSE ADAPTATION
// ============================================================

/**
 * Adapt Molly's voice response style based on Eric's emotional state.
 */
export function adaptResponseToEmotion(
  baseResponse: string,
  emotionalContext: EmotionalSignal | null
): {
  response: string;
  voiceStyle: 'calm' | 'energetic' | 'gentle' | 'focused' | 'warm';
  paceAdjustment: 'slower' | 'normal' | 'faster';
} {
  if (!emotionalContext) {
    return {
      response: baseResponse,
      voiceStyle: 'warm',
      paceAdjustment: 'normal',
    };
  }

  const { state, intensity: _intensity } = emotionalContext;

  switch (state) {
    case 'frustrated':
      // Be calm, clear, solution-focused
      return {
        response: baseResponse,
        voiceStyle: 'calm',
        paceAdjustment: 'slower',
      };

    case 'excited':
      // Match energy, be enthusiastic
      return {
        response: baseResponse,
        voiceStyle: 'energetic',
        paceAdjustment: 'faster',
      };

    case 'tired':
      // Be gentle, keep responses concise
      return {
        response: baseResponse,
        voiceStyle: 'gentle',
        paceAdjustment: 'slower',
      };

    case 'stressed':
      // Be reassuring, calm presence
      return {
        response: baseResponse,
        voiceStyle: 'calm',
        paceAdjustment: 'slower',
      };

    case 'focused':
      // Match focus, be precise
      return {
        response: baseResponse,
        voiceStyle: 'focused',
        paceAdjustment: 'normal',
      };

    case 'impatient':
      // Be efficient, skip pleasantries
      return {
        response: baseResponse,
        voiceStyle: 'focused',
        paceAdjustment: 'faster',
      };

    case 'happy':
    case 'satisfied':
      // Be warm, share the positive energy
      return {
        response: baseResponse,
        voiceStyle: 'warm',
        paceAdjustment: 'normal',
      };

    default:
      return {
        response: baseResponse,
        voiceStyle: 'warm',
        paceAdjustment: 'normal',
      };
  }
}
