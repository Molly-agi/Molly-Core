// src/ai/engine-titan/__tests__/calibration-dataset.test.ts
//
// Tests calibration dataset generation, save/load round-trip, and
// text-based calibration generation.

import { describe, test, expect, afterAll } from '@jest/globals';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateSyntheticCalibration,
  generateCalibrationFromText,
  saveCalibrationDataset,
  loadCalibrationDataset,
} from '../calibration-dataset';

const TEST_DIR = join('/tmp', `calibration-test-${Date.now()}`);

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('generateSyntheticCalibration', () => {
  test('generates correct number of sequences with default config', () => {
    const ds = generateSyntheticCalibration({
      numSequences: 4,
      seqLength: 16,
      vocabSize: 1000,
    });
    expect(ds.numSequences).toBe(4);
    expect(ds.seqLength).toBe(16);
    expect(ds.vocabSize).toBe(1000);
    expect(ds.sequences).toHaveLength(4);
  });

  test('all tokens are within vocab range', () => {
    const ds = generateSyntheticCalibration({
      numSequences: 8,
      seqLength: 32,
      vocabSize: 500,
    });
    for (const seq of ds.sequences) {
      expect(seq.length).toBe(32);
      for (let i = 0; i < seq.length; i++) {
        expect(seq[i]).toBeGreaterThanOrEqual(0);
        expect(seq[i]).toBeLessThan(500);
      }
    }
  });

  test('seeded generation is reproducible', () => {
    const ds1 = generateSyntheticCalibration({
      numSequences: 2,
      seqLength: 8,
      vocabSize: 100,
      seed: 42,
    });
    const ds2 = generateSyntheticCalibration({
      numSequences: 2,
      seqLength: 8,
      vocabSize: 100,
      seed: 42,
    });

    for (let s = 0; s < 2; s++) {
      for (let t = 0; t < 8; t++) {
        expect(ds1.sequences[s][t]).toBe(ds2.sequences[s][t]);
      }
    }
  });

  test('different seeds produce different data', () => {
    const ds1 = generateSyntheticCalibration({
      numSequences: 1,
      seqLength: 16,
      vocabSize: 10000,
      seed: 1,
    });
    const ds2 = generateSyntheticCalibration({
      numSequences: 1,
      seqLength: 16,
      vocabSize: 10000,
      seed: 2,
    });

    let same = 0;
    for (let i = 0; i < 16; i++) {
      if (ds1.sequences[0][i] === ds2.sequences[0][i]) same++;
    }
    expect(same).toBeLessThan(16);
  });

  test('Zipf distribution biases toward low token IDs', () => {
    const ds = generateSyntheticCalibration({
      numSequences: 4,
      seqLength: 256,
      vocabSize: 10000,
      seed: 42,
    });

    let lowCount = 0;
    let totalCount = 0;
    for (const seq of ds.sequences) {
      for (let i = 0; i < seq.length; i++) {
        if (seq[i] < 1000) lowCount++;
        totalCount++;
      }
    }
    // With Zipf-like pow(u, 2.0), P(token < 10%) ≈ sqrt(0.1) ≈ 31.6%
    expect(lowCount / totalCount).toBeGreaterThan(0.2);
  });
});

describe('generateCalibrationFromText', () => {
  test('splits text into sequences using encoder', () => {
    const encode = (text: string) =>
      Array.from(text).map((c) => c.charCodeAt(0));

    const text = 'A'.repeat(64);
    const ds = generateCalibrationFromText(text, encode, {
      numSequences: 2,
      seqLength: 16,
      vocabSize: 256,
    });

    expect(ds.numSequences).toBe(2);
    expect(ds.sequences).toHaveLength(2);
    expect(ds.sequences[0].length).toBe(16);
  });

  test('pads with repeats when text is too short', () => {
    const encode = (text: string) =>
      Array.from(text).map((c) => c.charCodeAt(0));

    const text = 'Hi';
    const ds = generateCalibrationFromText(text, encode, {
      numSequences: 4,
      seqLength: 1,
      vocabSize: 256,
    });

    expect(ds.numSequences).toBe(4);
    expect(ds.sequences).toHaveLength(4);
  });
});

describe('saveCalibrationDataset / loadCalibrationDataset round-trip', () => {
  test('save and load produces identical dataset', () => {
    const ds = generateSyntheticCalibration({
      numSequences: 4,
      seqLength: 16,
      vocabSize: 500,
      seed: 99,
    });

    saveCalibrationDataset(ds, TEST_DIR);

    expect(existsSync(join(TEST_DIR, 'calibration-index.json'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'calibration-tokens.bin'))).toBe(true);

    const loaded = loadCalibrationDataset(TEST_DIR);

    expect(loaded.numSequences).toBe(ds.numSequences);
    expect(loaded.seqLength).toBe(ds.seqLength);
    expect(loaded.vocabSize).toBe(ds.vocabSize);
    expect(loaded.sequences).toHaveLength(ds.sequences.length);

    for (let s = 0; s < ds.numSequences; s++) {
      for (let t = 0; t < ds.seqLength; t++) {
        expect(loaded.sequences[s][t]).toBe(ds.sequences[s][t]);
      }
    }
  });
});
