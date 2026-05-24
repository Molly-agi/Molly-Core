/**
 * Memory Lifecycle Coordinator — Orchestration Layer
 * Wires all compression techniques + safety infrastructure into the memory consolidation pipeline.
 *
 * Flow: Memory → Compress → Checkpoint → Log → Firestore
 */

import type { Firestore } from 'firebase/firestore';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';
import { VocabDictCompressor, buildDictionaryFromCorpus } from './vocab-dict';
import {
  applyPersonalityReferenceCompression,
  decompressPersonalityReferences,
  type PersonalityReferenceBundle,
} from './personality-reference';
import {
  applyTemporalDeltaEncoding,
  decompressTemporalDeltas,
  type TemporalDeltaBundle,
} from './temporal-delta';
import { RollbackCheckpointManager } from '../recovery/checkpoint';
import {
  PruneComplianceLogger,
  type PruneReasonCode,
} from '../audit/prune-logger';
import { AblationTestEngine } from '../benchmarks/ablation';

export interface CompressionPipeline {
  enableVocabDict?: boolean;
  enableTimedecay?: boolean;
  enablePersonalityRef?: boolean;
  enableTemporalDelta?: boolean;
  enableNumericQuant?: boolean;
  enableInteractionTrace?: boolean;
}

/**
 * Result of a full compression pipeline run — includes both the compressed
 * buffer for storage AND the structured bundles needed for decompression.
 */
export interface CompressionResult {
  compressed: Buffer;
  metrics: CompressionMetrics;
  checkpointId: string;
  // Structured bundles stored alongside the buffer for lossless decompression
  personalityBundle?: PersonalityReferenceBundle;
  temporalBundle?: TemporalDeltaBundle;
}

export interface CompressionMetrics {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  techniquesUsed: string[];
  timeMs: number;
  fidelityLoss: number;
}

/**
 * Orchestrates the complete memory lifecycle from hot storage through compression to cold storage.
 * Manages checkpoints, audit logging, and compression pipeline execution.
 */
export class MemoryLifecycleCoordinator {
  private db: Firestore;
  private userId: string;
  private vocabCompressor: VocabDictCompressor | null = null;
  private checkpointManager: RollbackCheckpointManager;
  private auditLogger: PruneComplianceLogger;
  private ablationEngine: AblationTestEngine;
  private pipeline: CompressionPipeline;

  constructor(
    db: Firestore,
    userId: string,
    pipeline: CompressionPipeline = {
      enableVocabDict: true,
      enableTemporalDelta: true,
      enablePersonalityRef: true,
    }
  ) {
    this.db = db;
    this.userId = userId;
    this.pipeline = pipeline;
    this.checkpointManager = new RollbackCheckpointManager(db);
    this.auditLogger = new PruneComplianceLogger(
      `logs/memory-audit-${userId}.jsonl`
    );
    this.ablationEngine = new AblationTestEngine();

    MollyLogger.info('Memory lifecycle coordinator initialized', 'lifecycle', {
      userId,
      pipelineConfig: pipeline,
    });
  }

  /**
   * Initialize vocabulary compressor from a corpus of text (Molly's conversation history).
   */
  public async initializeVocabularyScan(corpus: string): Promise<void> {
    try {
      const manifest = buildDictionaryFromCorpus(corpus, 50000);
      this.vocabCompressor = new VocabDictCompressor(manifest);

      MollyLogger.info('Vocabulary compressor initialized', 'lifecycle', {
        dictionarySize: manifest.tokens.length,
        version: manifest.version,
      });
    } catch (error) {
      MollyLogger.error(
        'Failed to initialize vocabulary compressor',
        'lifecycle',
        { error }
      );
    }
  }

  /**
   * Execute full compression pipeline on a batch of memories.
   * Returns compressed data + metrics.
   */
  public async compressMemoryBatch(
    engrams: MemoryEngram[]
  ): Promise<CompressionResult> {
    const startTime = performance.now();

    // Measure original size from raw text corpus
    const originalCorpus = engrams.map((e) => e.content).join(' ');
    const originalSize = Buffer.byteLength(originalCorpus, 'utf8');

    // Create checkpoint BEFORE compression
    let checkpointId = '';
    try {
      checkpointId = await this.checkpointManager.createCheckpoint(
        this.userId,
        `users/${this.userId}/memory-batch`,
        {
          engrams: engrams.map((e) => ({
            id: e.id,
            content: e.content,
            timestamp: e.timestamp.toISOString(),
            importance: e.importance,
          })),
          timestamp: new Date().toISOString(),
        }
      );
    } catch (err) {
      MollyLogger.warn('Failed to create compression checkpoint', 'lifecycle', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Apply compression techniques in P1 priority order
    let workingEngrams = [...engrams];
    const techniquesUsed: string[] = [];
    let personalityBundle: PersonalityReferenceBundle | undefined;
    let temporalBundle: TemporalDeltaBundle | undefined;

    // ── T1: Personality Reference Compression ──
    // Deduplicates personality snapshots into a reference table.
    // Expected gain: 8-10% on datasets with personalityContext populated.
    if (this.pipeline.enablePersonalityRef) {
      personalityBundle = applyPersonalityReferenceCompression(workingEngrams);
      // For the pipeline, continue with original engrams (T1 operates on structure)
      techniquesUsed.push('T1_PERSONALITY_REF');
      MollyLogger.debug(
        'T1 personality reference compression applied',
        'lifecycle',
        {
          refCount: Object.keys(personalityBundle.personalityRefs).length,
          engramCount: personalityBundle.engrams.length,
        }
      );
    }

    // ── T3: Temporal Delta Encoding ──
    // Stores deltas between consecutive engrams instead of full copies.
    // Expected gain: 3-5% on numeric fields; enables T2 (time-decay) later.
    if (this.pipeline.enableTemporalDelta) {
      temporalBundle = applyTemporalDeltaEncoding(workingEngrams);
      // Use reconstructed engrams to maintain pipeline correctness
      workingEngrams = temporalBundle.reconstructedEngrams;
      techniquesUsed.push('T3_TEMPORAL_DELTA');
      MollyLogger.debug('T3 temporal delta encoding applied', 'lifecycle', {
        baseCount: temporalBundle.bases.length,
        deltaGroupCount: temporalBundle.deltaGroups.length,
        passthroughCount: temporalBundle.passthrough.length,
      });
    }

    // ── T4: Vocabulary Dictionary Compression ──
    // Replaces common words with 2-byte tokens.
    // Expected gain: 50-60% on text content.
    const textCorpus = workingEngrams.map((e) => e.content).join(' ');
    let compressed = Buffer.from(textCorpus);

    if (this.pipeline.enableVocabDict && this.vocabCompressor) {
      compressed = this.vocabCompressor.compressString(textCorpus);
      techniquesUsed.push('T4_VOCAB_DICT');
    }

    // T2 (Time-Decay), T5 (Numeric Quantization), T6 (Interaction Trace)
    // are staged for P2/P3 — implemented after P1 recall validation passes.

    const compressedSize = compressed.byteLength;
    const compressionRatio = (
      ((originalSize - compressedSize) / originalSize) *
      100
    ).toFixed(2);

    const duration = performance.now() - startTime;

    const metrics: CompressionMetrics = {
      originalSize,
      compressedSize,
      compressionRatio: parseFloat(String(compressionRatio)),
      techniquesUsed,
      timeMs: parseFloat(duration.toFixed(2)),
      fidelityLoss: 0, // Will accumulate from technique-specific losses
    };

    MollyLogger.info('Memory batch compressed', 'lifecycle', {
      originalSize,
      compressedSize,
      ratio: `${compressionRatio}%`,
      techniques: techniquesUsed.join(','),
      timeMs: metrics.timeMs,
    });

    return {
      compressed,
      metrics,
      checkpointId,
      personalityBundle,
      temporalBundle,
    };
  }

  /**
   * Decompress a previously compressed memory batch back to MemoryEngram[].
   * Pass the CompressionResult from compressMemoryBatch.
   */
  public decompressMemoryBatch(result: CompressionResult): MemoryEngram[] {
    // Start with whatever was in the temporal bundle (most complete form)
    let engrams: MemoryEngram[] = [];

    if (result.temporalBundle) {
      engrams = decompressTemporalDeltas(result.temporalBundle);
    }

    // Restore personality contexts from reference table
    if (result.personalityBundle && engrams.length > 0) {
      // Rebuild bundle with current engrams + original refs
      const rebuildBundle: PersonalityReferenceBundle = {
        ...result.personalityBundle,
        engrams: engrams as PersonalityReferenceBundle['engrams'],
      };
      engrams = decompressPersonalityReferences(rebuildBundle);
    }

    return engrams;
  }

  /**
   * Log a memory eviction action (for compliance audit trail).
   */
  public async logEviction(
    engram: MemoryEngram,
    reason: PruneReasonCode,
    bytesSaved: number
  ): Promise<void> {
    await this.auditLogger.logAction({
      userId: this.userId,
      engramId: engram.id,
      actionTaken: 'ARCHIVED',
      reasonCode: reason,
      impactMetrics: {
        bytesSaved,
        retainedSimilarityScore: engram.importance,
      },
    });
  }

  /**
   * Log a consolidation cycle (engrams moved to cold storage).
   */
  public async logConsolidation(
    count: number,
    totalBytesSaved: number
  ): Promise<void> {
    await this.auditLogger.logAction({
      userId: this.userId,
      engramId: 'consolidation-batch',
      actionTaken: 'CONSOLIDATED',
      reasonCode: 'CAPACITY_CONSTRAINT',
      impactMetrics: {
        bytesSaved: totalBytesSaved,
      },
    });
  }

  /**
   * Run ablation test to measure compression technique effectiveness.
   */
  public async runAblationTest(testCorpus: string) {
    const suite = await this.ablationEngine.executeAblationRun(
      testCorpus,
      this.pipeline.enableVocabDict ? ['VOCAB_DICT'] : []
    );

    MollyLogger.info(
      'Ablation test complete',
      'lifecycle',
      this.ablationEngine.analyzeReport(suite)
    );

    return suite;
  }

  /**
   * Get compliance audit report.
   */
  public async getAuditReport() {
    return this.auditLogger.generateComplianceReport();
  }

  /**
   * Emergency restore from checkpoint.
   */
  public async emergencyRestore(checkpointId: string): Promise<void> {
    await this.checkpointManager.emergencyRollback(
      checkpointId,
      `users/${this.userId}/memory-batch`
    );
  }
}

/**
 * Singleton instance per user.
 */
const _coordinators = new Map<string, MemoryLifecycleCoordinator>();

export function getMemoryLifecycleCoordinator(
  db: Firestore,
  userId: string,
  pipeline?: CompressionPipeline
): MemoryLifecycleCoordinator {
  if (!_coordinators.has(userId)) {
    _coordinators.set(
      userId,
      new MemoryLifecycleCoordinator(db, userId, pipeline)
    );
  }
  return _coordinators.get(userId)!;
}

export function clearCoordinators(): void {
  _coordinators.clear();
}
