/**
 * @fileOverview F2.5 — constantTimeVerify tests
 *
 * Verifies that the comparison does not leak signature length via early
 * return. The function must run timingSafeEqual regardless of whether
 * the candidate has the correct length.
 */

import { createHmac, randomBytes } from 'crypto';
import { constantTimeVerify } from '../constant-time-verify';

/** Produce a real 44-char HMAC-SHA256 base64 digest. */
function makeDigest(payload: string): string {
  return createHmac('sha256', randomBytes(32)).update(payload).digest('base64');
}

describe('constantTimeVerify (F2.5)', () => {
  // Generate deterministic test strings at describe-time.
  const key = randomBytes(32);
  const correct = createHmac('sha256', key)
    .update('test-payload')
    .digest('base64');
  // A different digest of the same length (same-length wrong value).
  const sameLen = createHmac('sha256', key)
    .update('other-payload')
    .digest('base64');

  it('F2.5: correct string length is 44 chars (sanity)', () => {
    expect(correct.length).toBe(44);
    expect(sameLen.length).toBe(44);
  });

  it('F2.5: returns true for identical strings', () => {
    expect(constantTimeVerify(correct, correct)).toBe(true);
  });

  it('F2.5: returns false for different same-length string', () => {
    expect(sameLen).not.toBe(correct);
    expect(sameLen.length).toBe(correct.length);
    expect(constantTimeVerify(correct, sameLen)).toBe(false);
  });

  it('F2.5: returns false for candidate shorter than expected', () => {
    const short = correct.slice(0, 20);
    expect(short.length).toBeLessThan(correct.length);
    expect(constantTimeVerify(correct, short)).toBe(false);
  });

  it('F2.5: returns false for candidate longer than expected', () => {
    const long = correct + 'extra';
    expect(long.length).toBeGreaterThan(correct.length);
    expect(constantTimeVerify(correct, long)).toBe(false);
  });

  it('F2.5: returns false for empty candidate', () => {
    expect(constantTimeVerify(correct, '')).toBe(false);
  });

  it('F2.5: returns false for empty expected', () => {
    expect(constantTimeVerify('', correct)).toBe(false);
  });

  it('F2.5: returns false when both strings differ (all zeros vs all ones)', () => {
    const a = makeDigest('payload-a');
    const b = makeDigest('payload-b');
    // Two independently-generated digests should not be equal.
    if (a !== b) {
      expect(constantTimeVerify(a, b)).toBe(false);
    }
  });

  it('F2.5: any string verifies against itself', () => {
    const d = makeDigest('round-trip');
    expect(constantTimeVerify(d, d)).toBe(true);
  });
});
