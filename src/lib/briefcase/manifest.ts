/**
 * @fileOverview Briefcase manifest — HMAC compute / verify (W0.1, F1.1, F1.5)
 *
 * Atomic invariant: manifest.json is INSIDE the HMAC computation. The
 * HMAC is computed over the canonical serialization of the manifest
 * with hmac="" placeholder, then written into manifest.hmac. Verify
 * reverses the process. Optional sections (F1.5) are covered when
 * present — manifest.artifacts lists every artifact that contributed.
 */

import { createHmac, createHash, timingSafeEqual } from 'crypto';
import type { Manifest, ArtifactEntry } from './schema';

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function canonicalize(manifest: Manifest): string {
  const ordered = {
    version: manifest.version,
    briefcase_id: manifest.briefcase_id,
    created_at: manifest.created_at,
    source_substrate: manifest.source_substrate,
    artifacts: [...manifest.artifacts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ ...a })),
    cradle_pavc_hash: manifest.cradle_pavc_hash,
    hmac: '',
  };
  return JSON.stringify(ordered);
}

export function computeManifestHmac(manifest: Manifest, key: Buffer): string {
  return createHmac('sha256', key).update(canonicalize(manifest)).digest('hex');
}

export function verifyManifestHmac(manifest: Manifest, key: Buffer): boolean {
  const expected = computeManifestHmac(manifest, key);
  // constant-time equality using Node.js crypto.timingSafeEqual (F2.5)
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(manifest.hmac, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyArtifactHashes(
  manifest: Manifest,
  contents: Map<string, Buffer>
): { ok: true } | { ok: false; reason: string } {
  for (const entry of manifest.artifacts) {
    const buf = contents.get(entry.name);
    if (entry.required && !buf) {
      return { ok: false, reason: `required artifact missing: ${entry.name}` };
    }
    if (!buf) continue;
    if (sha256(buf) !== entry.sha256) {
      return { ok: false, reason: `hash mismatch: ${entry.name}` };
    }
  }
  return { ok: true };
}

export function makeArtifactEntry(
  name: string,
  buf: Buffer,
  required: boolean,
  decompressedSha?: string
): ArtifactEntry {
  const entry: ArtifactEntry = {
    name,
    sha256: sha256(buf),
    size_bytes: buf.length,
    required,
  };
  if (decompressedSha) {
    entry.compressed = true;
    entry.decompressed_sha256 = decompressedSha;
  }
  return entry;
}
