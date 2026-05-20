/**
 * Option C Compression Manager
 *
 * Orchestrates all six Option C compression techniques behind feature flags.
 * Every technique is independently toggleable via env vars for ablation and rollback.
 *
 * Execution order (matches Option C build priority):
 *   P1: T1 → T3 → T4
 *   P2: T2 → T6
 *   P3: T5
 *
 * Guardrails (enforced after every technique):
 *   - Episodic recall must remain ≥ 95% (RECALL_GUARDRAIL)
 *   - If a technique would violate the guardrail, it is skipped and flagged
 *
 * Phase 0 state: all technique flags default OFF.
 * Enable each technique only after its tests pass the recall guardrail.
 */

import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';
import {
  applyPersonalityReferenceCompression,
  decompressPersonalityReferences,
} from './personality-reference';
import {
  applyTemporalDeltaEncoding,
  decompressTemporalDeltas,
} from './temporal-delta';
import {
  applyVocabularyCompression,
  decompressVocabulary,
} from './vocabulary-dict';

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export interface CompressionFeatureFlags {
  // P1 — build first, highest confidence
  t1PersonalityReference: boolean; // env: MOLLY_COMPRESS_T1
  t3TemporalDelta: boolean; // env: MOLLY_COMPRESS_T3
  t4VocabularyDict: boolean; // env: MOLLY_COMPRESS_T4
  // P2 — after P1 is stable
  t2TimeDecayFidelity: boolean; // env: MOLLY_COMPRESS_T2
  t6InteractionTrace: boolean; // env: MOLLY_COMPRESS_T6
  // P3 — optimize after P1+P2
  t5NumericQuantization: boolean; // env: MOLLY_COMPRESS_T5
}

function loadFeatureFlags(): CompressionFeatureFlags {
  return {
    t1PersonalityReference: process.env.MOLLY_COMPRESS_T1 === '1',
    t3TemporalDelta: process.env.MOLLY_COMPRESS_T3 === '1',
    t4VocabularyDict: process.env.MOLLY_COMPRESS_T4 === '1',
    t2TimeDecayFidelity: process.env.MOLLY_COMPRESS_T2 === '1',
    t6InteractionTrace: process.env.MOLLY_COMPRESS_T6 === '1',
    t5NumericQuantization: process.env.MOLLY_COMPRESS_T5 === '1',
  };
}

// ============================================================================
// COMPRESSION PIPELINE TYPES
// ============================================================================

export interface CompressionContext {
  engrams: MemoryEngram[];
  sessionId: string;
  compressionTimestamp: number;
}

export interface CompressionAuditEntry {
  technique: string;
  engramId: string;
  action: 'retained' | 'transformed' | 'pruned';
  reason: string;
  originalByteSize?: number;
  compressedByteSize?: number;
}

export interface CompressionMetrics {
  originalCount: number;
  survivingCount: number;
  episodicRecall: number; // ID-intersection recall (0..1)
  originalByteSize: number;
  compressedByteSize: number;
  compressionRatio: number; // (1 - compressed/original) × 100
  techniquesApplied: string[];
  techniquesSkipped: string[]; // skipped due to guardrail or flag=off
  guardrailPassed: boolean;
  restoreLatencyMs?: number;
}

export interface CompressedMemoryBundle {
  version: '1.0';
  compressedAt: number;
  sessionId: string;
  techniqueOrder: string[];
  // Each technique stage produces a named payload that the next stage or
  // the decompressor can consume. We keep all stages so rollback can stop
  // at any stage.
  stages: {
    afterT1?: ReturnType<typeof applyPersonalityReferenceCompression>;
    afterT3?: ReturnType<typeof applyTemporalDeltaEncoding>;
    afterT4?: ReturnType<typeof applyVocabularyCompression>;
    // T2, T6, T5 payloads added when those techniques are built
  };
  // Final engrams (post all enabled techniques). These are the live-serving engrams.
  finalEngrams: MemoryEngram[];
  auditEntries: CompressionAuditEntry[];
}

export interface CompressionResult {
  bundle: CompressedMemoryBundle;
  metrics: CompressionMetrics;
}

// ============================================================================
// GUARDRAIL CHECK
// ============================================================================

const RECALL_GUARDRAIL = 0.95; // 95% — do NOT ship below this

function measureEpisodicRecall(
  originalIds: Set<string>,
  surviving: MemoryEngram[]
): number {
  let intersection = 0;
  for (const e of surviving) {
    if (originalIds.has(e.id)) intersection++;
  }
  return originalIds.size > 0 ? intersection / originalIds.size : 1;
}

// ============================================================================
// COMPRESSION MANAGER
// ============================================================================

export class CompressionManager {
  private static instance: CompressionManager | null = null;
  private readonly flags: CompressionFeatureFlags;

  private constructor(flags?: Partial<CompressionFeatureFlags>) {
    this.flags = { ...loadFeatureFlags(), ...flags };
  }

  static getInstance(
    flags?: Partial<CompressionFeatureFlags>
  ): CompressionManager {
    if (!CompressionManager.instance) {
      CompressionManager.instance = new CompressionManager(flags);
    }
    return CompressionManager.instance;
  }

  // For tests: reset singleton so flags can be changed between test cases
  static resetForTest(): void {
    CompressionManager.instance = null;
  }

  getFlags(): Readonly<CompressionFeatureFlags> {
    return { ...this.flags };
  }

  async compress(ctx: CompressionContext): Promise<CompressionResult> {
    const originalIds = new Set(ctx.engrams.map((e) => e.id));
    const originalByteSize = JSON.stringify(ctx.engrams).length;
    const techniquesApplied: string[] = [];
    const techniquesSkipped: string[] = [];
    const auditEntries: CompressionAuditEntry[] = [];
    const bundle: CompressedMemoryBundle = {
      version: '1.0',
      compressedAt: ctx.compressionTimestamp,
      sessionId: ctx.sessionId,
      techniqueOrder: [],
      stages: {},
      finalEngrams: ctx.engrams,
      auditEntries,
    };

    let currentEngrams = ctx.engrams;

    // ---- T1: Personality Reference Compression (P1) ----
    if (this.flags.t1PersonalityReference) {
      const result = applyPersonalityReferenceCompression(currentEngrams);
      const recall = measureEpisodicRecall(originalIds, result.engrams);

      if (recall >= RECALL_GUARDRAIL) {
        bundle.stages.afterT1 = result;
        currentEngrams = result.engrams;
        techniquesApplied.push('T1:PersonalityReference');
        for (const e of result.engrams) {
          auditEntries.push({
            technique: 'T1:PersonalityReference',
            engramId: e.id,
            action: result.personalityRefId[e.id] ? 'transformed' : 'retained',
            reason: result.personalityRefId[e.id]
              ? 'personality_deduped_to_ref'
              : 'no_personality_context',
          });
        }
        MollyLogger.info(
          'T1: PersonalityReference applied',
          'compression-manager',
          {
            savedRefs: Object.keys(result.personalityRefs).length,
            recall: `${(recall * 100).toFixed(1)}%`,
          }
        );
      } else {
        techniquesSkipped.push('T1:PersonalityReference (guardrail violation)');
        MollyLogger.warn(
          'T1: SKIPPED — recall would drop below guardrail',
          'compression-manager',
          { recall }
        );
      }
    } else {
      techniquesSkipped.push('T1:PersonalityReference (flag off)');
    }

    // ---- T3: Temporal Delta Encoding (P1) ----
    if (this.flags.t3TemporalDelta) {
      const result = applyTemporalDeltaEncoding(currentEngrams);
      const recall = measureEpisodicRecall(
        originalIds,
        result.reconstructedEngrams
      );

      if (recall >= RECALL_GUARDRAIL) {
        bundle.stages.afterT3 = result;
        currentEngrams = result.reconstructedEngrams;
        techniquesApplied.push('T3:TemporalDelta');
        MollyLogger.info('T3: TemporalDelta applied', 'compression-manager', {
          bases: result.bases.length,
          deltaGroups: result.deltaGroups.length,
          recall: `${(recall * 100).toFixed(1)}%`,
        });
      } else {
        techniquesSkipped.push('T3:TemporalDelta (guardrail violation)');
        MollyLogger.warn(
          'T3: SKIPPED — recall would drop below guardrail',
          'compression-manager',
          { recall }
        );
      }
    } else {
      techniquesSkipped.push('T3:TemporalDelta (flag off)');
    }

    // ---- T4: Vocabulary Dictionary Compression (P1) ----
    if (this.flags.t4VocabularyDict) {
      const result = applyVocabularyCompression(currentEngrams);
      const recall = measureEpisodicRecall(originalIds, result.engrams);

      if (recall >= RECALL_GUARDRAIL) {
        bundle.stages.afterT4 = result;
        currentEngrams = result.engrams;
        techniquesApplied.push('T4:VocabularyDict');
        MollyLogger.info('T4: VocabularyDict applied', 'compression-manager', {
          dictEntries: Object.keys(result.dictionary).length,
          recall: `${(recall * 100).toFixed(1)}%`,
        });
      } else {
        techniquesSkipped.push('T4:VocabularyDict (guardrail violation)');
        MollyLogger.warn(
          'T4: SKIPPED — recall would drop below guardrail',
          'compression-manager',
          { recall }
        );
      }
    } else {
      techniquesSkipped.push('T4:VocabularyDict (flag off)');
    }

    // T2, T6, T5 — stubs, built in Option C P2/P3 phases
    if (this.flags.t2TimeDecayFidelity)
      techniquesSkipped.push('T2:TimeDecayFidelity (not yet built — P2)');
    if (this.flags.t6InteractionTrace)
      techniquesSkipped.push('T6:InteractionTrace (not yet built — P2)');
    if (this.flags.t5NumericQuantization)
      techniquesSkipped.push('T5:NumericQuantization (not yet built — P3)');

    bundle.finalEngrams = currentEngrams;
    bundle.techniqueOrder = techniquesApplied;
    bundle.auditEntries = auditEntries;

    const compressedByteSize = JSON.stringify(bundle).length;
    const finalRecall = measureEpisodicRecall(originalIds, currentEngrams);

    return {
      bundle,
      metrics: {
        originalCount: ctx.engrams.length,
        survivingCount: currentEngrams.length,
        episodicRecall: finalRecall,
        originalByteSize,
        compressedByteSize,
        compressionRatio: (1 - compressedByteSize / originalByteSize) * 100,
        techniquesApplied,
        techniquesSkipped,
        guardrailPassed: finalRecall >= RECALL_GUARDRAIL,
      },
    };
  }

  async decompress(bundle: CompressedMemoryBundle): Promise<MemoryEngram[]> {
    const startMs = Date.now();

    // Decompress in reverse technique order
    let engrams = bundle.finalEngrams;

    // T4 → T3 → T1 decompression (reverse of application)
    if (bundle.stages.afterT4) {
      engrams = decompressVocabulary(bundle.stages.afterT4);
    }
    if (bundle.stages.afterT3) {
      engrams = decompressTemporalDeltas(bundle.stages.afterT3);
    }
    if (bundle.stages.afterT1) {
      engrams = decompressPersonalityReferences(bundle.stages.afterT1);
    }

    MollyLogger.debug('Decompression complete', 'compression-manager', {
      techniquesReversed: bundle.techniqueOrder.length,
      latencyMs: Date.now() - startMs,
    });

    return engrams;
  }
}
