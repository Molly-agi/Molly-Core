// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/inference/matmul-worker.ts
//
// Worker thread for parallel matrix-vector multiplication.
// Receives a slice of output rows to compute: y[startRow..endRow] = x @ W[slice]
//
// Communication via SharedArrayBuffer for zero-copy weight access.
// Input vector and output slice use MessagePort for coordination.

import { parentPort, workerData } from 'node:worker_threads';

interface WorkerInit {
  workerId: number;
}

const { workerId } = workerData as WorkerInit;

// Listen for matmul tasks
parentPort!.on('message', (msg: MatmulTask) => {
  if (msg.type === 'matmul') {
    const { wBuf, wOffset, input, inDim, startRow, endRow } = msg;

    // W is a SharedArrayBuffer — zero-copy access across all workers
    const W = new Float32Array(wBuf, wOffset);
    const x = new Float32Array(input);
    const numRows = endRow - startRow;
    const result = new Float32Array(numRows);

    for (let j = 0; j < numRows; j++) {
      const rowIdx = startRow + j;
      const rowOffset = rowIdx * inDim;
      let sum = 0;
      for (let i = 0; i < inDim; i++) {
        sum += x[i] * W[rowOffset + i];
      }
      result[j] = sum;
    }

    parentPort!.postMessage(
      { type: 'result', workerId, startRow, endRow, data: result.buffer },
      [result.buffer]
    );
  } else if (msg.type === 'shutdown') {
    process.exit(0);
  }
});

// Signal ready
parentPort!.postMessage({ type: 'ready', workerId });

interface MatmulTask {
  type: 'matmul' | 'shutdown';
  wBuf: SharedArrayBuffer;
  wOffset: number;
  input: ArrayBuffer;
  inDim: number;
  startRow: number;
  endRow: number;
}
