/**
 * Memory Compression System Index
 * Exports all compression techniques and supporting infrastructure.
 *
 * Technique build order (Option C):
 *   S0: Schema Stripper (structural overhead removal, 40-50% gain)
 *   P1: T1 (personality-reference) → T3 (temporal-delta) → T4 (vocabulary-dict)
 *   P2: T2 (time-decay) → T6 (interaction-trace)
 *   P3: T5 (numeric-quantization)                        — not yet built
 *
 * Primary entry point for the pipeline: CompressionManager (feature-flag driven)
 * Full lifecycle entry point:          MemoryLifecycleCoordinator (Firestore-backed)
 */

// ── S0: Structural Schema Stripping ────────────────────────────────────────
export {
  SchemaStripper,
} from './schema-stripper';
export type {
  SchemaManifest,
  StrippedMemory,
} from './schema-stripper';

// ── T1: Personality Reference Compression ─────────────────────────────────
export {
  applyPersonalityReferenceCompression,
  decompressPersonalityReferences,
  measurePersonalityCompressionGain,
} from './personality-reference';
export type {
  EngramWithRef,
  PersonalityReferenceBundle,
} from './personality-reference';

// ── T3: Temporal Delta Encoding ────────────────────────────────────────────
export {
  applyTemporalDeltaEncoding,
  decompressTemporalDeltas,
  measureTemporalDeltaGain,
} from './temporal-delta';
export type {
  TemporalBase,
  TemporalDelta,
  TemporalDeltaBundle,
} from './temporal-delta';

// ── T4a: Vocabulary Dictionary — pipeline version (string substitution) ───
// Used by CompressionManager in the Option C pipeline.
export {
  applyVocabularyCompression,
  decompressVocabulary,
  measureVocabularyCompressionGain,
} from './vocabulary-dict';
export type { VocabularyDictionary, VocabularyBundle } from './vocabulary-dict';

// ── T4b: Vocabulary Dictionary — binary version (Uint16 buffer) ───────────
// Used by MemoryLifecycleCoordinator for cold-storage archival.
export { VocabDictCompressor, buildDictionaryFromCorpus } from './vocab-dict';
export type { DictionaryManifest } from './vocab-dict';

// ── T2: Time-Decay Fidelity (P2) ───────────────────────────────────────────
export {
  applyTimeDecayFidelity,
  decompressTimeDecayFidelity,
  measureTimeDecayGain,
  getTimeDecayDistributionSummary,
} from './time-decay-fidelity';
export type { TimeDecayStage } from './time-decay-fidelity';

// ── T6: Interaction Trace (P2) ─────────────────────────────────────────────
export {
  applyInteractionTrace,
  decompressInteractionTrace,
  measureInteractionTraceGain,
  getInteractionDistributionSummary,
} from './interaction-trace';
export type { InteractionTraceStage } from './interaction-trace';

// ── Orchestrators ──────────────────────────────────────────────────────────
// CompressionManager: feature-flag-driven, 95% recall guardrail, pure compression
export { CompressionManager } from './compression-manager';
export type {
  CompressionFeatureFlags,
  CompressionContext,
  CompressionMetrics,
  CompressedMemoryBundle,
  CompressionResult,
  CompressionAuditEntry,
} from './compression-manager';

// MemoryLifecycleCoordinator: full lifecycle (checkpoint, audit, Firestore)
export {
  MemoryLifecycleCoordinator,
  getMemoryLifecycleCoordinator,
  clearCoordinators,
} from './lifecycle-coordinator';
export type {
  CompressionPipeline,
  CompressionResult as LifecycleCompressionResult,
  CompressionMetrics as LifecycleCompressionMetrics,
} from './lifecycle-coordinator';

// ── Supporting Infrastructure ──────────────────────────────────────────────
export { RollbackCheckpointManager } from '../recovery/checkpoint';
export type { CheckpointMetadata } from '../recovery/checkpoint';

export { PruneComplianceLogger } from '../audit/prune-logger';
export type { AuditLogEntry, PruneReasonCode } from '../audit/prune-logger';

export { AblationTestEngine } from '../benchmarks/ablation';
export type { AblationReport, AblationSuite } from '../benchmarks/ablation';
