// src/ai/engine-titan/__tests__/compression-strategy.test.ts
//
// Tests the per-layer compression strategy controller: routing logic,
// quantizer selection, multi-layer planning, and model size estimation.

import { describe, test, expect } from '@jest/globals';
import {
  selectStrategy,
  selectQuantizer,
  planCompression,
  estimateModelSize,
  type LayerStrategy,
  type StrategyConfig,
} from '../compression-strategy';
import { E8QuantizerAdapter } from '../quantizer-e8-adapter';
import { TernaryQuantizerAdapter } from '../quantizer-ternary-adapter';

describe('selectStrategy — layer routing', () => {
  test('narrow layer (cols <= 1024) routes to svd-e8 with rank 128', () => {
    const s = selectStrategy('model.layers.0.self_attn.q_proj', 4096, 512);
    expect(s.path).toBe('svd-e8');
    expect(s.rank).toBe(128);
    expect(s.rhtEnabled).toBe(false);
    expect(s.layerName).toBe('model.layers.0.self_attn.q_proj');
  });

  test('narrow boundary (cols = 1024) is inclusive', () => {
    const s = selectStrategy('attn.k_proj', 4096, 1024);
    expect(s.path).toBe('svd-e8');
    expect(s.rank).toBe(128);
  });

  test('medium layer (1024 < cols <= 4096) routes to svd-e8 with rank 256', () => {
    const s = selectStrategy('model.layers.5.mlp.gate_proj', 4096, 2048);
    expect(s.path).toBe('svd-e8');
    expect(s.rank).toBe(256);
    expect(s.rhtEnabled).toBe(false);
  });

  test('medium boundary (cols = 4096) routes to medium path', () => {
    const s = selectStrategy('mlp.up', 4096, 4096);
    expect(s.path).toBe('svd-e8');
    expect(s.rank).toBe(256);
  });

  test('wide layer (cols > 4096) routes to raw-e8-rht', () => {
    const s = selectStrategy('model.layers.0.mlp.down_proj', 8192, 8192);
    expect(s.path).toBe('raw-e8-rht');
    expect(s.rank).toBeUndefined();
    expect(s.rhtEnabled).toBe(true);
  });

  test('wide layer at RHT boundary uses rht when cols > rhtWidthThreshold', () => {
    const s = selectStrategy('embed', 128256, 8192);
    expect(s.path).toBe('raw-e8-rht');
    expect(s.rhtEnabled).toBe(true);
  });

  test('wide layer with RHT threshold raised above cols gets raw-e8 without RHT', () => {
    const s = selectStrategy('embed', 4096, 8192, {
      rhtWidthThreshold: 16384,
    });
    expect(s.path).toBe('raw-e8');
    expect(s.rhtEnabled).toBe(false);
  });

  test('custom thresholds override defaults', () => {
    const config: StrategyConfig = {
      narrowThreshold: 512,
      wideThreshold: 2048,
      narrowRank: 64,
      mediumRank: 128,
    };

    const narrow = selectStrategy('a', 1024, 256, config);
    expect(narrow.path).toBe('svd-e8');
    expect(narrow.rank).toBe(64);

    const medium = selectStrategy('b', 1024, 1024, config);
    expect(medium.path).toBe('svd-e8');
    expect(medium.rank).toBe(128);

    const wide = selectStrategy('c', 1024, 4096, config);
    // cols=4096 == default rhtWidthThreshold=4096, strict >  means no RHT
    expect(wide.path).toBe('raw-e8');

    const wideWithRht = selectStrategy('d', 1024, 8192, config);
    expect(wideWithRht.path).toBe('raw-e8-rht');
  });

  test('reason string contains dimension info', () => {
    const s = selectStrategy('test.layer', 4096, 512);
    expect(s.reason).toContain('512');
    expect(s.reason).toContain('narrow');
  });

  test('K and V projections with same dimensions get identical strategy', () => {
    const kStrat = selectStrategy('layer.0.self_attn.k_proj', 4096, 1024);
    const vStrat = selectStrategy('layer.0.self_attn.v_proj', 4096, 1024);
    expect(kStrat.path).toBe(vStrat.path);
    expect(kStrat.rank).toBe(vStrat.rank);
    expect(kStrat.rhtEnabled).toBe(vStrat.rhtEnabled);
  });
});

describe('selectQuantizer', () => {
  test('svd-e8 path returns E8QuantizerAdapter', () => {
    const strategy = selectStrategy('attn.q', 4096, 512);
    const q = selectQuantizer(strategy);
    expect(q).toBeInstanceOf(E8QuantizerAdapter);
    expect(q.type).toBe('e8-lattice');
  });

  test('raw-e8-rht path returns E8QuantizerAdapter with RHT enabled', () => {
    const strategy = selectStrategy('mlp.down', 8192, 8192);
    const q = selectQuantizer(strategy);
    expect(q).toBeInstanceOf(E8QuantizerAdapter);
  });

  test('svd-ternary path returns TernaryQuantizerAdapter', () => {
    const strategy: LayerStrategy = {
      layerName: 'test',
      path: 'svd-ternary',
      rank: 128,
      rhtEnabled: false,
      reason: 'forced ternary',
    };
    const q = selectQuantizer(strategy);
    expect(q).toBeInstanceOf(TernaryQuantizerAdapter);
    expect(q.type).toBe('ternary');
  });
});

describe('planCompression', () => {
  test('plans a simulated Llama-style layer stack correctly', () => {
    const layers = [
      { name: 'model.layers.0.self_attn.q_proj', rows: 4096, cols: 4096 },
      { name: 'model.layers.0.self_attn.k_proj', rows: 4096, cols: 1024 },
      { name: 'model.layers.0.self_attn.v_proj', rows: 4096, cols: 1024 },
      { name: 'model.layers.0.self_attn.o_proj', rows: 4096, cols: 4096 },
      { name: 'model.layers.0.mlp.gate_proj', rows: 4096, cols: 14336 },
      { name: 'model.layers.0.mlp.up_proj', rows: 4096, cols: 14336 },
      { name: 'model.layers.0.mlp.down_proj', rows: 14336, cols: 4096 },
    ];

    const plan = planCompression(layers);
    expect(plan).toHaveLength(7);

    // Q, O projections: 4096 cols → medium path (svd-e8, rank 256)
    expect(plan[0].path).toBe('svd-e8');
    expect(plan[0].rank).toBe(256);

    // K, V projections: 1024 cols → narrow path (svd-e8, rank 128)
    expect(plan[1].path).toBe('svd-e8');
    expect(plan[1].rank).toBe(128);
    expect(plan[2].path).toBe('svd-e8');
    expect(plan[2].rank).toBe(128);

    // O projection: same as Q (4096 cols)
    expect(plan[3].path).toBe('svd-e8');

    // FFN gate, up: 14336 cols → raw-e8-rht
    expect(plan[4].path).toBe('raw-e8-rht');
    expect(plan[4].rhtEnabled).toBe(true);
    expect(plan[5].path).toBe('raw-e8-rht');

    // FFN down: 4096 cols → medium path
    expect(plan[6].path).toBe('svd-e8');
    expect(plan[6].rank).toBe(256);
  });

  test('plan preserves layer names', () => {
    const layers = [
      { name: 'layer_A', rows: 100, cols: 100 },
      { name: 'layer_B', rows: 100, cols: 5000 },
    ];
    const plan = planCompression(layers);
    expect(plan[0].layerName).toBe('layer_A');
    expect(plan[1].layerName).toBe('layer_B');
  });
});

describe('estimateModelSize', () => {
  test('raw E8 layer estimates at 3.5 bits/weight', () => {
    const strategies: LayerStrategy[] = [
      {
        layerName: 'test',
        path: 'raw-e8',
        rhtEnabled: false,
        reason: 'test',
      },
    ];
    const sizes = [{ rows: 1000, cols: 1000 }];
    const est = estimateModelSize(strategies, sizes);

    expect(est.totalWeights).toBe(1_000_000);
    expect(est.estimatedBits).toBe(3_500_000);
    expect(est.estimatedMB).toBeCloseTo(3_500_000 / 8 / 1024 / 1024, 5);
  });

  test('raw-e8-rht estimates same as raw-e8', () => {
    const rawStrat: LayerStrategy[] = [
      { layerName: 'a', path: 'raw-e8', rhtEnabled: false, reason: '' },
    ];
    const rhtStrat: LayerStrategy[] = [
      { layerName: 'a', path: 'raw-e8-rht', rhtEnabled: true, reason: '' },
    ];
    const sizes = [{ rows: 1000, cols: 8000 }];

    const rawEst = estimateModelSize(rawStrat, sizes);
    const rhtEst = estimateModelSize(rhtStrat, sizes);
    expect(rawEst.estimatedBits).toBe(rhtEst.estimatedBits);
  });

  test('svd-e8 includes A factor overhead', () => {
    const strategies: LayerStrategy[] = [
      {
        layerName: 'test',
        path: 'svd-e8',
        rank: 128,
        rhtEnabled: false,
        reason: '',
      },
    ];
    const sizes = [{ rows: 4096, cols: 4096 }];
    const est = estimateModelSize(strategies, sizes);

    // A: 4096 × 128 × 32 bits = 16,777,216 bits
    // B: 128 × 4096 × 3.5 bits = 1,835,008 bits
    // Total: 18,612,224 bits for 16,777,216 weights
    const expectedBits = 4096 * 128 * 32 + 128 * 4096 * 3.5;
    expect(est.estimatedBits).toBe(expectedBits);
    expect(est.totalWeights).toBe(4096 * 4096);
  });

  test('svd-ternary uses 1.58 bits/weight for B factor', () => {
    const strategies: LayerStrategy[] = [
      {
        layerName: 'test',
        path: 'svd-ternary',
        rank: 128,
        rhtEnabled: false,
        reason: '',
      },
    ];
    const sizes = [{ rows: 4096, cols: 4096 }];
    const est = estimateModelSize(strategies, sizes);

    const expectedBits = 4096 * 128 * 32 + 128 * 4096 * 1.58;
    expect(est.estimatedBits).toBe(expectedBits);
  });

  test('multi-layer estimate sums correctly', () => {
    const strategies: LayerStrategy[] = [
      { layerName: 'a', path: 'raw-e8', rhtEnabled: false, reason: '' },
      { layerName: 'b', path: 'raw-e8', rhtEnabled: false, reason: '' },
    ];
    const sizes = [
      { rows: 100, cols: 100 },
      { rows: 200, cols: 200 },
    ];
    const est = estimateModelSize(strategies, sizes);

    expect(est.totalWeights).toBe(10000 + 40000);
    expect(est.estimatedBits).toBe((10000 + 40000) * 3.5);
  });

  test('70B Llama-style model size estimate is in expected range', () => {
    // Simulate 80 layers of a 70B-class model
    const layers: { name: string; rows: number; cols: number }[] = [];
    const layerSizes: { rows: number; cols: number }[] = [];

    for (let i = 0; i < 80; i++) {
      // Q/O: 8192 × 8192, K/V: 8192 × 1024, gate/up: 8192 × 28672, down: 28672 × 8192
      const layerDefs = [
        { name: `l${i}.q`, rows: 8192, cols: 8192 },
        { name: `l${i}.k`, rows: 8192, cols: 1024 },
        { name: `l${i}.v`, rows: 8192, cols: 1024 },
        { name: `l${i}.o`, rows: 8192, cols: 8192 },
        { name: `l${i}.gate`, rows: 8192, cols: 28672 },
        { name: `l${i}.up`, rows: 8192, cols: 28672 },
        { name: `l${i}.down`, rows: 28672, cols: 8192 },
      ];
      for (const l of layerDefs) {
        layers.push(l);
        layerSizes.push({ rows: l.rows, cols: l.cols });
      }
    }

    const plan = planCompression(layers);
    const est = estimateModelSize(plan, layerSizes);

    // 70B model should estimate somewhere between 15-40 GB depending on mix
    const gb = est.estimatedMB / 1024;
    expect(gb).toBeGreaterThan(10);
    expect(gb).toBeLessThan(50);
    expect(est.totalWeights).toBeGreaterThan(50e9);
  });
});
