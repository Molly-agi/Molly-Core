// src/ai/inference/parallel-eval-worker.ts
//
// Worker process for parallel-eval-pool. Each worker owns its own driver +
// layerEngine + kvCache, processes a chunk of window indices sequentially,
// and reports aggregate loss/token/window-ppl arrays back to the main thread.
//
// Runs OUTSIDE the main event loop — no shared state with siblings.

import { parentPort, workerData } from 'node:worker_threads';
import { CrystalTransformerDriver } from './crystal-transformer-driver';
import type {
  LayerNormWeights,
  LayerBiasWeights,
  DriverConfig,
  LayerProbe,
} from './crystal-transformer-driver';
import { CrystalInferenceLayer } from '../engine-titan/crystal-inference-layer';
import { KvCache } from './kv-cache';
import { assertFinite } from '../engine-titan/nan-tripwire';

/**
 * Data passed to a worker via workerData. Serializable — Float32Arrays and
 * plain objects survive structured clone; class instances do not.
 */
export interface WorkerEvalInput {
  vaultDir: string;
  driverConfig: DriverConfig;
  layersNorm: LayerNormWeights[];
  layersBias: LayerBiasWeights[];
  finalNorm: Float32Array;
  tokenIds: number[];
  windowSize: number;
  windowIndices: number[]; // which windows THIS worker processes
  maxHotLayers: number;
  enableNanTripwire: boolean;
}

/**
 * Per-window result reported back. Ordered by windowIndex so the main thread
 * can restore original window order after aggregation.
 */
export interface WorkerEvalResult {
  windowIndex: number;
  loss: number;
  tokenCount: number;
  perplexity: number;
  nanDetected: boolean;
  nanLocation: string | null;
}

/**
 * Stable log-softmax — duplicated from f4-eval-harness so worker is self-
 * contained (worker files can't easily import private helpers).
 */
function logSoftmax(logits: Float32Array, targetIdx: number): number {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  let sumExp = 0;
  for (let i = 0; i < logits.length; i++) {
    sumExp += Math.exp(logits[i] - max);
  }
  return logits[targetIdx] - Math.log(sumExp) - max;
}

function processWindow(
  input: WorkerEvalInput,
  driver: CrystalTransformerDriver,
  layerEngine: CrystalInferenceLayer,
  windowIndex: number
): WorkerEvalResult {
  const { tokenIds, windowSize, driverConfig, enableNanTripwire } = input;
  const totalLayers = driverConfig.totalLayers ?? 80;
  const kvDim = (driverConfig.kvHeads ?? 8) * (driverConfig.headDim ?? 128);

  const windowStart = windowIndex * windowSize;
  const windowTokens = tokenIds.slice(windowStart, windowStart + windowSize);

  const kvCache = new KvCache({
    numLayers: totalLayers,
    kvDim,
    maxTokens: windowSize,
  });

  const tripwire: LayerProbe | undefined = enableNanTripwire
    ? (name: string, vec: Float32Array) => {
        const match = name.match(/^L(\d+)\./);
        const layer = match ? parseInt(match[1], 10) : -1;
        assertFinite(name, layer, vec);
      }
    : undefined;

  let windowLoss = 0;
  let windowTokenCount = 0;
  let nanDetected = false;
  let nanLocation: string | null = null;

  for (let pos = 0; pos < windowTokens.length - 1; pos++) {
    const tokenId = windowTokens[pos];
    const targetId = windowTokens[pos + 1];

    try {
      const logits = driver.executeTokenPass(
        tokenId,
        pos,
        input.layersNorm,
        input.layersBias,
        input.finalNorm,
        kvCache,
        layerEngine,
        tripwire
      );

      for (let i = 0; i < logits.length; i++) {
        if (!Number.isFinite(logits[i])) {
          nanDetected = true;
          nanLocation = `logits at window=${windowIndex}, pos=${pos}, index=${i}`;
          break;
        }
      }
      if (nanDetected) break;

      const logP = logSoftmax(logits, targetId);
      windowLoss += -logP;
      windowTokenCount++;
    } catch (err) {
      // NaN tripwire may throw NonFiniteError. Capture and abort this window
      // gracefully rather than letting the whole worker die.
      nanDetected = true;
      nanLocation =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : `unknown-${String(err)}`;
      break;
    }
  }

  const avgLoss =
    windowTokenCount > 0 ? windowLoss / windowTokenCount : Infinity;
  return {
    windowIndex,
    loss: windowLoss,
    tokenCount: windowTokenCount,
    perplexity: Math.exp(avgLoss),
    nanDetected,
    nanLocation,
  };
}

// Main worker entry point — runs at module load time when spawned via Worker
async function main(): Promise<void> {
  if (!parentPort) {
    throw new Error('parallel-eval-worker.ts must be run inside a Worker');
  }
  const input = workerData as WorkerEvalInput;

  // Setup ONCE per worker — driver + layerEngine reused across windows
  const driver = new CrystalTransformerDriver(input.driverConfig);
  const layerEngine = new CrystalInferenceLayer({
    vaultDir: input.vaultDir,
    maxHotLayers: input.maxHotLayers,
  });

  const results: WorkerEvalResult[] = [];
  for (const windowIndex of input.windowIndices) {
    results.push(processWindow(input, driver, layerEngine, windowIndex));
  }

  parentPort.postMessage({ results });
}

main().catch((err) => {
  if (parentPort) {
    parentPort.postMessage({
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
});
