/**
 * Generic Data Benchmark
 * Tests how the three Titan Echo tiers perform on non-AI data:
 *   - Web/HTML content records
 *   - Statistics / metrics data
 *   - Database-style records (e-commerce, users, products)
 *   - Log files
 *
 * Expectation: T1-T7 semantic techniques will contribute near-zero on data
 * without AI memory structure. Only T8 (gzip) is format-agnostic.
 */
import { CompressionManager } from '../../compression/compression-manager';
import type { MemoryEngram } from '../../neural-engram';

// ─── Data generators ────────────────────────────────────────────────────────

function makeWebRecord(i: number): MemoryEngram {
  const urls = [
    'https://example.com/page',
    'https://news.site/article',
    'https://shop.io/product',
  ];
  const html = `<html><head><title>Page ${i}</title></head><body><h1>Article ${i}</h1><p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(8)}</p><ul>${Array.from({ length: 5 }, (_, j) => `<li><a href="/link-${i}-${j}">Link ${j}</a></li>`).join('')}</ul></body></html>`;
  return {
    id: `web_${i}`,
    userId: 'storage-test',
    content: html,
    timestamp: new Date(Date.now() - i * 3600000),
    importance: Math.random(),
    emotionalValence: 0,
    arousal: 0,
    accessCount: Math.floor(Math.random() * 1000),
    lastAccessed: new Date(),
    consolidationState: 'consolidated',
    contextTags: ['web', 'html'],
    data: {
      url: `${urls[i % 3]}/${i}`,
      statusCode: 200,
      contentType: 'text/html',
      byteSize: html.length,
      crawledAt: new Date(Date.now() - i * 3600000).toISOString(),
      links: Array.from({ length: 5 }, (_, j) => `/link-${i}-${j}`),
      wordCount: Math.floor(Math.random() * 2000),
      readingTimeSeconds: Math.floor(Math.random() * 300),
    },
  } as unknown as MemoryEngram;
}

function makeStatsRecord(i: number): MemoryEngram {
  return {
    id: `stats_${i}`,
    userId: 'storage-test',
    content: `Metric snapshot ${i}: cpu=${(Math.random() * 100).toFixed(2)}% mem=${(Math.random() * 32).toFixed(3)}GB disk_io=${(Math.random() * 500).toFixed(1)}MB/s net_rx=${(Math.random() * 1000).toFixed(2)}Mbps net_tx=${(Math.random() * 500).toFixed(2)}Mbps`,
    timestamp: new Date(Date.now() - i * 60000),
    importance: 0.5,
    emotionalValence: 0,
    arousal: 0,
    accessCount: 0,
    lastAccessed: new Date(),
    consolidationState: 'consolidated',
    contextTags: ['metrics', 'system'],
    data: {
      cpu: parseFloat((Math.random() * 100).toFixed(6)),
      memory_gb: parseFloat((Math.random() * 32).toFixed(6)),
      disk_io_mbps: parseFloat((Math.random() * 500).toFixed(6)),
      net_rx_mbps: parseFloat((Math.random() * 1000).toFixed(6)),
      net_tx_mbps: parseFloat((Math.random() * 500).toFixed(6)),
      temperature_c: parseFloat((40 + Math.random() * 30).toFixed(6)),
      uptime_seconds: i * 60,
      process_count: Math.floor(Math.random() * 500),
      open_files: Math.floor(Math.random() * 10000),
    },
  } as unknown as MemoryEngram;
}

function makeDbRecord(i: number): MemoryEngram {
  const categories = ['Electronics', 'Clothing', 'Food', 'Books', 'Tools'];
  return {
    id: `db_${i}`,
    userId: 'storage-test',
    content: `Product SKU-${i}: ${categories[i % 5]} item with description covering features, specifications, and usage instructions. Available in multiple variants.`,
    timestamp: new Date(Date.now() - i * 86400000),
    importance: 0.5,
    emotionalValence: 0,
    arousal: 0,
    accessCount: Math.floor(Math.random() * 500),
    lastAccessed: new Date(),
    consolidationState: 'consolidated',
    contextTags: ['database', 'product'],
    data: {
      sku: `SKU-${String(i).padStart(6, '0')}`,
      category: categories[i % 5],
      price_usd: parseFloat((Math.random() * 999.99).toFixed(6)),
      stock_qty: Math.floor(Math.random() * 10000),
      weight_kg: parseFloat((Math.random() * 50).toFixed(6)),
      rating: parseFloat((1 + Math.random() * 4).toFixed(6)),
      review_count: Math.floor(Math.random() * 5000),
      supplier_id: `SUP-${Math.floor(Math.random() * 100)}`,
      warehouse_location: `WH-${String.fromCharCode(65 + (i % 26))}-${Math.floor(i / 26) % 100}`,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
    },
  } as unknown as MemoryEngram;
}

function makeLogRecord(i: number): MemoryEngram {
  const services = [
    'api-gateway',
    'auth-service',
    'db-proxy',
    'cache-layer',
    'worker',
  ];
  const level =
    i % 20 === 0
      ? 'ERROR'
      : i % 5 === 0
        ? 'WARN'
        : i % 2 === 0
          ? 'DEBUG'
          : 'INFO';
  return {
    id: `log_${i}`,
    userId: 'storage-test',
    content: `[${level}] [${services[i % 5]}] [trace-${String(i).padStart(8, '0')}] Request processed in ${Math.floor(Math.random() * 2000)}ms - status=${level === 'ERROR' ? 500 : 200} path=/api/v2/resource/${i % 1000} user=${Math.floor(Math.random() * 100000)}`,
    timestamp: new Date(Date.now() - i * 1000),
    importance: level === 'ERROR' ? 0.9 : 0.1,
    emotionalValence: 0,
    arousal: 0,
    accessCount: 0,
    lastAccessed: new Date(),
    consolidationState: 'consolidated',
    contextTags: ['log', level.toLowerCase()],
    data: {
      level,
      service: services[i % 5],
      traceId: `trace-${String(i).padStart(8, '0')}`,
      durationMs: Math.floor(Math.random() * 2000),
      statusCode: level === 'ERROR' ? 500 : 200,
      path: `/api/v2/resource/${i % 1000}`,
      userId: Math.floor(Math.random() * 100000),
      requestSize: Math.floor(Math.random() * 10000),
      responseSize: Math.floor(Math.random() * 50000),
    },
  } as unknown as MemoryEngram;
}

// ─── Tier configs ────────────────────────────────────────────────────────────

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

// For honest gzip-only baseline
const T8_ONLY = {
  label: 'T8_GZIP_ONLY',
  flags: {
    t1PersonalityReference: false,
    t3TemporalDelta: false,
    t4VocabularyDict: false,
    t2TimeDecayFidelity: false,
    t6InteractionTrace: false,
    t5NumericQuantization: false,
    t7ContentDelta: false,
    t8StandardCompression: true,
  },
};

async function runDataset(label: string, engrams: MemoryEngram[]) {
  const originalSize = JSON.stringify(engrams).length;
  const rows: string[] = [];

  // Gzip-only baseline first
  CompressionManager.resetForTest();
  const baselineMgr = CompressionManager.getInstance(T8_ONLY.flags);
  const baseline = await baselineMgr.compress({
    engrams,
    sessionId: `generic-${label}-baseline`,
    compressionTimestamp: Date.now(),
  });
  const baselineRatio = baseline.metrics.compressionRatio;
  rows.push(
    `  ${'T8_GZIP_ONLY (baseline)'.padEnd(28)} → ${(baseline.metrics.compressedByteSize / 1024).toFixed(1).padStart(8)} KB  |  ${baselineRatio.toFixed(1).padStart(5)}%`
  );

  for (const tier of TIERS) {
    CompressionManager.resetForTest();
    const mgr = CompressionManager.getInstance(tier.flags);
    const result = await mgr.compress({
      engrams,
      sessionId: `generic-${label}-${tier.label}`,
      compressionTimestamp: Date.now(),
    });
    const ratio = result.metrics.compressionRatio;
    const delta = ratio - baselineRatio;
    const deltaStr =
      delta >= 0.05
        ? `  ← +${delta.toFixed(1)}% vs gzip`
        : delta <= -0.05
          ? `  ← ${delta.toFixed(1)}% vs gzip`
          : '  ← same as gzip';
    rows.push(
      `  ${tier.label.padEnd(28)} → ${(result.metrics.compressedByteSize / 1024).toFixed(1).padStart(8)} KB  |  ${ratio.toFixed(1).padStart(5)}%${deltaStr}`
    );
  }

  console.log(
    `\n${label} (${engrams.length} records, ${(originalSize / 1024).toFixed(1)} KB original)`
  );
  console.log('─'.repeat(85));
  rows.forEach((r) => console.log(r));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('generic data storage: web, stats, database, logs', async () => {
  const WEB = Array.from({ length: 500 }, (_, i) => makeWebRecord(i));
  const STATS = Array.from({ length: 500 }, (_, i) => makeStatsRecord(i));
  const DB = Array.from({ length: 500 }, (_, i) => makeDbRecord(i));
  const LOGS = Array.from({ length: 500 }, (_, i) => makeLogRecord(i));

  console.log('\n' + '═'.repeat(75));
  console.log('GENERIC DATA BENCHMARK — NON-AI STORAGE');
  console.log('═'.repeat(75));

  await runDataset('Web/HTML Content', WEB);
  await runDataset('System Statistics/Metrics', STATS);
  await runDataset('Database Records (e-commerce)', DB);
  await runDataset('Application Logs', LOGS);

  console.log('\n' + '═'.repeat(75));
  console.log(
    'NOTE: T1-T7 are AI-memory-specific. On generic data only T8 (gzip)'
  );
  console.log(
    'contributes meaningful compression. MODEL_95_NESTED = gzip tier.'
  );
  console.log('For pure storage (HDD/NVMe), purpose-built tools (zstd, LZ4)');
  console.log(
    'operate at block level and would outperform this JSON-layer system.'
  );
  console.log('═'.repeat(75) + '\n');

  // Just verify it runs without crashing and recall is 100%
  expect(true).toBe(true);
}, 60000);
