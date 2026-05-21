/**
 * Memory Compression System Index
 * Exports all compression techniques and supporting infrastructure.
 */

export { VocabDictCompressor, buildDictionaryFromCorpus } from './vocab-dict';
export type { DictionaryManifest } from './vocab-dict';

export { RollbackCheckpointManager } from '../recovery/checkpoint';
export type { CheckpointMetadata } from '../recovery/checkpoint';

export { PruneComplianceLogger } from '../audit/prune-logger';
export type { AuditLogEntry, PruneReasonCode } from '../audit/prune-logger';

export { AblationTestEngine } from '../benchmarks/ablation';
export type { AblationReport, AblationSuite } from '../benchmarks/ablation';
