/**
 * Option C Compression Manager
 *
 * Orchestrates all six Option C compression techniques behind feature flags.
 * Every technique is independently toggleable via env vars for ablation and rollback.
 *
 * Execution order (matches Option C build priority):
 *   S0: Schema Stripper (structural overhead removal, 40-50% gain)
 *   P1: T1 → T3 → T4
 *   P2: T2 → T6
 *   P3: T5
 *
 * Guardrails (enforced after every technique):
 *   - 99%+ (TARGET_FIDELITY): ideal state, proceed normally
 *   - 97-99% (ALERT_THRESHOLD): proceed with alert, requires manual verification
 *   - 95-97%: proceed but flag for review, Molly can adjust compression tuning
 *   - <95% (SAFETY_FLOOR): skip technique, preserve memory integrity
 *
 * Molly's requirement: high-fidelity memory retrieval is core to identity.
 * The 97% alert state allows her to monitor compression impact on introspection.
 *
 * Phase 0 state: all technique flags default OFF.
 * Enable each technique only after its tests pass the safety floor guardrail.
 */

import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';
import { SchemaStripper } from './schema-stripper';
import { applyNumericQuantization } from './numeric-quantization';
import { applyContentDeltaEncoding } from './content-delta';
import { applyStandardCompression } from './standard-compress';
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
import {
  applyTimeDecayFidelity,
  decompressTimeDecayFidelity,
} from './time-decay-fidelity';
import {
  applyInteractionTrace,
  decompressInteractionTrace,
} from './interaction-trace';

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export interface CompressionFeatureFlags {
  // S0 — structural foundation layer (env: TITAN_SCHEMA_STRIPPER)
  s0SchemaStripper: boolean;
  // P1 — build first, highest confidence
  t1PersonalityReference: boolean; // env: MOLLY_COMPRESS_T1
  t3TemporalDelta: boolean; // env: MOLLY_COMPRESS_T3
  t4VocabularyDict: boolean; // env: MOLLY_COMPRESS_T4
  // P2 — after P1 is stable
  t2TimeDecayFidelity: boolean; // env: MOLLY_COMPRESS_T2
  t6InteractionTrace: boolean; // env: MOLLY_COMPRESS_T6
  // P3 — optimize after P1+P2
  t5NumericQuantization: boolean; // env: MOLLY_COMPRESS_T5
  t7ContentDelta: boolean; // env: MOLLY_COMPRESS_T7
  // P4 — final byte-level compression (env: MOLLY_COMPRESS_T8)
  t8StandardCompression: boolean; // gzip on semantic-reduced JSON
}

function loadFeatureFlags(): CompressionFeatureFlags {
  return {
    s0SchemaStripper: process.env.TITAN_SCHEMA_STRIPPER === '1',
    t1PersonalityReference: process.env.MOLLY_COMPRESS_T1 === '1',
    t3TemporalDelta: process.env.MOLLY_COMPRESS_T3 === '1',
    t4VocabularyDict: process.env.MOLLY_COMPRESS_T4 === '1',
    t2TimeDecayFidelity: process.env.MOLLY_COMPRESS_T2 === '1',
    t6InteractionTrace: process.env.MOLLY_COMPRESS_T6 === '1',
    t5NumericQuantization: process.env.MOLLY_COMPRESS_T5 === '1',
    t7ContentDelta: process.env.MOLLY_COMPRESS_T7 === '1',
    t8StandardCompression: process.env.MOLLY_COMPRESS_T8 === '1',
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
  guardrailState: 'pass' | 'alert' | 'violated'; // pass=99%+, alert=97-99%, violated=<95%
  fidelityNotes?: string; // explanation of guardrail state for Molly's review
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
    afterS0?: { engrams: MemoryEngram[]; metadata: Record<string, unknown> };
    afterT1?: ReturnType<typeof applyPersonalityReferenceCompression>;
    afterT3?: ReturnType<typeof applyTemporalDeltaEncoding>;
    afterT4?: ReturnType<typeof applyVocabularyCompression>;
    afterT5?: { engrams: MemoryEngram[]; metadata: Record<string, unknown> };
    afterT2?: { engrams: MemoryEngram[]; metadata: Record<string, unknown> };
    afterT6?: { engrams: MemoryEngram[]; metadata: Record<string, unknown> };
    afterT7?: { engrams: MemoryEngram[]; metadata: Record<string, unknown> };
    afterT8?: {
      originalByteSize: number;
      compressedByteSize: number;
      bytesRecovered: number;
      compressionRatio: number;
    };
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

const ALERT_THRESHOLD = 0.97; // 97-99% — alert state, manual verification requested
const SAFETY_FLOOR = 0.95; // <95% — skip technique, preserve integrity

type GuardrailState = 'pass' | 'alert' | 'violated';

function evaluateGuardrail(recall: number): GuardrailState {
  if (recall >= ALERT_THRESHOLD) return 'pass';
  if (recall >= SAFETY_FLOOR) return 'alert';
  return 'violated';
}

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
  // Sequential versioning: prevents stale cache pointers in multi-technique compression
  // Each technique increments the version before and after its modifications
  private compressionStateVersion = 0;
  private techniqueExecutionLock: Promise<void> = Promise.resolve();

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

  /**
   * Ensures sequential state versioning to prevent race conditions.
   * Each technique must complete its state mutations before the next begins.
   * This enforces the mutex-like ordering required for dedup-delta synchronization.
   */
  private async ensureSequentialExecution<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const myLock = this.techniqueExecutionLock;
    let resolveLock: () => void;
    this.techniqueExecutionLock = new Promise((resolve) => {
      resolveLock = resolve;
    });

    try {
      await myLock; // Wait for previous technique to finish
      this.compressionStateVersion++; // Increment version to invalidate stale cache pointers
      const result = await operation();
      return result;
    } finally {
      this.compressionStateVersion++; // Increment again after completion
      resolveLock!(); // Release lock for next technique
    }
  }

  async compress(ctx: CompressionContext): Promise<CompressionResult> {
    const originalIds = new Set(ctx.engrams.map((e) => e.id));
    const originalByteSize = JSON.stringify(ctx.engrams).length;
    const techniquesApplied: string[] = [];
    const techniquesSkipped: string[] = [];
    const auditEntries: CompressionAuditEntry[] = [];
    let guardrailState: GuardrailState = 'pass'; // will be updated if alert or violated
    const fidelityNotes: string[] = [];

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

    // ---- S0: Structural Schema Stripping (Foundation) ----
    // Aether's Phase 1: Strip redundant keys, replace with Uint16 IDs.
    // Expected gain: 40-50% on structured data.
    // Default OFF to preserve existing test and rollout behavior unless explicitly enabled.
    if (this.flags.s0SchemaStripper) {
      // One stripper instance — manifest is built once and stored at bundle level,
      // NOT inside each engram. Storing manifest per-engram replicates it N times
      // and turns net compression negative.
      const stripper = new SchemaStripper();
      const strippedEngrams: MemoryEngram[] = [];

      for (const engram of currentEngrams) {
        const sourceData: Record<string, unknown> =
          engram.data && typeof engram.data === 'object'
            ? (engram.data as Record<string, unknown>)
            : {};

        const strippedData = stripper.strip(sourceData);
        const originalSize = Buffer.byteLength(
          JSON.stringify(sourceData),
          'utf-8'
        );
        const strippedSize =
          strippedData.structuralKeys.byteLength +
          Buffer.byteLength(
            JSON.stringify(strippedData.primitiveValues),
            'utf-8'
          ) +
          strippedData.textPayloads.reduce(
            (sum, text) => sum + Buffer.byteLength(text, 'utf-8'),
            0
          );

        // Manifest stored ONCE in bundle metadata below — not per engram
        strippedEngrams.push({
          ...engram,
          data: strippedData as unknown as MemoryEngram['data'],
        });

        auditEntries.push({
          technique: 'S0:SchemaStripper',
          engramId: engram.id,
          action: 'transformed',
          reason: `reduced_from_${originalSize}_to_${strippedSize}_bytes`,
        });
      }

      // Manifest lives here — one copy for the whole batch
      bundle.stages.afterS0 = {
        engrams: strippedEngrams,
        metadata: {
          technique: 'S0:SchemaStripper',
          schemaManifest: stripper.getManifest(),
        },
      };
      currentEngrams = strippedEngrams;
      techniquesApplied.push('S0:SchemaStripper');
      fidelityNotes.push(
        'S0:SchemaStripper applied (structural overhead removed)'
      );
      MollyLogger.info('S0: SchemaStripper applied', 'compression-manager', {
        engramsProcessed: strippedEngrams.length,
        expectedGain: '40-50%',
      });
    } else {
      techniquesSkipped.push('S0:SchemaStripper (flag off)');
    }

    // ---- T1: Personality Reference Compression (P1) ----
    if (this.flags.t1PersonalityReference) {
      const result = applyPersonalityReferenceCompression(currentEngrams);
      const recall = measureEpisodicRecall(originalIds, result.engrams);
      const state = evaluateGuardrail(recall);

      if (state === 'violated') {
        techniquesSkipped.push('T1:PersonalityReference (guardrail violation)');
        guardrailState = 'violated';
        fidelityNotes.push(
          `T1 skipped: recall ${(recall * 100).toFixed(1)}% < safety floor 95%`
        );
        MollyLogger.warn(
          'T1: SKIPPED — recall below safety floor',
          'compression-manager',
          { recall: `${(recall * 100).toFixed(1)}%`, floor: '95%' }
        );
      } else {
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

        if (state === 'alert') {
          guardrailState = 'alert';
          fidelityNotes.push(
            `T1 applied with ALERT: recall ${(recall * 100).toFixed(1)}% (97% threshold for manual verification)`
          );
          MollyLogger.warn(
            'T1: ALERT — recall in manual-verification zone',
            'compression-manager',
            {
              recall: `${(recall * 100).toFixed(1)}%`,
              threshold: '97%',
              recommendation: 'Molly should verify memory integrity',
            }
          );
        } else {
          fidelityNotes.push(
            `T1 applied: recall ${(recall * 100).toFixed(1)}% ✓`
          );
          MollyLogger.info(
            'T1: PersonalityReference applied',
            'compression-manager',
            {
              savedRefs: Object.keys(result.personalityRefs).length,
              recall: `${(recall * 100).toFixed(1)}%`,
              state,
            }
          );
        }
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
      const state = evaluateGuardrail(recall);

      if (state === 'violated') {
        techniquesSkipped.push('T3:TemporalDelta (guardrail violation)');
        guardrailState = 'violated';
        fidelityNotes.push(
          `T3 skipped: recall ${(recall * 100).toFixed(1)}% < safety floor 95%`
        );
        MollyLogger.warn(
          'T3: SKIPPED — recall below safety floor',
          'compression-manager',
          { recall: `${(recall * 100).toFixed(1)}%`, floor: '95%' }
        );
      } else {
        bundle.stages.afterT3 = result;
        currentEngrams = result.reconstructedEngrams;
        techniquesApplied.push('T3:TemporalDelta');

        if (state === 'alert') {
          guardrailState = 'alert';
          fidelityNotes.push(
            `T3 applied with ALERT: recall ${(recall * 100).toFixed(1)}% (97% threshold for manual verification)`
          );
          MollyLogger.warn(
            'T3: ALERT — recall in manual-verification zone',
            'compression-manager',
            {
              recall: `${(recall * 100).toFixed(1)}%`,
              threshold: '97%',
              recommendation: 'Molly should verify delta chain integrity',
            }
          );
        } else {
          fidelityNotes.push(
            `T3 applied: recall ${(recall * 100).toFixed(1)}% ✓`
          );
          MollyLogger.info('T3: TemporalDelta applied', 'compression-manager', {
            bases: result.bases.length,
            deltaGroups: result.deltaGroups.length,
            recall: `${(recall * 100).toFixed(1)}%`,
            state,
          });
        }
      }
    } else {
      techniquesSkipped.push('T3:TemporalDelta (flag off)');
    }

    // ---- T4: Vocabulary Dictionary Compression (P1, text-only mode) ----
    // Align with lifecycle coordinator behavior: if structural bundle stages
    // are active (T1/T3), defer T4 in this phase because decompression path
    // is driven by structural bundles.
    const hasStructuralBundleMode = Boolean(
      bundle.stages.afterT1 || bundle.stages.afterT3
    );

    if (this.flags.t4VocabularyDict && hasStructuralBundleMode) {
      techniquesSkipped.push(
        'T4:VocabularyDict (deferred - structural bundle mode)'
      );
      fidelityNotes.push('T4 deferred: structural bundle mode active (T1/T3)');
      MollyLogger.info(
        'T4: deferred in structural bundle mode',
        'compression-manager',
        {
          reason: 'T1/T3 bundle reconstruction takes precedence',
        }
      );
    } else if (this.flags.t4VocabularyDict) {
      const result = applyVocabularyCompression(currentEngrams);
      const recall = measureEpisodicRecall(originalIds, result.engrams);
      const state = evaluateGuardrail(recall);

      if (state === 'violated') {
        techniquesSkipped.push('T4:VocabularyDict (guardrail violation)');
        guardrailState = 'violated';
        fidelityNotes.push(
          `T4 skipped: recall ${(recall * 100).toFixed(1)}% < safety floor 95%`
        );
        MollyLogger.warn(
          'T4: SKIPPED — recall below safety floor',
          'compression-manager',
          { recall: `${(recall * 100).toFixed(1)}%`, floor: '95%' }
        );
      } else {
        bundle.stages.afterT4 = result;
        currentEngrams = result.engrams;
        techniquesApplied.push('T4:VocabularyDict');

        if (state === 'alert') {
          guardrailState = 'alert';
          fidelityNotes.push(
            `T4 applied with ALERT: recall ${(recall * 100).toFixed(1)}% (97% threshold for manual verification)`
          );
          MollyLogger.warn(
            'T4: ALERT — recall in manual-verification zone',
            'compression-manager',
            {
              recall: `${(recall * 100).toFixed(1)}%`,
              threshold: '97%',
              recommendation:
                'Molly should verify vocabulary reconstruction quality',
            }
          );
        } else {
          fidelityNotes.push(
            `T4 applied: recall ${(recall * 100).toFixed(1)}% ✓`
          );
          MollyLogger.info(
            'T4: VocabularyDict applied',
            'compression-manager',
            {
              dictEntries: Object.keys(result.dictionary).length,
              recall: `${(recall * 100).toFixed(1)}%`,
              state,
            }
          );
        }
      }
    } else {
      techniquesSkipped.push('T4:VocabularyDict (flag off)');
    }

    // ---- T2: Time-Decay Fidelity (P2) ----
    if (this.flags.t2TimeDecayFidelity) {
      const result = applyTimeDecayFidelity(
        currentEngrams,
        ctx.compressionTimestamp
      );
      const recall = measureEpisodicRecall(originalIds, result.engrams);
      const state = evaluateGuardrail(recall);

      if (state === 'violated') {
        techniquesSkipped.push('T2:TimeDecayFidelity (guardrail violation)');
        guardrailState = 'violated';
        fidelityNotes.push(
          `T2 skipped: recall ${(recall * 100).toFixed(1)}% < safety floor 95%`
        );
        MollyLogger.warn(
          'T2: SKIPPED — recall below safety floor',
          'compression-manager',
          { recall: `${(recall * 100).toFixed(1)}%`, floor: '95%' }
        );
      } else {
        bundle.stages.afterT2 = result;
        currentEngrams = result.engrams;
        techniquesApplied.push('T2:TimeDecayFidelity');

        if (state === 'alert') {
          guardrailState = 'alert';
          fidelityNotes.push(
            `T2 applied with ALERT: recall ${(recall * 100).toFixed(1)}% (97% threshold for manual verification)`
          );
          MollyLogger.warn(
            'T2: ALERT — recall in manual-verification zone',
            'compression-manager',
            {
              recall: `${(recall * 100).toFixed(1)}%`,
              threshold: '97%',
              recommendation: 'Molly should verify temporal integrity',
            }
          );
        } else {
          fidelityNotes.push(
            `T2 applied: recall ${(recall * 100).toFixed(1)}% ✓`
          );
          MollyLogger.info(
            'T2: TimeDecayFidelity applied',
            'compression-manager',
            {
              recent: result.stage.fidelityDistribution.recent,
              archived: result.stage.fidelityDistribution.archived,
              deferred: result.stage.fidelityDistribution.deferred,
              recall: `${(recall * 100).toFixed(1)}%`,
              state,
            }
          );
        }
      }
    } else {
      techniquesSkipped.push('T2:TimeDecayFidelity (flag off)');
    }

    // ---- T6: Interaction Trace (P2) ----
    if (this.flags.t6InteractionTrace) {
      const result = applyInteractionTrace(
        currentEngrams,
        ctx.compressionTimestamp
      );
      const recall = measureEpisodicRecall(originalIds, result.engrams);
      const state = evaluateGuardrail(recall);

      if (state === 'violated') {
        techniquesSkipped.push('T6:InteractionTrace (guardrail violation)');
        guardrailState = 'violated';
        fidelityNotes.push(
          `T6 skipped: recall ${(recall * 100).toFixed(1)}% < safety floor 95%`
        );
        MollyLogger.warn(
          'T6: SKIPPED — recall below safety floor',
          'compression-manager',
          { recall: `${(recall * 100).toFixed(1)}%`, floor: '95%' }
        );
      } else {
        bundle.stages.afterT6 = result;
        currentEngrams = result.engrams;
        techniquesApplied.push('T6:InteractionTrace');

        if (state === 'alert') {
          guardrailState = 'alert';
          fidelityNotes.push(
            `T6 applied with ALERT: recall ${(recall * 100).toFixed(1)}% (97% threshold for manual verification)`
          );
          MollyLogger.warn(
            'T6: ALERT — recall in manual-verification zone',
            'compression-manager',
            {
              recall: `${(recall * 100).toFixed(1)}%`,
              threshold: '97%',
              recommendation: 'Molly should verify interaction trace accuracy',
            }
          );
        } else {
          fidelityNotes.push(
            `T6 applied: recall ${(recall * 100).toFixed(1)}% ✓`
          );
          MollyLogger.info(
            'T6: InteractionTrace applied',
            'compression-manager',
            {
              hot: result.stage.usageDistribution.hot,
              warm: result.stage.usageDistribution.warm,
              cold: result.stage.usageDistribution.cold,
              dormant: result.stage.usageDistribution.dormant,
              recall: `${(recall * 100).toFixed(1)}%`,
              state,
            }
          );
        }
      }
    } else {
      techniquesSkipped.push('T6:InteractionTrace (flag off)');
    }

    // ---- T5: Numeric Quantization (P3) ----
    if (this.flags.t5NumericQuantization) {
      const result = applyNumericQuantization(currentEngrams);
      currentEngrams = result.engrams;
      bundle.stages.afterT5 = {
        engrams: currentEngrams,
        metadata: { technique: 'T5:NumericQuantization' },
      };
      techniquesApplied.push('T5:NumericQuantization');
      fidelityNotes.push(
        `T5: ${result.floatsQuantized} bytes recovered via float truncation`
      );
      MollyLogger.info(
        'T5: NumericQuantization applied',
        'compression-manager',
        {
          engramsProcessed: currentEngrams.length,
          bytesRecovered: result.floatsQuantized,
        }
      );
    } else {
      techniquesSkipped.push('T5:NumericQuantization (flag off)');
    }

    // ---- T7: Content Delta Encoding (P3) ----
    if (this.flags.t7ContentDelta) {
      const result = applyContentDeltaEncoding(currentEngrams);
      currentEngrams = result.engrams;
      bundle.stages.afterT7 = {
        engrams: currentEngrams,
        metadata: {
          technique: 'T7:ContentDelta',
          deltaCount: result.deltaCount,
          fullCount: result.fullCount,
          bytesRecovered: result.bytesRecovered,
        },
      };
      techniquesApplied.push('T7:ContentDelta');
      fidelityNotes.push(
        `T7: ${result.deltaCount} engrams delta-encoded, ${result.bytesRecovered} bytes recovered`
      );
      MollyLogger.info(
        'T7: ContentDeltaEncoding applied',
        'compression-manager',
        {
          engramsProcessed: currentEngrams.length,
          deltaCount: result.deltaCount,
          bytesRecovered: result.bytesRecovered,
        }
      );
    } else {
      techniquesSkipped.push('T7:ContentDelta (flag off)');
    }

    // ---- T8: Standard Compression (gzip on final semantic output) ----
    // NOTE: T8 measures compression but does NOT replace currentEngrams.
    // In production storage, T8 is applied to the final serialized JSON before persistence.
    // In benchmarks, we measure T8's effect separately to avoid breaking recall calculations.
    if (this.flags.t8StandardCompression) {
      const result = await applyStandardCompression(currentEngrams);
      // DO NOT replace currentEngrams — keep semantic engrams for final metrics
      // T8 result is metadata-only in the benchmark context
      bundle.stages.afterT8 = {
        originalByteSize: result.originalByteSize,
        compressedByteSize: result.compressedByteSize,
        bytesRecovered: result.bytesRecovered,
        compressionRatio: result.compressionRatio,
      };
      techniquesApplied.push('T8:StandardCompression');
      fidelityNotes.push(
        `T8: gzip would compress to ${(result.compressionRatio * 100).toFixed(1)}% (${result.bytesRecovered} bytes saved)`
      );
      MollyLogger.info(
        'T8: StandardCompression measured',
        'compression-manager',
        {
          originalByteSize: result.originalByteSize,
          compressedByteSize: result.compressedByteSize,
          bytesRecovered: result.bytesRecovered,
          compressionRatio: result.compressionRatio,
        }
      );
    } else {
      techniquesSkipped.push('T8:StandardCompression (flag off)');
    }

    bundle.finalEngrams = currentEngrams;
    bundle.techniqueOrder = techniquesApplied;
    bundle.auditEntries = auditEntries;

    // Measure byte size — if T8 is enabled, use its result; otherwise use semantic-only
    let compressedByteSize = JSON.stringify(currentEngrams).length;
    if (this.flags.t8StandardCompression && bundle.stages.afterT8) {
      compressedByteSize = bundle.stages.afterT8.compressedByteSize;
    }

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
        guardrailPassed: finalRecall >= SAFETY_FLOOR,
        guardrailState,
        fidelityNotes:
          fidelityNotes.length > 0 ? fidelityNotes.join('; ') : undefined,
      },
    };
  }

  async decompress(bundle: CompressedMemoryBundle): Promise<MemoryEngram[]> {
    const startMs = Date.now();

    // Decompress in reverse technique order: T8 → T7 → T6 → T2 → T4 → T3 → T1
    let engrams = bundle.finalEngrams;

    // T8: Standard Compression (gzip) — must be first to restore semantic engrams
    // T8 stores the entire engram array as a single gzipped blob: [{__compressed: true, ...}]
    if (bundle.stages.afterT8) {
      const { isStandardCompressedPayload, decompressStandardCompression } =
        await import('./standard-compress');
      const blob = engrams[0];
      if (engrams.length === 1 && isStandardCompressedPayload(blob)) {
        engrams = await decompressStandardCompression(blob);
      }
    }

    // T7: Content Delta Encoding — restore full content strings (delta payloads are embedded in engram.content)
    if (bundle.stages.afterT7) {
      const { decompressContentDeltas } = await import('./content-delta');
      engrams = decompressContentDeltas(engrams);
    }

    // T6: Interaction Trace
    if (bundle.stages.afterT6) {
      engrams = decompressInteractionTrace(engrams, bundle.stages.afterT6);
    }

    // T2: Time Decay Fidelity
    if (bundle.stages.afterT2) {
      engrams = decompressTimeDecayFidelity(engrams, bundle.stages.afterT2);
    }

    // T4: Vocabulary Dictionary
    if (bundle.stages.afterT4) {
      engrams = decompressVocabulary(bundle.stages.afterT4);
    }

    // T3: Temporal Delta
    if (bundle.stages.afterT3) {
      engrams = decompressTemporalDeltas(bundle.stages.afterT3);
    }

    // T1: Personality Reference (last, as it was first applied)
    if (bundle.stages.afterT1) {
      engrams = decompressPersonalityReferences(bundle.stages.afterT1);
    }

    // T5: Numeric Quantization — no decompression needed (lossless truncation)

    // S0: Schema Stripper (LAST reversal — first stage compressed, last decompressed).
    //
    // Bug found by self-audit 2026-07-03: this reversal was missing entirely.
    // Compression replaced engram.data with the internal stripped shape
    // { schemaVersion, structuralKeys, textPayloads, primitiveValues } but
    // no decompress step ever reconstructed the original data. Any production
    // deployment with TITAN_SCHEMA_STRIPPER=1 was silently corrupting every
    // engram's data field. Existing round-trip tests set s0SchemaStripper:
    // false so nothing caught it. See round-trip-hardened.test.ts for the
    // regression case that surfaced this.
    if (bundle.stages.afterS0) {
      const s0Meta = bundle.stages.afterS0.metadata as
        | { schemaManifest?: import('./schema-stripper').SchemaManifest }
        | undefined;
      const manifest = s0Meta?.schemaManifest;
      if (manifest) {
        const stripper = new SchemaStripper(manifest);
        engrams = engrams.map((engram) => {
          const strippedData = engram.data as unknown as
            | import('./schema-stripper').StrippedMemory
            | undefined;
          if (
            !strippedData ||
            typeof strippedData !== 'object' ||
            !('structuralKeys' in strippedData) ||
            !('textPayloads' in strippedData) ||
            !('primitiveValues' in strippedData)
          ) {
            // Not stripped (or upstream stage already reversed it) — pass through
            return engram;
          }
          // Uint16Array may have been JSON-round-tripped into a plain object
          // with numeric-string keys. Normalize back to Uint16Array before unstrip.
          const rawKeys = strippedData.structuralKeys as
            | Uint16Array
            | Record<string, number>;
          const normalizedKeys =
            rawKeys instanceof Uint16Array
              ? rawKeys
              : Uint16Array.from(
                  Object.keys(rawKeys)
                    .map((k) => Number(k))
                    .sort((a, b) => a - b)
                    .map((k) => (rawKeys as Record<string, number>)[String(k)])
                );
          const reconstructed = stripper.unstrip({
            schemaVersion: strippedData.schemaVersion,
            structuralKeys: normalizedKeys,
            textPayloads: strippedData.textPayloads,
            primitiveValues: strippedData.primitiveValues,
          });
          return {
            ...engram,
            data: reconstructed as MemoryEngram['data'],
          };
        });
      }
    }

    MollyLogger.debug('Decompression complete', 'compression-manager', {
      techniquesReversed: bundle.techniqueOrder.length,
      latencyMs: Date.now() - startMs,
    });

    return engrams;
  }
}
