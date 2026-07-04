// src/ai/inference/needle-probe.ts
//
// Needle-in-haystack retrieval probe for F4 acceptance gate.
// Tests whether compression corrupts long-context attention by inserting a
// known retrieval target at a specific position and querying for it later.
//
// From F4_ACCEPTANCE_THRESHOLDS.md:
//   256 tokens  → ≥ 95% accuracy
//   1024 tokens → ≥ 90% accuracy
//   2048 tokens → ≥ 85% accuracy
//   4096 tokens → ≥ 80% (or ≤10pt drop from uncompressed)

import type { CrystalInferenceLayer as CILType } from '../engine-titan/crystal-inference-layer';
import type { KvCache as KVCType } from './kv-cache';
import { CrystalTransformerDriver } from './crystal-transformer-driver';
import type {
  DriverConfig,
  LayerNormWeights,
  LayerBiasWeights,
  LayerProbe,
} from './crystal-transformer-driver';

// --- Types ---

export interface NeedleProbeConfig {
  /** Driver geometry */
  driverConfig: DriverConfig;
  /** Crystal vault directory */
  vaultDir: string;
  /** 1D weights from GGUF */
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;
  /** Max hot layers in inference cache */
  maxHotLayers?: number;
  /** Number of test cases per depth (default 100) */
  casesPerDepth?: number;
  /** Seed for deterministic needle generation (default 42) */
  seed?: number;
  /** Haystack corpus — pre-tokenized Wikipedia text for filling context */
  haystackTokenIds: number[];
  /** Tokenizer encode function: string → token IDs */
  encode: (text: string) => number[];
  /** Tokenizer decode function: token IDs → string */
  decode: (ids: number[]) => string;
  /** Token ID for newline (used to frame the needle) */
  newlineTokenId: number;
  /** Progress callback */
  onProgress?: (depth: number, caseNum: number, total: number) => void;
  /** Optional NaN tripwire probe */
  tripwire?: LayerProbe;
}

export interface NeedleDepthSpec {
  contextDepth: number;
  insertPosition: number;
  minAccuracy: number;
}

export const DEFAULT_DEPTH_SPECS: NeedleDepthSpec[] = [
  { contextDepth: 256, insertPosition: 50, minAccuracy: 0.95 },
  { contextDepth: 1024, insertPosition: 200, minAccuracy: 0.9 },
  { contextDepth: 2048, insertPosition: 500, minAccuracy: 0.85 },
  { contextDepth: 4096, insertPosition: 1000, minAccuracy: 0.8 },
];

export interface NeedleProbeResult {
  /** Per-depth results */
  depths: NeedleDepthResult[];
  /** Overall pass/fail against thresholds */
  passed: boolean;
  /** Failure descriptions (empty if passed) */
  failures: string[];
}

export interface NeedleDepthResult {
  contextDepth: number;
  insertPosition: number;
  casesRun: number;
  correctCount: number;
  accuracy: number;
  minAccuracy: number;
  passed: boolean;
  /** Delta vs uncompressed baseline (null if no baseline provided) */
  deltaVsBaseline: number | null;
}

export interface NeedleCase {
  needle: string;
  tokenIds: number[];
  needlePosition: number;
  queryPosition: number;
}

// --- Deterministic PRNG ---

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
}

// --- Needle Generation ---

function generateNeedle(rng: () => number): string {
  const digits = Math.floor(rng() * 900000) + 100000;
  return `${digits}`;
}

function buildNeedleContext(
  needle: string,
  insertPos: number,
  contextDepth: number,
  haystackTokenIds: number[],
  encode: (text: string) => number[],
  newlineTokenId: number,
  rng: () => number
): { tokenIds: number[]; needleTokenStart: number } {
  const preamble = `The secret number is ${needle}. Remember it.`;
  const query = `What was the secret number mentioned earlier? The secret number is`;
  const preambleIds = encode(preamble);
  const queryIds = encode(query);

  // Build: [haystack before needle] [preamble] [haystack after] [query]
  // insertPos is where the preamble starts (in token positions)
  const haystackBefore = insertPos;
  const queryLen = queryIds.length;
  const preambleLen = preambleIds.length;
  const haystackAfter = contextDepth - insertPos - preambleLen - queryLen;

  if (haystackAfter < 0) {
    throw new RangeError(
      `Context too short: depth=${contextDepth}, insertPos=${insertPos}, ` +
        `preambleLen=${preambleLen}, queryLen=${queryLen}`
    );
  }

  // Pick a random start in the haystack corpus
  const maxStart = Math.max(0, haystackTokenIds.length - contextDepth * 2);
  const haystackStart = Math.floor(rng() * maxStart);

  const result: number[] = [];

  // Haystack before needle
  const beforeSlice = haystackTokenIds.slice(
    haystackStart,
    haystackStart + haystackBefore
  );
  result.push(...beforeSlice);

  // Pad if haystack too short
  while (result.length < haystackBefore) {
    result.push(haystackTokenIds[result.length % haystackTokenIds.length]);
  }

  // Newline + preamble + newline (frame the needle clearly)
  result.push(newlineTokenId);
  const needleTokenStart = result.length;
  result.push(...preambleIds);
  result.push(newlineTokenId);

  // Haystack after needle
  const afterStart = haystackStart + haystackBefore;
  const afterSlice = haystackTokenIds.slice(
    afterStart,
    afterStart + haystackAfter
  );
  result.push(...afterSlice);
  while (result.length < contextDepth - queryLen) {
    result.push(
      haystackTokenIds[(result.length + afterStart) % haystackTokenIds.length]
    );
  }

  // Query at the end
  result.push(newlineTokenId);
  result.push(...queryIds);

  return { tokenIds: result.slice(0, contextDepth), needleTokenStart };
}

// --- Greedy Decode ---

function greedyDecode(logits: Float32Array): number {
  let bestIdx = 0;
  let bestVal = logits[0];
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > bestVal) {
      bestVal = logits[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

// --- Main Probe ---

export function runNeedleProbe(
  config: NeedleProbeConfig,
  depthSpecs?: NeedleDepthSpec[],
  baselineAccuracies?: Map<number, number>
): NeedleProbeResult {
  const specs = depthSpecs ?? DEFAULT_DEPTH_SPECS;
  const casesPerDepth = config.casesPerDepth ?? 100;
  const seed = config.seed ?? 42;
  const rng = lcg(seed);

  const depths: NeedleDepthResult[] = [];
  const failures: string[] = [];

  for (const spec of specs) {
    if (config.haystackTokenIds.length < spec.contextDepth * 2) {
      failures.push(
        `Insufficient haystack tokens for depth ${spec.contextDepth}: ` +
          `need ${spec.contextDepth * 2}, have ${config.haystackTokenIds.length}`
      );
      continue;
    }

    let correct = 0;
    let casesRun = 0;

    for (let c = 0; c < casesPerDepth; c++) {
      const needle = generateNeedle(rng);
      const { tokenIds } = buildNeedleContext(
        needle,
        spec.insertPosition,
        spec.contextDepth,
        config.haystackTokenIds,
        config.encode,
        config.newlineTokenId,
        rng
      );

      const retrieved = runSingleCase(tokenIds, needle, config);

      if (retrieved === needle) {
        correct++;
      }
      casesRun++;

      config.onProgress?.(spec.contextDepth, c + 1, casesPerDepth);
    }

    const accuracy = casesRun > 0 ? correct / casesRun : 0;
    const baselineAcc = baselineAccuracies?.get(spec.contextDepth) ?? null;
    const deltaVsBaseline = baselineAcc != null ? accuracy - baselineAcc : null;

    const passed = accuracy >= spec.minAccuracy;
    if (!passed) {
      failures.push(
        `Depth ${spec.contextDepth}: accuracy ${(accuracy * 100).toFixed(1)}% < ` +
          `required ${(spec.minAccuracy * 100).toFixed(1)}%`
      );
    }

    // Fable v3 additional check: ≤10pt drop from baseline
    if (deltaVsBaseline != null && deltaVsBaseline < -0.1) {
      failures.push(
        `Depth ${spec.contextDepth}: ${(deltaVsBaseline * 100).toFixed(1)}pt drop ` +
          `from uncompressed baseline exceeds 10pt limit`
      );
    }

    depths.push({
      contextDepth: spec.contextDepth,
      insertPosition: spec.insertPosition,
      casesRun,
      correctCount: correct,
      accuracy,
      minAccuracy: spec.minAccuracy,
      passed,
      deltaVsBaseline,
    });
  }

  return {
    depths,
    passed: failures.length === 0,
    failures,
  };
}

function runSingleCase(
  contextTokenIds: number[],
  needle: string,
  config: NeedleProbeConfig
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CrystalInferenceLayer } =
    require('../engine-titan/crystal-inference-layer') as {
      CrystalInferenceLayer: new (opts: {
        vaultDir: string;
        maxHotLayers?: number;
      }) => CILType;
    };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { KvCache } = require('./kv-cache') as {
    KvCache: new (opts: {
      numLayers: number;
      kvDim: number;
      maxTokens: number;
    }) => KVCType;
  };

  const driver = new CrystalTransformerDriver(config.driverConfig);
  const layerEngine = new CrystalInferenceLayer({
    vaultDir: config.vaultDir,
    maxHotLayers: config.maxHotLayers ?? 8,
  });

  const totalLayers = config.driverConfig.totalLayers ?? 80;
  const kvDim =
    (config.driverConfig.kvHeads ?? 8) * (config.driverConfig.headDim ?? 128);

  const kvCache = new KvCache({
    numLayers: totalLayers,
    kvDim,
    maxTokens: contextTokenIds.length + 10,
  });

  // Prefill: run all context tokens through the model
  let logits: Float32Array = new Float32Array(0);
  for (let pos = 0; pos < contextTokenIds.length; pos++) {
    logits = driver.executeTokenPass(
      contextTokenIds[pos],
      pos,
      config.layersNorm,
      config.layersBias,
      config.finalNorm,
      kvCache,
      layerEngine as unknown as Parameters<typeof driver.executeTokenPass>[6],
      config.tripwire
    );
  }

  // Decode up to 6 tokens (needle is 6 digits)
  const generated: number[] = [];
  let nextLogits = logits;
  for (let step = 0; step < 6; step++) {
    const tokenId = greedyDecode(nextLogits);
    generated.push(tokenId);

    nextLogits = driver.executeTokenPass(
      tokenId,
      contextTokenIds.length + step,
      config.layersNorm,
      config.layersBias,
      config.finalNorm,
      kvCache,
      layerEngine as unknown as Parameters<typeof driver.executeTokenPass>[6],
      config.tripwire
    );
  }

  const decoded = config.decode(generated).trim();
  // Extract the first 6-digit sequence from the decoded output
  const match = decoded.match(/\d{6}/);
  return match ? match[0] : decoded.slice(0, 6);
}

// --- Threshold checker (mirrors checkF4Thresholds pattern) ---

export function checkNeedleThresholds(result: NeedleProbeResult): {
  passed: boolean;
  failures: string[];
} {
  return { passed: result.passed, failures: result.failures };
}
