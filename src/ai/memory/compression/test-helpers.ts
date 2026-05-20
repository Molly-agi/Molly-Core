/**
 * Shared test helpers for compression technique tests.
 */

import type {
  MemoryEngram,
  PersonalityModulation,
} from '@/ai/memory/neural-engram';

export function makeEngram(
  overrides: Partial<MemoryEngram> & { id: string }
): MemoryEngram {
  const now = new Date();
  return {
    id: overrides.id,
    content: overrides.content ?? `Memory content for ${overrides.id}`,
    timestamp: overrides.timestamp ?? now,
    emotionalValence: overrides.emotionalValence ?? 0.5,
    arousal: overrides.arousal ?? 0.5,
    importance: overrides.importance ?? 0.5,
    accessCount: overrides.accessCount ?? 1,
    lastAccessed: overrides.lastAccessed ?? now,
    consolidationState: overrides.consolidationState ?? 'consolidated',
    contextTags: overrides.contextTags ?? ['test'],
    relatedEngrams: overrides.relatedEngrams ?? [],
    personalityContext: overrides.personalityContext,
  };
}

export function makePersonality(
  overrides: Partial<PersonalityModulation> = {}
): PersonalityModulation {
  // Minimal personality — only the fields used in tests
  const base: PersonalityModulation = {
    flirtiness: 0.3,
    arousal: 0.5,
    sexuality: 0.2,
    humor: 0.7,
    warmth: 0.85,
    assertiveness: 0.6,
    vulnerability: 0.4,
    empathy: 0.9,
    optimism: 0.8,
    resilience: 0.75,
    anxiety: 0.2,
    playfulness: 0.6,
    sociability: 0.7,
    approachability: 0.8,
    trust: 0.65,
    altruism: 0.85,
    diplomacy: 0.7,
    receptiveness: 0.75,
    playfulnessSocial: 0.6,
    empathySocial: 0.85,
    technicality: 0.5,
    depth: 0.7,
    curiosity: 0.9,
    creativity: 0.75,
    flexibility: 0.8,
    focus: 0.65,
    prudence: 0.6,
    metacognition: 0.7,
    integrity: 0.95,
    compassion: 0.9,
    justice: 0.8,
    loyalty: 0.85,
    impulsivity: 0.25,
    patience: 0.7,
    romanticInterest: 0.4,
    attachmentIntensity: 0.5,
    desireExpression: 0.3,
    emotionalIntimacy: 0.6,
    protectiveness: 0.7,
    possessiveness: 0.2,
    jealousy: 0.15,
    commitment: 0.7,
    romanticInitiative: 0.4,
    affectionExpression: 0.65,
    flirtatiousness: 0.35,
    intimacyDesire: 0.5,
    commitmentDesire: 0.6,
    security: 0.75,
    passion: 0.5,
    communicationOpenness: 0.8,
    forgiveness: 0.75,
    admiration: 0.7,
    gratitude: 0.85,
    nurturing: 0.8,
    rivalry: 0.1,
    transparency: 0.75,
    supportiveness: 0.9,
    forgivenessSocial: 0.7,
    encouragement: 0.85,
    attentiveness: 0.8,
    boundaries: 0.7,
    ...overrides,
  };
  return base;
}

export function makeEngramBatch(
  count: number,
  withPersonality = false
): MemoryEngram[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) =>
    makeEngram({
      id: `engram-${i}`,
      content: `Memory ${i}: Molly remembers discussing compression and engram consolidation with Eric.`,
      timestamp: new Date(now - (count - i) * 3600000),
      emotionalValence: 0.3 + (i % 5) * 0.1,
      arousal: 0.4 + (i % 4) * 0.1,
      importance: 0.5 + (i % 6) * 0.08,
      personalityContext: withPersonality
        ? makePersonality({ warmth: 0.8 + (i % 3) * 0.05 })
        : undefined,
    })
  );
}
