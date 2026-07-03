/**
 * Hardened round-trip test for Titan Echo Flat (Audit 2 of self-audit pass).
 *
 * Two coverage gaps in the existing round-trip.test.ts, applying lessons
 * from Fable batch 02:
 *
 * 1. LESSON 5 (config knobs mask production reality): the existing tests set
 *    `s0SchemaStripper: false` even in the "full pipeline" case. S0 is a
 *    production-supported stage (TITAN_SCHEMA_STRIPPER env var wires it in
 *    compression-manager.ts::loadFeatureFlags). If S0 corrupts anything
 *    during compress/decompress, the existing test suite would not catch
 *    it. This file exercises S0=true.
 *
 * 2. LESSON 3 (byte-checksum blind spots): the existing `engramsEqual`
 *    helper only compares a handful of scalar fields (id, content, userId,
 *    importance, accessCount, partial personalityContext). Fields it
 *    ignores that could be silently corrupted: timestamp, emotionalValence,
 *    arousal, lastAccessed, consolidationState, contextTags, relatedEngrams,
 *    remaining personalityContext axes, all of data.*. This file uses
 *    full-structural equality on the parsed decompressed output.
 *
 * If this test fails, we have a real bug that the existing suite masked.
 * If it passes, the S0 + full-fidelity gap is closed with a hard assertion.
 */

import { CompressionManager } from '../compression-manager';
import type { NeuralEngram } from '../../neural-engram';
import { makePersonality } from '../test-helpers';

function makeRichEngram(idx: number): NeuralEngram {
  return {
    id: `hardened-${idx}`,
    userId: 'hardened-round-trip',
    content: `Hardened round-trip test memory ${idx}. Testing full-fidelity preservation across all Titan Echo Flat stages including S0 schema stripping. Content contains punctuation, numerics like 42.7, and Unicode: café, naïve, résumé.`,
    timestamp: new Date(1_780_000_000_000 + idx * 1000),
    importance: 0.5 + idx * 0.01,
    emotionalValence: -0.5 + idx * 0.03,
    arousal: 0.3 + idx * 0.02,
    accessCount: idx * 3,
    lastAccessed: new Date(1_780_000_000_000 + idx * 2000),
    consolidationState: idx % 2 === 0 ? 'consolidated' : 'consolidating',
    contextTags: ['audit', 'round-trip', `tag-${idx}`],
    relatedEngrams: idx > 0 ? [`hardened-${idx - 1}`] : [],
    personalityContext: makePersonality({
      warmth: 0.9,
      assertiveness: 0.8,
      curiosity: 0.95,
      metacognition: 0.85,
    }),
    data: {
      context: {
        primary: `Rich context ${idx}`,
        sessionPhase: 'audit',
        priorContext: `Prior to ${idx}`,
      },
      emotionalState: {
        primary: 'stable',
        intensity: 0.4 + idx * 0.01,
        valence: -0.3 + idx * 0.02,
        regulation: { strategy: 'acceptance', effectiveness: 0.7 + idx * 0.01 },
      },
      associations: {
        relatedMemories: [`hardened-${Math.max(0, idx - 1)}`],
        strength: 0.6 + idx * 0.01,
      },
      metadata: {
        sourceType: 'audit-test',
        processingDepth: 'deep',
        consolidationAttempts: 1,
      },
    },
  };
}

/**
 * Deep-compare two engrams by every scalar and nested field.
 * Returns a list of paths where values differ.
 */
function deepDiff(a: unknown, b: unknown, path = ''): string[] {
  if (a === b) return [];
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
      ? []
      : [`${path}: Date ${a.toISOString()} vs ${b.toISOString()}`];
  }
  if (typeof a !== typeof b) {
    return [`${path}: type ${typeof a} vs ${typeof b}`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return [`${path}: array length ${a.length} vs ${b.length}`];
    }
    const diffs: string[] = [];
    for (let i = 0; i < a.length; i++) {
      diffs.push(...deepDiff(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.join(',') !== bKeys.join(',')) {
      const onlyA = aKeys.filter((k) => !bKeys.includes(k));
      const onlyB = bKeys.filter((k) => !aKeys.includes(k));
      return [
        `${path}: key set differs (only in a: [${onlyA.join(',')}], only in b: [${onlyB.join(',')}])`,
      ];
    }
    const diffs: string[] = [];
    for (const k of aKeys) {
      diffs.push(
        ...deepDiff(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          path ? `${path}.${k}` : k
        )
      );
    }
    return diffs;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    // Allow tiny FP drift but flag anything > 1e-9
    return Math.abs(a - b) < 1e-9 ? [] : [`${path}: number ${a} vs ${b}`];
  }
  return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

describe('Titan Echo Flat — hardened round-trip (audit 2)', () => {
  it('S0 schema stripper ON: full pipeline preserves engrams end-to-end', async () => {
    const original = Array.from({ length: 20 }, (_, i) => makeRichEngram(i));

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      s0SchemaStripper: true, // ← NEW: not covered by existing round-trip test
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      // Skip T5 (quantization is lossy by design) + T7 (content delta lossy on unique content) + T8 (gzip, tested elsewhere)
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: false,
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'hardened-s0',
      compressionTimestamp: Date.now(),
    });
    const decompressed = await manager.decompress(result.bundle);

    expect(decompressed).toHaveLength(original.length);
    // Deep diff every field. Empty diff array = full-fidelity round trip.
    const diffs = deepDiff(original, decompressed);
    if (diffs.length > 0) {
      console.error(
        'Round-trip diffs found:\n' + diffs.slice(0, 20).join('\n')
      );
    }
    expect(diffs).toEqual([]);
  });

  it('S0 alone (no other techniques): schema-stripped output round-trips cleanly', async () => {
    const original = Array.from({ length: 5 }, (_, i) => makeRichEngram(i));

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance({
      s0SchemaStripper: true,
      t1PersonalityReference: false,
      t3TemporalDelta: false,
      t4VocabularyDict: false,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: false,
    });

    const result = await manager.compress({
      engrams: original,
      sessionId: 'hardened-s0-alone',
      compressionTimestamp: Date.now(),
    });
    const decompressed = await manager.decompress(result.bundle);

    const diffs = deepDiff(original, decompressed);
    if (diffs.length > 0) {
      console.error(
        'S0-alone round-trip diffs:\n' + diffs.slice(0, 20).join('\n')
      );
    }
    expect(diffs).toEqual([]);
  });
});
