/**
 * @fileOverview Constant-time HMAC-SHA256 verification (W0.2, F2.5).
 *
 * The comparison MUST be timing-safe even when the supplied signature
 * has a different byte-length than the computed digest. The previous
 * implementation short-circuited on `a.length !== b.length`, which
 * leaks timing information and can throw if lengths differ.
 *
 * Fix strategy
 * ────────────
 * 1. Decode the signature into raw bytes (base64 or hex).
 * 2. Allocate two equal-length buffers (same size as the expected digest).
 *    Pre-fill with 0xff so a truncated-then-padded sig cannot accidentally
 *    match a digest containing 0x00 in the trailing bytes.
 * 3. Copy the expected digest into `ref`; copy the provided bytes into
 *    `cmp` (clamped to expected.length).
 * 4. Call `timingSafeEqual(ref, cmp)` — always, without exception risk.
 * 5. Additionally gate on `provided.length === expected.length` so that
 *    a padded-but-truncated sig is still rejected — BUT evaluate this
 *    AFTER the timing-safe comparison so the timing path is constant.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify an HMAC-SHA256 signature in constant time.
 *
 * @param payload   The signed payload string.
 * @param secret    The HMAC secret (string or Buffer).
 * @param sig       The signature provided by the client.
 * @param encoding  Encoding of `sig`; defaults to `'base64'`.
 * @returns `true` iff the signature is valid.
 */
export function verifyHmacSha256(
  payload: string,
  secret: string | Buffer,
  sig: string,
  encoding: 'base64' | 'hex' = 'base64'
): boolean {
  // Compute expected digest as raw bytes.
  const expected = createHmac('sha256', secret).update(payload).digest();

  // Decode provided signature; treat any decode error as zero-length.
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, encoding);
  } catch {
    provided = Buffer.alloc(0);
  }

  // Build equal-length buffers for timingSafeEqual.
  // Pre-filled with 0xff: a truncated+padded sig won't match a 0x00-tailed digest.
  const ref = Buffer.alloc(expected.length, 0xff);
  const cmp = Buffer.alloc(expected.length, 0xff);
  expected.copy(ref);
  provided.copy(cmp, 0, 0, Math.min(provided.length, expected.length));

  // F2.5: Always run the timing-safe comparison, THEN check length.
  // The bitwise AND evaluates both without short-circuit.
  // Compare the raw encoded-string length so that appended characters
  // after base64 padding (e.g. sig + 'AAAA') are caught even when
  // Buffer.from silently discards them during decoding.
  const bytesMatch = timingSafeEqual(ref, cmp) ? 1 : 0;
  const expectedEncodedLen = expected.toString(encoding).length;
  const lenMatch = sig.length === expectedEncodedLen ? 1 : 0;
  return (bytesMatch & lenMatch) === 1;
}
