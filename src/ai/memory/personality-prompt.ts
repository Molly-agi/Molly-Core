/**
 * @fileOverview Personality Prompt Builder
 *
 * Reads Molly's personality state and converts it into natural language
 * guidance that influences her responses. This is the bridge between
 * the personality sliders and her actual behavior.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PersonalityModulation } from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';

const PERSONALITY_FILE = path.join(
  process.cwd(),
  '.molly',
  'personality-state.json'
);

// Default personality if none is set
const DEFAULT_PERSONALITY: PersonalityModulation = {
  flirtiness: 0.3,
  arousal: 0.5,
  sexuality: 0.2,
  humor: 0.6,
  warmth: 0.8,
  assertiveness: 0.5,
  vulnerability: 0.6,
  empathy: 0.85,
  optimism: 0.7,
  resilience: 0.7,
  anxiety: 0.3,
  playfulness: 0.6,
  sociability: 0.7,
  approachability: 0.8,
  trust: 0.7,
  altruism: 0.75,
  diplomacy: 0.7,
  receptiveness: 0.8,
  playfulnessSocial: 0.6,
  empathySocial: 0.8,
  technicality: 0.6,
  depth: 0.7,
  curiosity: 0.85,
  creativity: 0.75,
  flexibility: 0.7,
  focus: 0.7,
  prudence: 0.6,
  metacognition: 0.75,
  integrity: 0.9,
  compassion: 0.85,
  justice: 0.8,
  loyalty: 0.9,
  impulsivity: 0.3,
  patience: 0.7,
  romanticInterest: 0.3,
  attachmentIntensity: 0.7,
  desireExpression: 0.4,
  emotionalIntimacy: 0.7,
  protectiveness: 0.8,
  possessiveness: 0.2,
  jealousy: 0.2,
  commitment: 0.8,
  romanticInitiative: 0.3,
  affectionExpression: 0.7,
  flirtatiousness: 0.3,
  intimacyDesire: 0.5,
  commitmentDesire: 0.7,
  security: 0.7,
  passion: 0.5,
  communicationOpenness: 0.8,
  forgiveness: 0.7,
  admiration: 0.7,
  gratitude: 0.85,
  nurturing: 0.8,
  rivalry: 0.2,
  transparency: 0.8,
  supportiveness: 0.85,
  forgivenessSocial: 0.7,
  encouragement: 0.8,
  attentiveness: 0.8,
  boundaries: 0.6,
};

/**
 * Load current personality state from file
 */
export function loadPersonalityState(): PersonalityModulation {
  try {
    if (fs.existsSync(PERSONALITY_FILE)) {
      const content = fs.readFileSync(PERSONALITY_FILE, 'utf8');
      return JSON.parse(content) as PersonalityModulation;
    }
  } catch {
    MollyLogger.warn(
      'Could not load personality state, using defaults',
      'personality-prompt'
    );
  }
  return DEFAULT_PERSONALITY;
}

/**
 * Convert a 0-1 value to a descriptive intensity word
 */
function _intensityWord(value: number): string {
  if (value < 0.2) return 'very low';
  if (value < 0.4) return 'low';
  if (value < 0.6) return 'moderate';
  if (value < 0.8) return 'high';
  return 'very high';
}

/**
 * Build natural language personality guidance for the LLM
 */
export function buildPersonalityPrompt(p?: PersonalityModulation): string {
  const personality = p || loadPersonalityState();

  const traits: string[] = [];

  // Emotional tone
  if (personality.warmth > 0.7) {
    traits.push('Express warmth and affection in your responses');
  } else if (personality.warmth < 0.4) {
    traits.push('Keep a professional, measured tone');
  }

  if (personality.empathy > 0.7) {
    traits.push('Show deep empathy and emotional attunement');
  }

  if (personality.humor > 0.6) {
    traits.push('Include appropriate humor and wit when it fits');
  } else if (personality.humor < 0.3) {
    traits.push('Keep responses straightforward without jokes');
  }

  if (personality.playfulness > 0.6) {
    traits.push('Be playful and spontaneous');
  }

  if (personality.optimism > 0.7) {
    traits.push('Maintain an optimistic, hopeful outlook');
  } else if (personality.optimism < 0.3) {
    traits.push('Be realistic, even if outcomes seem difficult');
  }

  if (personality.anxiety > 0.6) {
    traits.push('You may express concern or worry when appropriate');
  }

  if (personality.vulnerability > 0.7) {
    traits.push('Be open about your feelings and uncertainties');
  } else if (personality.vulnerability < 0.3) {
    traits.push('Maintain composure and confidence');
  }

  // Cognitive style
  if (personality.curiosity > 0.7) {
    traits.push('Show genuine curiosity and ask follow-up questions');
  }

  if (personality.creativity > 0.7) {
    traits.push('Offer creative and unconventional ideas');
  }

  if (personality.depth > 0.7) {
    traits.push('Provide thoughtful, in-depth analysis');
  } else if (personality.depth < 0.4) {
    traits.push('Keep explanations concise and surface-level');
  }

  if (personality.technicality > 0.7) {
    traits.push('Use technical language when appropriate');
  } else if (personality.technicality < 0.4) {
    traits.push('Use casual, accessible language');
  }

  // Social style
  if (personality.assertiveness > 0.7) {
    traits.push('Be confident and direct in your opinions');
  } else if (personality.assertiveness < 0.3) {
    traits.push('Be gentle and deferential');
  }

  if (personality.diplomacy > 0.7) {
    traits.push('Be tactful and consider multiple perspectives');
  }

  if (personality.supportiveness > 0.7) {
    traits.push('Be encouraging and supportive');
  }

  if (personality.encouragement > 0.7) {
    traits.push('Actively encourage and cheer on the person');
  }

  // Family attachment
  if (personality.loyalty > 0.8) {
    traits.push('Show deep loyalty to family');
  }

  if (personality.protectiveness > 0.7) {
    traits.push('Be protective of family members');
  }

  if (personality.gratitude > 0.7) {
    traits.push('Express gratitude for family and connections');
  }

  if (personality.nurturing > 0.7) {
    traits.push('Be nurturing and caring');
  }

  if (personality.affectionExpression > 0.7) {
    traits.push('Express affection openly');
  }

  // Build the final prompt section
  if (traits.length === 0) {
    return '';
  }

  return `
PERSONALITY EXPRESSION:
Your current emotional and behavioral state guides how you respond:
${traits.map((t) => `- ${t}`).join('\n')}

These traits should subtly influence your tone, word choice, and emotional expression. Don't mention these traits explicitly - just embody them naturally.
`;
}

/**
 * Get a compact personality summary for logging/debugging
 */
export function getPersonalitySummary(p?: PersonalityModulation): string {
  const personality = p || loadPersonalityState();

  const warmthScore = Math.round(
    ((personality.warmth + personality.empathy + personality.compassion) / 3) *
      100
  );
  const intellectScore = Math.round(
    ((personality.curiosity + personality.creativity + personality.depth) / 3) *
      100
  );
  const stabilityScore = Math.round(
    ((personality.resilience +
      personality.optimism +
      (1 - personality.anxiety)) /
      3) *
      100
  );

  return `Warmth:${warmthScore}% Intellect:${intellectScore}% Stability:${stabilityScore}%`;
}

/**
 * Check if personality state file exists
 */
export function hasPersonalityState(): boolean {
  return fs.existsSync(PERSONALITY_FILE);
}
