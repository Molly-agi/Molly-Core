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

export function applyPersonalityReferenceCompression(
  engrams: MemoryEngram[]
): PersonalityReferenceResult {
  const currentHash = getPersonaVersionHash();
  const personalityRefId: Record<string, string> = {};
  const personalityRefs: Record<string, any> = {};

  const processedEngrams = engrams.map((engram) => {
    const data = engram.data as any;

    if (data && (data.persona || data.identity || data.principles)) {
      if (!personalityRefs[currentHash]) {
        // Only capture fields that actually exist to ensure bit-perfect restoration
        const ref: any = {};
        if (data.identity) ref.identity = data.identity;
        if (data.principles) ref.principles = data.principles;
        if (data.persona) ref.persona = data.persona;
        personalityRefs[currentHash] = ref;
      }

      personalityRefId[engram.id] = currentHash;

      const { persona, identity, principles, ...rest } = data;
      return {
        ...engram,
        data: {
          ...rest,
          __t1_ref: currentHash
        }
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
    const data = engram.data as any;
    if (data && data.__t1_ref) {
      const hash = data.__t1_ref;
      const refData = result.personalityRefs[hash];
      if (refData) {
        const { __t1_ref, ...rest } = data;
        return {
          ...engram,
          data: {
            ...rest,
            ...refData
          }
        };
      }
    }
    return engram;
  });
}
