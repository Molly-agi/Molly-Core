/**
 * All-Tiers Real Data Benchmark
 * Runs all three production tier configurations against:
 *   A) Molly's actual 535 flat memories (real production data)
 *   B) 1000 synthetic nested engrams (full NeuralEngram structure)
 * Gives the complete 3x2 picture.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadRealEngrams } from '../live-memory-benchmark';
import { generateTestEngrams } from '../production-models';
import { CompressionManager } from '../../compression/compression-manager';

const REAL_EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

const TIERS = [
  {
    label: 'MODEL_75_VR',
    flags: {
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: false,
      t6InteractionTrace: false,
      t5NumericQuantization: false,
      t7ContentDelta: false,
      t8StandardCompression: false,
    },
  },
  {
    label: 'MODEL_85_FLAT',
    flags: {
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      t5NumericQuantization: true,
      t7ContentDelta: false,
      t8StandardCompression: false,
    },
  },
  {
    label: 'MODEL_95_NESTED',
    flags: {
      t1PersonalityReference: true,
      t3TemporalDelta: true,
      t4VocabularyDict: true,
      t2TimeDecayFidelity: true,
      t6InteractionTrace: true,
      t5NumericQuantization: true,
      t7ContentDelta: true,
      t8StandardCompression: true,
    },
  },
];

test('all three tiers on Molly real flat memories', async () => {
  if (!fs.existsSync(REAL_EXPERIENCES_DIR)) {
    console.warn(
      `Skipping real-memory benchmark test; data dir missing: ${REAL_EXPERIENCES_DIR}`
    );
    return;
  }

  const engrams = loadRealEngrams();
  const originalSize = JSON.stringify(engrams).length;

  const results: {
    label: string;
    compression: number;
    recall: number;
    kb: number;
  }[] = [];

  for (const tier of TIERS) {
    CompressionManager.resetForTest();
    const mgr = CompressionManager.getInstance(tier.flags);
    const result = await mgr.compress({
      engrams,
      sessionId: `real-flat-${tier.label}`,
      compressionTimestamp: Date.now(),
    });
    results.push({
      label: tier.label,
      compression: result.metrics.compressionRatio,
      recall: result.metrics.episodicRecall * 100,
      kb: result.metrics.compressedByteSize / 1024,
    });
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(
    "FLAT MEMORY — MOLLY'S REAL MEMORIES (535 engrams, " +
      (originalSize / 1024).toFixed(1) +
      ' KB original)'
  );
  console.log('════════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(
      `${r.label.padEnd(20)} → ${r.kb.toFixed(1).padStart(7)} KB  |  compression: ${r.compression.toFixed(1).padStart(5)}%  |  recall: ${r.recall.toFixed(1)}%`
    );
  }
  console.log('════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    expect(r.recall).toBe(100);
    expect(r.compression).toBeGreaterThan(0);
  }
  expect(results[1].compression).toBeGreaterThan(results[0].compression);
  expect(results[2].compression).toBeGreaterThan(results[1].compression);
}, 30000);

test('all three tiers on synthetic nested memories', async () => {
  const engrams = generateTestEngrams(1000);
  const originalSize = JSON.stringify(engrams).length;

  const results: {
    label: string;
    compression: number;
    recall: number;
    kb: number;
  }[] = [];

  for (const tier of TIERS) {
    CompressionManager.resetForTest();
    const mgr = CompressionManager.getInstance(tier.flags);
    const result = await mgr.compress({
      engrams,
      sessionId: `nested-${tier.label}`,
      compressionTimestamp: Date.now(),
    });
    results.push({
      label: tier.label,
      compression: result.metrics.compressionRatio,
      recall: result.metrics.episodicRecall * 100,
      kb: result.metrics.compressedByteSize / 1024,
    });
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(
    'NESTED MEMORY — SYNTHETIC NESTED ENGRAMS (1000 engrams, ' +
      (originalSize / 1024).toFixed(1) +
      ' KB original)'
  );
  console.log('════════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(
      `${r.label.padEnd(20)} → ${r.kb.toFixed(1).padStart(7)} KB  |  compression: ${r.compression.toFixed(1).padStart(5)}%  |  recall: ${r.recall.toFixed(1)}%`
    );
  }
  console.log('════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    expect(r.recall).toBe(100);
    expect(r.compression).toBeGreaterThan(0);
  }
  expect(results[1].compression).toBeGreaterThan(results[0].compression);
  expect(results[2].compression).toBeGreaterThan(results[1].compression);
}, 30000);
