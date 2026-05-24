import type { MemoryEngram } from '../neural-engram';
import { MollyLogger } from '../../logger';

/**
 * T5: Numeric Quantization
 *
 * Reduces float precision across all numeric fields in each engram.
 * AI memory values (importance, valence, arousal, personality traits) are
 * stored with full float64 precision (e.g. 0.7823419572...) but only need
 * 3 decimal places of meaningful resolution for recall and retrieval.
 *
 * This is lossless at the semantic level — no memory is altered, only
 * its numeric representation is normalized.
 *
 * Expected gain: 1-4% depending on float density per engram.
 */

const PRECISION = 3; // decimal places to keep
const FACTOR = Math.pow(10, PRECISION); // 1000

/**
 * Recursively quantize all numeric float values in an object.
 * Integers and non-numeric fields are left untouched.
 */
function quantizeObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'number') {
    // Only quantize floats — integers stay as-is
    if (Number.isInteger(obj)) return obj;
    return Math.round(obj * FACTOR) / FACTOR;
  }

  if (Array.isArray(obj)) {
    return obj.map(quantizeObject);
  }

  if (obj instanceof Date) return obj;

  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      result[key] = quantizeObject(obj[key]);
    }
    return result;
  }

  return obj;
}

export interface NumericQuantizationResult {
  engrams: MemoryEngram[];
  floatsQuantized: number;
}

export function applyNumericQuantization(
  engrams: MemoryEngram[]
): NumericQuantizationResult {
  let floatsQuantized = 0;

  const processedEngrams = engrams.map((engram) => {
    const before = JSON.stringify(engram).length;
    const quantized = quantizeObject(engram) as MemoryEngram;
    const after = JSON.stringify(quantized).length;
    floatsQuantized += Math.max(0, before - after);
    return quantized;
  });

  MollyLogger.debug('T5: Numeric quantization applied', 'compression-t5', {
    engramCount: engrams.length,
    bytesRecovered: floatsQuantized,
    precisionKept: PRECISION,
  });

  return {
    engrams: processedEngrams,
    floatsQuantized,
  };
}
