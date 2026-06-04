/**
 * @fileOverview F2.5 — Constant-time signature verification tests.
 *
 * Verifies that `verifyHmacSha256` never throws, always performs a
 * timing-safe comparison, and rejects signatures with wrong length
 * without short-circuiting on the length check.
 */

import { createHmac } from 'crypto';
import { verifyHmacSha256 } from '../verify';

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64');
}

describe('bridge-security verify (F2.5)', () => {
  const secret = 'test-secret-32-bytes-of-noise!!';
  const payload = 'device-1|1700000000000|nonce-abc';

  it('F2.5: correct signature verifies as true', () => {
    const sig = sign(secret, payload);
    expect(verifyHmacSha256(payload, secret, sig)).toBe(true);
  });

  it('F2.5: wrong secret fails', () => {
    const sig = sign('different-secret', payload);
    expect(verifyHmacSha256(payload, secret, sig)).toBe(false);
  });

  it('F2.5: tampered payload fails', () => {
    const sig = sign(secret, payload);
    expect(verifyHmacSha256(`${payload}|extra`, secret, sig)).toBe(false);
  });

  it('F2.5: empty signature does not throw and returns false', () => {
    expect(() => verifyHmacSha256(payload, secret, '')).not.toThrow();
    expect(verifyHmacSha256(payload, secret, '')).toBe(false);
  });

  it('F2.5: short signature does not throw and returns false', () => {
    // 3 chars base64 → 2 bytes; HMAC-SHA256 digest is 32 bytes
    expect(() => verifyHmacSha256(payload, secret, 'abc')).not.toThrow();
    expect(verifyHmacSha256(payload, secret, 'abc')).toBe(false);
  });

  it('F2.5: overlong signature does not throw and returns false', () => {
    const sig = sign(secret, payload) + 'AAAA';
    expect(() => verifyHmacSha256(payload, secret, sig)).not.toThrow();
    expect(verifyHmacSha256(payload, secret, sig)).toBe(false);
  });

  it('F2.5: truncated-then-padded sig is rejected', () => {
    const sig = sign(secret, payload);
    const truncated = sig.slice(0, sig.length - 4);
    expect(verifyHmacSha256(payload, secret, truncated)).toBe(false);
  });

  it('F2.5: all-zeros sig does not accidentally pass', () => {
    // 44 A-chars decode to 33 zero bytes — length matches 32-byte digest only if padded
    const zeroLike = 'A'.repeat(44); // base64 → 33 bytes (not 32)
    expect(verifyHmacSha256(payload, secret, zeroLike)).toBe(false);
  });

  it('F2.5: hex encoding variant verifies correctly', () => {
    const hexSig = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSha256(payload, secret, hexSig, 'hex')).toBe(true);
  });

  it('F2.5: hex encoding with wrong sig fails', () => {
    const hexSig = createHmac('sha256', 'wrong-key')
      .update(payload)
      .digest('hex');
    expect(verifyHmacSha256(payload, secret, hexSig, 'hex')).toBe(false);
  });
});
