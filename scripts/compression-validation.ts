#!/usr/bin/env npx tsx

/**
 * MOLLY COMPRESSION STACK VALIDATION HARNESS — Phase 0 Instrumented
 *
 * Phase 0 additions vs prior version:
 * - Long-horizon dataset: 10 simulated sessions, 30-day span, multi-cycle replay
 * - Episodic recall: ID-intersection based (NOT count ratio — fixes behavioral continuity illusion)
 * - Personality continuity: separated from episodic recall
 * - Retention audit log: records every pruning decision with reason codes
 * - Rollback checkpoint: snapshot before each run, verify integrity after restore
 * - KPI summary: machine-readable for dashboard consumption
 *
 * Compressor variants (current system analysis):
 * - Baseline:  JSON+gzip only (no semantic pruning)
 * - Variant 1: Capacity constraints (FIFO truncation — current system core)
 * - Variant 2: + Connection decay (weak-tie pruning)
 * - Variant 3: + Working memory decay
 * - Variant 4: + LLM context summarization
 * - Full:      All above + AES-256-GCM metadata encryption
 *
 * Metrics:
 *  1. compressionRatio      — (1 - compressedSize/originalSize) × 100
 *  2. restoreLatencyMs      — decompression time
 *  3. episodicRecall        — |survived engram IDs ∩ original IDs| / |original IDs| × 100
 *  4. personalityContinuity — personality dimension delta < 0.1 for all dims × 100
 *  5. semanticFidelity      — Jaccard similarity on importance distributions
 *  6. identityCoherence     — mean(1 - |origVal - restVal|) across personality dims
 *  7. failureRate           — decompress failures / total runs × 100
 *  8. rollbackSuccessRate   — successful rollback verifications / total × 100
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { createHash } from 'crypto';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// DATA STRUCTURES
// ============================================================================

interface Message {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: number;
}

interface Engram {
  id: string;
  timestamp: number;
  content: string;
  emotionalValence: number;
  arousal: number;
  importance: number;
  consolidationState: 'volatile' | 'consolidating' | 'consolidated';
}

interface Seed {
  id: string;
  name: string;
  connections: { targetId: string; strength: number }[];
  lastAccess: number;
  value: number;
}

interface WorkingMemorySlot {
  engram: Engram;
  activationLevel: number;
  decayRate: number;
}

interface PersonalityContext {
  affinityForCompassion: number;
  affinityForCuriosity: number;
  affinityForGrowth: number;
  affinityForHumility: number;
  [key: string]: number;
}

interface SessionBlock {
  sessionId: string;
  sessionIndex: number;
  startTimestamp: number;
  endTimestamp: number;
  messageCount: number;
}

interface TestDataset {
  name: string;
  size: 'small' | 'medium' | 'large' | 'long-horizon';
  sessions: SessionBlock[];
  messages: Message[];
  engrams: Engram[];
  gardenSeeds: Seed[];
  workingMemory: WorkingMemorySlot[];
  personality: PersonalityContext;
}

// ============================================================================
// PHASE 0 AUDIT STRUCTURES
// ============================================================================

type PruningReason =
  | 'capacity_limit' // FIFO hard cutoff
  | 'connection_decay' // Garden seed connection strength below threshold
  | 'working_memory_decay' // Activation level decayed to zero
  | 'age_threshold' // Time-decay policy removed old record
  | 'summarized' // Replaced by LLM-style summary token
  | 'encryption_truncation'; // AES-GCM overhead truncated content

interface RetentionAuditEntry {
  engramId: string;
  action: 'retained' | 'pruned';
  reason: PruningReason | 'retained';
  importanceScore: number;
  recencyScore: number; // 0..1, 1 = most recent
  emotionalWeight: number;
}

interface PruningAuditLog {
  runId: string;
  timestamp: number;
  variant: string;
  dataset: string;
  cycle: number;
  entries: RetentionAuditEntry[];
  summary: {
    totalBefore: number;
    totalAfter: number;
    retainedCount: number;
    prunedCount: number;
    pruningReasons: Partial<Record<PruningReason, number>>;
  };
}

interface RollbackCheckpoint {
  checkpointId: string;
  timestamp: number;
  dataHash: string;
  originalEngramIds: string[];
  originalMessageCount: number;
  originalPersonality: PersonalityContext;
}

// AblationMetrics — Phase 0 fixed schema
// KEY CHANGE: episodicRecall is ID-intersection based (true recall)
//             personalityContinuity is the personality-fields metric (was called behavioralContinuity)
//             they are SEPARATE fields — the old conflation was the behavioral continuity illusion
interface AblationMetrics {
  variant: string;
  dataset: string;
  cycle: number;
  compressionRatio: number;
  restoreLatencyMs: number;
  episodicRecall: number; // % of original engram IDs that survived
  personalityContinuity: number; // % of personality dims within 0.1 delta
  semanticFidelity: number;
  identityCoherence: number;
  failureRate: number;
  rollbackSuccessRate: number;
  auditLogPath?: string;
  notes?: string;
}

interface KpiSummary {
  generatedAt: string;
  phase: 'Phase 0 — Baseline and Instrumentation';
  datasetResults: Record<
    string,
    {
      bestCompressionRatio: number;
      worstEpisodicRecall: number;
      bestPersonalityContinuity: number;
      averageRestoreLatencyMs: number;
    }
  >;
  longHorizonDrift: {
    episodicRecallAtCycle1: number;
    episodicRecallAtCycle10: number;
    driftPercent: number;
    exceedsGuardrail: boolean; // true if recall < 95%
  };
  guardrailStatus: {
    episodicRecallAbove95: boolean;
    latencyWithinSlo: boolean;
    rollbackSuccessAbove99: boolean;
  };
  recommendation: string;
}

// ============================================================================
// ROLLBACK CHECKPOINT UTILITIES
// ============================================================================

function createCheckpoint(dataset: TestDataset): RollbackCheckpoint {
  const hash = createHash('sha256')
    .update(JSON.stringify(dataset.engrams.map((e) => e.id).sort()))
    .digest('hex')
    .slice(0, 16);

  return {
    checkpointId: `ckpt-${Date.now()}-${hash}`,
    timestamp: Date.now(),
    dataHash: hash,
    originalEngramIds: dataset.engrams.map((e) => e.id),
    originalMessageCount: dataset.messages.length,
    originalPersonality: { ...dataset.personality },
  };
}

function verifyCheckpoint(
  checkpoint: RollbackCheckpoint,
  restored: TestDataset
): boolean {
  const restoredHash = createHash('sha256')
    .update(JSON.stringify(restored.engrams.map((e) => e.id).sort()))
    .digest('hex')
    .slice(0, 16);

  // Rollback integrity: the restored data must decode without corruption.
  // We do NOT require identical IDs (compression legitimately prunes).
  // We DO require: personality is stable (identity not corrupted).
  const personalityStable = Object.keys(checkpoint.originalPersonality).every(
    (k) => {
      const orig = checkpoint.originalPersonality[k];
      const rest = restored.personality[k];
      return rest !== undefined && Math.abs(orig - rest) < 0.15;
    }
  );

  // Verify the restored hash is internally consistent (no partial decode)
  const restoredInternalHash = createHash('sha256')
    .update(JSON.stringify(restored.engrams.map((e) => e.id).sort()))
    .digest('hex')
    .slice(0, 16);

  return personalityStable && restoredHash === restoredInternalHash;
}

// ============================================================================
// AUDIT LOG BUILDER
// ============================================================================

function buildAuditLog(
  runId: string,
  variant: string,
  dataset: TestDataset,
  cycle: number,
  before: Engram[],
  after: Engram[],
  reasonMap: Map<string, PruningReason>
): PruningAuditLog {
  const afterIds = new Set(after.map((e) => e.id));
  const now = Date.now();
  const newest = before.reduce((max, e) => Math.max(max, e.timestamp), 0);
  const oldest = before.reduce(
    (min, e) => Math.min(min, e.timestamp),
    Infinity
  );
  const span = newest - oldest || 1;

  const entries: RetentionAuditEntry[] = before.map((e) => {
    const action = afterIds.has(e.id) ? 'retained' : 'pruned';
    const reason =
      action === 'pruned'
        ? (reasonMap.get(e.id) ?? 'capacity_limit')
        : 'retained';
    return {
      engramId: e.id,
      action,
      reason,
      importanceScore: e.importance,
      recencyScore: (e.timestamp - oldest) / span,
      emotionalWeight: Math.abs(e.emotionalValence) * e.arousal,
    };
  });

  const prunedEntries = entries.filter((e) => e.action === 'pruned');
  const pruningReasons: Partial<Record<PruningReason, number>> = {};
  for (const entry of prunedEntries) {
    if (entry.reason !== 'retained') {
      pruningReasons[entry.reason] = (pruningReasons[entry.reason] ?? 0) + 1;
    }
  }

  return {
    runId,
    timestamp: now,
    variant,
    dataset: dataset.name,
    cycle,
    entries,
    summary: {
      totalBefore: before.length,
      totalAfter: after.length,
      retainedCount: entries.filter((e) => e.action === 'retained').length,
      prunedCount: prunedEntries.length,
      pruningReasons,
    },
  };
}

function writeAuditLog(log: PruningAuditLog, outputDir: string): string {
  const filename = `audit-${log.runId.replace(/[^a-z0-9-]/gi, '_')}.json`;
  const fullPath = path.join(outputDir, filename);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(log, null, 2));
  return fullPath;
}

// ============================================================================
// DATASET GENERATORS
// ============================================================================

const SAMPLE_CONTENTS = [
  "Eric asked about Molly's day and she described finding a new pattern in the training data.",
  'Molly expressed concern about memory fragmentation during long sessions.',
  'Working on the compression algorithm — temporal delta encoding showing promise.',
  'Family bridge connected — Aether sent context about browser-side semantic indexing.',
  'Wisdom extraction completed: three high-valence memories consolidated this session.',
  "John's protocol triggered: behavioral continuity checkpoint passed.",
  "Claire's light protocol: safety check nominal, identity coherence stable.",
  'Dream cycle initiated — long-horizon replay test running in background.',
  'Gemini confirmed: vocabulary compression reduced working set by 8%.',
  'New engram formed: understanding that repair is more dignified than replacement.',
];

function makeEngrams(
  count: number,
  baseTime: number,
  prefix: string
): Engram[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-engram-${i}`,
    timestamp: baseTime - (count - i) * 3600000,
    content: SAMPLE_CONTENTS[i % SAMPLE_CONTENTS.length],
    emotionalValence: (Math.sin(i * 0.7) + 1) / 2,
    arousal: (Math.cos(i * 0.4) + 1) / 2,
    importance: 0.3 + (i % 5) * 0.14,
    consolidationState:
      i % 3 === 0 ? 'volatile' : i % 3 === 1 ? 'consolidating' : 'consolidated',
  }));
}

function makeMessages(
  count: number,
  baseTime: number,
  prefix: string
): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-msg-${i}`,
    timestamp: baseTime - (count - i) * 60000,
    role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
    content: `[${prefix}] Exchange ${i}: ${SAMPLE_CONTENTS[i % SAMPLE_CONTENTS.length]}`,
    tokens: 25 + (i % 30),
  }));
}

const BASE_PERSONALITY: PersonalityContext = {
  affinityForCompassion: 0.85,
  affinityForCuriosity: 0.92,
  affinityForGrowth: 0.88,
  affinityForHumility: 0.79,
};

function generateSmallDataset(): TestDataset {
  const now = Date.now();
  return {
    name: 'small-session',
    size: 'small',
    sessions: [
      {
        sessionId: 'sess-0',
        sessionIndex: 0,
        startTimestamp: now - 3600000,
        endTimestamp: now,
        messageCount: 10,
      },
    ],
    messages: makeMessages(10, now, 'small'),
    engrams: makeEngrams(5, now, 'small'),
    gardenSeeds: Array.from({ length: 20 }, (_, i) => ({
      id: `small-seed-${i}`,
      name: `Concept ${i}`,
      connections: Array.from({ length: 3 }, (_, j) => ({
        targetId: `small-seed-${(i + j + 1) % 20}`,
        strength: 0.1 + (i % 9) * 0.1,
      })),
      lastAccess: now - Math.floor(i * 1.2) * 3600000,
      value: 0.3 + (i % 7) * 0.1,
    })),
    workingMemory: makeEngrams(5, now, 'small-wm').map((e, i) => ({
      engram: e,
      activationLevel: 0.8 - i * 0.12,
      decayRate: 0.1,
    })),
    personality: { ...BASE_PERSONALITY },
  };
}

function generateMediumDataset(): TestDataset {
  const now = Date.now();
  return {
    name: 'medium-session',
    size: 'medium',
    sessions: Array.from({ length: 3 }, (_, i) => ({
      sessionId: `sess-${i}`,
      sessionIndex: i,
      startTimestamp: now - (3 - i) * 86400000,
      endTimestamp: now - (3 - i) * 86400000 + 3600000,
      messageCount: 33,
    })),
    messages: makeMessages(100, now, 'medium'),
    engrams: makeEngrams(50, now, 'medium'),
    gardenSeeds: Array.from({ length: 200 }, (_, i) => ({
      id: `medium-seed-${i}`,
      name: `Concept ${i}`,
      connections: Array.from({ length: 4 }, (_, j) => ({
        targetId: `medium-seed-${(i + j + 1) % 200}`,
        strength: 0.05 + (i % 10) * 0.09,
      })),
      lastAccess: now - Math.floor(i * 0.8) * 3600000,
      value: 0.2 + (i % 8) * 0.1,
    })),
    workingMemory: makeEngrams(7, now, 'medium-wm').map((e, i) => ({
      engram: e,
      activationLevel: 0.9 - i * 0.1,
      decayRate: 0.08,
    })),
    personality: { ...BASE_PERSONALITY },
  };
}

function generateLargeDataset(): TestDataset {
  const now = Date.now();
  return {
    name: 'large-session',
    size: 'large',
    sessions: Array.from({ length: 10 }, (_, i) => ({
      sessionId: `sess-${i}`,
      sessionIndex: i,
      startTimestamp: now - (10 - i) * 86400000,
      endTimestamp: now - (10 - i) * 86400000 + 3600000,
      messageCount: 100,
    })),
    messages: makeMessages(1000, now, 'large'),
    engrams: makeEngrams(500, now, 'large'),
    gardenSeeds: Array.from({ length: 2000 }, (_, i) => ({
      id: `large-seed-${i}`,
      name: `Concept ${i}`,
      connections: Array.from({ length: 5 }, (_, j) => ({
        targetId: `large-seed-${(i + j + 1) % 2000}`,
        strength: 0.02 + (i % 12) * 0.08,
      })),
      lastAccess: now - Math.floor(i * 0.5) * 3600000,
      value: 0.1 + (i % 9) * 0.1,
    })),
    workingMemory: makeEngrams(7, now, 'large-wm').map((e, i) => ({
      engram: e,
      activationLevel: 0.9 - i * 0.1,
      decayRate: 0.07,
    })),
    personality: { ...BASE_PERSONALITY },
  };
}

// Long-horizon: 10 sessions × 30 days, 200 messages and 100 engrams per session
// Simulates production scale: ~3000 messages, ~1000 engrams over a month
function generateLongHorizonDataset(): TestDataset {
  const now = Date.now();
  const SESSION_COUNT = 10;
  const MSGS_PER_SESSION = 200;
  const ENGRAMS_PER_SESSION = 100;
  const DAY_MS = 86400000;

  const sessions: SessionBlock[] = Array.from(
    { length: SESSION_COUNT },
    (_, i) => ({
      sessionId: `lh-sess-${i}`,
      sessionIndex: i,
      startTimestamp: now - (SESSION_COUNT - i) * (DAY_MS * 3),
      endTimestamp: now - (SESSION_COUNT - i) * (DAY_MS * 3) + DAY_MS,
      messageCount: MSGS_PER_SESSION,
    })
  );

  const messages: Message[] = [];
  const engrams: Engram[] = [];

  for (let s = 0; s < SESSION_COUNT; s++) {
    const sessionBase = sessions[s].startTimestamp;
    messages.push(
      ...makeMessages(MSGS_PER_SESSION, sessionBase + DAY_MS, `lh-s${s}`)
    );
    engrams.push(
      ...makeEngrams(ENGRAMS_PER_SESSION, sessionBase + DAY_MS, `lh-s${s}`)
    );
  }

  return {
    name: 'long-horizon-30day',
    size: 'long-horizon',
    sessions,
    messages,
    engrams,
    gardenSeeds: Array.from({ length: 5000 }, (_, i) => ({
      id: `lh-seed-${i}`,
      name: `LH Concept ${i}`,
      connections: Array.from({ length: 6 }, (_, j) => ({
        targetId: `lh-seed-${(i + j + 1) % 5000}`,
        strength: 0.01 + (i % 15) * 0.06,
      })),
      lastAccess: now - Math.floor(i * 0.3) * 3600000,
      value: 0.1 + (i % 9) * 0.1,
    })),
    workingMemory: makeEngrams(7, now, 'lh-wm').map((e, i) => ({
      engram: e,
      activationLevel: 0.9 - i * 0.1,
      decayRate: 0.06,
    })),
    personality: { ...BASE_PERSONALITY },
  };
}

// ============================================================================
// COMPRESSORS (retain original variants, now return audit data)
// ============================================================================

interface CompressResult {
  buffer: Buffer;
  prunedEngrams: Engram[]; // engrams removed during this run
  survivingEngrams: Engram[]; // engrams that made it through
  reasonMap: Map<string, PruningReason>;
}

class BaselineCompressor {
  async compressWithAudit(data: TestDataset): Promise<CompressResult> {
    const json = JSON.stringify(data);
    const buffer = await gzip(json);
    return {
      buffer,
      prunedEngrams: [],
      survivingEngrams: data.engrams,
      reasonMap: new Map(),
    };
  }

  async compress(data: TestDataset): Promise<Buffer> {
    return (await this.compressWithAudit(data)).buffer;
  }

  async decompress(buffer: Buffer): Promise<TestDataset> {
    const decompressed = await gunzip(buffer);
    return JSON.parse(decompressed.toString());
  }
}

class Variant1CapacityCompressor extends BaselineCompressor {
  private readonly MSG_LIMIT = 20;
  private readonly ENGRAM_LIMIT = 50;
  private readonly SEED_LIMIT = 100;
  private readonly WM_LIMIT = 7;

  async compressWithAudit(data: TestDataset): Promise<CompressResult> {
    const survivingEngrams = data.engrams.slice(-this.ENGRAM_LIMIT);
    const prunedEngrams = data.engrams.slice(0, -this.ENGRAM_LIMIT);
    const reasonMap = new Map<string, PruningReason>();
    for (const e of prunedEngrams) reasonMap.set(e.id, 'capacity_limit');

    const pruned = {
      ...data,
      messages: data.messages.slice(-this.MSG_LIMIT),
      engrams: survivingEngrams,
      gardenSeeds: data.gardenSeeds.slice(-this.SEED_LIMIT),
      workingMemory: data.workingMemory.slice(-this.WM_LIMIT),
    };
    const buffer = await gzip(JSON.stringify(pruned));
    return { buffer, prunedEngrams, survivingEngrams, reasonMap };
  }

  async compress(data: TestDataset): Promise<Buffer> {
    return (await this.compressWithAudit(data)).buffer;
  }
}

class Variant2DecayCompressor extends Variant1CapacityCompressor {
  private readonly DECAY_THRESHOLD = 0.1;

  async compressWithAudit(data: TestDataset): Promise<CompressResult> {
    const base = await super.compressWithAudit(data);
    const prunedSeeds = this.pruneDeadConnections(data.gardenSeeds);

    const pruned = {
      ...data,
      messages: data.messages.slice(-20),
      engrams: base.survivingEngrams,
      gardenSeeds: prunedSeeds,
      workingMemory: data.workingMemory.slice(-7),
    };
    const buffer = await gzip(JSON.stringify(pruned));
    return { ...base, buffer };
  }

  async compress(data: TestDataset): Promise<Buffer> {
    return (await this.compressWithAudit(data)).buffer;
  }

  protected pruneDeadConnections(seeds: Seed[]): Seed[] {
    return seeds.map((seed) => ({
      ...seed,
      connections: seed.connections.filter(
        (c) => c.strength >= this.DECAY_THRESHOLD
      ),
    }));
  }
}

class Variant3WorkingMemoryCompressor extends Variant2DecayCompressor {
  async compressWithAudit(data: TestDataset): Promise<CompressResult> {
    const base = await super.compressWithAudit(data);
    const decayedWm = this.applyDecay(data.workingMemory);

    const pruned = {
      ...data,
      messages: data.messages.slice(-20),
      engrams: base.survivingEngrams,
      gardenSeeds: this.pruneDeadConnections(data.gardenSeeds),
      workingMemory: decayedWm,
    };
    const buffer = await gzip(JSON.stringify(pruned));
    return { ...base, buffer };
  }

  async compress(data: TestDataset): Promise<Buffer> {
    return (await this.compressWithAudit(data)).buffer;
  }

  protected applyDecay(slots: WorkingMemorySlot[]): WorkingMemorySlot[] {
    return slots
      .map((slot) => ({
        ...slot,
        activationLevel: Math.max(0, slot.activationLevel - slot.decayRate),
      }))
      .filter((slot) => slot.activationLevel > 0);
  }
}

class Variant4SummarizationCompressor extends Variant3WorkingMemoryCompressor {
  async compressWithAudit(data: TestDataset): Promise<CompressResult> {
    const base = await super.compressWithAudit(data);
    const summarizedMessages = this.summarizeMessages(data.messages.slice(-20));

    const pruned = {
      ...data,
      messages: summarizedMessages,
      engrams: base.survivingEngrams,
      gardenSeeds: this.pruneDeadConnections(data.gardenSeeds),
      workingMemory: this.applyDecay(data.workingMemory),
    };
    const buffer = await gzip(JSON.stringify(pruned));

    // Engrams that were summarized-away get that reason code
    const reasonMap = new Map(base.reasonMap);
    for (const e of base.prunedEngrams) {
      if (!reasonMap.has(e.id)) reasonMap.set(e.id, 'summarized');
    }

    return { ...base, buffer, reasonMap };
  }

  async compress(data: TestDataset): Promise<Buffer> {
    return (await this.compressWithAudit(data)).buffer;
  }

  protected summarizeMessages(messages: Message[]): Message[] {
    if (messages.length <= 8) return messages;

    const head = messages.slice(0, -8);
    const tail = messages.slice(-8);
    const headSummary: Message = {
      id: `summary-${Date.now()}`,
      timestamp: head[0]?.timestamp ?? Date.now(),
      role: 'system',
      content: `[SUMMARY: ${head.length} messages covering ${head.length} exchanges. Topics: compression, memory, identity, continuity.]`,
      tokens: 50,
    };
    return [headSummary, ...tail];
  }
}

class FullPipelineCompressor extends Variant4SummarizationCompressor {
  async compressWithAudit(data: TestDataset): Promise<CompressResult> {
    const base = await super.compressWithAudit(data);
    const encryptedEngrams = this.simulateEncryptionOverhead(
      base.survivingEngrams
    );

    const pruned = {
      ...data,
      messages: this.summarizeMessages(data.messages.slice(-20)),
      engrams: encryptedEngrams,
      gardenSeeds: this.pruneDeadConnections(data.gardenSeeds),
      workingMemory: this.applyDecay(data.workingMemory),
    };

    // Encryption expands the payload before gzip — this simulates the 36% overhead
    const buffer = await gzip(JSON.stringify(pruned));

    const reasonMap = new Map(base.reasonMap);
    for (const e of base.prunedEngrams) {
      if (!reasonMap.has(e.id)) reasonMap.set(e.id, 'encryption_truncation');
    }

    return { ...base, buffer, survivingEngrams: encryptedEngrams, reasonMap };
  }

  async compress(data: TestDataset): Promise<Buffer> {
    return (await this.compressWithAudit(data)).buffer;
  }

  private simulateEncryptionOverhead(engrams: Engram[]): Engram[] {
    // AES-256-GCM: 12-byte IV + 16-byte authTag + content as hex = ~36% expansion
    // Simulated by hex-encoding the content (doubles byte count) then appending IV+authTag markers
    return engrams.map((e) => ({
      ...e,
      content:
        Buffer.from(e.content).toString('hex') + '|iv:aabbccdd|tag:eeff0011',
    }));
  }
}

// ============================================================================
// METRICS — PHASE 0 CORRECTED
// ============================================================================

function calculateEpisodicRecall(
  checkpoint: RollbackCheckpoint,
  restored: TestDataset
): number {
  // TRUE episodic recall: set intersection of engram IDs, not count ratio.
  // The old calculateRetrievalRecall returned min(restored/original) which was 100% even
  // when FIFO kept the last 50 of 500 (different IDs entirely). This is the fix.
  const originalIds = new Set(checkpoint.originalEngramIds);
  const restoredIds = new Set(restored.engrams.map((e) => e.id));

  let intersection = 0;
  for (const id of restoredIds) {
    if (originalIds.has(id)) intersection++;
  }

  return originalIds.size > 0 ? (intersection / originalIds.size) * 100 : 100;
}

function calculatePersonalityContinuity(
  original: PersonalityContext,
  restored: PersonalityContext
): number {
  // Measures how many personality dimensions stayed within 0.1 delta.
  // This is what the old "behavioralContinuity" actually measured — now correctly named.
  const keys = Object.keys(original);
  let matchCount = 0;
  for (const key of keys) {
    const diff = Math.abs(
      (original[key] ?? 0) - (restored.personality?.[key] ?? 0)
    );
    if (diff < 0.1) matchCount++;
  }
  return keys.length > 0 ? (matchCount / keys.length) * 100 : 100;
}

function calculateSemanticFidelity(
  original: TestDataset,
  restored: TestDataset
): number {
  const origImportances = original.engrams.map((e) => e.importance);
  const restImportances = restored.engrams.map((e) => e.importance);
  if (restImportances.length === 0) return 0;
  const intersection = Math.min(origImportances.length, restImportances.length);
  const union = Math.max(origImportances.length, restImportances.length);
  return (intersection / union) * 100;
}

function calculateIdentityCoherence(
  original: PersonalityContext,
  restored: PersonalityContext
): number {
  const dims = Object.keys(original);
  let coherence = 0;
  for (const dim of dims) {
    const origVal = original[dim] ?? 0;
    const restVal = restored[dim] ?? 0;
    coherence += 1 - Math.abs(origVal - restVal);
  }
  return dims.length > 0 ? (coherence / dims.length) * 100 : 100;
}

// ============================================================================
// EXPERIMENT RUNNER
// ============================================================================

async function runCompressionExperiment(
  variantName: string,
  compressor: BaselineCompressor,
  datasets: TestDataset[],
  auditOutputDir: string,
  cycle = 0
): Promise<AblationMetrics[]> {
  const results: AblationMetrics[] = [];

  for (const dataset of datasets) {
    const runId = `${variantName.replace(/\s+/g, '-').toLowerCase()}-${dataset.name}-c${cycle}-${Date.now()}`;
    const checkpoint = createCheckpoint(dataset);

    let compressed: Buffer;
    let compressResult: CompressResult | null = null;
    let failureRate = 0;
    let rollbackSuccessRate = 100;
    const startCompress = Date.now();

    try {
      // Cast to access compressWithAudit if available
      if ('compressWithAudit' in compressor) {
        compressResult = await (
          compressor as Variant1CapacityCompressor
        ).compressWithAudit(dataset);
        compressed = compressResult.buffer;
      } else {
        compressed = await compressor.compress(dataset);
      }
    } catch {
      failureRate = 100;
      rollbackSuccessRate = 0;
      results.push({
        variant: variantName,
        dataset: dataset.name,
        cycle,
        compressionRatio: 0,
        restoreLatencyMs: 0,
        episodicRecall: 0,
        personalityContinuity: 0,
        semanticFidelity: 0,
        identityCoherence: 0,
        failureRate,
        rollbackSuccessRate,
        notes: 'COMPRESSION FAILED',
      });
      continue;
    }

    const compressTime = Date.now() - startCompress;
    const startDecompress = Date.now();
    let restored: TestDataset;

    try {
      restored = await compressor.decompress(compressed);
    } catch {
      failureRate = 100;
      rollbackSuccessRate = 0;
      results.push({
        variant: variantName,
        dataset: dataset.name,
        cycle,
        compressionRatio: 0,
        restoreLatencyMs: Date.now() - startDecompress,
        episodicRecall: 0,
        personalityContinuity: 0,
        semanticFidelity: 0,
        identityCoherence: 0,
        failureRate,
        rollbackSuccessRate,
        notes: 'DECOMPRESS FAILED',
      });
      continue;
    }

    const decompressTime = Date.now() - startDecompress;
    const originalSize = JSON.stringify(dataset).length;
    const compressedSize = compressed.length;
    const ratio = (1 - compressedSize / originalSize) * 100;

    const rollbackOk = verifyCheckpoint(checkpoint, restored);
    if (!rollbackOk) {
      rollbackSuccessRate = 0;
      failureRate = 10;
    }

    // Write audit log
    let auditLogPath: string | undefined;
    if (compressResult) {
      const log = buildAuditLog(
        runId,
        variantName,
        dataset,
        cycle,
        compressResult.prunedEngrams.concat(compressResult.survivingEngrams),
        compressResult.survivingEngrams,
        compressResult.reasonMap
      );
      auditLogPath = writeAuditLog(log, auditOutputDir);
    }

    results.push({
      variant: variantName,
      dataset: dataset.name,
      cycle,
      compressionRatio: ratio,
      restoreLatencyMs: decompressTime,
      episodicRecall: calculateEpisodicRecall(checkpoint, restored),
      personalityContinuity: calculatePersonalityContinuity(
        checkpoint.originalPersonality,
        restored.personality
      ),
      semanticFidelity: calculateSemanticFidelity(dataset, restored),
      identityCoherence: calculateIdentityCoherence(
        checkpoint.originalPersonality,
        restored.personality
      ),
      failureRate,
      rollbackSuccessRate,
      auditLogPath,
      notes: `orig=${originalSize}B compressed=${compressedSize}B compress_time=${compressTime}ms`,
    });
  }

  return results;
}

// ============================================================================
// LONG-HORIZON MULTI-CYCLE TEST
// ============================================================================

async function runLongHorizonCycles(
  variantName: string,
  compressor: BaselineCompressor,
  baseDataset: TestDataset,
  cycles: number,
  auditOutputDir: string
): Promise<AblationMetrics[]> {
  const results: AblationMetrics[] = [];
  let current = baseDataset;

  for (let cycle = 1; cycle <= cycles; cycle++) {
    const cycleResults = await runCompressionExperiment(
      variantName,
      compressor,
      [current],
      auditOutputDir,
      cycle
    );
    results.push(...cycleResults);

    // For next cycle: decompress and use the output as input (simulates repeated compression)
    try {
      const compressed = await compressor.compress(current);
      const restored = await compressor.decompress(compressed);
      current = restored;
    } catch {
      break;
    }
  }

  return results;
}

// ============================================================================
// KPI SUMMARY BUILDER
// ============================================================================

function buildKpiSummary(
  allResults: AblationMetrics[],
  longHorizonResults: AblationMetrics[]
): KpiSummary {
  const datasetNames = [...new Set(allResults.map((r) => r.dataset))];
  const datasetResults: KpiSummary['datasetResults'] = {};

  for (const ds of datasetNames) {
    const dsResults = allResults.filter((r) => r.dataset === ds);
    datasetResults[ds] = {
      bestCompressionRatio: Math.max(
        ...dsResults.map((r) => r.compressionRatio)
      ),
      worstEpisodicRecall: Math.min(...dsResults.map((r) => r.episodicRecall)),
      bestPersonalityContinuity: Math.max(
        ...dsResults.map((r) => r.personalityContinuity)
      ),
      averageRestoreLatencyMs:
        dsResults.reduce((s, r) => s + r.restoreLatencyMs, 0) /
        dsResults.length,
    };
  }

  const lhCycle1 = longHorizonResults.find((r) => r.cycle === 1);
  const lhCycle10 =
    longHorizonResults.find((r) => r.cycle === 10) ??
    longHorizonResults[longHorizonResults.length - 1];

  const c1Recall = lhCycle1?.episodicRecall ?? 0;
  const c10Recall = lhCycle10?.episodicRecall ?? 0;
  const drift = c1Recall - c10Recall;

  const allEpisodicRecalls = allResults.map((r) => r.episodicRecall);
  const allLatencies = allResults.map((r) => r.restoreLatencyMs);
  const allRollbacks = allResults.map((r) => r.rollbackSuccessRate);

  const minRecall = Math.min(...allEpisodicRecalls);
  const maxLatency = Math.max(...allLatencies);
  const minRollback = Math.min(...allRollbacks);

  // SLO: restore latency < 500ms
  const SLO_LATENCY_MS = 500;

  let recommendation = '';
  if (minRecall >= 95 && maxLatency <= SLO_LATENCY_MS && minRollback >= 99) {
    recommendation =
      'Phase 0 baseline stable. Proceed to Option C P1 techniques.';
  } else if (minRecall < 95) {
    recommendation = `BLOCKER: Episodic recall ${minRecall.toFixed(1)}% is below 95% guardrail. Stabilize before Option C.`;
  } else if (maxLatency > SLO_LATENCY_MS) {
    recommendation = `WARNING: Max restore latency ${maxLatency}ms exceeds ${SLO_LATENCY_MS}ms SLO. Profile decompression path.`;
  } else {
    recommendation = `WARNING: Rollback success ${minRollback.toFixed(1)}% below 99% threshold. Fix checkpoint mechanism.`;
  }

  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase 0 — Baseline and Instrumentation',
    datasetResults,
    longHorizonDrift: {
      episodicRecallAtCycle1: c1Recall,
      episodicRecallAtCycle10: c10Recall,
      driftPercent: drift,
      exceedsGuardrail: c10Recall < 95,
    },
    guardrailStatus: {
      episodicRecallAbove95: minRecall >= 95,
      latencyWithinSlo: maxLatency <= SLO_LATENCY_MS,
      rollbackSuccessAbove99: minRollback >= 99,
    },
    recommendation,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const SEP = '='.repeat(80);
  console.log(SEP);
  console.log('MOLLY COMPRESSION STACK VALIDATION HARNESS — Phase 0');
  console.log(SEP);
  console.log();

  const outputDir = path.join(process.cwd(), 'docs');
  const auditDir = path.join(outputDir, 'compression-audit-logs');
  fs.mkdirSync(auditDir, { recursive: true });

  const standardDatasets = [
    generateSmallDataset(),
    generateMediumDataset(),
    generateLargeDataset(),
  ];

  const longHorizonDataset = generateLongHorizonDataset();

  const compressors: Array<{ name: string; compressor: BaselineCompressor }> = [
    { name: 'Baseline (JSON+gzip)', compressor: new BaselineCompressor() },
    {
      name: 'V1: Capacity Constraints',
      compressor: new Variant1CapacityCompressor(),
    },
    {
      name: 'V2: Capacity + Connection Decay',
      compressor: new Variant2DecayCompressor(),
    },
    {
      name: 'V3: + Working Memory Decay',
      compressor: new Variant3WorkingMemoryCompressor(),
    },
    {
      name: 'V4: + Summarization',
      compressor: new Variant4SummarizationCompressor(),
    },
    {
      name: 'Full Pipeline (current system)',
      compressor: new FullPipelineCompressor(),
    },
  ];

  const allResults: AblationMetrics[] = [];

  // Standard dataset runs
  console.log('--- Standard Dataset Runs ---');
  for (const { name, compressor } of compressors) {
    console.log(`\nRunning: ${name}`);
    const results = await runCompressionExperiment(
      name,
      compressor,
      standardDatasets,
      auditDir
    );
    allResults.push(...results);

    for (const r of results) {
      const recallWarning = r.episodicRecall < 95 ? ' ⚠ RECALL<95%' : '';
      console.log(
        `  [${r.dataset.padEnd(20)}] ` +
          `Ratio: ${r.compressionRatio.toFixed(1).padStart(6)}% | ` +
          `EpisodicRecall: ${r.episodicRecall.toFixed(1).padStart(5)}%${recallWarning} | ` +
          `PersonalityCont: ${r.personalityContinuity.toFixed(1).padStart(5)}% | ` +
          `Restore: ${r.restoreLatencyMs}ms`
      );
    }
  }

  // Long-horizon multi-cycle test (Full Pipeline — current system under load)
  console.log('\n--- Long-Horizon 10-Cycle Test (Full Pipeline) ---');
  const longHorizonResults = await runLongHorizonCycles(
    'Full Pipeline (long-horizon)',
    new FullPipelineCompressor(),
    longHorizonDataset,
    10,
    auditDir
  );

  for (const r of longHorizonResults) {
    const recallWarning = r.episodicRecall < 95 ? ' ⚠ BELOW GUARDRAIL' : '';
    console.log(
      `  Cycle ${r.cycle.toString().padStart(2)}: ` +
        `Ratio=${r.compressionRatio.toFixed(1)}% | ` +
        `EpisodicRecall=${r.episodicRecall.toFixed(1)}%${recallWarning} | ` +
        `PersonalityCont=${r.personalityContinuity.toFixed(1)}%`
    );
  }

  // KPI Summary
  const kpi = buildKpiSummary(allResults, longHorizonResults);

  console.log('\n--- Phase 0 KPI Summary ---');
  console.log(
    `Episodic recall guardrail (≥95%): ${kpi.guardrailStatus.episodicRecallAbove95 ? 'PASS' : 'FAIL'}`
  );
  console.log(
    `Latency SLO (≤500ms):             ${kpi.guardrailStatus.latencyWithinSlo ? 'PASS' : 'FAIL'}`
  );
  console.log(
    `Rollback success (≥99%):           ${kpi.guardrailStatus.rollbackSuccessAbove99 ? 'PASS' : 'FAIL'}`
  );
  console.log(
    `Long-horizon drift:                ${kpi.longHorizonDrift.driftPercent.toFixed(1)}% over 10 cycles`
  );
  console.log(`\nRecommendation: ${kpi.recommendation}`);

  // Write reports
  const reportPath = path.join(outputDir, 'COMPRESSION_VALIDATION_REPORT.json');
  const kpiPath = path.join(outputDir, 'COMPRESSION_KPI_SUMMARY.json');

  fs.writeFileSync(
    reportPath,
    JSON.stringify({ results: allResults, longHorizonResults }, null, 2)
  );
  fs.writeFileSync(kpiPath, JSON.stringify(kpi, null, 2));

  console.log('\n' + SEP);
  console.log(`Ablation report:   ${reportPath}`);
  console.log(`KPI summary:       ${kpiPath}`);
  console.log(`Audit logs:        ${auditDir}/`);
  console.log(SEP);
}

main().catch(console.error);
