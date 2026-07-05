// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/weight-crystal-adapter.ts

import type { EvictableCrystal } from '../memory/crystal-library-eviction';
import type { LayerMetadata } from './orchestrator';

export interface TitanWeightCrystal extends EvictableCrystal {
  id: string;
  significance: number;
  isCornerstone: boolean;
  moduleType: 'weight';
  storagePath: string;
  rows: number;
  cols: number;
  targetRank: number;
  scaleB: number;
  compressedAt: number;
}

export type LayerCategory =
  | 'embedding'
  | 'attention'
  | 'mlp'
  | 'norm'
  | 'output'
  | 'unknown';

const LAYER_SIGNIFICANCE: Record<LayerCategory, number> = {
  embedding: 0.95,
  output: 0.95,
  attention: 0.85,
  mlp: 0.7,
  norm: 0.5,
  unknown: 0.4,
};

const CORNERSTONE_CATEGORIES: Set<LayerCategory> = new Set([
  'embedding',
  'output',
]);

export function classifyLayer(layerName: string): LayerCategory {
  const lower = layerName.toLowerCase();
  if (lower.includes('embed') || lower.includes('wte') || lower.includes('wpe'))
    return 'embedding';
  if (
    lower.includes('lm_head') ||
    lower.includes('output') ||
    lower.includes('final')
  )
    return 'output';
  if (
    lower.includes('attn') ||
    lower.includes('attention') ||
    lower.includes('q_proj') ||
    lower.includes('k_proj') ||
    lower.includes('v_proj') ||
    lower.includes('o_proj')
  )
    return 'attention';
  if (
    lower.includes('mlp') ||
    lower.includes('ffn') ||
    lower.includes('gate') ||
    lower.includes('up_proj') ||
    lower.includes('down_proj')
  )
    return 'mlp';
  if (
    lower.includes('norm') ||
    lower.includes('ln') ||
    lower.includes('layernorm')
  )
    return 'norm';
  return 'unknown';
}

export function metadataToWeightCrystal(
  meta: LayerMetadata,
  storagePath: string
): TitanWeightCrystal {
  const category = classifyLayer(meta.layerName);
  return {
    id: meta.layerName,
    significance: LAYER_SIGNIFICANCE[category],
    isCornerstone: CORNERSTONE_CATEGORIES.has(category),
    moduleType: 'weight',
    storagePath,
    rows: meta.rows,
    cols: meta.cols,
    targetRank: meta.targetRank,
    scaleB: meta.scaleB,
    compressedAt: meta.compressedAt,
  };
}

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadWeightCrystalsFromDir(
  storageDir: string
): TitanWeightCrystal[] {
  const files: string[] = readdirSync(storageDir).filter((f: string) =>
    f.endsWith('.meta.json')
  );

  return files.map((file: string) => {
    const raw = readFileSync(join(storageDir, file), 'utf-8');
    const meta: LayerMetadata = JSON.parse(raw);
    return metadataToWeightCrystal(meta, storageDir);
  });
}
