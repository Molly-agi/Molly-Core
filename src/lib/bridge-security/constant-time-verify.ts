/**
 * @fileOverview F2.5 — Constant-time signature verification (W0.2)
 *
 * The original verifyHelloSignature short-circuits on length mismatch
 * before calling timingSafeEqual, leaking whether the candidate has the
 * correct length via response-time difference.
 *
 * Fix: derive a fixed-length (32-byte) HMAC-SHA256 digest from each
 * input, then compare with timingSafeEqual. The derivation step always
 * runs and always produces equal-length buffers — there is no early
 * exit based on input size.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * One-time key generated at module load. Its value is never secret —
 * the only purpose is to derive same-length comparison buffers.
 * A new key each process lifetime prevents any cross-process oracle.
 */
const _deriveKey = randomBytes(32);

/**
 * Compare two HMAC digest strings in constant time.
 *
 * Both inputs are hashed to a 32-byte digest (HMAC-SHA256) before the
 * comparison, so timingSafeEqual always runs regardless of whether the
 * candidate has the correct length. The call site cannot distinguish a
 * short/long wrong candidate from a same-length wrong candidate.
 *
 * @returns true only when `expected` and `candidate` are identical
 *   non-empty strings.
 */
export function constantTimeVerify(
  expected: string,
  candidate: string
): boolean {
  if (!expected || !candidate) return false;

  const derive = (s: string): Buffer =>
    createHmac('sha256', _deriveKey).update(s, 'utf8').digest();

  // timingSafeEqual runs unconditionally — no length short-circuit.
  return timingSafeEqual(derive(expected), derive(candidate));
}
