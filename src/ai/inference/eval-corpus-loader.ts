// src/ai/inference/eval-corpus-loader.ts
//
// F4 Protocol Sections 1-2: Eval corpus tokenization and hash pinning.
// Loads WikiText-2 splits, tokenizes with Qwen 2.5 BPE, slices into
// deterministic non-overlapping windows, and computes SHA-256 hashes.
//
// Usage:
//   const corpus = loadEvalCorpus({ tokenizerPath, wikiTextTestPath, wikiTextTrainPath });
//   console.log(corpus.evalSetSha256);    // pinned hash for F4 report
//   console.log(corpus.calibrationSetSha256);

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'node:fs';
import { QwenTokenizer } from './qwen-tokenizer';

export interface EvalCorpusConfig {
  tokenizerPath: string;
  wikiTextTestPath: string;
  wikiTextTrainPath: string;
  evalWindowCount?: number;
  evalWindowSize?: number;
  calibrationSequences?: number;
  calibrationSeqLen?: number;
}

export interface EvalCorpus {
  evalTokenIds: Int32Array;
  evalWindowCount: number;
  evalWindowSize: number;
  evalSetSha256: string;

  calibrationTokenIds: Int32Array;
  calibrationSequences: number;
  calibrationSeqLen: number;
  calibrationSetSha256: string;

  vocabSize: number;
  tokenizerPath: string;
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function tokenizeChunked(
  tokenizer: QwenTokenizer,
  text: string,
  minTokens: number
): number[] {
  const lines = text.split('\n');
  const ids: number[] = [];
  for (const line of lines) {
    if (!line) continue;
    const lineIds = tokenizer.encode(line);
    for (let i = 0; i < lineIds.length; i++) ids.push(lineIds[i]);
    if (ids.length >= minTokens) break;
  }
  return ids;
}

export function loadEvalCorpus(config: EvalCorpusConfig): EvalCorpus {
  const evalWindowCount = config.evalWindowCount ?? 30;
  const evalWindowSize = config.evalWindowSize ?? 2048;
  const calibrationSequences = config.calibrationSequences ?? 128;
  const calibrationSeqLen = config.calibrationSeqLen ?? 2048;

  const evalTokensNeeded = evalWindowCount * evalWindowSize;
  const calibrationTokensNeeded = calibrationSequences * calibrationSeqLen;

  if (!existsSync(config.tokenizerPath)) {
    throw new Error(`Tokenizer not found: ${config.tokenizerPath}`);
  }
  if (!existsSync(config.wikiTextTestPath)) {
    throw new Error(
      `WikiText-2 test split not found: ${config.wikiTextTestPath}`
    );
  }
  if (!existsSync(config.wikiTextTrainPath)) {
    throw new Error(
      `WikiText-2 train split not found: ${config.wikiTextTrainPath}`
    );
  }

  const tokenizer = new QwenTokenizer(config.tokenizerPath);

  // --- Eval set: WikiText-2 test split ---
  const testText = readFileSync(config.wikiTextTestPath, 'utf8');
  const testTokenIds = tokenizeChunked(tokenizer, testText, evalTokensNeeded);

  if (testTokenIds.length < evalTokensNeeded) {
    throw new Error(
      `WikiText-2 test split too short: got ${testTokenIds.length} tokens, ` +
        `need ${evalTokensNeeded} (${evalWindowCount} windows × ${evalWindowSize}). ` +
        `Download the full WikiText-2 test split (~245K tokens).`
    );
  }

  const evalTokenIds = new Int32Array(testTokenIds.slice(0, evalTokensNeeded));
  const evalSetSha256 = sha256(new Uint8Array(evalTokenIds.buffer));

  // --- Calibration set: WikiText-2 train split ---
  const trainText = readFileSync(config.wikiTextTrainPath, 'utf8');
  const trainTokenIds = tokenizeChunked(
    tokenizer,
    trainText,
    calibrationTokensNeeded
  );

  if (trainTokenIds.length < calibrationTokensNeeded) {
    throw new Error(
      `WikiText-2 train split too short: got ${trainTokenIds.length} tokens, ` +
        `need ${calibrationTokensNeeded} (${calibrationSequences} sequences × ${calibrationSeqLen}). ` +
        `Download the full WikiText-2 train split (~2M tokens).`
    );
  }

  const calibrationTokenIds = new Int32Array(
    trainTokenIds.slice(0, calibrationTokensNeeded)
  );
  const calibrationSetSha256 = sha256(
    new Uint8Array(calibrationTokenIds.buffer)
  );

  return {
    evalTokenIds,
    evalWindowCount,
    evalWindowSize,
    evalSetSha256,
    calibrationTokenIds,
    calibrationSequences,
    calibrationSeqLen,
    calibrationSetSha256,
    vocabSize: tokenizer.vocabSize,
    tokenizerPath: config.tokenizerPath,
  };
}

export interface WindowIterator {
  windowIndex: number;
  tokenIds: Int32Array;
  startOffset: number;
}

export function* iterateEvalWindows(
  corpus: EvalCorpus
): Generator<WindowIterator> {
  for (let i = 0; i < corpus.evalWindowCount; i++) {
    const start = i * corpus.evalWindowSize;
    yield {
      windowIndex: i,
      tokenIds: corpus.evalTokenIds.slice(start, start + corpus.evalWindowSize),
      startOffset: start,
    };
  }
}

export function* iterateCalibrationSequences(
  corpus: EvalCorpus
): Generator<WindowIterator> {
  for (let i = 0; i < corpus.calibrationSequences; i++) {
    const start = i * corpus.calibrationSeqLen;
    yield {
      windowIndex: i,
      tokenIds: corpus.calibrationTokenIds.slice(
        start,
        start + corpus.calibrationSeqLen
      ),
      startOffset: start,
    };
  }
}

export function pinHashes(corpus: EvalCorpus): {
  evalSetSha256: string;
  calibrationSetSha256: string;
  evalTokenCount: number;
  calibrationTokenCount: number;
  vocabSize: number;
} {
  return {
    evalSetSha256: corpus.evalSetSha256,
    calibrationSetSha256: corpus.calibrationSetSha256,
    evalTokenCount: corpus.evalTokenIds.length,
    calibrationTokenCount: corpus.calibrationTokenIds.length,
    vocabSize: corpus.vocabSize,
  };
}
