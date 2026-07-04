// src/ai/inference/__tests__/vault-verifier.test.ts
//
// Test contract per Eli's F4 Protocol Section 5 assignment (bridge 20:13 UTC
// 2026-07-04): "Unit test with mock vault (3 fake meta.json files, one with
// wrong hash)"
//
// Extended coverage:
//   - Happy path: 3 metas all match → valid=true, no mismatches
//   - One-wrong path: 2 match + 1 wrong → valid=false, 1 mismatch
//   - Missing hash field on some layers
//   - Vault dir missing
//   - GGUF file missing
//   - Empty vault dir (no meta files)
//   - Back-compat: sourceGGUFSha256 (all-caps GGUF, legacy) still accepted

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyVaultIntegrity } from '../vault-verifier';

// Test fixtures — small GGUF-shaped files, easy to hash
let tmpRoot: string;
let ggufA: string; // fixed content A
let ggufB: string; // fixed content B (different hash)
let ggufAHash: string;
let ggufBHash: string;

beforeAll(async () => {
  tmpRoot = join(tmpdir(), `vault-verifier-inference-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });

  ggufA = join(tmpRoot, 'model-A.gguf');
  ggufB = join(tmpRoot, 'model-B.gguf');
  // Distinct byte payloads so SHA-256 differs
  writeFileSync(ggufA, Buffer.from('GGUF-A-payload-' + 'x'.repeat(1024)));
  writeFileSync(ggufB, Buffer.from('GGUF-B-payload-' + 'y'.repeat(1024)));

  // Compute expected hashes once (using verifyVaultIntegrity on empty vault
  // to leverage the shared hasher would trigger vault-empty branch; instead
  // hash directly here so tests are hermetic).
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  ggufAHash = createHash('sha256').update(readFileSync(ggufA)).digest('hex');
  ggufBHash = createHash('sha256').update(readFileSync(ggufB)).digest('hex');
});

afterAll(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function makeVault(
  name: string,
  layers: Array<{ layer: string; hash: string | null; useLegacyKey?: boolean }>
): string {
  const dir = join(tmpRoot, name);
  mkdirSync(dir, { recursive: true });
  for (const { layer, hash, useLegacyKey } of layers) {
    const meta: Record<string, unknown> = {
      layerName: layer,
      rows: 1,
      cols: 1,
      targetRank: 1,
      compressedAt: 1,
    };
    if (hash !== null) {
      if (useLegacyKey) {
        meta.sourceGGUFSha256 = hash; // legacy all-caps
      } else {
        meta.sourceGgufSha256 = hash; // Eli spec camelCase
      }
    }
    writeFileSync(join(dir, `${layer}.meta.json`), JSON.stringify(meta));
  }
  return dir;
}

describe('verifyVaultIntegrity — F4 Section 5', () => {
  it('happy path: 3 metas all match → valid=true, no mismatches', async () => {
    const vault = makeVault('happy', [
      { layer: 'blk.0.attn_q', hash: ggufAHash },
      { layer: 'blk.0.attn_k', hash: ggufAHash },
      { layer: 'blk.0.attn_v', hash: ggufAHash },
    ]);
    const report = await verifyVaultIntegrity(vault, ggufA);
    expect(report.valid).toBe(true);
    expect(report.mismatches).toEqual([]);
    expect(report.layerCount).toBe(3);
    expect(report.ggufSha256).toBe(ggufAHash);
  });

  it('one-wrong path: 2 match + 1 wrong → valid=false, 1 mismatch', async () => {
    const vault = makeVault('one-wrong', [
      { layer: 'blk.0.attn_q', hash: ggufAHash },
      { layer: 'blk.0.attn_k', hash: ggufBHash }, // wrong
      { layer: 'blk.0.attn_v', hash: ggufAHash },
    ]);
    const report = await verifyVaultIntegrity(vault, ggufA);
    expect(report.valid).toBe(false);
    expect(report.mismatches).toEqual(['blk.0.attn_k']);
    expect(report.layerCount).toBe(3);
    expect(report.ggufSha256).toBe(ggufAHash);
  });

  it('all-wrong: every layer disagrees → all listed', async () => {
    const vault = makeVault('all-wrong', [
      { layer: 'a', hash: ggufBHash },
      { layer: 'b', hash: ggufBHash },
      { layer: 'c', hash: ggufBHash },
    ]);
    const report = await verifyVaultIntegrity(vault, ggufA);
    expect(report.valid).toBe(false);
    expect(report.mismatches.sort()).toEqual(['a', 'b', 'c']);
    expect(report.layerCount).toBe(3);
  });

  it('missing-hash-field marked distinctly', async () => {
    const vault = makeVault('missing-field', [
      { layer: 'good', hash: ggufAHash },
      { layer: 'nohash', hash: null }, // no sourceGgufSha256 field
    ]);
    const report = await verifyVaultIntegrity(vault, ggufA);
    expect(report.valid).toBe(false);
    expect(report.mismatches).toContain('nohash:missing-hash-field');
    expect(report.mismatches).not.toContain('good');
  });

  it('legacy field name (sourceGGUFSha256 all-caps) still accepted', async () => {
    const vault = makeVault('legacy', [
      { layer: 'legacy-a', hash: ggufAHash, useLegacyKey: true },
      { layer: 'legacy-b', hash: ggufAHash, useLegacyKey: true },
    ]);
    const report = await verifyVaultIntegrity(vault, ggufA);
    expect(report.valid).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it('vault dir missing → valid=false with sentinel mismatch', async () => {
    const report = await verifyVaultIntegrity(
      join(tmpRoot, 'does-not-exist'),
      ggufA
    );
    expect(report.valid).toBe(false);
    expect(report.mismatches).toContain(':vault-dir-missing');
    expect(report.layerCount).toBe(0);
  });

  it('GGUF file missing → valid=false with sentinel mismatch', async () => {
    const vault = makeVault('needs-gguf', [{ layer: 'x', hash: ggufAHash }]);
    const report = await verifyVaultIntegrity(
      vault,
      join(tmpRoot, 'missing.gguf')
    );
    expect(report.valid).toBe(false);
    expect(report.mismatches).toContain(':gguf-file-missing');
    expect(report.ggufSha256).toBe('');
  });

  it('empty vault dir → valid=false (nothing to verify against)', async () => {
    const emptyDir = join(tmpRoot, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const report = await verifyVaultIntegrity(emptyDir, ggufA);
    expect(report.valid).toBe(false);
    expect(report.layerCount).toBe(0);
    expect(report.ggufSha256).toBe(ggufAHash);
  });

  it('unreadable meta.json → marked as sentinel, other layers unaffected', async () => {
    const dir = join(tmpRoot, 'unreadable');
    mkdirSync(dir, { recursive: true });
    // Valid meta
    writeFileSync(
      join(dir, 'good.meta.json'),
      JSON.stringify({ sourceGgufSha256: ggufAHash })
    );
    // Malformed JSON
    writeFileSync(join(dir, 'broken.meta.json'), '{not valid json');
    const report = await verifyVaultIntegrity(dir, ggufA);
    expect(report.valid).toBe(false);
    expect(report.mismatches).toContain('broken:unreadable-meta');
    expect(report.mismatches).not.toContain('good');
    expect(report.layerCount).toBe(2);
  });
});
