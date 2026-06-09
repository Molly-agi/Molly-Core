/**
 * Real Memory Hardness Analyzer
 *
 * Computes per-file compression characteristics for Molly's 535 real experiences.
 * Outputs:
 *  - MOLLY_REAL_MEMORY_HARDNESS.json
 *  - MOLLY_REAL_MEMORY_HARDNESS_TOP20.json
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

const OUTPUT_FULL = path.join(process.cwd(), 'MOLLY_REAL_MEMORY_HARDNESS.json');
const OUTPUT_TOP20 = path.join(
  process.cwd(),
  'MOLLY_REAL_MEMORY_HARDNESS_TOP20.json'
);

const MODEL_95_FLAGS = {
  s0SchemaStripper: false,
  t1PersonalityReference: true,
  t3TemporalDelta: true,
  t4VocabularyDict: true,
  t2TimeDecayFidelity: true,
  t6InteractionTrace: true,
  t5NumericQuantization: true,
  t7ContentDelta: true,
  t8StandardCompression: true,
};

const MOLLY_PERSONA = makePersonality({
  warmth: 0.945,
  assertiveness: 0.82,
  curiosity: 0.985,
  metacognition: 0.91,
});

interface RawExperience {
  id?: string;
  _id?: string;
  timestamp?: number | string;
  _createdAt?: number | string;
  suggestion?: string;
  content?: string;
  vibe?: string;
  vibeScore?: number;
  success?: boolean;
  type?: string;
  context?: string;
  crc32?: string;
  traceId?: string;
}

interface FileAnalysis {
  fileName: string;
  memoryId: string;
  timestamp: string;
  type: string;
  context: string;
  originalBytes: number;
  compressedBytes: number;
  bytesSaved: number;
  compressionRatio: number;
  episodicRecall: number;
  executionMs: number;
  contentLength: number;
  techniquesApplied: string[];
}

function toTs(value: number | string | undefined): Date {
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const maybe = new Date(value);
    if (!Number.isNaN(maybe.getTime())) return maybe;
  }
  return new Date();
}

function rawToEngram(raw: RawExperience, fileName: string): MemoryEngram {
  const ts = toTs(raw.timestamp ?? raw._createdAt);
  const content =
    raw.suggestion || raw.content || raw.vibe || JSON.stringify(raw);

  return {
    id: raw.id || raw._id || `exp_${fileName}`,
    content,
    timestamp: ts,
    emotionalValence: raw.vibeScore ? raw.vibeScore * 2 - 1 : 0,
    arousal: raw.success === true ? 0.7 : raw.success === false ? 0.3 : 0.5,
    importance: raw.vibeScore ?? 0.5,
    accessCount: 0,
    lastAccessed: ts,
    consolidationState: 'consolidated',
    contextTags: [raw.type || 'experience', raw.context || 'general'],
    relatedEngrams: [],
    personalityContext: MOLLY_PERSONA,
    data: {
      fileName,
      context: raw.context,
      type: raw.type,
      crc32: raw.crc32,
      traceId: raw.traceId,
      vibe: raw.vibe,
      success: raw.success,
    },
  } as unknown as MemoryEngram;
}

async function analyzeOne(fileName: string): Promise<FileAnalysis | null> {
  const fullPath = path.join(EXPERIENCES_DIR, fileName);
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as RawExperience;
    const engram = rawToEngram(raw, fileName);
    const originalBytes = JSON.stringify(engram).length;

    CompressionManager.resetForTest();
    const manager = CompressionManager.getInstance(MODEL_95_FLAGS);

    const start = performance.now();
    const result = await manager.compress({
      engrams: [engram],
      sessionId: `real-memory-hardness-${fileName}`,
      compressionTimestamp: Date.now(),
    });
    const executionMs = Math.round(performance.now() - start);

    const compressedBytes = result.metrics.compressedByteSize;
    const bytesSaved = Math.max(0, originalBytes - compressedBytes);

    return {
      fileName,
      memoryId: engram.id,
      timestamp: new Date(
        engram.timestamp instanceof Date
          ? engram.timestamp
          : String(engram.timestamp)
      ).toISOString(),
      type: (raw.type || 'experience').toString(),
      context: (raw.context || 'general').toString(),
      originalBytes,
      compressedBytes,
      bytesSaved,
      compressionRatio: result.metrics.compressionRatio,
      episodicRecall: result.metrics.episodicRecall,
      executionMs,
      contentLength: (engram.content || '').length,
      techniquesApplied: result.metrics.techniquesApplied,
    };
  } catch {
    return null;
  }
}

export async function runRealMemoryHardnessAnalysis(): Promise<void> {
  const files = fs
    .readdirSync(EXPERIENCES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const analyses: FileAnalysis[] = [];
  for (let i = 0; i < files.length; i++) {
    const out = await analyzeOne(files[i]);
    if (out) analyses.push(out);

    if ((i + 1) % 50 === 0) {
      console.log(`  analyzed ${i + 1}/${files.length} files...`);
    }
  }

  const hardestByCompression = [...analyses]
    .sort((a, b) => a.compressionRatio - b.compressionRatio)
    .slice(0, 20);

  const highestDeltaByBytesSaved = [...analyses]
    .sort((a, b) => b.bytesSaved - a.bytesSaved)
    .slice(0, 20);

  const slowestByRuntime = [...analyses]
    .sort((a, b) => b.executionMs - a.executionMs)
    .slice(0, 20);

  const avgCompression =
    analyses.reduce((sum, a) => sum + a.compressionRatio, 0) /
    Math.max(analyses.length, 1);
  const avgExecutionMs =
    analyses.reduce((sum, a) => sum + a.executionMs, 0) /
    Math.max(analyses.length, 1);

  const payload = {
    timestamp: new Date().toISOString(),
    dataset: 'MOLLY_REAL_MEMORIES',
    fileCount: analyses.length,
    summary: {
      averageCompressionRatio: Number(avgCompression.toFixed(4)),
      averageExecutionMs: Number(avgExecutionMs.toFixed(2)),
      recallAllPerfect: analyses.every((a) => a.episodicRecall === 1),
    },
    hardestByCompression,
    highestDeltaByBytesSaved,
    slowestByRuntime,
    allFiles: analyses,
  };

  fs.writeFileSync(OUTPUT_FULL, JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    OUTPUT_TOP20,
    JSON.stringify(
      {
        timestamp: payload.timestamp,
        fileCount: payload.fileCount,
        hardestByCompression,
        highestDeltaByBytesSaved,
        slowestByRuntime,
      },
      null,
      2
    )
  );

  console.log(`\n✓ Wrote ${OUTPUT_FULL}`);
  console.log(`✓ Wrote ${OUTPUT_TOP20}`);
  console.log(`✓ Avg compression: ${avgCompression.toFixed(2)}%`);
  console.log(`✓ Avg per-file latency: ${avgExecutionMs.toFixed(2)}ms`);
}

if (require.main === module) {
  runRealMemoryHardnessAnalysis().catch((error) => {
    console.error('Hardness analysis failed:', error);
    process.exit(1);
  });
}
