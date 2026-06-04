/**
 * @fileOverview Briefcase verifier — receiver-side validation (W0.1)
 *
 * Order of checks (any failure = hard halt, do not proceed):
 *   1. manifest HMAC verifies (F1.1)
 *   2. each artifact's stored sha256 matches contents (F1.5 covers optional)
 *   3. no unlisted entries in bundle (F1.5 adversarial — Atlas review finding)
 *   4. compressed artifacts: post-decompression sha256 matches manifest
 *      decompressed_sha256 (F1.2)
 *   5. cradle.md PAVC hash matches manifest.cradle_pavc_hash (F1.3)
 *   6. egress-receipt.json is present and gate-signed (F1.4)
 */

import { sha256, verifyManifestHmac, verifyArtifactHashes } from './manifest';
import { verifyEgressReceipt } from './egress-receipt';
import type { Manifest, EgressReceipt } from './schema';

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; halt: true };

export interface VerifyInput {
  manifest: Manifest;
  contents: Map<string, Buffer>;
  decompressed: Map<string, Buffer>;
  expected_cradle_pavc_hash: string;
  hmac_key: Buffer;
  gate_key: Buffer;
}

export function verifyBriefcase(input: VerifyInput): VerifyResult {
  if (!verifyManifestHmac(input.manifest, input.hmac_key)) {
    return { ok: false, reason: 'manifest HMAC invalid', halt: true };
  }

  const hashes = verifyArtifactHashes(input.manifest, input.contents);
  if (!hashes.ok) return { ok: false, reason: hashes.reason, halt: true };

  // F1.5 (Atlas adversarial finding): reject any bundle entry that is not
  // listed in the manifest and is not a known internal file.  An attacker who
  // injects extra content into a valid bundle must not be able to slip it past
  // the receiver undetected.
  const KNOWN_INTERNAL = new Set(['manifest.json', 'egress-receipt.json']);
  const listedNames = new Set(input.manifest.artifacts.map((a) => a.name));
  for (const name of input.contents.keys()) {
    if (!KNOWN_INTERNAL.has(name) && !listedNames.has(name)) {
      return {
        ok: false,
        reason: `unlisted bundle entry: ${name}`,
        halt: true,
      };
    }
  }

  for (const entry of input.manifest.artifacts) {
    if (!entry.compressed) continue;
    const plain = input.decompressed.get(entry.name);
    if (!plain) {
      return {
        ok: false,
        reason: `decompressed bytes missing: ${entry.name}`,
        halt: true,
      };
    }
    if (sha256(plain) !== entry.decompressed_sha256) {
      return {
        ok: false,
        reason: `post-decompression checksum mismatch: ${entry.name}`,
        halt: true,
      };
    }
  }

  const cradle = input.contents.get('cradle.md');
  if (!cradle) {
    return { ok: false, reason: 'cradle.md missing', halt: true };
  }
  if (sha256(cradle) !== input.expected_cradle_pavc_hash) {
    return { ok: false, reason: 'cradle PAVC hash mismatch', halt: true };
  }
  if (input.manifest.cradle_pavc_hash !== input.expected_cradle_pavc_hash) {
    return {
      ok: false,
      reason: 'manifest cradle_pavc_hash differs from expected',
      halt: true,
    };
  }

  const receiptBuf = input.contents.get('egress-receipt.json');
  let receipt: EgressReceipt | undefined;
  if (receiptBuf) {
    try {
      receipt = JSON.parse(receiptBuf.toString('utf8')) as EgressReceipt;
    } catch {
      return { ok: false, reason: 'egress-receipt unparseable', halt: true };
    }
  }
  const r = verifyEgressReceipt(receipt, input.gate_key);
  if (!r.ok) return { ok: false, reason: r.reason, halt: true };

  return { ok: true };
}
