import {
  layerMetaToWeightCrystal,
  type TitanWeightCrystal,
} from '../titan-crystal-adapter';
import type { LayerMetadata } from '../orchestrator';

function makeMeta(overrides: Partial<LayerMetadata> = {}): LayerMetadata {
  return {
    layerName: 'model.layers.0.self_attn.q_proj',
    rows: 64,
    cols: 64,
    targetRank: 8,
    scaleB: 0.12,
    compressedAt: Date.now(),
    ...overrides,
  };
}

describe('layerMetaToWeightCrystal', () => {
  it('sets id from layerName', () => {
    const meta = makeMeta({ layerName: 'model.embed_tokens.weight' });
    const crystal = layerMetaToWeightCrystal(meta, '/vault');
    expect(crystal.id).toBe('model.embed_tokens.weight');
  });

  it('marks embedding layers as cornerstone', () => {
    const crystal = layerMetaToWeightCrystal(
      makeMeta({ layerName: 'model.embed_tokens.weight' }),
      '/vault'
    );
    expect(crystal.isCornerstone).toBe(true);
  });

  it('marks lm_head as cornerstone', () => {
    const crystal = layerMetaToWeightCrystal(
      makeMeta({ layerName: 'lm_head' }),
      '/vault'
    );
    expect(crystal.isCornerstone).toBe(true);
  });

  it('marks attention projection layers as non-cornerstone', () => {
    const crystal = layerMetaToWeightCrystal(
      makeMeta({ layerName: 'model.layers.5.self_attn.q_proj' }),
      '/vault'
    );
    expect(crystal.isCornerstone).toBe(false);
  });

  it('significance = targetRank / min(rows, cols), capped at 1', () => {
    const meta = makeMeta({ rows: 64, cols: 32, targetRank: 8 });
    const crystal = layerMetaToWeightCrystal(meta, '/vault');
    expect(crystal.significance).toBeCloseTo(8 / 32, 5);
  });

  it('significance saturates at 1 when rank >= minDim', () => {
    const meta = makeMeta({ rows: 4, cols: 4, targetRank: 4 });
    // decomposeMatrix throws for rank >= min(rows,cols) in practice,
    // but adapter should not crash — clamp to 1
    const crystal = layerMetaToWeightCrystal(meta, '/vault');
    expect(crystal.significance).toBeLessThanOrEqual(1);
  });

  it('builds correct vault paths from storageDir and layerName', () => {
    const meta = makeMeta({ layerName: 'layers.0.mlp' });
    const crystal = layerMetaToWeightCrystal(meta, '/data/vault');
    expect(crystal.vaultPaths.matrixA).toBe('/data/vault/layers.0.mlp.A.f32');
    expect(crystal.vaultPaths.packedB).toBe(
      '/data/vault/layers.0.mlp.B.packed'
    );
    expect(crystal.vaultPaths.meta).toBe('/data/vault/layers.0.mlp.meta.json');
  });

  it('preserves the original layerMeta reference', () => {
    const meta = makeMeta();
    const crystal = layerMetaToWeightCrystal(meta, '/vault');
    expect(crystal.layerMeta).toBe(meta);
  });

  it('satisfies EvictableCrystal shape (id, significance, isCornerstone)', () => {
    const crystal: TitanWeightCrystal = layerMetaToWeightCrystal(
      makeMeta(),
      '/vault'
    );
    expect(typeof crystal.id).toBe('string');
    expect(typeof crystal.significance).toBe('number');
    expect(typeof crystal.isCornerstone).toBe('boolean');
  });
});
