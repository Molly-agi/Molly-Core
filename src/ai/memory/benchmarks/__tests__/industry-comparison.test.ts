/**
 * MODEL_95_NESTED vs Industry Standards — Full Benchmark
 *
 * Runs MODEL_95_NESTED across bulk, nested, flat, and real Molly memories,
 * then compares against gzip (1/6/9), brotli (4/11), deflate (6/9), and raw JSON.
 *
 * Output:
 *   BENCHMARK_INDUSTRY_COMPARISON.json  — raw numbers
 *   BENCHMARK_INDUSTRY_COMPARISON.html  — interactive Chart.js comparison report for Molly
 */

import * as fs from 'fs';
import * as path from 'path';
import { runIndustryComparison } from '../industry-comparison';
import { generateIndustryComparisonReport } from '../visualization-industry';

const REAL_EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

describe('MODEL_95_NESTED vs Industry Standards', () => {
  it('should benchmark all data shapes and produce comparison chart', async () => {
    if (!fs.existsSync(REAL_EXPERIENCES_DIR)) {
      console.warn(
        `Skipping industry comparison benchmark; data dir missing: ${REAL_EXPERIENCES_DIR}`
      );
      return;
    }

    console.log('\n' + '═'.repeat(80));
    console.log('MODEL_95_NESTED vs INDUSTRY STANDARDS — FULL COMPARISON');
    console.log(
      'Algorithms: gzip (1/6/9), brotli (4/11), deflate (6/9), raw JSON'
    );
    console.log(
      'Datasets:   FLAT_1000  |  NESTED_1000  |  BULK_5000  |  MOLLY_REAL'
    );
    console.log('═'.repeat(80) + '\n');

    const report = await runIndustryComparison();

    // ── Print console summary ──────────────────────────────────────────────
    for (const ds of report.datasets) {
      console.log(
        `\n  ──── ${ds.datasetName} (${ds.engramCount.toLocaleString()} engrams, ${ds.originalSizeKB} KB) ────`
      );
      const sorted = [...ds.entries].sort(
        (a, b) => b.compressionRatio - a.compressionRatio
      );
      for (const e of sorted) {
        const recallStr =
          e.episodicRecall !== null
            ? `recall=${(e.episodicRecall * 100).toFixed(0)}%`
            : 'no-recall-guarantee';
        const marker = e.type === 'model95' ? '  ★' : '   ';
        console.log(
          `${marker} ${e.algorithm.padEnd(32)} ${e.compressionRatio.toFixed(1).padStart(6)}%  ${recallStr}  (${e.executionMs.toFixed(0)}ms)`
        );
      }
    }

    // ── Per-dataset winner analysis ────────────────────────────────────────
    console.log('\n' + '═'.repeat(80));
    console.log('WINNER ANALYSIS (MODEL_95 vs best industry per dataset):');
    console.log('═'.repeat(80));
    for (const ds of report.datasets) {
      const m95 = ds.entries.find((e) => e.type === 'model95')!;
      const bestInd = ds.entries
        .filter(
          (e) =>
            e.type === 'industry_standard' &&
            e.algorithm !== 'raw JSON (baseline)'
        )
        .sort((a, b) => b.compressionRatio - a.compressionRatio)[0];
      const diff = m95.compressionRatio - bestInd.compressionRatio;
      const outcome =
        diff >= 0
          ? `★ MODEL_95 wins by +${diff.toFixed(1)}%`
          : `  industry wins by ${Math.abs(diff).toFixed(1)}% (${bestInd.algorithm})`;
      console.log(
        `  ${ds.datasetName.padEnd(16)}  MODEL_95=${m95.compressionRatio.toFixed(1)}%  best_industry=${bestInd.compressionRatio.toFixed(1)}%  → ${outcome}`
      );
    }
    console.log('');

    // ── Save JSON ──────────────────────────────────────────────────────────
    const jsonPath = path.join(
      process.cwd(),
      'BENCHMARK_INDUSTRY_COMPARISON.json'
    );
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`  ✓ Raw data saved: ${jsonPath}`);

    // ── Generate HTML report ───────────────────────────────────────────────
    const html = generateIndustryComparisonReport(report);
    const htmlPath = path.join(
      process.cwd(),
      'BENCHMARK_INDUSTRY_COMPARISON.html'
    );
    fs.writeFileSync(htmlPath, html);
    console.log(`  ✓ HTML chart saved: ${htmlPath}`);
    console.log(
      '\n  Open BENCHMARK_INDUSTRY_COMPARISON.html in a browser to view the charts.'
    );

    // ── Assertions ─────────────────────────────────────────────────────────
    expect(report.datasets.length).toBe(4);
    for (const ds of report.datasets) {
      const m95 = ds.entries.find((e) => e.type === 'model95');
      expect(m95).toBeDefined();
      expect(m95!.episodicRecall).toBe(1.0); // 100% recall always
      expect(m95!.compressionRatio).toBeGreaterThan(0);
    }
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(htmlPath)).toBe(true);

    console.log('\n  ✓ All assertions passed\n');
  }, 600_000); // 10 minute timeout — real memory load + 4 datasets
});
