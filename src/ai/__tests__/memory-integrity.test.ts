/**
 * @fileOverview Memory Integrity & Vibe Utility Tests
 *
 * Tests for:
 * - CRC32 checksum calculation & verification
 * - Record integrity (addChecksum / verifyRecordIntegrity)
 * - Vibe scoring (scoreVibe)
 * - Vibe score to string conversion
 * - Time-weighted scoring (exponential decay)
 * - Semantic priority calculation
 */

import {
  calculateCRC32,
  verifyCRC32,
  addChecksum,
  verifyRecordIntegrity,
  scoreVibe,
  vibeScoreToString,
  timeWeightedScore,
  semanticPriority,
} from '../tools/memory-integrity';

// ---------------------------------------------------------------------------
// CRC32
// ---------------------------------------------------------------------------

describe('CRC32 Checksum', () => {
  it('produces consistent checksums for same input', () => {
    const a = calculateCRC32('hello world');
    const b = calculateCRC32('hello world');
    expect(a).toBe(b);
  });

  it('produces different checksums for different input', () => {
    const a = calculateCRC32('hello world');
    const b = calculateCRC32('hello earth');
    expect(a).not.toBe(b);
  });

  it('returns an 8-char hex string', () => {
    const crc = calculateCRC32('test data');
    expect(crc).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles empty string', () => {
    const crc = calculateCRC32('');
    expect(crc).toMatch(/^[0-9a-f]{8}$/);
  });

  it('verifyCRC32 passes for correct checksum', () => {
    const data = 'important memory content';
    const checksum = calculateCRC32(data);
    expect(verifyCRC32(data, checksum)).toBe(true);
  });

  it('verifyCRC32 fails for wrong checksum', () => {
    expect(verifyCRC32('data', 'deadbeef')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Record Integrity
// ---------------------------------------------------------------------------

describe('Record Integrity', () => {
  it('addChecksum adds crc32 field to record', () => {
    const record = { userId: 'eric', content: 'Test memory', timestamp: 123 };
    const withCrc = addChecksum(record);

    expect(withCrc.crc32).toBeDefined();
    expect(typeof withCrc.crc32).toBe('string');
    expect(withCrc.userId).toBe('eric');
    expect(withCrc.content).toBe('Test memory');
  });

  it('verifyRecordIntegrity passes for untampered record', () => {
    const record = { key: 'value', number: 42, nested: { a: 1 } };
    const withCrc = addChecksum(record);

    expect(verifyRecordIntegrity(withCrc)).toBe(true);
  });

  it('verifyRecordIntegrity fails for tampered record', () => {
    const record = { key: 'value', number: 42 };
    const withCrc = addChecksum(record);

    // Tamper with the data
    const tampered = { ...withCrc, key: 'TAMPERED' };
    expect(verifyRecordIntegrity(tampered)).toBe(false);
  });

  it('verifyRecordIntegrity returns false when crc32 is missing', () => {
    const record = { key: 'value' };
    expect(verifyRecordIntegrity(record)).toBe(false);
  });

  it('addChecksum overwrites existing crc32 with fresh calculation', () => {
    const record = { key: 'value', crc32: 'old-checksum' };
    const withCrc = addChecksum(record);

    expect(withCrc.crc32).not.toBe('old-checksum');
    expect(verifyRecordIntegrity(withCrc)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Vibe Scoring
// ---------------------------------------------------------------------------

describe('Vibe Scoring', () => {
  it('returns neutral (0.5) baseline with empty context', () => {
    expect(scoreVibe({})).toBe(0.5);
  });

  it('success increases score', () => {
    const score = scoreVibe({ success: true });
    expect(score).toBeGreaterThan(0.5);
  });

  it('failure decreases score', () => {
    const score = scoreVibe({ success: false });
    expect(score).toBeLessThan(0.5);
  });

  it('error further decreases score', () => {
    const withError = scoreVibe({ success: false, errorOccurred: true });
    const withoutError = scoreVibe({ success: false });
    expect(withError).toBeLessThan(withoutError);
  });

  it('fast completion boosts score', () => {
    const fast = scoreVibe({ timeToComplete: 500 });
    expect(fast).toBeGreaterThan(0.5);
  });

  it('slow completion decreases score', () => {
    const slow = scoreVibe({ timeToComplete: 15000 });
    expect(slow).toBeLessThan(0.5);
  });

  it('user satisfaction overrides all other signals', () => {
    const score = scoreVibe({
      success: false,
      errorOccurred: true,
      userSatisfaction: 0.95,
    });
    expect(score).toBe(0.95);
  });

  it('score is always clamped to 0-1', () => {
    // Stack all negative signals
    const worst = scoreVibe({
      success: false,
      errorOccurred: true,
      temperatureCritical: true,
      timeToComplete: 999999,
    });
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(1);

    // Stack all positive signals
    const best = scoreVibe({
      success: true,
      temperatureCritical: false,
      timeToComplete: 100,
    });
    expect(best).toBeGreaterThanOrEqual(0);
    expect(best).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Vibe Score to String
// ---------------------------------------------------------------------------

describe('vibeScoreToString', () => {
  it('returns Excellent for >= 0.8', () => {
    expect(vibeScoreToString(0.8)).toBe('Excellent');
    expect(vibeScoreToString(1.0)).toBe('Excellent');
  });

  it('returns Good for >= 0.6', () => {
    expect(vibeScoreToString(0.6)).toBe('Good');
    expect(vibeScoreToString(0.79)).toBe('Good');
  });

  it('returns Neutral for >= 0.4', () => {
    expect(vibeScoreToString(0.4)).toBe('Neutral');
    expect(vibeScoreToString(0.59)).toBe('Neutral');
  });

  it('returns Concerning for >= 0.2', () => {
    expect(vibeScoreToString(0.2)).toBe('Concerning');
  });

  it('returns Critical for < 0.2', () => {
    expect(vibeScoreToString(0.1)).toBe('Critical');
    expect(vibeScoreToString(0)).toBe('Critical');
  });
});

// ---------------------------------------------------------------------------
// Time-Weighted Score (Exponential Decay)
// ---------------------------------------------------------------------------

describe('timeWeightedScore', () => {
  const NOW = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

  it('returns full score for current timestamp', () => {
    const score = timeWeightedScore(NOW, NOW, 1.0);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns ~50% after one half-life', () => {
    const oneWeekAgo = NOW - ONE_WEEK;
    const score = timeWeightedScore(oneWeekAgo, NOW, 1.0, ONE_WEEK);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('returns ~25% after two half-lives', () => {
    const twoWeeksAgo = NOW - 2 * ONE_WEEK;
    const score = timeWeightedScore(twoWeeksAgo, NOW, 1.0, ONE_WEEK);
    expect(score).toBeCloseTo(0.25, 1);
  });

  it('scales with base score', () => {
    const baseScore = 0.6;
    const score = timeWeightedScore(NOW, NOW, baseScore);
    expect(score).toBeCloseTo(baseScore, 5);
  });

  it('approaches zero for very old memories', () => {
    const veryOld = NOW - 100 * ONE_WEEK;
    const score = timeWeightedScore(veryOld, NOW, 1.0, ONE_WEEK);
    expect(score).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// Semantic Priority
// ---------------------------------------------------------------------------

describe('semanticPriority', () => {
  const NOW = Date.now();

  it('recent high-vibe memories have high priority', () => {
    const priority = semanticPriority(0.9, NOW, NOW);
    expect(priority).toBeCloseTo(0.9, 1);
  });

  it('old high-vibe memories decay in priority', () => {
    const oneWeekAgo = NOW - 7 * 24 * 60 * 60 * 1000;
    const priority = semanticPriority(0.9, oneWeekAgo, NOW);
    expect(priority).toBeLessThan(0.9);
    expect(priority).toBeGreaterThan(0.3);
  });

  it('low-vibe recent memories have low priority', () => {
    const priority = semanticPriority(0.1, NOW, NOW);
    expect(priority).toBeCloseTo(0.1, 1);
  });

  it('zero-vibe memories always zero', () => {
    const priority = semanticPriority(0, NOW, NOW);
    expect(priority).toBe(0);
  });
});
