// src/ai/engine-titan/__tests__/vault-verifier.test.ts
//
// Coverage:
//   - Happy path: SHA matches, verifier returns ok=true
//   - Drift detection: SHA mismatch flagged as fatal with clear reason
//   - Internal inconsistency: mixed-hash vault flagged, divergentLayers populated
//   - Legacy compat: vault predating sourceGGUFSha256 field passes with reason
//   - hashFileSha256 streams a real file and matches openssl output

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verifyVaultSource } from '../vault-verifier';
import { hashFileSha256 } from '../streaming-compress';
import type { LayerMetadata } from '../orchestrator';

let tmpDir: string;
let ggufA: string;
let ggufB: string;
let ggufAHash: string;
let ggufBHash: string;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `vault-verifier-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  ggufA = join(tmpDir, 'sourceA.gguf');
  ggufB = join(tmpDir, 'sourceB.gguf');
  // Deterministic byte fixtures — same bytes = same hash
  writeFileSync(ggufA, Buffer.from('GGUF-fixture-A-' + 'a'.repeat(1000)));
  writeFileSync(ggufB, Buffer.from('GGUF-fixture-B-' + 'b'.repeat(1000)));
  ggufAHash = await hashFileSha256(ggufA);
  ggufBHash = await hashFileSha256(ggufB);
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function writeMeta(vaultDir: string, meta: LayerMetadata) {
  writeFileSync(
    join(vaultDir, `${meta.layerName}.meta.json`),
    JSON.stringify(meta, null, 2)
  );
}

function baseMeta(name: string): LayerMetadata {
  return {
    layerName: name,
    rows: 4,
    cols: 8,
    targetRank: 8,
    compressedAt: 1,
    quantizerType: 'int8-per-row',
    compressionPath: 'int8-per-row',
  };
}

describe('hashFileSha256', () => {
  it('produces stable 64-char lowercase hex', async () => {
    expect(ggufAHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ggufBHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ggufAHash).not.toBe(ggufBHash);
  });

  it('matches a single-pass Node crypto hash of the same bytes', async () => {
    // Cross-check: read the whole file and hash directly, must equal streaming
    const bytes = readFileSync(ggufA);
    const oneShot = createHash('sha256').update(bytes).digest('hex');
    expect(ggufAHash).toBe(oneShot);
  });
});

describe('verifyVaultSource', () => {
  let vault: string;

  beforeAll(() => {
    vault = join(tmpDir, 'vault1');
    mkdirSync(vault, { recursive: true });
  });

  it('happy path: SHA matches → ok=true', async () => {
    writeMeta(vault, { ...baseMeta('layer_a'), sourceGGUFSha256: ggufAHash });
    writeMeta(vault, { ...baseMeta('layer_b'), sourceGGUFSha256: ggufAHash });
    const result = await verifyVaultSource(vault, ggufA);
    expect(result.ok).toBe(true);
    expect(result.expected).toBe(ggufAHash);
    expect(result.actual).toBe(ggufAHash);
    expect(result.divergentLayers).toHaveLength(0);
    expect(result.legacyLayers).toHaveLength(0);
  });

  it('detects drift: GGUF changed since compression → ok=false with clear reason', async () => {
    // Vault has hash of A but we point verifier at B
    const result = await verifyVaultSource(vault, ggufB);
    expect(result.ok).toBe(false);
    expect(result.expected).toBe(ggufAHash);
    expect(result.actual).toBe(ggufBHash);
    expect(result.reason).toMatch(/drifted since compression/);
  });

  it('detects internal inconsistency: mixed-hash vault flagged', async () => {
    const dirtyVault = join(tmpDir, 'dirty-vault');
    mkdirSync(dirtyVault, { recursive: true });
    writeMeta(dirtyVault, {
      ...baseMeta('layer_a'),
      sourceGGUFSha256: ggufAHash,
    });
    writeMeta(dirtyVault, {
      ...baseMeta('layer_b'),
      sourceGGUFSha256: ggufBHash, // different source!
    });
    const result = await verifyVaultSource(dirtyVault, ggufA);
    expect(result.ok).toBe(false);
    expect(result.divergentLayers).toContain('layer_b');
    expect(result.reason).toMatch(/internally inconsistent/);
  });

  it('legacy compat: vault without sourceGGUFSha256 field → ok=true with reason', async () => {
    const legacyVault = join(tmpDir, 'legacy-vault');
    mkdirSync(legacyVault, { recursive: true });
    // No sourceGGUFSha256 field
    writeMeta(legacyVault, baseMeta('layer_a'));
    writeMeta(legacyVault, baseMeta('layer_b'));
    const result = await verifyVaultSource(legacyVault, ggufA);
    expect(result.ok).toBe(true);
    expect(result.expected).toBeNull();
    expect(result.legacyLayers).toHaveLength(2);
    expect(result.reason).toMatch(/legacy vault/);
  });

  it('mixed legacy + tracked: passes when tracked layers match, notes legacy count', async () => {
    const mixedVault = join(tmpDir, 'mixed-vault');
    mkdirSync(mixedVault, { recursive: true });
    writeMeta(mixedVault, {
      ...baseMeta('tracked_layer'),
      sourceGGUFSha256: ggufAHash,
    });
    writeMeta(mixedVault, baseMeta('legacy_layer')); // no hash
    const result = await verifyVaultSource(mixedVault, ggufA);
    expect(result.ok).toBe(true);
    expect(result.expected).toBe(ggufAHash);
    expect(result.legacyLayers).toEqual(['legacy_layer']);
  });

  it('empty vault: returns ok=true with legacy reason (no metas to check)', async () => {
    const emptyVault = join(tmpDir, 'empty-vault');
    mkdirSync(emptyVault, { recursive: true });
    const result = await verifyVaultSource(emptyVault, ggufA);
    expect(result.ok).toBe(true);
    expect(result.expected).toBeNull();
  });

  it('skips malformed meta files without crashing', async () => {
    const halfBrokenVault = join(tmpDir, 'half-broken');
    mkdirSync(halfBrokenVault, { recursive: true });
    writeFileSync(join(halfBrokenVault, 'broken.meta.json'), '{invalid json}');
    writeMeta(halfBrokenVault, {
      ...baseMeta('good_layer'),
      sourceGGUFSha256: ggufAHash,
    });
    const result = await verifyVaultSource(halfBrokenVault, ggufA);
    expect(result.ok).toBe(true);
    expect(result.sampleLayer).toBe('good_layer');
  });
});
