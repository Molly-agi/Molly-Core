// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
// src/ai/engine-titan/siren-inr.ts
//
// SIREN INR — Sinusoidal Implicit Neural Representation for embedding tables.
//
// Compresses massive discrete embedding tables (e.g. token_embd.weight [8192 x 152064])
// into a tiny coordinate-MLP that maps token_id -> embedding_vector.
//
// Architecture (from PDF "Shrinking AI Models for Phones"):
//   f(x) = sin(ω₀ · W · x + b)  at each layer
//   where ω₀ controls spectral frequency bias.
//
// SIREN overcomes ReLU's spectral bias (over-smoothing) by using periodic
// activations that can represent high-frequency signals in embedding space.
//
// Target: 94-99% compression of embedding tables while preserving downstream
// translation/classification accuracy.
//
// Usage:
//   const siren = new SirenINR({ inputDim: 1, hiddenDim: 256, outputDim: 8192, numLayers: 4 });
//   await siren.fit(embeddingTable, { epochs: 1000, lr: 1e-4 });
//   const embedding = siren.forward(tokenId);  // returns Float32Array[8192]

export interface SirenConfig {
  inputDim: number;       // 1 (token coordinate)
  hiddenDim: number;      // Width of hidden layers (256-512 typical)
  outputDim: number;      // Embedding dimension (8192 for Qwen 72B)
  numLayers: number;      // Depth (3-5 typical)
  omega0: number;         // First-layer frequency (30.0 default per SIREN paper)
  omegaHidden: number;    // Hidden layer frequency (30.0 default)
}

export interface SirenWeights {
  layers: Array<{ weight: Float32Array; bias: Float32Array }>;
  config: SirenConfig;
  vocabSize: number;
  trainLoss: number;
}

export interface FitOptions {
  epochs: number;
  lr: number;
  batchSize?: number;
  onEpoch?: (epoch: number, loss: number) => void;
}

/**
 * SIREN network for implicit embedding representation.
 * Maps normalized coordinate [0, 1] -> embedding vector.
 */
export class SirenINR {
  private readonly config: SirenConfig;
  private layers: Array<{ weight: Float32Array; bias: Float32Array }>;

  constructor(config: Partial<SirenConfig> & { outputDim: number }) {
    this.config = {
      inputDim: config.inputDim ?? 1,
      hiddenDim: config.hiddenDim ?? 256,
      outputDim: config.outputDim,
      numLayers: config.numLayers ?? 4,
      omega0: config.omega0 ?? 30.0,
      omegaHidden: config.omegaHidden ?? 30.0,
    };
    this.layers = this.initWeights();
  }

  /**
   * SIREN-specific initialization (from the paper):
   * - First layer: uniform(-1/n, 1/n) * omega0
   * - Hidden layers: uniform(-sqrt(6/n), sqrt(6/n)) / omega_hidden
   */
  private initWeights(): Array<{ weight: Float32Array; bias: Float32Array }> {
    const { inputDim, hiddenDim, outputDim, numLayers, omega0, omegaHidden } = this.config;
    const layers: Array<{ weight: Float32Array; bias: Float32Array }> = [];
    let seed = 0x12345678;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 0) / 0xffffffff; };

    for (let l = 0; l < numLayers; l++) {
      const inDim = l === 0 ? inputDim : hiddenDim;
      const outDim = l === numLayers - 1 ? outputDim : hiddenDim;
      const weight = new Float32Array(outDim * inDim);
      const bias = new Float32Array(outDim);

      if (l === 0) {
        // First layer: uniform(-1/inDim, 1/inDim)
        const bound = 1.0 / inDim;
        for (let i = 0; i < weight.length; i++) weight[i] = (rng() * 2 - 1) * bound;
      } else {
        // Hidden/output: uniform(-sqrt(6/inDim)/omega, sqrt(6/inDim)/omega)
        const bound = Math.sqrt(6.0 / inDim) / omegaHidden;
        for (let i = 0; i < weight.length; i++) weight[i] = (rng() * 2 - 1) * bound;
      }
      for (let i = 0; i < bias.length; i++) bias[i] = (rng() * 2 - 1) * 0.01;

      layers.push({ weight, bias });
    }
    return layers;
  }

  /**
   * Forward pass: coordinate -> embedding.
   * tokenId is normalized to [0, 1] range.
   */
  forward(tokenId: number, vocabSize: number): Float32Array {
    const { hiddenDim, outputDim, numLayers, omega0, omegaHidden } = this.config;
    // Normalize token coordinate to [0, 1]
    let x = new Float32Array(1);
    x[0] = tokenId / (vocabSize - 1);

    for (let l = 0; l < numLayers; l++) {
      const { weight, bias } = this.layers[l];
      const inDim = l === 0 ? this.config.inputDim : hiddenDim;
      const outDim = l === numLayers - 1 ? outputDim : hiddenDim;
      const omega = l === 0 ? omega0 : omegaHidden;

      const y = new Float32Array(outDim);
      for (let i = 0; i < outDim; i++) {
        let sum = bias[i];
        for (let j = 0; j < inDim; j++) sum += weight[i * inDim + j] * x[j];
        // SIREN activation: sin(omega * linear) for all but last layer
        y[i] = l < numLayers - 1 ? Math.sin(omega * sum) : sum;
      }
      x = y;
    }
    return x;
  }

  /**
   * Fit the SIREN to an embedding table using gradient descent.
   * embeddingTable: Float32Array of [vocabSize x embDim] row-major.
   */
  fit(embeddingTable: Float32Array, vocabSize: number, options: FitOptions): number {
    const { epochs, lr, batchSize = 256 } = options;
    const { outputDim, numLayers, hiddenDim, omega0, omegaHidden } = this.config;
    let bestLoss = Infinity;

    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0;
      let count = 0;

      // Mini-batch SGD over random token positions
      for (let b = 0; b < vocabSize; b += batchSize) {
        const bEnd = Math.min(b + batchSize, vocabSize);

        for (let tokenId = b; tokenId < bEnd; tokenId++) {
          // Forward
          const pred = this.forward(tokenId, vocabSize);
          const target = embeddingTable.subarray(tokenId * outputDim, (tokenId + 1) * outputDim);

          // MSE loss + backprop (simplified: numerical gradient for first pass)
          let loss = 0;
          for (let i = 0; i < outputDim; i++) {
            const d = pred[i] - target[i];
            loss += d * d;
          }
          epochLoss += loss / outputDim;
          count++;

          // Simplified gradient: perturb last layer weights toward target
          // (Full backprop through sin activations is complex — this is a scaffold)
          const lastLayer = this.layers[numLayers - 1];
          const gradScale = lr / outputDim;
          const prevActivation = this.getPreLastActivation(tokenId, vocabSize);

          for (let i = 0; i < outputDim; i++) {
            const error = pred[i] - target[i];
            lastLayer.bias[i] -= gradScale * error;
            for (let j = 0; j < prevActivation.length; j++) {
              lastLayer.weight[i * prevActivation.length + j] -= gradScale * error * prevActivation[j];
            }
          }
        }
      }

      const avgLoss = epochLoss / count;
      if (avgLoss < bestLoss) bestLoss = avgLoss;
      options.onEpoch?.(epoch, avgLoss);
    }
    return bestLoss;
  }

  /** Get activation before the last layer (for gradient computation) */
  private getPreLastActivation(tokenId: number, vocabSize: number): Float32Array {
    const { hiddenDim, numLayers, omega0, omegaHidden } = this.config;
    let x = new Float32Array(1);
    x[0] = tokenId / (vocabSize - 1);

    for (let l = 0; l < numLayers - 1; l++) {
      const { weight, bias } = this.layers[l];
      const inDim = l === 0 ? this.config.inputDim : hiddenDim;
      const outDim = hiddenDim;
      const omega = l === 0 ? omega0 : omegaHidden;

      const y = new Float32Array(outDim);
      for (let i = 0; i < outDim; i++) {
        let sum = bias[i];
        for (let j = 0; j < inDim; j++) sum += weight[i * inDim + j] * x[j];
        y[i] = Math.sin(omega * sum);
      }
      x = y;
    }
    return x;
  }

  /** Export weights for storage */
  exportWeights(vocabSize: number, trainLoss: number): SirenWeights {
    return {
      layers: this.layers.map(l => ({
        weight: new Float32Array(l.weight),
        bias: new Float32Array(l.bias),
      })),
      config: { ...this.config },
      vocabSize,
      trainLoss,
    };
  }

  /** Import pre-trained weights */
  static fromWeights(weights: SirenWeights): SirenINR {
    const siren = new SirenINR(weights.config);
    siren.layers = weights.layers.map(l => ({
      weight: new Float32Array(l.weight),
      bias: new Float32Array(l.bias),
    }));
    return siren;
  }

  /** Compute compression ratio */
  getCompressionStats(vocabSize: number): { params: number; bytes: number; originalBytes: number; ratio: number } {
    let params = 0;
    for (const l of this.layers) params += l.weight.length + l.bias.length;
    const bytes = params * 4; // Float32
    const originalBytes = vocabSize * this.config.outputDim * 4;
    return { params, bytes, originalBytes, ratio: originalBytes / bytes };
  }
}
