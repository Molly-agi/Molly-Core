/**
 * Memory Lifecycle Coordinator — Orchestration Layer
 * Wires all compression techniques + safety infrastructure into the memory consolidation pipeline.
 * 
 * Flow: Memory → Compress → Checkpoint → Log → Firestore
 */

import type { Firestore } from 'firebase/firestore';
import type { MemoryEngram, PersonalityModulation } from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';
import { VocabDictCompressor, buildDictionaryFromCorpus } from './compression/vocab-dict';
import { RollbackCheckpointManager } from './recovery/checkpoint';
import { PruneComplianceLogger, type PruneReasonCode } from './audit/prune-logger';
import { AblationTestEngine } from './benchmarks/ablation';

export interface CompressionPipeline {
  enableVocabDict?: boolean;
  enableTimedecay?: boolean;
  enablePersonalityRef?: boolean;
  enableTemporalDelta?: boolean;
  enableNumericQuant?: boolean;
  enableInteractionTrace?: boolean;
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
  ): Promise<{
    compressed: Buffer;
    metrics: CompressionMetrics;
    checkpointId: string;
  }> {
    const startTime = performance.now();

    // Build corpus from engrams for compression
    const corpus = engrams.map((e) => e.content).join(' ');
    const originalSize = Buffer.byteLength(corpus, 'utf8');

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

    // Apply compression techniques
    let compressed = Buffer.from(corpus);
    const techniquesUsed: string[] = [];

    // Technique 4: Vocabulary Dictionary
    if (this.pipeline.enableVocabDict && this.vocabCompressor) {
      compressed = this.vocabCompressor.compressString(corpus);
      techniquesUsed.push('VOCAB_DICT');
    }

    // TODO: Wire in other techniques
    // - Technique 1: PersonalityRefEngine
    // - Technique 2: TimeDecayCompressor
    // - Technique 3: TemporalDeltaEncoder
    // - Technique 5: NumericQuantizer
    // - Technique 6: InteractionTraceCompressor

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
    };
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
let _coordinators = new Map<string, MemoryLifecycleCoordinator>();

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
