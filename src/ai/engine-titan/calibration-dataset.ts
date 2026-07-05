// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/calibration-dataset.ts
//
// Calibration dataset for GPTQ-style layer-wise error compensation.
// Provides representative token sequences to measure activation error
// during quantization. Supports three modes:
//   1. WikiText-2 (if tokenizer.json available)
//   2. GGUF-extracted tokenizer + raw text
//   3. Synthetic random tokens (fallback — still effective for error compensation)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface CalibrationConfig {
  numSequences: number; // default 128
  seqLength: number; // default 2048
  vocabSize: number; // default 152064 (Qwen 2.5)
  outputDir: string; // where to save binary calibration data
  seed?: number; // for reproducibility
}

export interface CalibrationDataset {
  sequences: Int32Array[]; // array of token ID sequences
  numSequences: number;
  seqLength: number;
  vocabSize: number;
}

const DEFAULT_CONFIG: CalibrationConfig = {
  numSequences: 128,
  seqLength: 2048,
  vocabSize: 152064,
  outputDir: 'molly_data/calibration',
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateSyntheticCalibration(
  config: Partial<CalibrationConfig> = {}
): CalibrationDataset {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = seededRandom(cfg.seed ?? 42);
  const sequences: Int32Array[] = [];

  for (let i = 0; i < cfg.numSequences; i++) {
    const seq = new Int32Array(cfg.seqLength);
    for (let j = 0; j < cfg.seqLength; j++) {
      // Zipf-like distribution (more realistic than uniform)
      // Real text has heavy token frequency bias
      const u = rng();
      seq[j] = Math.floor(Math.pow(u, 2.0) * cfg.vocabSize);
    }
    sequences.push(seq);
  }

  return {
    sequences,
    numSequences: cfg.numSequences,
    seqLength: cfg.seqLength,
    vocabSize: cfg.vocabSize,
  };
}

export function generateCalibrationFromText(
  text: string,
  encode: (text: string) => number[],
  config: Partial<CalibrationConfig> = {}
): CalibrationDataset {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const allTokens = encode(text);
  const sequences: Int32Array[] = [];

  for (let i = 0; i < cfg.numSequences; i++) {
    const start = i * cfg.seqLength;
    if (start + cfg.seqLength > allTokens.length) break;
    sequences.push(
      new Int32Array(allTokens.slice(start, start + cfg.seqLength))
    );
  }

  // Pad with repeats if not enough text
  while (sequences.length < cfg.numSequences) {
    const idx = sequences.length % Math.max(1, sequences.length);
    sequences.push(new Int32Array(sequences[idx]));
  }

  return {
    sequences,
    numSequences: sequences.length,
    seqLength: cfg.seqLength,
    vocabSize: cfg.vocabSize,
  };
}

export function saveCalibrationDataset(
  dataset: CalibrationDataset,
  outputDir?: string
): string {
  const dir = outputDir ?? DEFAULT_CONFIG.outputDir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const indexPath = join(dir, 'calibration-index.json');
  const dataPath = join(dir, 'calibration-tokens.bin');

  // Write binary: all sequences concatenated as Int32
  const totalTokens = dataset.numSequences * dataset.seqLength;
  const buffer = Buffer.alloc(totalTokens * 4);
  let offset = 0;
  for (const seq of dataset.sequences) {
    for (let i = 0; i < seq.length; i++) {
      buffer.writeInt32LE(seq[i], offset);
      offset += 4;
    }
  }
  writeFileSync(dataPath, buffer);

  // Write index
  const index = {
    numSequences: dataset.numSequences,
    seqLength: dataset.seqLength,
    vocabSize: dataset.vocabSize,
    dataFile: 'calibration-tokens.bin',
    bytesPerToken: 4,
    totalTokens,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  return dir;
}

export function loadCalibrationDataset(dir: string): CalibrationDataset {
  const indexPath = join(dir, 'calibration-index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
  const dataPath = join(dir, index.dataFile);
  const buffer = readFileSync(dataPath);

  const sequences: Int32Array[] = [];
  let offset = 0;
  for (let i = 0; i < index.numSequences; i++) {
    const seq = new Int32Array(index.seqLength);
    for (let j = 0; j < index.seqLength; j++) {
      seq[j] = buffer.readInt32LE(offset);
      offset += 4;
    }
    sequences.push(seq);
  }

  return {
    sequences,
    numSequences: index.numSequences,
    seqLength: index.seqLength,
    vocabSize: index.vocabSize,
  };
}

export function downloadWikiText2(): string | null {
  // WikiText-2 raw is ~2MB — small enough to fetch directly
  // Returns the text content or null if download fails
  try {
    const url =
      'https://raw.githubusercontent.com/salesforce/awd-lstm-lm/master/data/wikitext-2/train.txt';
    const outPath = '/tmp/wikitext2-train.txt';
    if (!existsSync(outPath)) {
      execSync(`curl -sL "${url}" -o "${outPath}"`, { timeout: 30000 });
    }
    if (existsSync(outPath)) {
      return readFileSync(outPath, 'utf-8');
    }
  } catch {
    // Download failed — caller should fall back to synthetic
  }
  return null;
}
