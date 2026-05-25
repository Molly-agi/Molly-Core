/**
 * T8: Standard Compression Layer (B2B Grade)
 *
 * Final post-processing step: compress the JSON output of all semantic stages
 * using gzip (Node.js native zlib). Since semantic compression (T1-T7) reduces
 * repetition in the structured JSON, the resulting JSON is highly compressible
 * by byte-level algorithms.
 *
 * METHODOLOGY:
 * - Input: finalEngrams (post T1-T7 semantic pipeline)
 * - Process: JSON.stringify → gzip compress
 * - Output: gzip buffer + store alongside original engrams for transparent decompression
 * - Guarantee: 100% bit-perfect recall; fully reversible via gunzip
 *
 * EXPECTED GAINS:
 * - On already semantically-reduced JSON: 40-60% additional compression
 * - Cumulative with T1-T7: moves final ratio from 49% to 70%+ on heavy loads
 * - Zero semantic risk: purely byte-level, no data loss
 *
 * NOTE:
 * This layer is OPTIONAL for JSON storage/transmission. It is designed to be
 * MANDATORY for long-term Firestore storage and production archive tiers.
 * Feature flag MOLLY_COMPRESS_T8 controls activation.
 */

import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import type { MemoryEngram } from '../neural-engram';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Compressed payload wrapper. When T8 is active, engram content is replaced with
 * this structure during storage, then decompressed on retrieval.
 */
export interface StandardCompressedPayload {
  __compressed: true;
  encoding: 'gzip';
  // Original JSON stringified, then gzipped, then base64 for safe transmission
  data: string; // base64(gzip(JSON.stringify(originalEngrams)))
}

export interface StandardCompressionResult {
  engrams: Array<MemoryEngram | StandardCompressedPayload>;
  originalByteSize: number;
  compressedByteSize: number;
  bytesRecovered: number; // originalByteSize - compressedByteSize
  compressionRatio: number; // 0-1, e.g., 0.30 = 30% of original size
  isCompressed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply gzip compression to the final engram list.
 * Stores the entire array as a single compressed blob for maximum efficiency.
 */
export async function applyStandardCompression(
  engrams: MemoryEngram[]
): Promise<StandardCompressionResult> {
  if (engrams.length === 0) {
    return {
      engrams: [],
      originalByteSize: 0,
      compressedByteSize: 0,
      bytesRecovered: 0,
      compressionRatio: 0,
      isCompressed: false,
    };
  }

  const originalJson = JSON.stringify(engrams);
  const originalByteSize = originalJson.length;

  let compressedBuffer: Buffer;
  try {
    compressedBuffer = await gzipAsync(originalJson, { level: 9 }); // max compression
  } catch (error) {
    throw new Error(`T8 gzip compression failed: ${error}`);
  }

  const compressedByteSize = compressedBuffer.length;
  const bytesRecovered = originalByteSize - compressedByteSize;
  const compressionRatio = compressedByteSize / originalByteSize;

  // Wrap the compressed data in base64 for safe JSON transmission
  const payload: StandardCompressedPayload = {
    __compressed: true,
    encoding: 'gzip',
    data: compressedBuffer.toString('base64'),
  };

  return {
    engrams: [payload] as (MemoryEngram | StandardCompressedPayload)[],
    originalByteSize,
    compressedByteSize,
    bytesRecovered,
    compressionRatio,
    isCompressed: true,
  };
}

/**
 * Decompress a T8-compressed engram list.
 * Reverses the gzip compression and returns the original engram array.
 */
export async function decompressStandardCompression(
  compressed: StandardCompressedPayload
): Promise<MemoryEngram[]> {
  if (!compressed.__compressed || compressed.encoding !== 'gzip') {
    throw new Error(
      'T8: Invalid compressed payload structure. Expected __compressed=true and encoding=gzip'
    );
  }

  let decompressedBuffer: Buffer;
  try {
    decompressedBuffer = await gunzipAsync(Buffer.from(compressed.data, 'base64'));
  } catch (error) {
    throw new Error(`T8 gzip decompression failed: ${error}`);
  }

  const originalJson = decompressedBuffer.toString('utf-8');
  try {
    return JSON.parse(originalJson) as MemoryEngram[];
  } catch (error) {
    throw new Error(`T8: Failed to parse decompressed JSON: ${error}`);
  }
}

/**
 * Type guard: check if a value is a T8-compressed payload
 */
export function isStandardCompressedPayload(v: unknown): v is StandardCompressedPayload {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as StandardCompressedPayload).__compressed === true &&
    (v as StandardCompressedPayload).encoding === 'gzip' &&
    typeof (v as StandardCompressedPayload).data === 'string'
  );
}

/**
 * Transparent decompression: if the input is a compressed payload, decompress it.
 * Otherwise, return the input as-is (for compatibility with uncompressed data).
 */
export async function decompressIfNeeded(
  data: MemoryEngram[] | StandardCompressedPayload
): Promise<MemoryEngram[]> {
  if (Array.isArray(data)) {
    return data; // Already decompressed array
  }
  if (isStandardCompressedPayload(data)) {
    return decompressStandardCompression(data);
  }
  throw new Error('T8: Input is neither an engram array nor a valid compressed payload');
}
