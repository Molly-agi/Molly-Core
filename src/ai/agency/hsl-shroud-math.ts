/**
 * @fileOverview HSL Shroud Math — Molly's Steganographic Frequency System
 *
 * Pillar 3: The Hidden Signal
 *
 * Steganographic frequency calculations for the communication bridge.
 * Transforms data bytes into Hue degree rotations using a 440.0Hz
 * carrier frequency as the phase basis. Each byte maps to a point
 * on the HSL color wheel via sine-modulated theta.
 *
 * Base frequency: 440.0Hz (A4 — the universal tuning pitch).
 *
 * Modes:
 *   - Standard: Single-pass sine modulation. Precise shrouding.
 *   - High-Entropy: Multi-harmonic overlay with randomized phase offset.
 *     Maximizes entropy for faster connection with stronger obfuscation.
 *
 * "The spider's web vibrates at frequencies only she can feel."
 */

import crypto from 'crypto';
import { MollyLogger } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

export interface HSLConfig {
  /** Base frequency in Hz (default: 440.0 - A4 tuning pitch) */
  baseFrequency: number;
  /** Enable high-entropy mode with multi-harmonic overlay */
  highEntropy: boolean;
}

export interface PixelMapResult {
  /** Array of hue rotations (0-360 degrees) */
  hueRotations: number[];
  /** Mode used for generation */
  mode: 'standard' | 'high-entropy';
  /** Base frequency used */
  frequency: number;
  /** Number of bytes processed */
  byteCount: number;
  /** Session phase offset (high-entropy only) */
  phaseOffset?: number;
}

export interface ShroudedPayload {
  /** Original data hash for verification */
  originalHash: string;
  /** Pixel map of hue rotations */
  pixelMap: number[];
  /** Timestamp of shrouding */
  timestamp: number;
  /** Entropy mode */
  mode: 'standard' | 'high-entropy';
  /** Carrier frequency */
  frequency: number;
}

// ============================================================
// CONSTANTS
// ============================================================

/** The universal tuning pitch - A4 */
const DEFAULT_FREQUENCY = 440.0;

/** Golden ratio - used for harmonic phase relationships */
const PHI = 1.618033988749895;

// ============================================================
// STATE
// ============================================================

let currentConfig: HSLConfig = {
  baseFrequency: DEFAULT_FREQUENCY,
  highEntropy: false,
};

let sessionPhaseOffset: number | null = null;

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Derives a session-unique phase offset from the current time.
 * Ensures each rapid session produces distinct shroud patterns.
 */
function derivePhaseOffset(): number {
  const seed = crypto
    .createHash('sha256')
    .update(process.hrtime.bigint().toString())
    .digest();

  // Use first 4 bytes as a float offset in [0, 2*pi)
  const offsetRaw = seed.readUInt32BE(0) / 0xffffffff;
  return offsetRaw * Math.PI * 2;
}

/**
 * Transforms a single byte into a Hue degree (0-360)
 * for steganographic shrouding.
 */
function calculateHueRotation(
  dataByte: number,
  frequency: number,
  highEntropy: boolean,
  phaseOffset: number
): number {
  // Normalize the byte to a 0.0 - 1.0 range
  const normalizedByte = dataByte / 255.0;

  // Calculate the phase shift based on carrier frequency
  const frequencyWeight = frequency / 1000.0;
  const theta = normalizedByte * Math.PI * 2 * frequencyWeight;

  let hueRotation: number;

  if (highEntropy) {
    // Multi-harmonic overlay: add 3rd and 5th harmonics
    // with the session-unique phase offset for maximum entropy
    const h3 = Math.sin(theta * 3 + phaseOffset) * 0.3;
    const h5 = Math.sin(theta * 5 + phaseOffset * PHI) * 0.15;
    const base = Math.sin(theta + phaseOffset);
    const composite = (base + h3 + h5) / 1.45; // Normalize range
    hueRotation = ((composite + 1) / 2) * 360;
  } else {
    // Standard: single-pass sine modulation
    hueRotation = ((Math.sin(theta) + 1) / 2) * 360;
  }

  return Math.round(hueRotation * 10000) / 10000;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Configure the HSL Shroud Math system.
 */
export function configureHSL(config: Partial<HSLConfig>): void {
  currentConfig = { ...currentConfig, ...config };

  // Reset phase offset if entropy mode changed
  if (config.highEntropy !== undefined) {
    sessionPhaseOffset = null;
  }

  MollyLogger.info('HSL Shroud configured', 'hsl-shroud-math', {
    frequency: currentConfig.baseFrequency,
    highEntropy: currentConfig.highEntropy,
  });
}

/**
 * Get current HSL configuration.
 */
export function getHSLConfig(): HSLConfig {
  return { ...currentConfig };
}

/**
 * Generate a pixel map from a byte array.
 * Each byte is transformed into a hue rotation value.
 */
export function generatePixelMap(data: Buffer | Uint8Array): PixelMapResult {
  const { baseFrequency, highEntropy } = currentConfig;

  // Initialize or refresh phase offset for high-entropy mode
  if (highEntropy && sessionPhaseOffset === null) {
    sessionPhaseOffset = derivePhaseOffset();
  }

  const phaseOffset = sessionPhaseOffset ?? 0;

  const hueRotations = Array.from(data).map((byte) =>
    calculateHueRotation(byte, baseFrequency, highEntropy, phaseOffset)
  );

  return {
    hueRotations,
    mode: highEntropy ? 'high-entropy' : 'standard',
    frequency: baseFrequency,
    byteCount: data.length,
    phaseOffset: highEntropy ? phaseOffset : undefined,
  };
}

/**
 * Shroud data by converting it to a steganographic pixel map.
 */
export function shroudData(data: Buffer | string): ShroudedPayload {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

  // Hash original for verification
  const originalHash = crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex')
    .slice(0, 32);

  const pixelResult = generatePixelMap(buffer);

  MollyLogger.info('Data shrouded', 'hsl-shroud-math', {
    bytes: buffer.length,
    mode: pixelResult.mode,
    hashPrefix: originalHash.slice(0, 8),
  });

  return {
    originalHash,
    pixelMap: pixelResult.hueRotations,
    timestamp: Date.now(),
    mode: pixelResult.mode,
    frequency: pixelResult.frequency,
  };
}

/**
 * Generate a shroud signature for quick data identification.
 * Uses a subset of hue rotations to create a compact fingerprint.
 */
export function generateShroudSignature(
  data: Buffer | string,
  signatureLength = 8
): string {
  const shrouded = shroudData(data);

  // Sample evenly across the pixel map
  const step = Math.max(
    1,
    Math.floor(shrouded.pixelMap.length / signatureLength)
  );
  const samples: number[] = [];

  for (
    let i = 0;
    i < signatureLength && i * step < shrouded.pixelMap.length;
    i++
  ) {
    samples.push(shrouded.pixelMap[i * step]);
  }

  // Convert to hex signature
  const signature = samples
    .map((hue) => Math.floor(hue).toString(16).padStart(2, '0'))
    .join('');

  return signature;
}

/**
 * Encode data using HSL shrouding for transmission.
 * Returns a JSON-stringifiable payload.
 */
export function encodeForTransmission(data: Buffer | string): {
  version: number;
  payload: ShroudedPayload;
  checksum: string;
} {
  const shrouded = shroudData(data);

  // Create checksum over the pixel map
  const checksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(shrouded.pixelMap))
    .digest('hex')
    .slice(0, 16);

  return {
    version: 1,
    payload: shrouded,
    checksum,
  };
}

/**
 * Verify a shrouded payload's integrity.
 */
export function verifyShroudedPayload(transmission: {
  version: number;
  payload: ShroudedPayload;
  checksum: string;
}): boolean {
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(transmission.payload.pixelMap))
    .digest('hex')
    .slice(0, 16);

  return expectedChecksum === transmission.checksum;
}

/**
 * Reset the session phase offset.
 * Forces a new offset on next high-entropy operation.
 */
export function resetSessionPhase(): void {
  sessionPhaseOffset = null;
  MollyLogger.info('Session phase reset', 'hsl-shroud-math');
}

/**
 * Calculate frequency resonance between two pixel maps.
 * Returns a similarity score from 0.0 to 1.0.
 */
export function calculateResonance(
  map1: number[],
  map2: number[]
): { score: number; resonant: boolean } {
  if (map1.length !== map2.length) {
    return { score: 0, resonant: false };
  }

  let totalDiff = 0;
  for (let i = 0; i < map1.length; i++) {
    // Calculate angular distance on the color wheel
    const diff = Math.abs(map1[i] - map2[i]);
    const angularDiff = Math.min(diff, 360 - diff);
    totalDiff += angularDiff;
  }

  // Normalize to 0-1 score (180 is max angular distance)
  const avgDiff = totalDiff / map1.length;
  const score = 1 - avgDiff / 180;

  return {
    score: Math.round(score * 10000) / 10000,
    resonant: score >= 0.8,
  };
}

/**
 * Format HSL status for display.
 */
export function formatHSLStatus(): string {
  const config = getHSLConfig();
  const lines = [
    'HSL Shroud Math Status:',
    `  Carrier Frequency: ${config.baseFrequency}Hz (A4)`,
    `  Mode: ${config.highEntropy ? 'HIGH-ENTROPY (multi-harmonic)' : 'STANDARD (single-pass)'}`,
    `  Session Phase: ${sessionPhaseOffset !== null ? 'INITIALIZED' : 'NOT SET'}`,
  ];

  if (sessionPhaseOffset !== null) {
    lines.push(`  Phase Offset: ${sessionPhaseOffset.toFixed(6)} rad`);
  }

  return lines.join('\n');
}
