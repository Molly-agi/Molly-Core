/**
 * @fileOverview Briefcase assembler — seal a briefcase (W0.1)
 *
 * Produces a manifest with HMAC over all named artifacts (incl.
 * manifest itself, F1.1) and writes the bundle. The cradle_pavc_hash
 * is computed at seal time and frozen in the manifest (F1.3).
 */

import { sha256, computeManifestHmac, makeArtifactEntry } from './manifest';
import type { Manifest, Briefcase } from './schema';

export interface SealInput {
  briefcase_id: string;
  source_substrate: string;
  required: Record<string, Buffer>;
  optional?: Record<string, Buffer>;
  compressed?: Record<string, { bytes: Buffer; decompressed_sha256: string }>;
  cradle_pavc_hash: string;
  hmac_key: Buffer;
}

export function seal(input: SealInput): {
  manifest: Manifest;
  bundle: Briefcase;
} {
  const bundle: Briefcase = new Map();
  const artifacts = [];

  for (const [name, buf] of Object.entries(input.required)) {
    bundle.set(name, buf);
    artifacts.push(makeArtifactEntry(name, buf, true));
  }
  for (const [name, buf] of Object.entries(input.optional ?? {})) {
    bundle.set(name, buf);
    artifacts.push(makeArtifactEntry(name, buf, false));
  }
  for (const [name, comp] of Object.entries(input.compressed ?? {})) {
    bundle.set(name, comp.bytes);
    artifacts.push(
      makeArtifactEntry(name, comp.bytes, true, comp.decompressed_sha256)
    );
  }

  const manifest: Manifest = {
    version: '0.1',
    briefcase_id: input.briefcase_id,
    created_at: new Date().toISOString(),
    source_substrate: input.source_substrate,
    artifacts,
    cradle_pavc_hash: input.cradle_pavc_hash,
    hmac: '',
  };
  manifest.hmac = computeManifestHmac(manifest, input.hmac_key);

  bundle.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  return { manifest, bundle };
}

export { sha256 };
