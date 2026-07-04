// src/ai/engine-titan/vault-verifier.ts
//
// Fable v3 requirement: verify at inference load time that the source GGUF
// hasn't drifted since compression. Motivation: 1D tensors (norms, biases,
// embeddings NOT in vault) come from GGUF at inference. If someone recompiled
// the model or the file was modified, the 1D tensors won't match the compressed
// 2D crystals and the model will silently produce garbage.
//
// This module provides:
//   - hashFileSha256(path)         streaming SHA-256 (re-exported from
//                                  streaming-compress for convenience)
//   - verifyVaultSource(vaultDir, ggufPath) → { ok, expected, actual, sampleLayer }
//     Compares the SHA-256 of the current GGUF against the sourceGGUFSha256
//     recorded in the vault's meta files. Reads the first meta file with a
//     source hash to determine expected value; asserts remaining metas match.
//
// The verifier is invoked by the loader (e.g., CrystalTransformerDriver setup)
// before any inference begins. Failing the check is a hard error, not a warn —
// silent GGUF drift is exactly the failure mode we're guarding against.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hashFileSha256 } from './streaming-compress';
import type { LayerMetadata } from './orchestrator';

export interface VaultVerificationResult {
  ok: boolean;
  /** SHA-256 recorded in the vault (from any meta.json). Null if no meta has one. */
  expected: string | null;
  /** SHA-256 of the current GGUF file. */
  actual: string;
  /** Layer name whose meta was used as the reference. */
  sampleLayer: string | null;
  /**
   * Layer names whose meta records a DIFFERENT sourceGGUFSha256 than
   * `expected`. Non-empty means the vault itself is inconsistent — was
   * compressed against multiple GGUF versions in different passes. Fatal.
   */
  divergentLayers: string[];
  /**
   * Layer names with NO sourceGGUFSha256 field (legacy crystals from before
   * this feature landed). Not fatal; verifier will still pass if all layers
   * that DO have the field agree with the current GGUF.
   */
  legacyLayers: string[];
  reason: string;
}

/**
 * Walk the vault directory, read every .meta.json, compare recorded
 * sourceGGUFSha256 against the actual SHA-256 of the GGUF at `ggufPath`.
 */
export async function verifyVaultSource(
  vaultDir: string,
  ggufPath: string
): Promise<VaultVerificationResult> {
  const actual = await hashFileSha256(ggufPath);

  let expected: string | null = null;
  let sampleLayer: string | null = null;
  const divergentLayers: string[] = [];
  const legacyLayers: string[] = [];

  for (const entry of readdirSync(vaultDir)) {
    if (!entry.endsWith('.meta.json')) continue;
    try {
      const raw = readFileSync(join(vaultDir, entry), 'utf-8');
      const meta = JSON.parse(raw) as LayerMetadata;
      const layerName = meta.layerName ?? entry.replace(/\.meta\.json$/, '');

      if (!meta.sourceGGUFSha256) {
        legacyLayers.push(layerName);
        continue;
      }

      if (expected === null) {
        expected = meta.sourceGGUFSha256;
        sampleLayer = layerName;
      } else if (meta.sourceGGUFSha256 !== expected) {
        divergentLayers.push(layerName);
      }
    } catch {
      // Malformed meta — skip. Loader will surface the parse error elsewhere.
    }
  }

  if (expected === null) {
    // No meta had a sourceGGUFSha256. Vault predates this feature.
    return {
      ok: true, // best-effort back-compat
      expected: null,
      actual,
      sampleLayer: null,
      divergentLayers: [],
      legacyLayers,
      reason:
        'no sourceGGUFSha256 recorded in any vault meta — legacy vault, verification skipped',
    };
  }

  if (divergentLayers.length > 0) {
    return {
      ok: false,
      expected,
      actual,
      sampleLayer,
      divergentLayers,
      legacyLayers,
      reason: `vault is internally inconsistent: ${divergentLayers.length} layer(s) recorded a different sourceGGUFSha256 than the sample (${sampleLayer}). Vault was compressed against multiple GGUF versions.`,
    };
  }

  if (expected !== actual) {
    return {
      ok: false,
      expected,
      actual,
      sampleLayer,
      divergentLayers: [],
      legacyLayers,
      reason: `source GGUF has drifted since compression. Expected SHA-256 ${expected} (from ${sampleLayer}), current file is ${actual}. 1D tensors (norms, biases) from the current GGUF will not match the compressed crystals.`,
    };
  }

  return {
    ok: true,
    expected,
    actual,
    sampleLayer,
    divergentLayers: [],
    legacyLayers,
    reason: `vault source verified — SHA-256 ${expected} matches (${legacyLayers.length} legacy layer(s) skipped)`,
  };
}
