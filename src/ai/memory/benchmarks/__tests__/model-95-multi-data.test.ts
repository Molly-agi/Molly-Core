/**
 * MODEL_95_NESTED Multi-Data Benchmark Test
 * Runs the 95 model against three distinct data workloads:
 *   1. Fat/Nested AI Memory (complex, personality-rich)
 *   2. VR Gaming Data (lightweight, telemetry-focused)
 *   3. Generic Bulk Data (heterogeneous storage data)
 */

import { runModel95MultiDataBenchmark } from '../model-95-multi-data';

describe('MODEL_95_NESTED Multi-Data Benchmark', () => {
  it('should compress fat AI memory to 50%+ with 95%+ recall', async () => {
    const result = await runModel95MultiDataBenchmark(1000);
    const fatMemoryResult = result.results.find(r => r.dataType === 'FAT_AI_MEMORY');

    expect(fatMemoryResult).toBeDefined();
    expect(fatMemoryResult!.compressionRatio).toBeGreaterThanOrEqual(50);
    expect(fatMemoryResult!.episodicRecall).toBeGreaterThanOrEqual(0.95);
    expect(fatMemoryResult!.passed).toBe(true);

    console.log('\n✓ Fat AI Memory Test PASSED');
    console.log(`  Compression: ${fatMemoryResult!.compressionRatio.toFixed(1)}%`);
    console.log(`  Recall: ${(fatMemoryResult!.episodicRecall * 100).toFixed(1)}%`);
  });

  it('should compress VR gameplay data to 50%+ with 95%+ recall', async () => {
    const result = await runModel95MultiDataBenchmark(1000);
    const vrResult = result.results.find(r => r.dataType === 'VR_GAMEPLAY');

    expect(vrResult).toBeDefined();
    expect(vrResult!.compressionRatio).toBeGreaterThanOrEqual(50);
    expect(vrResult!.episodicRecall).toBeGreaterThanOrEqual(0.95);
    expect(vrResult!.passed).toBe(true);

    console.log('\n✓ VR Gameplay Data Test PASSED');
    console.log(`  Compression: ${vrResult!.compressionRatio.toFixed(1)}%`);
    console.log(`  Recall: ${(vrResult!.episodicRecall * 100).toFixed(1)}%`);
  });

  it('should compress generic bulk data to 50%+ with 95%+ recall', async () => {
    const result = await runModel95MultiDataBenchmark(1000);
    const bulkResult = result.results.find(r => r.dataType === 'GENERIC_BULK');

    expect(bulkResult).toBeDefined();
    expect(bulkResult!.compressionRatio).toBeGreaterThanOrEqual(50);
    expect(bulkResult!.episodicRecall).toBeGreaterThanOrEqual(0.95);
    expect(bulkResult!.passed).toBe(true);

    console.log('\n✓ Generic Bulk Data Test PASSED');
    console.log(`  Compression: ${bulkResult!.compressionRatio.toFixed(1)}%`);
    console.log(`  Recall: ${(bulkResult!.episodicRecall * 100).toFixed(1)}%`);
  });

  it('should maintain performance across all three data types', async () => {
    const result = await runModel95MultiDataBenchmark(1000);

    expect(result.results.length).toBe(3);
    expect(result.results.every(r => r.passed)).toBe(true);

    console.log('\n' + result.summary);
  });
});
