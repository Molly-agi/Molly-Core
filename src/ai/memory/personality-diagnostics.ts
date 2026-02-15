/**
 * @fileOverview Personality stability diagnostics.
 */

import type { PersonalityModulation } from '@/ai/memory/neural-engram';

export interface PersonalityDiagnosticsResult {
  status: 'stable' | 'caution' | 'unstable';
  score: number;
  flags: string[];
  extremes: number;
  variance: number;
}

export function evaluatePersonalityStability(
  personality: PersonalityModulation
): PersonalityDiagnosticsResult {
  const values = Object.values(personality);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  const extremes = values.filter(
    (value) => value <= 0.05 || value >= 0.95
  ).length;

  const flags: string[] = [];
  if (extremes >= 4) {
    flags.push('Multiple dimensions at extremes.');
  }
  if (stdDev > 0.28) {
    flags.push('High variance across personality dimensions.');
  }
  if (
    personality.arousal >= 0.9 &&
    personality.jealousy >= 0.75 &&
    personality.possessiveness >= 0.75
  ) {
    flags.push('Arousal + jealousy + possessiveness are elevated together.');
  }

  const extremePenalty = Math.min(1, extremes / 6);
  const variancePenalty = Math.min(1, stdDev / 0.35);
  const compositePenalty =
    extremePenalty * 0.45 +
    variancePenalty * 0.35 +
    (flags.length > 0 ? 0.2 : 0);
  const score = Math.max(0, Math.min(1, 1 - compositePenalty));

  let status: PersonalityDiagnosticsResult['status'] = 'stable';
  if (score < 0.5) status = 'unstable';
  else if (score < 0.75) status = 'caution';

  if (flags.length === 0) {
    flags.push('All personality ranges within expected bounds.');
  }

  return {
    status,
    score,
    flags,
    extremes,
    variance: Number(stdDev.toFixed(3)),
  };
}
