import type { MemoryEngram } from '../neural-engram';
import { getPersonaVersionHash } from '../../persona';
import { MollyLogger } from '../../logger';

/**
 * T1: Personality Reference Compression (B2B Grade)
 * 
 * Identifies stable identity data and replaces them with a versioned hash reference.
 */

export interface PersonalityReferenceResult {
  engrams: MemoryEngram[];
  personalityRefs: Record<string, any>; 
  personalityRefId: Record<string, string>; 
}

/**
 * Computes a hash of personality data for deduplication (within 0.005 tolerance).
 * 
 * CRITICAL: Compare object structure, not serialized blobs.
 * Serialization includes metadata (timestamps, IDs) that drift with every state-merge,
 * causing false uniqueness detection. Instead, normalize the trait values themselves.
 */
function hashPersonalityContext(personality: any): string {
  if (!personality || typeof personality !== 'object') return '';
  
  // Extract only the numeric personality traits (ignore metadata, timestamps, IDs)
  const traits: Array<[string, number]> = [];
  
  for (const [key, value] of Object.entries(personality)) {
    // Skip metadata and structural fields—only hash the actual traits
    if (typeof value === 'number' && !key.startsWith('_') && !['id', 'timestamp', 'version', 'hash'].includes(key)) {
      const normalized = Math.round(value * 200) / 200; // 0.005 tolerance
      traits.push([key, normalized]);
    }
  }
  
  // Sort by key to ensure deterministic hashing (same traits in any order = same hash)
  traits.sort(([k1], [k2]) => k1.localeCompare(k2));
  
  // Hash is based only on trait values, not metadata
  return traits.map(([k, v]) => `${k}:${v}`).join('|');
}

export function applyPersonalityReferenceCompression(
  engrams: MemoryEngram[]
): PersonalityReferenceResult {
  const personalityRefId: Record<string, string> = {};
  const personalityRefs: Record<string, any> = {};
  const hashToId: Record<string, string> = {};

  const processedEngrams = engrams.map((engram) => {
    const personalityContext = (engram as any).personalityContext;

    if (personalityContext && typeof personalityContext === 'object') {
      const hash = hashPersonalityContext(personalityContext);
      
      if (!hashToId[hash]) {
        const refId = `pers_${Object.keys(personalityRefs).length}`;
        hashToId[hash] = refId;
        personalityRefs[refId] = personalityContext;
      }

      const refId = hashToId[hash];
      personalityRefId[engram.id] = refId;

      const { personalityContext: _, ...rest } = engram as any;
      return {
        ...rest,
        personalityRefId: refId
      };
    }

    return engram;
  });

  return {
    engrams: processedEngrams,
    personalityRefs,
    personalityRefId
  };
}

export function decompressPersonalityReferences(
  result: PersonalityReferenceResult
): MemoryEngram[] {
  return result.engrams.map((engram) => {
    const refId = (engram as any).personalityRefId;
    if (refId && result.personalityRefs[refId]) {
      const personalityContext = result.personalityRefs[refId];
      const { personalityRefId: _, ...rest } = engram as any;
      return {
        ...rest,
        personalityContext
      };
    }
    return engram;
  });
}

export function measurePersonalityCompressionGain(
  originalEngrams: MemoryEngram[],
  bundle: PersonalityReferenceResult
): { savedBytes: number; ratioPercent: number; originalBytes: number; compressedBytes: number } {
  const originalSize = Buffer.byteLength(JSON.stringify(originalEngrams), 'utf-8');
  const compressedSize = Buffer.byteLength(JSON.stringify(bundle.engrams), 'utf-8') +
    Buffer.byteLength(JSON.stringify(bundle.personalityRefs), 'utf-8');
  const savedBytes = originalSize - compressedSize;
  const ratioPercent = (savedBytes / originalSize) * 100;

  return {
    savedBytes,
    ratioPercent,
    originalBytes: originalSize,
    compressedBytes: compressedSize,
  };
}
