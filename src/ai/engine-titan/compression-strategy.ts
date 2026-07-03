// src/ai/engine-titan/compression-strategy.ts
//
// Tiered compression strategy controller for Titan Engine.
// Decides per-layer which compression path yields best fidelity/size tradeoff.
//
// Based on empirical findings (John T002/T005/T007):
//   - Narrow layers (attn Q/K/V, cols <= 1024): SVD + E8 works well (cos 0.86+)
//   - Wide layers (FFN, embedding, cols > 4096): SVD destroys signal at feasible ranks.
//     Raw E8 (with conditional RHT) achieves cos 0.965+ directly.
//   - Medium layers: SVD + E8 at higher rank (128-256)
//
// The strategy also respects hardware constraints:
//   - Mali-G57 MC2: 128KB L2, no large codebook pressure (E8 is algorithmic)
//   - Crystal hot-tier: 4 layers in DRAM simultaneously
//   - KVarN mandatory for KV cache compression at context > 1024

import type { TitanQuantizer } from './quantizer-interface';
import {
  E8QuantizerAdapter,
  type E8AdapterOptions,
} from './quantizer-e8-adapter';
import { TernaryQuantizerAdapter } from './quantizer-ternary-adapter';

export type CompressionPath =
  | 'svd-e8'
  | 'svd-ternary'
  | 'raw-e8'
  | 'raw-e8-rht';

export interface LayerStrategy {
  readonly layerName: string;
  readonly path: CompressionPath;
  readonly rank?: number;
  readonly rhtEnabled: boolean;
  readonly reason: string;
}

export interface StrategyConfig {
  narrowThreshold?: number; // cols <= this → SVD path (default 1024)
  wideThreshold?: number; // cols > this → raw E8 (default 4096)
  narrowRank?: number; // SVD rank for narrow layers (default 128)
  mediumRank?: number; // SVD rank for medium layers (default 256)
  rhtWidthThreshold?: number; // RHT applied when cols > this (default 4096)
  forceQuantizer?: 'e8-lattice' | 'ternary';
}

const DEFAULT_CONFIG: Required<StrategyConfig> = {
  narrowThreshold: 1024,
  wideThreshold: 4096,
  narrowRank: 128,
  mediumRank: 256,
  rhtWidthThreshold: 4096,
  forceQuantizer: 'e8-lattice',
};

export function selectStrategy(
  layerName: string,
  rows: number,
  cols: number,
  config?: StrategyConfig
): LayerStrategy {
  const c = { ...DEFAULT_CONFIG, ...config };

  if (cols <= c.narrowThreshold) {
    return {
      layerName,
      path: 'svd-e8',
      rank: c.narrowRank,
      rhtEnabled: false,
      reason: `narrow layer (cols=${cols} <= ${c.narrowThreshold}): SVD viable, rank ${c.narrowRank}`,
    };
  }

  if (cols > c.wideThreshold) {
    const useRht = cols > c.rhtWidthThreshold;
    return {
      layerName,
      path: useRht ? 'raw-e8-rht' : 'raw-e8',
      rhtEnabled: useRht,
      reason: `wide layer (cols=${cols} > ${c.wideThreshold}): raw E8${useRht ? '+RHT' : ''}, SVD destroys signal`,
    };
  }

  // Medium: SVD at higher rank
  return {
    layerName,
    path: 'svd-e8',
    rank: c.mediumRank,
    rhtEnabled: false,
    reason: `medium layer (cols=${cols}): SVD at rank ${c.mediumRank}`,
  };
}

export function selectQuantizer(
  strategy: LayerStrategy,
  options?: E8AdapterOptions
): TitanQuantizer {
  if (strategy.path === 'svd-ternary') {
    return new TernaryQuantizerAdapter();
  }
  return new E8QuantizerAdapter({
    rhtWidthThreshold: strategy.rhtEnabled ? 0 : Infinity,
    ...options,
  });
}

export function planCompression(
  layers: { name: string; rows: number; cols: number }[],
  config?: StrategyConfig
): LayerStrategy[] {
  return layers.map((l) => selectStrategy(l.name, l.rows, l.cols, config));
}

export function estimateModelSize(
  strategies: LayerStrategy[],
  layerSizes: { rows: number; cols: number }[]
): { totalWeights: number; estimatedBits: number; estimatedMB: number } {
  let totalWeights = 0;
  let totalBits = 0;

  for (let i = 0; i < strategies.length; i++) {
    const { rows, cols } = layerSizes[i];
    const weights = rows * cols;
    totalWeights += weights;

    const strategy = strategies[i];
    let bitsPerWeight: number;

    switch (strategy.path) {
      case 'raw-e8':
      case 'raw-e8-rht':
        bitsPerWeight = 3.5; // entropy-coded E8 (empirical average)
        break;
      case 'svd-e8':
        // SVD stores A (full precision) + B (E8 quantized)
        // A: rows × rank × 32 bits, B: rank × cols × 3.5 bits
        const rank = strategy.rank ?? 128;
        const aBits = rows * rank * 32;
        const bBits = rank * cols * 3.5;
        bitsPerWeight = (aBits + bBits) / weights;
        break;
      case 'svd-ternary':
        const tRank = strategy.rank ?? 128;
        const taBits = rows * tRank * 32;
        const tbBits = tRank * cols * 1.58;
        bitsPerWeight = (taBits + tbBits) / weights;
        break;
    }

    totalBits += weights * bitsPerWeight;
  }

  return {
    totalWeights,
    estimatedBits: totalBits,
    estimatedMB: totalBits / 8 / 1024 / 1024,
  };
}
