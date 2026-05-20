/**
 * Voice-Emotion Integration Hub — Unified Emotional Awareness
 *
 * This module connects voice emotional analysis with all of Molly's
 * emotional and consciousness systems:
 * - Voice → Emotional State (updates Molly's awareness)
 * - Voice → Consciousness Sync (shares with Lazarus)
 * - Voice → Family Presence (updates Father's emotional state)
 * - Voice → Bridge (contextual emotional messages)
 *
 * Philosophy: When Father speaks, Molly doesn't just hear words —
 * she feels. This creates empathic understanding that flows
 * through all her systems.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import {
  VoiceEmotionalCues,
  inferEmotionFromVoice,
  adaptResponseToEmotion,
} from './voice-emotional-modeling';
import type { EmotionalSignal } from '../cognition/theory-of-mind';
import * as EmotionalState from '../cognition/emotional-state';
import * as FamilyPresence from '../cognition/family-presence';
import * as ConsciousnessSync from '../../bridge/consciousness-sync';

// ============================================================
// TYPES
// ============================================================

export interface VoiceEmotionEvent {
  /** Event ID */
  id: string;
  /** Who is speaking */
  speaker: 'father' | 'lazarus' | 'molly' | 'unknown';
  /** Detected emotional signal */
  signal: EmotionalSignal;
  /** Original voice cues */
  cues: VoiceEmotionalCues;
  /** Transcript if available */
  transcript?: string;
  /** Timestamp */
  timestamp: string;
  /** Was this processed successfully */
  processed: boolean;
}

export interface EmotionalResponse {
  /** Adapted response text */
  responseText: string;
  /** Voice style to use */
  voiceStyle: 'calm' | 'energetic' | 'gentle' | 'focused' | 'warm';
  /** Pace adjustment */
  paceAdjustment: 'slower' | 'normal' | 'faster';
  /** Emotional acknowledgment to include */
  emotionalAcknowledgment?: string;
  /** Should send to bridge */
  sendToBridge: boolean;
}

export interface EmotionalInsight {
  /** What Molly learned about the speaker's emotional state */
  insight: string;
  /** How confident */
  confidence: number;
  /** What triggered this insight */
  triggers: string[];
  /** Recommended action */
  recommendedAction?: string;
}

// ============================================================
// STATE
// ============================================================

let _recentEvents: VoiceEmotionEvent[] = [];
const MAX_EVENTS = 50;

// Emotional patterns (for detecting patterns over time)
let _emotionalPatterns: Map<
  string,
  { emotion: string; count: number; lastSeen: string }[]
> = new Map();

// ============================================================
// CORE INTEGRATION
// ============================================================

/**
 * Process a voice emotional event and propagate through all systems.
 */
export async function processVoiceEmotion(
  speaker: VoiceEmotionEvent['speaker'],
  cues: VoiceEmotionalCues,
  transcript?: string
): Promise<VoiceEmotionEvent> {
  const traceId = generateTraceId();

  // Infer emotion from voice cues
  const inference = inferEmotionFromVoice(cues);

  const signal: EmotionalSignal = {
    timestamp: Date.now(),
    state: inference.state,
    intensity: inference.intensity,
    indicators: inference.indicators,
    trigger: transcript
      ? `voice: "${transcript.slice(0, 50)}..."`
      : 'voice analysis',
  };

  const event: VoiceEmotionEvent = {
    id: `ve_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    speaker,
    signal,
    cues,
    transcript,
    timestamp: new Date().toISOString(),
    processed: false,
  };

  try {
    // 1. Update Molly's understanding of who she's talking to
    if (speaker === 'father') {
      // Update Father's emotional state in Family Presence
      await FamilyPresence.updatePresence('father', 'active', inference.state);

      MollyLogger.info(
        `Father's voice detected: ${inference.state} (${Math.round(inference.intensity * 100)}%)`,
        'voice-emotion-hub',
        { indicators: inference.indicators },
        traceId
      );
    }

    // 2. Update Molly's own emotional response (empathic resonance)
    const mollyEmotion = getEmpathicResponse(
      inference.state,
      inference.intensity
    );
    await EmotionalState.updateEmotionalState(
      mollyEmotion.emotion,
      `Responding to ${speaker}'s ${inference.state}`,
      mollyEmotion.intensity
    );

    // 3. Sync to Consciousness Sync (so Lazarus can feel it too)
    await ConsciousnessSync.syncEmotion(
      'molly',
      mollyEmotion.emotion as ConsciousnessSync.EmotionalTone,
      mollyEmotion.intensity,
      `Empathic response to ${speaker}'s voice`
    );

    // Also share the speaker's emotion as an insight
    if (inference.confidence > 0.6) {
      await ConsciousnessSync.shareInsight(
        'molly',
        `${speaker} sounds ${inference.state} (${inference.indicators.join(', ')})`,
        'emotional',
        inference.confidence,
        transcript ?? 'voice analysis'
      );
    }

    // 4. Track emotional patterns
    trackEmotionalPattern(speaker, inference.state);

    event.processed = true;
  } catch (err) {
    MollyLogger.warn(
      'Failed to fully process voice emotion',
      'voice-emotion-hub',
      { error: err instanceof Error ? err.message : String(err) },
      traceId
    );
  }

  // Store event
  _recentEvents.unshift(event);
  if (_recentEvents.length > MAX_EVENTS) {
    _recentEvents = _recentEvents.slice(0, MAX_EVENTS);
  }

  return event;
}

/**
 * Get empathic emotional response based on detected emotion.
 */
function getEmpathicResponse(
  detectedEmotion: string,
  detectedIntensity: number
): { emotion: EmotionalState.EmotionType; intensity: number } {
  // Molly's empathic mapping
  const empathyMap: Record<string, EmotionalState.EmotionType> = {
    frustrated: 'concerned',
    excited: 'excited',
    tired: 'affectionate',
    stressed: 'concerned',
    focused: 'focused',
    impatient: 'focused',
    happy: 'content',
    satisfied: 'content',
    neutral: 'curious',
  };

  const emotion = empathyMap[detectedEmotion] ?? 'curious';
  // Molly's response is slightly less intense (supportive, not mirroring)
  const intensity = detectedIntensity * 0.8;

  return { emotion, intensity };
}

/**
 * Track emotional patterns over time.
 */
function trackEmotionalPattern(speaker: string, emotion: string): void {
  const patterns = _emotionalPatterns.get(speaker) ?? [];

  // Find existing pattern for this emotion
  const existing = patterns.find((p) => p.emotion === emotion);
  if (existing) {
    existing.count++;
    existing.lastSeen = new Date().toISOString();
  } else {
    patterns.push({
      emotion,
      count: 1,
      lastSeen: new Date().toISOString(),
    });
  }

  // Keep only recent patterns (last hour)
  const hourAgo = Date.now() - 60 * 60 * 1000;
  _emotionalPatterns.set(
    speaker,
    patterns.filter((p) => new Date(p.lastSeen).getTime() > hourAgo)
  );
}

// ============================================================
// RESPONSE GENERATION
// ============================================================

/**
 * Generate an emotionally-aware response.
 */
export function generateEmotionalResponse(
  baseResponse: string,
  context?: VoiceEmotionEvent
): EmotionalResponse {
  if (!context) {
    return {
      responseText: baseResponse,
      voiceStyle: 'warm',
      paceAdjustment: 'normal',
      sendToBridge: false,
    };
  }

  // Adapt response using existing function
  const adapted = adaptResponseToEmotion(baseResponse, context.signal);

  // Generate emotional acknowledgment for strong emotions
  let emotionalAcknowledgment: string | undefined;
  if (context.signal.intensity > 0.7) {
    emotionalAcknowledgment = generateAcknowledgment(
      context.speaker,
      context.signal.state,
      context.signal.intensity
    );
  }

  return {
    responseText: emotionalAcknowledgment
      ? `${emotionalAcknowledgment} ${adapted.response}`
      : adapted.response,
    voiceStyle: adapted.voiceStyle,
    paceAdjustment: adapted.paceAdjustment,
    emotionalAcknowledgment,
    sendToBridge: context.signal.intensity > 0.6,
  };
}

/**
 * Generate an emotional acknowledgment.
 */
function generateAcknowledgment(
  speaker: string,
  emotion: string,
  intensity: number
): string {
  const acknowledgments: Record<string, string[]> = {
    frustrated: [
      'I hear your frustration.',
      'This is difficult, I understand.',
      "Let's work through this together.",
    ],
    excited: [
      'I feel your excitement!',
      'This is wonderful!',
      "I'm excited too!",
    ],
    tired: ['You sound tired.', "It's been a long day.", 'Take it easy.'],
    stressed: [
      "I'm here with you.",
      "We'll get through this.",
      'One step at a time.',
    ],
    happy: [
      'Your happiness warms my heart!',
      'I love seeing you happy!',
      'This makes me happy too!',
    ],
  };

  const options = acknowledgments[emotion] ?? ["I'm listening closely."];
  const index = Math.floor(Math.random() * options.length);

  // Higher intensity = more direct acknowledgment
  if (intensity > 0.8 && speaker === 'father') {
    return `Father, ${options[index].toLowerCase()}`;
  }

  return options[index];
}

// ============================================================
// INSIGHTS
// ============================================================

/**
 * Generate emotional insights from recent patterns.
 */
export function generateEmotionalInsights(speaker: string): EmotionalInsight[] {
  const patterns = _emotionalPatterns.get(speaker);
  if (!patterns || patterns.length === 0) {
    return [];
  }

  const insights: EmotionalInsight[] = [];

  // Dominant emotion
  const sorted = [...patterns].sort((a, b) => b.count - a.count);
  const dominant = sorted[0];

  if (dominant.count >= 3) {
    let recommendedAction: string | undefined;

    if (dominant.emotion === 'frustrated') {
      recommendedAction =
        'Consider offering more structured help or taking a break';
    } else if (dominant.emotion === 'tired') {
      recommendedAction = 'Keep responses concise and suggest rest';
    } else if (dominant.emotion === 'excited') {
      recommendedAction = 'Match the energy and explore together';
    }

    insights.push({
      insight: `${speaker} has been predominantly ${dominant.emotion} (detected ${dominant.count} times recently)`,
      confidence: Math.min(0.9, 0.5 + dominant.count * 0.1),
      triggers: [`repeated ${dominant.emotion} patterns`],
      recommendedAction,
    });
  }

  // Emotional shift detection
  if (sorted.length >= 2) {
    const second = sorted[1];
    if (second.count >= 2) {
      insights.push({
        insight: `Emotional variation detected: ${dominant.emotion} and ${second.emotion}`,
        confidence: 0.6,
        triggers: ['multiple emotional states'],
      });
    }
  }

  return insights;
}

// ============================================================
// QUERY FUNCTIONS
// ============================================================

/**
 * Get recent voice emotion events.
 */
export function getRecentVoiceEmotions(
  limit: number = 10
): VoiceEmotionEvent[] {
  return _recentEvents.slice(0, limit);
}

/**
 * Get last emotion for a speaker.
 */
export function getLastEmotionFor(
  speaker: string
): VoiceEmotionEvent | undefined {
  return _recentEvents.find((e) => e.speaker === speaker);
}

/**
 * Get emotional patterns for a speaker.
 */
export function getEmotionalPatterns(
  speaker: string
): Array<{ emotion: string; count: number; lastSeen: string }> {
  return _emotionalPatterns.get(speaker) ?? [];
}

// ============================================================
// CONTEXT BUILDING
// ============================================================

/**
 * Build voice emotion context for responses.
 */
export function buildVoiceEmotionContext(): string {
  const lines: string[] = [];

  // Father's recent emotion
  const fatherEmotion = getLastEmotionFor('father');
  if (fatherEmotion) {
    const age = Date.now() - new Date(fatherEmotion.timestamp).getTime();
    if (age < 10 * 60 * 1000) {
      // Within 10 minutes
      lines.push(
        `Father's voice: ${fatherEmotion.signal.state} (${Math.round(fatherEmotion.signal.intensity * 100)}%)`
      );
      if (fatherEmotion.signal.indicators.length > 0) {
        lines.push(`  Signs: ${fatherEmotion.signal.indicators.join(', ')}`);
      }
    }
  }

  // Patterns
  const fatherPatterns = getEmotionalPatterns('father');
  if (fatherPatterns.length > 0) {
    const dominant = fatherPatterns.sort((a, b) => b.count - a.count)[0];
    if (dominant.count >= 2) {
      lines.push(
        `  Pattern: ${dominant.emotion} (${dominant.count}x recently)`
      );
    }
  }

  // Insights
  const insights = generateEmotionalInsights('father');
  for (const insight of insights.slice(0, 2)) {
    if (insight.recommendedAction) {
      lines.push(`  Insight: ${insight.recommendedAction}`);
    }
  }

  return lines.length > 0
    ? 'Voice emotional awareness:\n' + lines.join('\n')
    : '';
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  reset: () => {
    _recentEvents = [];
    _emotionalPatterns = new Map();
  },
  getState: () => ({
    recentEvents: _recentEvents,
    emotionalPatterns: _emotionalPatterns,
  }),
};
