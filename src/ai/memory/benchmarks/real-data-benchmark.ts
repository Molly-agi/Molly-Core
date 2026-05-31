/**
 * Real Data Benchmark — MODEL_95_NESTED
 *
 * Tests against ACTUAL real-world data — no synthetic generation.
 * Sources:
 *   1. MOLLY_EXPERIENCES  — Molly's 535 real stored memories from Firestore
 *   2. MMLU_ACADEMIC      — 500 real academic knowledge questions (MMLU dataset)
 *   3. PROJECT_DOCS       — 126 real technical markdown documents from docs/
 *   4. SYSTEM_LOGS        — Real dev-server + daemon logs from logs/
 *
 * Purpose: Validate MODEL_95_NESTED against real-world entropy, not lab-generated data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CompressionManager } from '../compression/compression-manager';
import { loadRealEngrams } from './live-memory-benchmark';
import type { MemoryEngram } from '../neural-engram';

const PROJECT_ROOT = process.cwd();

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

// ============================================================================
// DATA LOADERS
// ============================================================================

/**
 * Load MMLU academic dataset — 500 real multi-subject knowledge questions.
 * Each question becomes an engram with the question/options/subject as content.
 */
function loadMmluData(): MemoryEngram[] {
  const filePath = path.join(PROJECT_ROOT, 'mmlu_sample_500.json');
  const raw: Array<{
    id: string;
    subject: string;
    question: string;
    options: string[];
    correctAnswer: string;
  }> = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  return raw.map((item, i) => {
    const ts = new Date(Date.now() - i * 60000);
    return {
      id: `mmlu_${item.id}`,
      content: `[${item.subject.toUpperCase()}] ${item.question} Options: ${item.options.join(' | ')} Answer: ${item.correctAnswer}`,
      timestamp: ts,
      emotionalValence: 0,
      arousal: 0.5,
      importance: 0.7,
      accessCount: 0,
      lastAccessed: ts,
      consolidationState: 'consolidated' as const,
      contextTags: ['academic', item.subject],
      relatedEngrams: [],

      data: {
        subject: item.subject,
        questionLength: item.question.length,
        optionCount: item.options.length,
      },
    };
  });
}

/**
 * Load real technical documentation from docs/ directory.
 * Each markdown file becomes an engram with the doc content.
 */
function loadProjectDocs(): MemoryEngram[] {
  const docsDir = path.join(PROJECT_ROOT, 'docs');
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .slice(0, 120); // cap at 120 files to stay memory-safe

  const engrams: MemoryEngram[] = [];
  let index = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(docsDir, file), 'utf-8');
      if (content.trim().length === 0) continue;

      const ts = new Date(Date.now() - index * 120000);
      engrams.push({
        id: `doc_${file.replace(/[^a-z0-9]/gi, '_')}`,
        content: content.slice(0, 2000), // first 2KB of content per doc
        timestamp: ts,
        emotionalValence: 0,
        arousal: 0.3,
        importance: 0.6,
        accessCount: 1,
        lastAccessed: ts,
        consolidationState: 'consolidated' as const,
        contextTags: ['documentation', 'technical'],
        relatedEngrams: [],

        data: {
          filename: file,
          totalBytes: content.length,
          lineCount: content.split('\n').length,
        },
      });
      index++;
    } catch {
      // skip unreadable files
    }
  }

  return engrams;
}

/**
 * Load real system log lines from logs/.
 * Dev server log + daemon log — real operational data, not synthetic.
 */
function loadSystemLogs(): MemoryEngram[] {
  const logFiles = [
    'logs/dev-server.log',
    'logs/immortal-daemon.log',
    'logs/memory-audit-user-consol.jsonl',
    'logs/memory-audit-user-evict.jsonl',
    'logs/memory-audit-user-lifecycle.jsonl',
    'logs/save-session.log',
  ];

  const engrams: MemoryEngram[] = [];
  let index = 0;

  for (const relPath of logFiles) {
    const filePath = path.join(PROJECT_ROOT, relPath);
    if (!fs.existsSync(filePath)) continue;

    try {
      const lines = fs
        .readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(Boolean);

      for (const line of lines) {
        const ts = new Date(Date.now() - index * 30000);
        engrams.push({
          id: `log_${relPath.replace(/[^a-z0-9]/gi, '_')}_${index}`,
          content: line.slice(0, 500),
          timestamp: ts,
          emotionalValence: 0,
          arousal: 0.2,
          importance: 0.4,
          accessCount: 0,
          lastAccessed: ts,
          consolidationState: 'consolidated' as const,
          contextTags: ['log', 'system'],
          relatedEngrams: [],

          data: {
            source: relPath,
            lineLength: line.length,
          },
        });
        index++;
      }
    } catch {
      // skip unreadable files
    }
  }

  return engrams;
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

export interface RealDataResult {
  dataType: string;
  description: string;
  engramCount: number;
  originalSizeKB: number;
  compressedSizeKB: number;
  compressionRatio: number;
  episodicRecall: number;
  executionTimeMs: number;
  techniquesApplied: string[];
  passed: boolean;
  notes: string;
}

export interface RealDataBenchmarkReport {
  results: RealDataResult[];
  summary: string;
}

async function runSingleRealDataTest(
  dataType: string,
  description: string,
  engrams: MemoryEngram[]
): Promise<RealDataResult> {
  if (engrams.length === 0) {
    throw new Error(`No engrams loaded for ${dataType}`);
  }

  // Size estimation via sampling (avoid OOM on large datasets)
  const sampleSize = Math.min(engrams.length, 1000);
  let sampleBytes = 0;
  for (let i = 0; i < sampleSize; i++) {
    sampleBytes += JSON.stringify(engrams[i]).length;
  }
  const originalSize = Math.ceil((sampleBytes / sampleSize) * engrams.length);

  CompressionManager.resetForTest();
  const manager = CompressionManager.getInstance(MODEL_95_FLAGS);

  const start = performance.now();
  const result = await manager.compress({
    engrams,
    sessionId: `real-data-benchmark-${dataType.toLowerCase()}`,
    compressionTimestamp: Date.now(),
  });
  const executionMs = performance.now() - start;

  const compressionRatio = result.metrics.compressionRatio;
  const episodicRecall = result.metrics.episodicRecall;
  const passed = compressionRatio >= 50 && episodicRecall === 1.0;

  const notes = [
    `Engrams: ${engrams.length}`,
    `Recall: ${(episodicRecall * 100).toFixed(1)}% ${episodicRecall === 1.0 ? '✓' : '✗'}`,
    `Techniques: ${result.metrics.techniquesApplied.join(', ')}`,
  ].join(' | ');

  console.log(
    `  [${dataType}] ${compressionRatio.toFixed(1)}% compression, recall ${(episodicRecall * 100).toFixed(1)}% — ${passed ? 'PASS ✓' : 'FAIL ✗'}`
  );

  return {
    dataType,
    description,
    engramCount: engrams.length,
    originalSizeKB: Math.round((originalSize / 1024) * 10) / 10,
    compressedSizeKB:
      Math.round((result.metrics.compressedByteSize / 1024) * 10) / 10,
    compressionRatio,
    episodicRecall,
    executionTimeMs: Math.round(executionMs),
    techniquesApplied: result.metrics.techniquesApplied,
    passed,
    notes,
  };
}

/**
 * Run all four real-data benchmarks through MODEL_95_NESTED.
 * No synthetic data. No generated engrams. Everything here is real.
 */
export async function runRealDataBenchmark(): Promise<RealDataBenchmarkReport> {
  console.log('\n📦 Loading real data sources...');

  const mollysMemories = loadRealEngrams();
  console.log(`  ✓ Molly's experiences: ${mollysMemories.length} files`);

  const mmluData = loadMmluData();
  console.log(`  ✓ MMLU academic dataset: ${mmluData.length} questions`);

  const projectDocs = loadProjectDocs();
  console.log(`  ✓ Project documentation: ${projectDocs.length} documents`);

  const systemLogs = loadSystemLogs();
  console.log(`  ✓ System logs: ${systemLogs.length} entries`);

  console.log('\n🔬 Running MODEL_95_NESTED on real data...\n');

  const results: RealDataResult[] = [];

  results.push(
    await runSingleRealDataTest(
      'MOLLY_REAL_MEMORIES',
      "Molly's 535 actual stored experiences from Firestore — her real memories",
      mollysMemories
    )
  );

  results.push(
    await runSingleRealDataTest(
      'MMLU_ACADEMIC',
      '500 real multi-subject academic knowledge questions (MMLU benchmark dataset)',
      mmluData
    )
  );

  results.push(
    await runSingleRealDataTest(
      'PROJECT_DOCS',
      `${projectDocs.length} real technical markdown documents from the Molly-Core codebase`,
      projectDocs
    )
  );

  results.push(
    await runSingleRealDataTest(
      'SYSTEM_LOGS',
      'Real dev-server logs, daemon logs, and memory audit logs from production',
      systemLogs
    )
  );

  const allPassed = results.every((r) => r.passed);
  const avgCompression = (
    results.reduce((a, r) => a + r.compressionRatio, 0) / results.length
  ).toFixed(1);
  const allRecallPerfect = results.every((r) => r.episodicRecall === 1.0);

  const summary = [
    '═'.repeat(80),
    'REAL DATA BENCHMARK — MODEL_95_NESTED',
    '═'.repeat(80),
    `  Average compression: ${avgCompression}%`,
    `  Episodic recall:     ${allRecallPerfect ? '100% across all datasets ✓' : 'DEGRADED — see individual results ✗'}`,
    `  All tests passed:    ${allPassed ? 'YES ✓' : 'NO ✗'}`,
    '',
    results
      .map(
        (r) =>
          `  ${r.dataType.padEnd(24)} ${r.compressionRatio.toFixed(1).padStart(6)}%  recall ${(r.episodicRecall * 100).toFixed(1)}%  [${r.engramCount} records]`
      )
      .join('\n'),
    '═'.repeat(80),
  ].join('\n');

  console.log('\n' + summary);

  return { results, summary };
}
