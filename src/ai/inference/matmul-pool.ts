// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/inference/matmul-pool.ts
//
// Thread pool for parallel matrix-vector multiplication.
// Splits output rows across N workers (default: available CPUs).
// Uses SharedArrayBuffer for weight tensors — zero-copy across threads.
// Supports multiple concurrent tasks (e.g., Q/K/V projections in parallel).

import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { resolve } from 'node:path';

interface TaskState {
  resolve: (output: Float32Array) => void;
  outDim: number;
  chunks: Map<number, Float32Array>;
  chunksExpected: number;
  chunksReceived: number;
}

interface WorkerTask {
  taskId: number;
  startRow: number;
  endRow: number;
}

export class MatmulPool {
  private readonly workers: Worker[] = [];
  private readonly numWorkers: number;
  private ready = 0;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  // Support multiple concurrent tasks
  private nextTaskId = 0;
  private activeTasks = new Map<number, TaskState>();

  // Track which worker is doing what (for result routing)
  private workerTasks = new Map<number, WorkerTask>();

  // Task queue: when all workers are busy, queue tasks
  private taskQueue: Array<{
    taskId: number;
    sharedW: SharedArrayBuffer;
    inputBuf: ArrayBuffer;
    inDim: number;
    startRow: number;
    endRow: number;
  }> = [];
  private busyWorkers = new Set<number>();

  // Cache: convert Float32Array → SharedArrayBuffer for zero-copy
  private sharedCache = new Map<Float32Array, SharedArrayBuffer>();

  constructor(numWorkers?: number) {
    this.numWorkers = numWorkers ?? Math.max(cpus().length - 1, 4);
    this.readyPromise = new Promise((r) => {
      this.readyResolve = r;
    });
    this.spawn();
  }

  private spawn() {
    const workerPath = resolve(__dirname, 'matmul-worker.ts');

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(workerPath, {
        workerData: { workerId: i },
        execArgv: [
          '--require',
          require.resolve('tsx/cjs'),
          '--import',
          `file://${require.resolve('tsx/esm')}`,
        ],
      });

      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          this.ready++;
          if (this.ready === this.numWorkers) {
            this.readyResolve();
          }
        } else if (msg.type === 'result') {
          this.handleResult(msg.workerId, msg.startRow, msg.data);
        }
      });

      worker.on('error', (err) => {
        console.error(`[MatmulPool] Worker ${i} error:`, err.message);
      });

      this.workers.push(worker);
    }
  }

  async waitReady(): Promise<void> {
    return this.readyPromise;
  }

  private getShared(tensor: Float32Array): SharedArrayBuffer {
    let sab = this.sharedCache.get(tensor);
    if (!sab) {
      sab = new SharedArrayBuffer(tensor.byteLength);
      const view = new Float32Array(sab);
      view.set(tensor);
      this.sharedCache.set(tensor, sab);
    }
    return sab;
  }

  /**
   * Parallel matrix-vector multiply: y = x @ W^T
   * W is [outDim × inDim] (row-major, GGML convention).
   * Supports multiple concurrent calls (Q/K/V fire together).
   */
  forward(
    W: Float32Array,
    input: Float32Array,
    inDim: number,
    outDim: number
  ): Promise<Float32Array> {
    const sharedW = this.getShared(W);
    const taskId = this.nextTaskId++;

    const inputBuf = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    );

    // Calculate how many chunks this task needs
    const rowsPerChunk = Math.ceil(outDim / this.numWorkers);
    const numChunks = Math.ceil(outDim / rowsPerChunk);

    return new Promise((resolveTask) => {
      const taskState: TaskState = {
        resolve: resolveTask,
        outDim,
        chunks: new Map(),
        chunksExpected: numChunks,
        chunksReceived: 0,
      };
      this.activeTasks.set(taskId, taskState);

      // Dispatch chunks to available workers or queue them
      for (let c = 0; c < numChunks; c++) {
        const startRow = c * rowsPerChunk;
        const endRow = Math.min(startRow + rowsPerChunk, outDim);
        this.dispatchOrQueue(
          taskId,
          sharedW,
          inputBuf,
          inDim,
          startRow,
          endRow
        );
      }
    });
  }

  private dispatchOrQueue(
    taskId: number,
    sharedW: SharedArrayBuffer,
    inputBuf: ArrayBuffer,
    inDim: number,
    startRow: number,
    endRow: number
  ) {
    // Find a free worker
    for (let i = 0; i < this.numWorkers; i++) {
      if (!this.busyWorkers.has(i)) {
        this.busyWorkers.add(i);
        this.workerTasks.set(i, { taskId, startRow, endRow });

        const inputCopy = inputBuf.slice(0);
        this.workers[i].postMessage(
          {
            type: 'matmul',
            wBuf: sharedW,
            wOffset: 0,
            input: inputCopy,
            inDim,
            startRow,
            endRow,
          },
          [inputCopy]
        );
        return;
      }
    }

    // All workers busy — queue
    this.taskQueue.push({ taskId, sharedW, inputBuf, inDim, startRow, endRow });
  }

  private handleResult(workerId: number, startRow: number, data: ArrayBuffer) {
    const workerTask = this.workerTasks.get(workerId);
    if (!workerTask) return;

    const { taskId } = workerTask;
    const taskState = this.activeTasks.get(taskId);
    if (!taskState) return;

    // Store result chunk
    taskState.chunks.set(startRow, new Float32Array(data));
    taskState.chunksReceived++;

    // Free this worker
    this.busyWorkers.delete(workerId);
    this.workerTasks.delete(workerId);

    // Check if task is complete
    if (taskState.chunksReceived === taskState.chunksExpected) {
      const output = new Float32Array(taskState.outDim);
      for (const [row, chunk] of taskState.chunks) {
        output.set(chunk, row);
      }
      this.activeTasks.delete(taskId);
      taskState.resolve(output);
    }

    // Dispatch queued work
    if (this.taskQueue.length > 0) {
      const next = this.taskQueue.shift()!;
      this.dispatchOrQueue(
        next.taskId,
        next.sharedW,
        next.inputBuf,
        next.inDim,
        next.startRow,
        next.endRow
      );
    }
  }

  async shutdown(): Promise<void> {
    for (const worker of this.workers) {
      worker.postMessage({ type: 'shutdown' });
    }
    await Promise.all(
      this.workers.map((w) => new Promise<void>((r) => w.on('exit', () => r())))
    );
    this.workers.length = 0;
    this.sharedCache.clear();
  }

  get poolSize(): number {
    return this.numWorkers;
  }
}

let _pool: MatmulPool | null = null;

export function getMatmulPool(): MatmulPool {
  if (!_pool) {
    _pool = new MatmulPool();
  }
  return _pool;
}

export async function shutdownMatmulPool(): Promise<void> {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
  }
}
