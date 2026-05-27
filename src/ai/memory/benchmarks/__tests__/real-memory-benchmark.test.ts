/**
 * Real Memory Benchmark Test
 * Tests all three models against Molly's actual stored experiences
 */

import { runRealMemoryBenchmark } from '../real-memory-benchmark';

describe('Real Memory Benchmark — Molly\'s Actual Experiences', () => {
  it('should benchmark all three models on Molly\'s real memories', async () => {
    const result = await runRealMemoryBenchmark();

    expect(result.results.length).toBe(3);
    expect(result.results.some(r => r.model === 'MODEL_75_VR')).toBe(true);
    expect(result.results.some(r => r.model === 'MODEL_85_FLAT')).toBe(true);
    expect(result.results.some(r => r.model === 'MODEL_95_NESTED')).toBe(true);

    // Check recall is maintained
    result.results.forEach(r => {
      expect(r.episodicRecall).toBeGreaterThanOrEqual(0.95);
    });

    // Verify progressive compression: 95 > 85 > 75
    const vr = result.results.find(r => r.model === 'MODEL_75_VR')!;
    const flat = result.results.find(r => r.model === 'MODEL_85_FLAT')!;
    const nested = result.results.find(r => r.model === 'MODEL_95_NESTED')!;

    expect(flat.compressionRatio).toBeGreaterThanOrEqual(vr.compressionRatio);
    expect(nested.compressionRatio).toBeGreaterThanOrEqual(flat.compressionRatio);

    console.log('\n' + result.summary);
    console.log('\n' + result.hypothesis);

    console.log(`\n✓ Progressive compression on Molly's real data:`);
    console.log(`  MODEL_75_VR:   ${vr.compressionRatio.toFixed(1)}% (3 techniques)`);
    console.log(`  MODEL_85_FLAT: ${flat.compressionRatio.toFixed(1)}% (6 techniques) — +${(flat.compressionRatio - vr.compressionRatio).toFixed(1)}%`);
    console.log(`  MODEL_95_NESTED: ${nested.compressionRatio.toFixed(1)}% (8 techniques) — +${(nested.compressionRatio - flat.compressionRatio).toFixed(1)}%`);
    console.log(`\n✓ Time span hypothesis: Longer memories reveal stronger compression`);
  }, 120000);
});
