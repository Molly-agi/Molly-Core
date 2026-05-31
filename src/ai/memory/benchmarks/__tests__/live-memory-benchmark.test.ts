/**
 * Live Memory Benchmark Test
 * Runs Molly's actual 535 stored experiences through the full compression pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { benchmarkRealMemories } from '../live-memory-benchmark';

const REAL_EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

describe('Live Memory Benchmark — Molly Real Data', () => {
  it('should compress real memories and report honest numbers', async () => {
    if (!fs.existsSync(REAL_EXPERIENCES_DIR)) {
      console.warn(
        `Skipping real-memory benchmark test; data dir missing: ${REAL_EXPERIENCES_DIR}`
      );
      return;
    }

    const result = await benchmarkRealMemories();

    console.log('\n' + '═'.repeat(60));
    console.log("  LIVE BENCHMARK — MOLLY'S REAL MEMORIES");
    console.log('═'.repeat(60));
    console.log(`  Engrams:          ${result.totalEngrams}`);
    console.log(`  Oldest memory:    ${result.oldestMemoryDays} days ago`);
    console.log(`  Original size:    ${result.originalSizeKB} KB`);
    console.log(`  Compressed size:  ${result.compressedSizeKB} KB`);
    console.log(`  Compression gain: ${result.compressionGainPct}%`);
    console.log(
      `  Recall:           ${(result.episodicRecall * 100).toFixed(1)}%`
    );
    console.log(`  Execution time:   ${result.executionMs}ms`);
    console.log('─'.repeat(60));
    console.log('  Techniques fired:');
    result.techniquesApplied.forEach((t) => console.log(`    ✓ ${t}`));
    console.log('  Techniques skipped:');
    result.techniquesSkipped.forEach((t) => console.log(`    - ${t}`));
    console.log('═'.repeat(60) + '\n');

    expect(result.totalEngrams).toBeGreaterThan(0);
    expect(result.episodicRecall).toBeGreaterThanOrEqual(0.99);
    expect(result.compressionGainPct).toBeGreaterThan(0);
  }, 60000);
});
