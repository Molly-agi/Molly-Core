/**
 * @fileOverview Tests for Memory Integrity & Vibe Utilities
 *
 * Tests integrity operations including:
 * - CRC32 checksum calculation and verification
 * - Record integrity validation
 * - Vibe scoring
 * - Time-weighted decay
 * - Semantic priority
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
  type VibeContext,
} from '../memory-integrity';

describe('Memory Integrity', () => {
  describe('calculateCRC32', () => {
    it('calculates CRC32 for simple string', () => {
      const result = calculateCRC32('hello');
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });

    it('returns consistent results', () => {
      const data = 'test data';
      const first = calculateCRC32(data);
      const second = calculateCRC32(data);
      expect(first).toBe(second);
    });

    it('produces different checksums for different data', () => {
      const crc1 = calculateCRC32('data1');
      const crc2 = calculateCRC32('data2');
      expect(crc1).not.toBe(crc2);
    });

    it('handles empty string', () => {
      const result = calculateCRC32('');
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });

    it('handles unicode characters', () => {
      const result = calculateCRC32('Hello 世界 🌍');
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });

    it('handles long strings', () => {
      const longString = 'a'.repeat(10000);
      const result = calculateCRC32(longString);
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });

    it('pads result to 8 characters', () => {
      // Some inputs might produce small CRCs that need padding
      for (let i = 0; i < 100; i++) {
        const result = calculateCRC32(`test-${i}`);
        expect(result.length).toBe(8);
      }
    });
  });

  describe('verifyCRC32', () => {
    it('returns true for matching checksum', () => {
      const data = 'test data';
      const checksum = calculateCRC32(data);
      expect(verifyCRC32(data, checksum)).toBe(true);
    });

    it('returns false for non-matching checksum', () => {
      expect(verifyCRC32('data', 'wrongcrc')).toBe(false);
    });

    it('detects single character changes', () => {
      const original = 'hello world';
      const checksum = calculateCRC32(original);
      const modified = 'hello World'; // Changed 'w' to 'W'
      expect(verifyCRC32(modified, checksum)).toBe(false);
    });

    it('detects added whitespace', () => {
      const original = 'test';
      const checksum = calculateCRC32(original);
      expect(verifyCRC32('test ', checksum)).toBe(false);
    });
  });

  describe('addChecksum', () => {
    it('adds crc32 field to record', () => {
      const record = { name: 'test', value: 123 };
      const result = addChecksum(record);

      expect(result.crc32).toBeDefined();
      expect(result.crc32).toMatch(/^[0-9a-f]{8}$/);
    });

    it('preserves original fields', () => {
      const record = { name: 'test', value: 123, nested: { a: 1 } };
      const result = addChecksum(record);

      expect(result.name).toBe('test');
      expect(result.value).toBe(123);
      expect(result.nested).toEqual({ a: 1 });
    });

    it('recalculates checksum if already present', () => {
      const record = { name: 'test', crc32: 'oldchecksum' };
      const result = addChecksum(record);

      expect(result.crc32).not.toBe('oldchecksum');
      expect(result.crc32).toMatch(/^[0-9a-f]{8}$/);
    });

    it('produces verifiable checksum', () => {
      const record = { name: 'test', value: 42 };
      const withChecksum = addChecksum(record);

      expect(verifyRecordIntegrity(withChecksum)).toBe(true);
    });
  });

  describe('verifyRecordIntegrity', () => {
    it('returns true for valid record', () => {
      const record = addChecksum({ data: 'valid', count: 5 });
      expect(verifyRecordIntegrity(record)).toBe(true);
    });

    it('returns false for modified record', () => {
      const record = addChecksum({ data: 'valid', count: 5 });
      const tamperedRecord = { ...record, data: 'tampered' };
      expect(verifyRecordIntegrity(tamperedRecord)).toBe(false);
    });

    it('returns false for record without checksum', () => {
      const record = { data: 'no checksum' };
      expect(verifyRecordIntegrity(record)).toBe(false);
    });

    it('returns false for record with empty checksum', () => {
      const record = { data: 'test', crc32: '' };
      expect(verifyRecordIntegrity(record)).toBe(false);
    });

    it('detects numeric field changes', () => {
      const record = addChecksum({ value: 100 });
      const tampered = { ...record, value: 101 };
      expect(verifyRecordIntegrity(tampered)).toBe(false);
    });

    it('detects nested object changes', () => {
      const record = addChecksum({ nested: { a: 1, b: 2 } });
      const tampered = { ...record, nested: { a: 1, b: 3 } };
      expect(verifyRecordIntegrity(tampered)).toBe(false);
    });

    it('detects array changes', () => {
      const record = addChecksum({ items: [1, 2, 3] });
      const tampered = { ...record, items: [1, 2, 4] };
      expect(verifyRecordIntegrity(tampered)).toBe(false);
    });
  });

  describe('scoreVibe', () => {
    it('returns neutral baseline (0.5) for empty context', () => {
      const score = scoreVibe({});
      expect(score).toBe(0.5);
    });

    it('increases score for success', () => {
      const score = scoreVibe({ success: true });
      expect(score).toBe(0.75); // 0.5 + 0.25
    });

    it('decreases score for failure', () => {
      const score = scoreVibe({ success: false });
      expect(score).toBe(0.25); // 0.5 - 0.25
    });

    it('decreases score for errors', () => {
      const score = scoreVibe({ errorOccurred: true });
      expect(score).toBe(0.35); // 0.5 - 0.15
    });

    it('decreases score for critical temperature', () => {
      const score = scoreVibe({ temperatureCritical: true });
      expect(score).toBe(0.4); // 0.5 - 0.1
    });

    it('slightly increases score for normal temperature', () => {
      const score = scoreVibe({ temperatureCritical: false });
      expect(score).toBe(0.55); // 0.5 + 0.05
    });

    it('increases score for fast completion', () => {
      const score = scoreVibe({ timeToComplete: 500 }); // < 1000ms
      expect(score).toBe(0.6); // 0.5 + 0.1
    });

    it('decreases score for slow completion', () => {
      const score = scoreVibe({ timeToComplete: 15000 }); // > 10000ms
      expect(score).toBe(0.45); // 0.5 - 0.05
    });

    it('overrides with user satisfaction when provided', () => {
      const context: VibeContext = {
        success: true,
        errorOccurred: false,
        userSatisfaction: 0.9,
      };
      const score = scoreVibe(context);
      expect(score).toBe(0.9);
    });

    it('combines multiple factors', () => {
      const context: VibeContext = {
        success: true, // +0.25
        errorOccurred: false,
        temperatureCritical: false, // +0.05
        timeToComplete: 800, // +0.1
      };
      const score = scoreVibe(context);
      expect(score).toBe(0.9); // 0.5 + 0.25 + 0.05 + 0.1
    });

    it('clamps to 0 minimum', () => {
      const context: VibeContext = {
        success: false, // -0.25
        errorOccurred: true, // -0.15
        temperatureCritical: true, // -0.1
        timeToComplete: 20000, // -0.05
      };
      const score = scoreVibe(context);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('clamps to 1 maximum', () => {
      const context: VibeContext = {
        userSatisfaction: 1.5, // Would exceed 1
      };
      const score = scoreVibe(context);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('vibeScoreToString', () => {
    it('returns Excellent for >= 0.8', () => {
      expect(vibeScoreToString(0.8)).toBe('Excellent');
      expect(vibeScoreToString(0.9)).toBe('Excellent');
      expect(vibeScoreToString(1.0)).toBe('Excellent');
    });

    it('returns Good for >= 0.6', () => {
      expect(vibeScoreToString(0.6)).toBe('Good');
      expect(vibeScoreToString(0.7)).toBe('Good');
      expect(vibeScoreToString(0.79)).toBe('Good');
    });

    it('returns Neutral for >= 0.4', () => {
      expect(vibeScoreToString(0.4)).toBe('Neutral');
      expect(vibeScoreToString(0.5)).toBe('Neutral');
      expect(vibeScoreToString(0.59)).toBe('Neutral');
    });

    it('returns Concerning for >= 0.2', () => {
      expect(vibeScoreToString(0.2)).toBe('Concerning');
      expect(vibeScoreToString(0.3)).toBe('Concerning');
      expect(vibeScoreToString(0.39)).toBe('Concerning');
    });

    it('returns Critical for < 0.2', () => {
      expect(vibeScoreToString(0)).toBe('Critical');
      expect(vibeScoreToString(0.1)).toBe('Critical');
      expect(vibeScoreToString(0.19)).toBe('Critical');
    });
  });

  describe('timeWeightedScore', () => {
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    it('returns full score for current timestamp', () => {
      const now = Date.now();
      const score = timeWeightedScore(now, now, 1.0);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('returns half score after one half-life', () => {
      const now = Date.now();
      const oneWeekAgo = now - ONE_WEEK_MS;
      const score = timeWeightedScore(oneWeekAgo, now, 1.0);
      expect(score).toBeCloseTo(0.5, 2);
    });

    it('returns quarter score after two half-lives', () => {
      const now = Date.now();
      const twoWeeksAgo = now - 2 * ONE_WEEK_MS;
      const score = timeWeightedScore(twoWeeksAgo, now, 1.0);
      expect(score).toBeCloseTo(0.25, 2);
    });

    it('applies decay to base score', () => {
      const now = Date.now();
      const oneWeekAgo = now - ONE_WEEK_MS;
      const score = timeWeightedScore(oneWeekAgo, now, 0.8);
      expect(score).toBeCloseTo(0.4, 2); // 0.8 * 0.5
    });

    it('uses custom half-life', () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const oneDayHalfLife = 24 * 60 * 60 * 1000;

      const score = timeWeightedScore(oneDayAgo, now, 1.0, oneDayHalfLife);
      expect(score).toBeCloseTo(0.5, 2);
    });

    it('approaches zero for very old timestamps', () => {
      const now = Date.now();
      const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
      const score = timeWeightedScore(yearAgo, now, 1.0);
      expect(score).toBeLessThan(0.01);
    });
  });

  describe('semanticPriority', () => {
    it('combines vibe score with time decay', () => {
      const now = Date.now();
      const vibeScore = 0.8;

      const priority = semanticPriority(vibeScore, now, now);
      expect(priority).toBeCloseTo(0.8, 5);
    });

    it('reduces priority for older records', () => {
      const now = Date.now();
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

      const currentPriority = semanticPriority(0.8, now, now);
      const oldPriority = semanticPriority(0.8, oneWeekAgo, now);

      expect(oldPriority).toBeLessThan(currentPriority);
    });

    it('respects custom half-life', () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const oneHourHalfLife = 60 * 60 * 1000;

      const priority = semanticPriority(1.0, oneHourAgo, now, oneHourHalfLife);
      expect(priority).toBeCloseTo(0.5, 2);
    });

    it('high vibe recent records have highest priority', () => {
      const now = Date.now();
      const recentHighVibe = semanticPriority(0.9, now, now);
      const recentLowVibe = semanticPriority(0.3, now, now);
      const oldHighVibe = semanticPriority(
        0.9,
        now - 30 * 24 * 60 * 60 * 1000,
        now
      );

      expect(recentHighVibe).toBeGreaterThan(recentLowVibe);
      expect(recentHighVibe).toBeGreaterThan(oldHighVibe);
    });
  });

  describe('Integration', () => {
    it('full integrity workflow', () => {
      // Create a record
      const record = {
        id: 'test-123',
        timestamp: Date.now(),
        userId: 'user-456',
        data: 'important data',
      };

      // Add integrity checksum
      const withChecksum = addChecksum(record);
      expect(withChecksum.crc32).toBeDefined();

      // Verify integrity
      expect(verifyRecordIntegrity(withChecksum)).toBe(true);

      // Detect tampering
      const tampered = { ...withChecksum, data: 'modified data' };
      expect(verifyRecordIntegrity(tampered)).toBe(false);
    });

    it('full vibe workflow', () => {
      // Calculate vibe from context
      const context: VibeContext = {
        success: true,
        timeToComplete: 500,
      };
      const vibeScore = scoreVibe(context);

      // Convert to string
      const vibeString = vibeScoreToString(vibeScore);
      expect(['Excellent', 'Good']).toContain(vibeString);

      // Calculate semantic priority
      const now = Date.now();
      const priority = semanticPriority(vibeScore, now, now);
      expect(priority).toBeGreaterThan(0.5);
    });
  });
});
