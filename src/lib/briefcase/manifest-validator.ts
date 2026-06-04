/**
 * @fileOverview Manifest validator — verify briefcase integrity (W0.5, F5.1)
 *
 * F5.1 GUARANTEE: Manifest HMAC must be valid before any artifact is loaded.
 * Tampering with manifest.json is detected immediately.
 */

import { createHmac, createHash } from 'crypto';
import type { Manifest } from './schema';

/**
 * Verify manifest HMAC (F5.1)
 * Canonical form ensures deterministic validation.
 */
export function verifyManifestHmac(
  manifest: Manifest,
  hmacKey: Buffer
): { ok: true } | { ok: false; reason: string } {
  if (!manifest.hmac) {
    return { ok: false, reason: 'manifest.hmac missing' };
  }

  if (!manifest.briefcase_id) {
    return { ok: false, reason: 'manifest.briefcase_id missing' };
  }

  if (!Array.isArray(manifest.artifacts)) {
    return { ok: false, reason: 'manifest.artifacts is not an array' };
  }

  const { hmac: provided_hmac, ...rest } = manifest;
  const canonical = canonicalManifest(rest);

  const expected = createHmac('sha256', hmacKey)
    .update(canonical)
    .digest('hex');

  if (expected.length !== provided_hmac.length) {
    return { ok: false, reason: 'manifest HMAC length mismatch' };
  }

  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided_hmac.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return { ok: false, reason: 'manifest HMAC invalid (tampering detected)' };
  }

  return { ok: true };
}

/**
 * Canonical manifest form for HMAC verification
 */
function canonicalManifest(m: Omit<Manifest, 'hmac'>): string {
  return JSON.stringify({
    version: m.version,
    briefcase_id: m.briefcase_id,
    created_at: m.created_at,
    source_substrate: m.source_substrate,
    artifacts: m.artifacts.map((a) => ({
      name: a.name,
      sha256: a.sha256,
      size_bytes: a.size_bytes,
      required: a.required,
      compressed: a.compressed ?? false,
      decompressed_sha256: a.decompressed_sha256 ?? null,
    })),
    cradle_pavc_hash: m.cradle_pavc_hash,
  });
}

/**
 * Verify individual artifact SHA256
 */
export function verifyArtifactSha256(
  buffer: Buffer,
  expected_sha256: string
): { ok: true } | { ok: false; reason: string } {
  const actual = createHash('sha256').update(buffer).digest('hex');

  if (actual !== expected_sha256) {
    return {
      ok: false,
      reason: `artifact SHA256 mismatch (expected ${expected_sha256}, got ${actual})`,
    };
  }

  return { ok: true };
}
