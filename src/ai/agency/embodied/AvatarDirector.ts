/**
 * @fileOverview Unified avatar frame compositor.
 *
 * Merges per-frame signals from three sources into a single AvatarFrame
 * consumed by MollyMesh on every render tick:
 *
 *   1. VoiceAvatarBridge   — emotional tone, jaw animation, speaking state
 *   2. RoboticsAvatarBridge — arm intent, neck target, task mood hint
 *   3. AvatarStateBridge    — network-state / cognitive-mood base expressions
 *
 * Priority for mood: voice emotion > robotics hint > DEFAULT
 * Priority for morphs: base → robotics → voice (voice wins conflicts)
 *
 * Usage:
 *   const director = new AvatarDirector();
 *   // From voice layer:
 *   director.voice.onEmotionalSignal(signal);
 *   director.voice.setSpeaking(true, clock.getElapsedTime());
 *   // From robotics layer:
 *   director.robotics.loadPlan(plan);
 *   // In useFrame:
 *   const frame = director.getFrame(state.clock.getElapsedTime());
 */

import {
  AvatarStateBridge,
  type FacialMorphOverrides,
  type CognitiveMood,
} from './AvatarStateBridge';
import { RoboticsAvatarBridge } from './RoboticsAvatarBridge';
import { VoiceAvatarBridge } from './VoiceAvatarBridge';
import { CircuitBreaker } from '@/ai/agency/security/CircuitBreaker';
import type { ArmGestureIntent } from './KinematicsCore';

export interface AvatarFrame {
  intent: ArmGestureIntent;
  morphOverrides: FacialMorphOverrides;
  neckPitch: number;
  neckYaw: number;
  mood: CognitiveMood;
}

export class AvatarDirector {
  /** Update robotics state via this bridge. */
  readonly robotics = new RoboticsAvatarBridge();
  /** Update voice state via this bridge. */
  readonly voice = new VoiceAvatarBridge();

  /** Override the cognitive mood directly (e.g. from auditCycle results). */
  moodOverride: CognitiveMood | null = null;

  /** Call once per render frame. Returns the merged avatar frame. */
  getFrame(elapsedTime: number): AvatarFrame {
    const networkState = CircuitBreaker.getInstance().getNetworkState();
    const roboticsFrame = this.robotics.getMotionFrame(elapsedTime);
    const voiceFrame = this.voice.getFrame(elapsedTime);

    // Mood resolution: explicit override → voice emotion → robotics hint
    const mood: CognitiveMood =
      this.moodOverride ??
      (voiceFrame.mood !== 'DEFAULT'
        ? voiceFrame.mood
        : roboticsFrame.moodHint);

    // Base morphs from network state + resolved mood
    const base = AvatarStateBridge.getExpressionModifiers(
      networkState,
      mood,
      elapsedTime
    );

    // Merge voice morph deltas on top; jaw open takes the maximum of both sources
    const morphOverrides: FacialMorphOverrides = {
      ...base,
      ...voiceFrame.morphDeltas,
      jawOpen: Math.max(base.jawOpen ?? 0, voiceFrame.speakingIntensity),
    };

    return {
      intent: roboticsFrame.intent,
      morphOverrides,
      neckPitch: roboticsFrame.neckPitch,
      neckYaw: roboticsFrame.neckYaw,
      mood,
    };
  }
}
