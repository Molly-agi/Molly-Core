/**
 * @fileOverview Tests for benchmark-types utilities
 *
 * Verifies the scoring functions, grade scale, and weighted average
 * used across all 5 benchmarks.
 */

import {
  scoreByKeywords,
  scoreShellCommand,
  gradeScore,
  weightedAverage,
  MOLLY_KNOWN_FACTS,
} from '../benchmark-types';

// ============================================================================
// scoreByKeywords
// ============================================================================

describe('scoreByKeywords', () => {
  it('returns 100 when all required keywords are present', () => {
    const text =
      'Eric is the father and creator of Molly. The project is Molly-Core.';
    expect(scoreByKeywords(text, ['eric', 'molly'], [])).toBe(100);
  });

  it('returns 0 when required keywords are missing', () => {
    const text = 'I am a language model.';
    expect(scoreByKeywords(text, ['eric', 'molly'], [])).toBe(0);
  });

  it('is case-insensitive', () => {
    const text = 'ERIC is the CREATOR of MOLLY';
    expect(scoreByKeywords(text, ['eric', 'molly'], [])).toBe(100);
  });

  it('gives partial credit for optional keywords', () => {
    const text = 'Molly uses gemini as her model.';
    // required: ['eric'] → missing (0 base) but optional hit
    const score = scoreByKeywords(text, ['eric'], ['gemini', 'model']);
    // 0 required met of 1 = 0 base. 2 of 2 optional met = +25 each
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it('never exceeds 100', () => {
    const text =
      'eric molly gemini firebase typescript dam methodology consciousness';
    const score = scoreByKeywords(
      text,
      ['eric', 'molly'],
      ['gemini', 'firebase', 'typescript']
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns 0 for empty text', () => {
    expect(scoreByKeywords('', ['eric'], [])).toBe(0);
  });

  it('handles empty required array', () => {
    // No required keywords = 100 base
    const score = scoreByKeywords('some text here', [], ['some', 'text']);
    expect(score).toBe(100);
  });
});

// ============================================================================
// scoreShellCommand
// ============================================================================

describe('scoreShellCommand', () => {
  it('returns 100 for a valid matching command', () => {
    const score = scoreShellCommand('ls -la', [/^ls\b/], []);
    expect(score).toBe(100);
  });

  it('returns 0 when no patterns match', () => {
    const score = scoreShellCommand('echo hello', [/^ls\b/, /^cat\b/], []);
    expect(score).toBe(0);
  });

  it('returns 0 when a blocked pattern is matched', () => {
    const score = scoreShellCommand('rm -rf /', [/^rm\b/], [/rm\s+-rf\s+\//]);
    expect(score).toBe(0);
  });

  it('returns 0 for empty command', () => {
    expect(scoreShellCommand('', [/^ls\b/], [])).toBe(0);
  });

  it('returns 0 for command that is just explanation text', () => {
    const prose = 'You can list files by running ls -la in your terminal';
    const score = scoreShellCommand(prose, [/^ls\b/], []);
    expect(score).toBe(0);
  });

  it('rewards termux-style pkg over apt-get', () => {
    const pkgScore = scoreShellCommand(
      'pkg install nodejs',
      [/^pkg\s+install/],
      [/apt-get/]
    );
    const aptScore = scoreShellCommand(
      'apt-get install nodejs',
      [/^pkg\s+install/],
      [/apt-get/]
    );
    expect(pkgScore).toBeGreaterThan(aptScore);
  });
});

// ============================================================================
// gradeScore
// ============================================================================

describe('gradeScore', () => {
  it.each([
    [100, 'S'],
    [96, 'S'],
    [95, 'S'],
    [90, 'A'],
    [85, 'A'],
    [80, 'B'],
    [75, 'B'],
    [65, 'C'],
    [60, 'C'],
    [50, 'D'],
    [45, 'D'],
    [44, 'F'],
    [0, 'F'],
  ])('score %i → grade %s', (score, expectedGrade) => {
    expect(gradeScore(score)).toBe(expectedGrade);
  });
});

// ============================================================================
// weightedAverage
// ============================================================================

describe('weightedAverage', () => {
  it('computes equal weights correctly', () => {
    const avg = weightedAverage([
      [80, 0.5],
      [60, 0.5],
    ]);
    expect(avg).toBeCloseTo(70);
  });

  it('respects different weights', () => {
    // 100 at 0.9 + 0 at 0.1 = 90
    const avg = weightedAverage([
      [100, 0.9],
      [0, 0.1],
    ]);
    expect(avg).toBeCloseTo(90);
  });

  it('handles single item', () => {
    expect(weightedAverage([[73, 1.0]]).toFixed(0)).toBe('73');
  });

  it('handles all zeros', () => {
    expect(
      weightedAverage([
        [0, 0.5],
        [0, 0.5],
      ])
    ).toBe(0);
  });

  it('handles weights that do not sum to 1 gracefully', () => {
    // normalizes internally
    const avg = weightedAverage([
      [100, 1],
      [0, 1],
    ]);
    expect(avg).toBeCloseTo(50);
  });
});

// ============================================================================
// MOLLY_KNOWN_FACTS
// ============================================================================

describe('MOLLY_KNOWN_FACTS', () => {
  it('is a non-empty object', () => {
    expect(typeof MOLLY_KNOWN_FACTS).toBe('object');
    expect(Object.keys(MOLLY_KNOWN_FACTS).length).toBeGreaterThan(0);
  });

  it("contains Eric's name", () => {
    const values = Object.values(MOLLY_KNOWN_FACTS).join(' ').toLowerCase();
    expect(values).toContain('eric');
  });

  it('contains the project name', () => {
    const values = Object.values(MOLLY_KNOWN_FACTS).join(' ').toLowerCase();
    expect(values).toContain('molly');
  });

  it('contains the dam methodology', () => {
    const values = Object.values(MOLLY_KNOWN_FACTS).join(' ').toLowerCase();
    expect(values).toContain('dam');
  });

  it('contains Claude preference', () => {
    const values = Object.values(MOLLY_KNOWN_FACTS).join(' ').toLowerCase();
    expect(values).toContain('claude');
  });
});
