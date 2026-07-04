// src/ai/inference/f4-full-report.ts
//
// Unified F4 gate runner. Orchestrates all sub-evaluations into the single
// JSON report format specified in F4_EVAL_PROTOCOL.md.
//
// Usage:
//   const report = await runF4FullReport(config);
//   writeFileSync(`F4_EVAL_${report.modelId}_${report.timestamp}.json`, JSON.stringify(report, null, 2));

import { runF4Eval, checkF4Thresholds } from './f4-eval-harness';
import { runParallelEval } from './parallel-eval-pool';
import { runNeedleProbe, checkNeedleThresholds } from './needle-probe';
import { CrystalTransformerDriver } from './crystal-transformer-driver';
import { CrystalInferenceLayer } from '../engine-titan/crystal-inference-layer';
import { KvCache } from './kv-cache';
import type {
  DriverConfig,
  LayerNormWeights,
  LayerBiasWeights,
} from './crystal-transformer-driver';

// --- Types ---

export interface F4FullReportConfig {
  modelId: string;
  modelSize: '1B' | '3B' | '7B+';
  sourceGgufSha256: string;
  evalSetSha256: string;
  calibrationSetSha256: string;

  vaultDir: string;
  driverConfig: DriverConfig;
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;

  evalTokenIds: number[];
  referencePpl: number;
  referenceLogits?: Float32Array[][];

  haystackTokenIds: number[];
  encode: (text: string) => number[];
  decode: (ids: number[]) => string;
  newlineTokenId: number;
  baselineNeedleAccuracies?: Map<number, number>;

  tier0Prompt?: string;
  maxHotLayers?: number;
  /** Use parallel eval pool for PPL phase (worker_threads). Default true. */
  parallel?: boolean;
  /** Worker count for parallel eval. Default: os.cpus().length - 1 */
  parallelWorkers?: number;

  onProgress?: (phase: string, detail: string) => void;
}

export interface F4Report {
  timestamp: string;
  modelId: string;
  modelSize: '1B' | '3B' | '7B+';
  sourceGgufSha256: string;
  evalSetSha256: string;
  calibrationSetSha256: string;

  perplexity: {
    compressed: number;
    reference: number;
    ratio: number;
    windowCount: number;
    windowPpls: number[];
  };

  klDivergence: {
    mean: number;
    max: number;
    p95: number;
    finalLogit: number;
    perLayer: number[];
    worstLayerName: string;
  };

  needleProbe: {
    depths: Array<{
      contextDepth: number;
      accuracy: number;
      baselineAccuracy: number | null;
      delta: number | null;
    }>;
  };

  tier0: {
    pplSanity: boolean;
    coherencePass: boolean;
    generatedText: string;
  };

  verdict: 'PASS' | 'FAIL';
  failures: string[];
}

// --- Tier 0 Coherence Check ---

function checkCoherence(text: string, tokenIds: number[]): boolean {
  if (tokenIds.length < 200) return false;

  const uniqueTokens = new Set(tokenIds);
  if (uniqueTokens.size < 50) return false;

  // 3-gram loop detection
  for (let i = 0; i <= tokenIds.length - 6; i++) {
    const gram = `${tokenIds[i]},${tokenIds[i + 1]},${tokenIds[i + 2]}`;
    let repeats = 0;
    for (let j = i + 3; j <= tokenIds.length - 3; j += 3) {
      const check = `${tokenIds[j]},${tokenIds[j + 1]},${tokenIds[j + 2]}`;
      if (check === gram) repeats++;
      if (repeats >= 3) return false;
    }
  }

  return true;
}

// --- Main ---

export async function runF4FullReport(
  config: F4FullReportConfig
): Promise<F4Report> {
  const failures: string[] = [];
  const useParallel = config.parallel !== false; // default true
  config.onProgress?.('ppl', 'Starting perplexity evaluation...');

  // Phase 1: PPL eval (parallel or sequential)
  const pplConfig = {
    vaultDir: config.vaultDir,
    driverConfig: config.driverConfig,
    tokenIds: config.evalTokenIds,
    windowCount: 30,
    windowSize: 2048,
    layersNorm: config.layersNorm,
    layersBias: config.layersBias,
    finalNorm: config.finalNorm,
    referencePpl: config.referencePpl,
    referenceLogits: config.referenceLogits,
    maxHotLayers: config.maxHotLayers ?? 8,
    enableNanTripwire: true,
    onProgress: (w: number, total: number, ppl: number) => {
      config.onProgress?.('ppl', `Window ${w}/${total}, PPL=${ppl.toFixed(2)}`);
    },
  };

  const pplResult = useParallel
    ? await runParallelEval({
        ...pplConfig,
        workerCount: config.parallelWorkers,
      })
    : runF4Eval(pplConfig);

  const pplCheck = checkF4Thresholds(pplResult, config.modelSize);
  failures.push(...pplCheck.failures);

  // Phase 2: Needle probe
  config.onProgress?.('needle', 'Starting needle-in-haystack probes...');

  const needleResult = runNeedleProbe(
    {
      driverConfig: config.driverConfig,
      vaultDir: config.vaultDir,
      layersNorm: config.layersNorm,
      layersBias: config.layersBias,
      finalNorm: config.finalNorm,
      haystackTokenIds: config.haystackTokenIds,
      encode: config.encode,
      decode: config.decode,
      newlineTokenId: config.newlineTokenId,
      maxHotLayers: config.maxHotLayers ?? 8,
      casesPerDepth: 100,
      seed: 42,
      onProgress: (depth, c, total) => {
        config.onProgress?.('needle', `Depth ${depth}: case ${c}/${total}`);
      },
    },
    undefined,
    config.baselineNeedleAccuracies
  );

  const needleCheck = checkNeedleThresholds(needleResult);
  failures.push(...needleCheck.failures);

  // Phase 3: Tier 0 coherence
  config.onProgress?.('tier0', 'Running Tier 0 coherence check...');

  const tier0Prompt = config.tier0Prompt ?? 'The capital of France is';
  const promptIds = config.encode(tier0Prompt);

  // Greedy generate 200 tokens
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
    maxTokens: promptIds.length + 210,
  });

  // Prefill prompt
  let logits: Float32Array = new Float32Array(0);
  for (let i = 0; i < promptIds.length; i++) {
    logits = driver.executeTokenPass(
      promptIds[i],
      i,
      config.layersNorm,
      config.layersBias,
      config.finalNorm,
      kvCache,
      layerEngine,
      undefined
    );
  }

  // Generate 200 tokens
  const generated: number[] = [];
  for (let step = 0; step < 200; step++) {
    let bestIdx = 0,
      bestVal = logits[0];
    for (let i = 1; i < logits.length; i++) {
      if (logits[i] > bestVal) {
        bestVal = logits[i];
        bestIdx = i;
      }
    }
    generated.push(bestIdx);
    logits = driver.executeTokenPass(
      bestIdx,
      promptIds.length + step,
      config.layersNorm,
      config.layersBias,
      config.finalNorm,
      kvCache,
      layerEngine,
      undefined
    );
  }

  const generatedText = config.decode(generated);
  const coherencePass = checkCoherence(generatedText, generated);
  const pplSanity =
    pplResult.pplRatio != null ? pplResult.pplRatio <= 1.5 : true;

  if (!pplSanity) failures.push('Tier 0 FAIL: PPL ratio > 1.5x (catastrophic)');
  if (!coherencePass)
    failures.push(
      'Tier 0 FAIL: coherence check failed (loops or degenerate output)'
    );

  // Assemble KL stats
  const klValues = pplResult.perLayerKL.filter((v) => v > 0);
  const meanKL =
    klValues.length > 0
      ? klValues.reduce((a, b) => a + b, 0) / klValues.length
      : 0;
  const maxKL = klValues.length > 0 ? Math.max(...klValues) : 0;
  const sortedKL = [...klValues].sort((a, b) => a - b);
  const p95KL =
    sortedKL.length > 0 ? sortedKL[Math.floor(sortedKL.length * 0.95)] : 0;
  const worstIdx = pplResult.perLayerKL.indexOf(maxKL);

  return {
    timestamp: new Date().toISOString(),
    modelId: config.modelId,
    modelSize: config.modelSize,
    sourceGgufSha256: config.sourceGgufSha256,
    evalSetSha256: config.evalSetSha256,
    calibrationSetSha256: config.calibrationSetSha256,

    perplexity: {
      compressed: pplResult.perplexity,
      reference: config.referencePpl,
      ratio: pplResult.pplRatio ?? -1,
      windowCount: pplResult.windowCount,
      windowPpls: pplResult.windowPpls,
    },

    klDivergence: {
      mean: meanKL,
      max: maxKL,
      p95: p95KL,
      finalLogit: pplResult.perLayerKL[totalLayers - 1] ?? 0,
      perLayer: pplResult.perLayerKL,
      worstLayerName: worstIdx >= 0 ? `layer_${worstIdx}` : 'none',
    },

    needleProbe: {
      depths: needleResult.depths.map((d) => ({
        contextDepth: d.contextDepth,
        accuracy: d.accuracy,
        baselineAccuracy:
          d.deltaVsBaseline != null ? d.accuracy - d.deltaVsBaseline : null,
        delta: d.deltaVsBaseline,
      })),
    },

    tier0: {
      pplSanity,
      coherencePass,
      generatedText: generatedText.slice(0, 500),
    },

    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
  };
}
