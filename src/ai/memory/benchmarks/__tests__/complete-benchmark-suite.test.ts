/**
 * Complete Benchmark Suite with Visualization
 * Runs multi-data, bulk-data, and real-data tests — generates comparison graphs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runModel95MultiDataBenchmark } from '../model-95-multi-data';
import { runBulkDataBenchmark } from '../bulk-data-benchmark';
import { runRealDataBenchmark } from '../real-data-benchmark';
import { generateBenchmarkReport, type ChartData } from '../visualization';

const REAL_EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

describe('Complete MODEL_95_NESTED Benchmark Suite with Graphs', () => {
  it('should run all benchmarks and generate comparison report with charts', async () => {
    if (!fs.existsSync(REAL_EXPERIENCES_DIR)) {
      console.warn(
        `Skipping complete benchmark suite; data dir missing: ${REAL_EXPERIENCES_DIR}`
      );
      return;
    }

    console.log('\n🚀 Starting complete benchmark suite...\n');

    // PHASE 1: Synthetic multi-data test
    console.log('═'.repeat(80));
    console.log(
      'PHASE 1: MULTI-DATA BENCHMARK (synthetic — fat AI, VR, generic)'
    );
    console.log('═'.repeat(80) + '\n');
    const multiDataResult = await runModel95MultiDataBenchmark(1000);

    // PHASE 2: Bulk simulation test
    console.log('\n═'.repeat(80));
    console.log('PHASE 2: BULK DATA BENCHMARK (30-60 day simulation)');
    console.log('═'.repeat(80) + '\n');
    const bulkDataResult = await runBulkDataBenchmark();

    // PHASE 3: Real data — zero synthetic
    console.log('\n═'.repeat(80));
    console.log(
      "PHASE 3: REAL DATA BENCHMARK (Molly's memories + MMLU + docs + logs)"
    );
    console.log('═'.repeat(80) + '\n');
    const realDataResult = await runRealDataBenchmark();

    // Prepare chart data
    const multiDataChartData: ChartData[] = multiDataResult.results.map(
      (r) => ({
        testName: 'Multi-Data',
        dataType: r.dataType,
        compressionRatio: r.compressionRatio,
        episodicRecall: r.episodicRecall,
        originalSizeKB: r.originalSizeKB,
        compressedSizeKB: r.compressedSizeKB,
        executionTimeMs: r.executionTimeMs,
      })
    );

    const bulkDataChartData: ChartData[] = bulkDataResult.results.map((r) => ({
      testName: 'Bulk Data',
      dataType: r.dataType,
      compressionRatio: r.compressionRatio,
      episodicRecall: r.episodicRecall,
      originalSizeKB: r.originalSizeKB,
      compressedSizeKB: r.compressedSizeKB,
      executionTimeMs: r.executionTimeMs,
      metricsPerSecond: r.metricsPerSecond,
    }));

    const realDataChartData: ChartData[] = realDataResult.results.map((r) => ({
      testName: 'Real Data',
      dataType: r.dataType,
      compressionRatio: r.compressionRatio,
      episodicRecall: r.episodicRecall,
      originalSizeKB: r.originalSizeKB,
      compressedSizeKB: r.compressedSizeKB,
      executionTimeMs: r.executionTimeMs,
    }));

    // Generate HTML report with all three test groups
    const htmlReport = generateBenchmarkReport(
      multiDataChartData,
      bulkDataChartData,
      new Date().toISOString(),
      realDataChartData
    );

    // Save report
    const reportPath = path.join(
      process.cwd(),
      'BENCHMARK_REPORT_MODEL_95.html'
    );
    fs.writeFileSync(reportPath, htmlReport);
    console.log(`\n✓ Report generated: ${reportPath}`);

    // Save raw JSON for analysis
    const jsonPath = path.join(process.cwd(), 'BENCHMARK_DATA_MODEL_95.json');
    const allResults = [
      ...multiDataResult.results,
      ...bulkDataResult.results,
      ...realDataResult.results,
    ];
    const jsonData = {
      timestamp: new Date().toISOString(),
      model: 'MODEL_95_NESTED',
      multiData: multiDataResult.results,
      bulkData: bulkDataResult.results,
      realData: realDataResult.results,
      summary: {
        multiDataAvgCompression: (
          multiDataResult.results.reduce((a, r) => a + r.compressionRatio, 0) /
          multiDataResult.results.length
        ).toFixed(1),
        bulkDataAvgCompression: (
          bulkDataResult.results.reduce((a, r) => a + r.compressionRatio, 0) /
          bulkDataResult.results.length
        ).toFixed(1),
        realDataAvgCompression: (
          realDataResult.results.reduce((a, r) => a + r.compressionRatio, 0) /
          realDataResult.results.length
        ).toFixed(1),
        overallAvgCompression: (
          allResults.reduce((a, r) => a + r.compressionRatio, 0) /
          allResults.length
        ).toFixed(1),
        allTestsPassed: allResults.every((r) => r.passed),
        mollyRealMemoryResult: realDataResult.results.find(
          (r) => r.dataType === 'MOLLY_REAL_MEMORIES'
        ),
      },
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(`✓ Raw data saved: ${jsonPath}\n`);

    // Log summary
    console.log('\n' + '═'.repeat(80));
    console.log('COMPLETE SUITE SUMMARY');
    console.log('═'.repeat(80));
    console.log(multiDataResult.summary);
    console.log('\n' + bulkDataResult.summary);
    console.log('\n' + realDataResult.summary);

    // Assertions
    expect(multiDataResult.results.every((r) => r.passed)).toBe(true);
    expect(bulkDataResult.results.every((r) => r.passed)).toBe(true);
    expect(realDataResult.results.every((r) => r.passed)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(true);

    console.log(
      "\n✓ All three phases passed — chart includes Molly's real memory numbers\n"
    );
  }, 900000); // 15 minute timeout — real data adds processing time
});
