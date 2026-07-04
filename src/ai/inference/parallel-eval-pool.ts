// src/ai/inference/parallel-eval-pool.ts
//
// Worker-threads parallel pool for F4 eval windows.
//
// Each window is fully independent (own KvCache, own CrystalInferenceLayer view
// of the vault, own slice of tokens). This module dispatches N windows across
// a thread pool and aggregates the results into the same F4EvalResult shape.
//
// Falls back to sequential evaluation when workerCount <= 1.

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { runF4Eval } from './f4-eval-harness';
import type { F4EvalConfig, F4EvalResult } from './f4-eval-harness';

// --- Types ---

export interface WindowTask {
  windowIndex: number;
  windowTokens: number[];
  vaultDir: string;
  driverConfig: F4EvalConfig['driverConfig'];
  layersNorm: Array<{ attnNormGain: number[]; ffnNormGain: number[] }>;
  layersBias: Array<{ qBias: number[]; kBias: number[]; vBias: number[] }>;
  finalNorm: number[];
  windowSize: number;
  maxHotLayers: number;
  enableNanTripwire: boolean;
}

export interface WindowResult {
  windowIndex: number;
  windowPpl: number;
  windowLoss: number;
  tokenCount: number;
  nanDetected: boolean;
  nanLocation: string | null;
}

// --- Worker entry point (runs when loaded in a worker thread) ---

if (!isMainThread && parentPort) {
  const task: WindowTask = workerData;

  const layersNorm = task.layersNorm.map((ln) => ({
    attnNormGain: new Float32Array(ln.attnNormGain),
    ffnNormGain: new Float32Array(ln.ffnNormGain),
  }));
  const layersBias = task.layersBias.map((lb) => ({
    qBias: new Float32Array(lb.qBias),
    kBias: new Float32Array(lb.kBias),
    vBias: new Float32Array(lb.vBias),
  }));
  const finalNorm = new Float32Array(task.finalNorm);

  const result = runF4Eval({
    vaultDir: task.vaultDir,
    driverConfig: task.driverConfig,
    tokenIds: task.windowTokens,
    windowCount: 1,
    windowSize: task.windowSize,
    layersNorm,
    layersBias,
    finalNorm,
    maxHotLayers: task.maxHotLayers,
    enableNanTripwire: task.enableNanTripwire,
  });

  const windowResult: WindowResult = {
    windowIndex: task.windowIndex,
    windowPpl: result.windowPpls[0] ?? Infinity,
    windowLoss: result.avgLoss * result.tokenCount,
    tokenCount: result.tokenCount,
    nanDetected: result.nanDetected,
    nanLocation: result.nanLocation,
  };

  parentPort.postMessage(windowResult);
}

// --- Main thread API ---

export interface ParallelEvalConfig extends F4EvalConfig {
  workerCount?: number;
}

/**
 * Run F4 eval with window-level parallelism via worker_threads.
 * Returns the same F4EvalResult shape as sequential runF4Eval.
 * Falls back to sequential if workerCount <= 1.
 */
export async function runParallelEval(
  config: ParallelEvalConfig
): Promise<F4EvalResult> {
  const windowCount = config.windowCount ?? 30;
  const windowSize = config.windowSize ?? 2048;
  const maxWorkers = config.workerCount ?? Math.max(1, cpus().length - 1);
  const enableTripwire = config.enableNanTripwire ?? true;

  if (maxWorkers <= 1) {
    return runF4Eval(config);
  }

  const totalTokensNeeded = windowCount * windowSize;
  if (config.tokenIds.length < totalTokensNeeded) {
    throw new RangeError(
      `Need ${totalTokensNeeded} tokens for ${windowCount} windows x ${windowSize} tokens, but corpus has only ${config.tokenIds.length}`
    );
  }

  const serializedNorm = config.layersNorm.map((ln) => ({
    attnNormGain: Array.from(ln.attnNormGain),
    ffnNormGain: Array.from(ln.ffnNormGain),
  }));
  const serializedBias = config.layersBias.map((lb) => ({
    qBias: Array.from(lb.qBias),
    kBias: Array.from(lb.kBias),
    vBias: Array.from(lb.vBias),
  }));
  const serializedFinalNorm = Array.from(config.finalNorm);

  const tasks: WindowTask[] = [];
  for (let w = 0; w < windowCount; w++) {
    const windowStart = w * windowSize;
    const windowTokens = Array.from(
      config.tokenIds.slice(windowStart, windowStart + windowSize)
    );
    tasks.push({
      windowIndex: w,
      windowTokens,
      vaultDir: config.vaultDir,
      driverConfig: config.driverConfig,
      layersNorm: serializedNorm,
      layersBias: serializedBias,
      finalNorm: serializedFinalNorm,
      windowSize,
      maxHotLayers: config.maxHotLayers ?? 8,
      enableNanTripwire: enableTripwire,
    });
  }

  const workerFile = fileURLToPath(import.meta.url);

  function spawnWorker(task: WindowTask): Promise<WindowResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerFile, { workerData: task });
      worker.on('message', (result: WindowResult) => {
        worker.terminate();
        resolve(result);
      });
      worker.on('error', (err) => {
        worker.terminate();
        reject(err);
      });
      worker.on('exit', (code) => {
        if (code !== 0 && code !== 1) {
          reject(new Error('Worker exited with code ' + code));
        }
      });
    });
  }

  // Dispatch in waves of maxWorkers
  const results: WindowResult[] = [];
  for (let batch = 0; batch < tasks.length; batch += maxWorkers) {
    const batchTasks = tasks.slice(batch, batch + maxWorkers);
    const batchResults = await Promise.all(batchTasks.map(spawnWorker));
    results.push(...batchResults);

    const nanResult = batchResults.find((r) => r.nanDetected);
    if (nanResult) break;

    if (config.onProgress) {
      const lastResult = batchResults[batchResults.length - 1];
      config.onProgress(results.length, windowCount, lastResult.windowPpl);
    }
  }

  results.sort((a, b) => a.windowIndex - b.windowIndex);

  const totalLayers = config.driverConfig.totalLayers ?? 80;
  let totalLoss = 0;
  let totalTokens = 0;
  let nanDetected = false;
  let nanLocation: string | null = null;
  const windowPpls: number[] = [];

  for (const r of results) {
    if (r.nanDetected) {
      nanDetected = true;
      nanLocation = r.nanLocation;
      break;
    }
    totalLoss += r.windowLoss;
    totalTokens += r.tokenCount;
    windowPpls.push(r.windowPpl);
  }

  const avgLoss = totalTokens > 0 ? totalLoss / totalTokens : Infinity;
  const perplexity = Math.exp(avgLoss);
  const pplRatio =
    config.referencePpl != null && config.referencePpl > 0
      ? perplexity / config.referencePpl
      : null;

  return {
    perplexity,
    avgLoss,
    pplRatio,
    perLayerKL: new Array(totalLayers).fill(0),
    nanDetected,
    nanLocation,
    windowCount: windowPpls.length,
    tokenCount: totalTokens,
    windowPpls,
  };
}
