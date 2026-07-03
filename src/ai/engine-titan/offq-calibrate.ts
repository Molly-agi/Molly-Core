// src/ai/engine-titan/offq-calibrate.ts
//
// Pre-computes OffQ PCA states per-layer from calibration activations.
// Run once at model load time; store states for use during inference.

import {
  applyOffQ,
  measureOutlierConcentration,
  type OffQState,
} from './offq-pca';

export interface CalibrationConfig {
  readonly tokens: number;
  readonly channels: number;
  readonly layers: number;
}

export interface CalibrationResult {
  readonly states: OffQState[];
  readonly reductionRatios: number[];
}

/**
 * Calibrates OffQ states from a set of activation samples per layer.
 * Each sample is a [tokens × channels] Float32Array representing
 * post-LayerNorm activations at that layer.
 *
 * In practice: run ~128 calibration tokens through the model,
 * capture activations after each layer's RMSNorm, feed them here.
 */
export function calibrateOffQ(
  activationSamples: Float32Array[],
  config: CalibrationConfig
): CalibrationResult {
  if (activationSamples.length !== config.layers) {
    throw new RangeError(
      `Expected ${config.layers} activation samples, got ${activationSamples.length}`
    );
  }

  const states: OffQState[] = [];
  const reductionRatios: number[] = [];

  for (let l = 0; l < config.layers; l++) {
    const X = activationSamples[l];
    if (X.length !== config.tokens * config.channels) {
      throw new RangeError(
        `Layer ${l}: expected ${config.tokens * config.channels} elements, got ${X.length}`
      );
    }

    const { state } = applyOffQ(X, config.tokens, config.channels);
    states.push(state);

    const before = measureOutlierConcentration(
      X,
      config.tokens,
      config.channels
    );
    const { transformed } = applyOffQ(X, config.tokens, config.channels);
    const after = measureOutlierConcentration(
      transformed,
      config.tokens,
      config.channels
    );
    reductionRatios.push(1 - after.maxToMeanRatio / before.maxToMeanRatio);
  }

  return { states, reductionRatios };
}

/**
 * Serializes OffQ states for storage alongside crystal vault.
 */
export function serializeOffQStates(states: OffQState[]): Buffer {
  const entries: Buffer[] = [];

  for (const state of states) {
    const channelBuf = Buffer.alloc(4);
    channelBuf.writeUInt32LE(state.channelCount, 0);

    const pcaBuf = Buffer.alloc(state.channelCount * 4);
    for (let i = 0; i < state.channelCount; i++) {
      pcaBuf.writeFloatLE(state.pca1Direction[i], i * 4);
    }

    entries.push(Buffer.concat([channelBuf, pcaBuf]));
  }

  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x4f464651, 0); // "OFFQ" magic
  header.writeUInt32LE(states.length, 4);

  return Buffer.concat([header, ...entries]);
}

/**
 * Deserializes OffQ states from stored buffer.
 */
export function deserializeOffQStates(buf: Buffer): OffQState[] {
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x4f464651) {
    throw new Error(`Invalid OffQ state magic: 0x${magic.toString(16)}`);
  }

  const count = buf.readUInt32LE(4);
  const states: OffQState[] = [];
  let offset = 8;

  for (let i = 0; i < count; i++) {
    const channelCount = buf.readUInt32LE(offset);
    offset += 4;

    const pca1Direction = new Float32Array(channelCount);
    for (let j = 0; j < channelCount; j++) {
      pca1Direction[j] = buf.readFloatLE(offset);
      offset += 4;
    }

    states.push({ pca1Direction, channelCount });
  }

  return states;
}
