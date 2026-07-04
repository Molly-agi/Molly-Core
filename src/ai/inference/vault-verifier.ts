// src/ai/inference/vault-verifier.ts
//
// F4 Protocol Section 5 — Vault integrity verifier for inference load time.
//
// Assigned by Eli via bridge 20:13 UTC 2026-07-04. Companion to (but distinct
// from) src/ai/engine-titan/vault-verifier.ts:
//
//   engine-titan/vault-verifier   — verifyVaultSource(): boolean-ish "does the
//                                    vault agree with itself + this GGUF",
//                                    returns { ok, expected, actual, sampleLayer }
//                                    Used for quick load-time gate.
//
//   inference/vault-verifier      — verifyVaultIntegrity(): per-layer report,
//                                    returns { valid, mismatches[], layerCount,
//                                    ggufSha256 }
//                                    Used for F4 dry-run diagnostics + audit
//                                    trail where you need to know WHICH layers
//                                    disagree, not just IF any disagree.
//
// Both consume the same shared streaming-hash helper from streaming-compress.ts
// (hashFileSha256) so the hashing logic is not duplicated.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hashFileSha256 } from '../engine-titan/streaming-compress';

/**
 * Per-layer verification report returned by verifyVaultIntegrity.
 *
 * valid       — true iff every meta.json's sourceGgufSha256 matches the current
 *               GGUF hash. False if any layer disagrees, if the GGUF is missing,
 *               or if any meta lacks a sourceGgufSha256 field.
 * mismatches  — layer names whose stored hash does NOT match the current GGUF.
 *               Also includes layers with missing sourceGgufSha256 field
 *               (marked as ":missing-hash-field"). Empty when valid.
 * layerCount  — total number of *.meta.json files scanned (valid + invalid).
 * ggufSha256  — SHA-256 hex digest of the current GGUF file. Empty string if
 *               GGUF file missing (in which case valid=false).
 */
export interface VaultIntegrityReport {
  valid: boolean;
  mismatches: string[];
  layerCount: number;
  ggufSha256: string;
}

/**
 * F4 Section 5 — verify vault integrity against a source GGUF.
 *
 * For each *.meta.json file in vaultDir:
 *   1. Read and parse the meta
 *   2. Extract sourceGgufSha256 field (field name matches Eli's spec;
 *      legacy field sourceGGUFSha256 with capital G is also accepted for
 *      back-compat with vaults written before the field-name convention
 *      was locked)
 *   3. Compare against SHA-256 of the current GGUF file
 *
 * Returns a per-layer mismatch report. Streaming hash means 40GB+ GGUFs
 * do not load into memory.
 *
 * @param vaultDir  path to directory containing *.meta.json files
 * @param ggufPath  path to the GGUF file the vault claims to be derived from
 */
export async function verifyVaultIntegrity(
  vaultDir: string,
  ggufPath: string
): Promise<VaultIntegrityReport> {
  if (!existsSync(vaultDir)) {
    return {
      valid: false,
      mismatches: [':vault-dir-missing'],
      layerCount: 0,
      ggufSha256: '',
    };
  }
  if (!existsSync(ggufPath)) {
    return {
      valid: false,
      mismatches: [':gguf-file-missing'],
      layerCount: 0,
      ggufSha256: '',
    };
  }

  const ggufSha256 = await hashFileSha256(ggufPath);

  const metaFiles = readdirSync(vaultDir).filter((f) =>
    f.endsWith('.meta.json')
  );
  const mismatches: string[] = [];

  for (const metaFile of metaFiles) {
    const layerName = metaFile.replace(/\.meta\.json$/, '');
    let meta: Record<string, unknown>;
    try {
      const raw = readFileSync(join(vaultDir, metaFile), 'utf-8');
      meta = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      mismatches.push(`${layerName}:unreadable-meta`);
      continue;
    }

    // Accept both field name conventions:
    //   sourceGgufSha256  (Eli spec, camelCase)
    //   sourceGGUFSha256  (legacy from a7efe729 commit, all-caps GGUF)
    const stored =
      (meta.sourceGgufSha256 as string | undefined) ??
      (meta.sourceGGUFSha256 as string | undefined);

    if (typeof stored !== 'string' || stored.length === 0) {
      mismatches.push(`${layerName}:missing-hash-field`);
      continue;
    }

    if (stored !== ggufSha256) {
      mismatches.push(layerName);
    }
  }

  return {
    valid: mismatches.length === 0 && metaFiles.length > 0,
    mismatches,
    layerCount: metaFiles.length,
    ggufSha256,
  };
}
