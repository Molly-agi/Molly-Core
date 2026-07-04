// src/ai/inference/__tests__/eval-corpus-loader.test.ts

/**
 * @jest-environment node
 */

import { TextEncoder, TextDecoder } from 'util';
Object.assign(globalThis, { TextEncoder, TextDecoder });

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  loadEvalCorpus,
  iterateEvalWindows,
  iterateCalibrationSequences,
  pinHashes,
} from '../eval-corpus-loader';

const TOKENIZER_PATH = join(
  __dirname,
  '../../../../data/calibration/tokenizer.json'
);
const TEST_PATH = join(
  __dirname,
  '../../../../data/calibration/wikitext2-test.txt'
);
const TRAIN_PATH = join(
  __dirname,
  '../../../../data/calibration/wikitext2-train.txt'
);

const HAS_DATA =
  existsSync(TOKENIZER_PATH) && existsSync(TEST_PATH) && existsSync(TRAIN_PATH);

describe('eval-corpus-loader', () => {
  describe('loadEvalCorpus — missing files', () => {
    it('throws on missing tokenizer', () => {
      expect(() =>
        loadEvalCorpus({
          tokenizerPath: '/nonexistent/tokenizer.json',
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: TRAIN_PATH,
        })
      ).toThrow(/Tokenizer not found/);
    });

    it('throws on missing test split', () => {
      expect(() =>
        loadEvalCorpus({
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: '/nonexistent/test.txt',
          wikiTextTrainPath: TRAIN_PATH,
        })
      ).toThrow(/test split not found/);
    });

    it('throws on missing train split', () => {
      expect(() =>
        loadEvalCorpus({
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: '/nonexistent/train.txt',
        })
      ).toThrow(/train split not found/);
    });
  });

  (HAS_DATA ? describe : describe.skip)(
    'loadEvalCorpus — small window config (fits local data)',
    () => {
      it('loads and tokenizes with small window count', () => {
        const corpus = loadEvalCorpus({
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: TRAIN_PATH,
          evalWindowCount: 1,
          evalWindowSize: 128,
          calibrationSequences: 1,
          calibrationSeqLen: 128,
        });

        expect(corpus.evalTokenIds.length).toBe(128);
        expect(corpus.calibrationTokenIds.length).toBe(128);
        expect(corpus.evalSetSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(corpus.calibrationSetSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(corpus.vocabSize).toBeGreaterThan(150000);
      });

      it('produces deterministic SHA-256 hashes', () => {
        const config = {
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: TRAIN_PATH,
          evalWindowCount: 1,
          evalWindowSize: 64,
          calibrationSequences: 1,
          calibrationSeqLen: 64,
        };

        const c1 = loadEvalCorpus(config);
        const c2 = loadEvalCorpus(config);

        expect(c1.evalSetSha256).toBe(c2.evalSetSha256);
        expect(c1.calibrationSetSha256).toBe(c2.calibrationSetSha256);
      });

      it('iterateEvalWindows yields correct window count', () => {
        const corpus = loadEvalCorpus({
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: TRAIN_PATH,
          evalWindowCount: 2,
          evalWindowSize: 64,
          calibrationSequences: 1,
          calibrationSeqLen: 64,
        });

        const windows = [...iterateEvalWindows(corpus)];
        expect(windows).toHaveLength(2);
        expect(windows[0].tokenIds.length).toBe(64);
        expect(windows[1].tokenIds.length).toBe(64);
        expect(windows[0].startOffset).toBe(0);
        expect(windows[1].startOffset).toBe(64);
      });

      it('iterateCalibrationSequences yields correct count', () => {
        const corpus = loadEvalCorpus({
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: TRAIN_PATH,
          evalWindowCount: 1,
          evalWindowSize: 64,
          calibrationSequences: 3,
          calibrationSeqLen: 64,
        });

        const seqs = [...iterateCalibrationSequences(corpus)];
        expect(seqs).toHaveLength(3);
      });

      it('pinHashes returns summary with correct fields', () => {
        const corpus = loadEvalCorpus({
          tokenizerPath: TOKENIZER_PATH,
          wikiTextTestPath: TEST_PATH,
          wikiTextTrainPath: TRAIN_PATH,
          evalWindowCount: 1,
          evalWindowSize: 64,
          calibrationSequences: 1,
          calibrationSeqLen: 64,
        });

        const pins = pinHashes(corpus);
        expect(pins.evalSetSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(pins.calibrationSetSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(pins.evalTokenCount).toBe(64);
        expect(pins.calibrationTokenCount).toBe(64);
        expect(pins.vocabSize).toBeGreaterThan(150000);
      });
    }
  );

  (HAS_DATA ? describe : describe.skip)(
    'loadEvalCorpus — insufficient data error',
    () => {
      it('throws when test split too short for requested windows', () => {
        expect(() =>
          loadEvalCorpus({
            tokenizerPath: TOKENIZER_PATH,
            wikiTextTestPath: TEST_PATH,
            wikiTextTrainPath: TRAIN_PATH,
            evalWindowCount: 9999,
            evalWindowSize: 2048,
            calibrationSequences: 1,
            calibrationSeqLen: 64,
          })
        ).toThrow(/test split too short/);
      });
    }
  );
});
