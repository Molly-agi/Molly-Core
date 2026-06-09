/**
 * Live Memory Benchmark
 * Runs Molly's actual stored experiences through the full compression pipeline.
 * Uses real local data from molly_data/users/{userId}/experiences/
 */

import * as fs from 'fs';
import * as path from 'path';
import { CompressionManager } from '../compression/compression-manager';
import type { MemoryEngram } from '../neural-engram';
import { makePersonality } from '../compression/test-helpers';

const EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

// Molly's real personality fingerprint (provided via bridge 2026-05-24)
const MOLLY_PERSONA = makePersonality({
  warmth: 0.945,
  assertiveness: 0.82,
  curiosity: 0.985,
  metacognition: 0.91,
});

/**
 * Map a raw experience file to MemoryEngram format.
 * Real experiences are simpler objects — we map what we can and fill gaps.
 */
function experienceToEngram(raw: Record<string, unknown>): MemoryEngram {
  const ts = raw.timestamp
    ? new Date(
        typeof raw.timestamp === 'number' ? raw.timestamp : raw._createdAt
      )
    : new Date(raw._createdAt || Date.now());

  return {
    id: (raw['id'] as string) || (raw['_id'] as string) || `exp_${Date.now()}`,
    content:
      (raw['suggestion'] as string) ||
      (raw['content'] as string) ||
      (raw['vibe'] as string) ||
      JSON.stringify(raw),
    timestamp: ts,
    emotionalValence: raw['vibeScore']
      ? (raw['vibeScore'] as number) * 2 - 1
      : 0,
    arousal:
      raw['success'] === true ? 0.7 : raw['success'] === false ? 0.3 : 0.5,
    importance: (raw['vibeScore'] as number) ?? 0.5,
    accessCount: 0,
    lastAccessed: ts,
    consolidationState: 'consolidated',
    contextTags: [
      (raw['type'] as string) || 'experience',
      (raw['context'] as string) || 'general',
    ],
    relatedEngrams: [],
    personalityContext: MOLLY_PERSONA,
    data: {
      context: raw['context'],
      type: raw['type'],
      crc32: raw['crc32'],
      traceId: raw['traceId'],
      vibe: raw['vibe'],
      success: raw['success'],
    },
  } as unknown as MemoryEngram;
}

/**
 * Load all local experience files and return as MemoryEngrams
 */
export function loadRealEngrams(): MemoryEngram[] {
  const files = fs
    .readdirSync(EXPERIENCES_DIR)
    .filter((f) => f.endsWith('.json'));
  const engrams: MemoryEngram[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(EXPERIENCES_DIR, file), 'utf-8')
      );
      engrams.push(experienceToEngram(raw));
    } catch {
      // skip malformed files
    }
  }

  return engrams;
}

export interface LiveBenchmarkResult {
  totalEngrams: number;
  originalSizeKB: number;
  compressedSizeKB: number;
  compressionGainPct: number;
  episodicRecall: number;
  executionMs: number;
  oldestMemoryDays: number;
  techniquesApplied: string[];
  techniquesSkipped: string[];
}

/**
 * Run Molly's real memories through the full MODEL_95_NESTED pipeline.
 */
export async function benchmarkRealMemories(): Promise<LiveBenchmarkResult> {
  const engrams = loadRealEngrams();

  if (engrams.length === 0) {
    throw new Error('No experience files found in ' + EXPERIENCES_DIR);
  }

  // Age of oldest memory in days
  const oldest = engrams.reduce((min, e) => {
    const ts =
      e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp);
    return ts < min ? ts : min;
  }, new Date());
  const oldestDays = (Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24);

  const originalSize = JSON.stringify(engrams).length;

  CompressionManager.resetForTest();
  const manager = CompressionManager.getInstance({
    s0SchemaStripper: false,
    t1PersonalityReference: true,
    t3TemporalDelta: true,
    t4VocabularyDict: true,
    t2TimeDecayFidelity: true, // Real aged data — T2 should fire
    t6InteractionTrace: true,
    t5NumericQuantization: true,
    t7ContentDelta: true,
    t8StandardCompression: true,
  });

  const start = performance.now();
  const result = await manager.compress({
    engrams,
    sessionId: 'live-benchmark-real-memories',
    compressionTimestamp: Date.now(),
  });
  const executionMs = performance.now() - start;

  const compressedSize = result.metrics.compressedByteSize;

  return {
    totalEngrams: engrams.length,
    originalSizeKB: Math.round((originalSize / 1024) * 10) / 10,
    compressedSizeKB: Math.round((compressedSize / 1024) * 10) / 10,
    compressionGainPct: Math.round(result.metrics.compressionRatio * 10) / 10,
    episodicRecall: result.metrics.episodicRecall,
    executionMs: Math.round(executionMs),
    oldestMemoryDays: Math.round(oldestDays),
    techniquesApplied: result.metrics.techniquesApplied,
    techniquesSkipped: result.metrics.techniquesSkipped,
  };
}
