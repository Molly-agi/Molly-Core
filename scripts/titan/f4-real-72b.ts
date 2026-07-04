// scripts/titan/f4-real-72b.ts
//
// Real F4 acceptance gate for Qwen 2.5 72B crystal vault.
// Wires all components: vault integrity, 1D weight loading, tokenized corpus,
// runF4FullReport, and emits the F4 report JSON.
//
// Usage:
//   npx ts-node scripts/titan/f4-real-72b.ts \
//     --gguf models/qwen2.5-72b-q4_k.gguf \
//     --vault vault/qwen2.5-72b/ \
//     --reference-ppl 5.12
//
// Exit 0 = PASS, Exit 1 = FAIL

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { cpus } from 'os';
import { verifyVaultIntegrity } from '../../src/ai/inference/vault-verifier';
import {
  QWEN2_72B_CONFIG,
  loadGguf1DWeights,
  verifyGeometry,
} from '../../src/ai/inference/configs/qwen2-72b-config';
import {
  loadEvalCorpus,
  pinHashes,
} from '../../src/ai/inference/eval-corpus-loader';
import {
  runF4FullReport,
  type F4Report,
} from '../../src/ai/inference/f4-full-report';
import { QwenTokenizer } from '../../src/ai/inference/qwen-tokenizer';

// --- CLI args ---

function parseArgs(): {
  ggufPath: string;
  vaultDir: string;
  referencePpl: number;
  outputDir: string;
  maxHotLayers: number;
} {
  const args = process.argv.slice(2);
  let ggufPath = '';
  let vaultDir = '';
  let referencePpl = NaN;
  let outputDir = 'docs/benchmarks/reports';
  let maxHotLayers = 4;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--gguf':
        ggufPath = args[++i];
        break;
      case '--vault':
        vaultDir = args[++i];
        break;
      case '--reference-ppl':
        referencePpl = parseFloat(args[++i]);
        break;
      case '--output-dir':
        outputDir = args[++i];
        break;
      case '--max-hot-layers':
        maxHotLayers = parseInt(args[++i], 10);
        break;
    }
  }

  if (!ggufPath) {
    console.error('ERROR: --gguf <path> is required');
    process.exit(1);
  }
  if (!vaultDir) {
    console.error('ERROR: --vault <path> is required');
    process.exit(1);
  }
  if (isNaN(referencePpl)) {
    console.error('ERROR: --reference-ppl <number> is required');
    process.exit(1);
  }

  return {
    ggufPath: resolve(ggufPath),
    vaultDir: resolve(vaultDir),
    referencePpl,
    outputDir: resolve(outputDir),
    maxHotLayers,
  };
}

// --- Main ---

async function main(): Promise<void> {
  const config = parseArgs();
  const startTime = Date.now();

  console.log('=== F4 REAL EVAL — Qwen 2.5 72B Crystal Vault ===\n');
  console.log(`GGUF: ${config.ggufPath}`);
  console.log(`Vault: ${config.vaultDir}`);
  console.log(`Reference PPL: ${config.referencePpl}`);
  console.log(`Max hot layers: ${config.maxHotLayers}`);
  console.log('');

  // Step 1: Verify vault integrity (F4 Section 5)
  console.log('[1/6] Verifying vault integrity...');
  const integrity = await verifyVaultIntegrity(
    config.vaultDir,
    config.ggufPath
  );
  if (!integrity.valid) {
    console.error('ABORT: Vault integrity check FAILED');
    console.error('  Mismatches:', integrity.mismatches.join(', '));
    console.error('  Layers scanned:', integrity.layerCount);
    process.exit(1);
  }
  console.log(
    `  OK: ${integrity.layerCount} layers verified, GGUF SHA matches`
  );
  console.log(`  GGUF SHA-256: ${integrity.ggufSha256.substring(0, 16)}...`);

  // Step 2: Verify geometry matches GGUF metadata
  console.log('\n[2/6] Verifying model geometry...');
  verifyGeometry(config.ggufPath);
  console.log('  OK: All geometry fields match GGUF metadata');

  // Step 3: Load 1D weights from GGUF
  console.log('\n[3/6] Loading 1D weights from GGUF (norms + biases)...');
  const { layersNorm, layersBias, finalNorm } = loadGguf1DWeights(
    config.ggufPath
  );
  console.log(
    `  Loaded: ${layersNorm.length} layers of norms + biases + finalNorm`
  );

  // Step 4: Load tokenized eval corpus
  console.log('\n[4/6] Loading and tokenizing eval corpus...');
  const calibDir = join(process.cwd(), 'data/calibration');
  const corpus = loadEvalCorpus({
    tokenizerPath: join(calibDir, 'tokenizer.json'),
    wikiTextTestPath: join(calibDir, 'wikitext2-test.txt'),
    wikiTextTrainPath: join(calibDir, 'wikitext2-train.txt'),
  });
  const pins = pinHashes(corpus);
  console.log(`  Eval tokens: ${pins.evalTokenCount} (30 windows x 2048)`);
  console.log(
    `  Calibration tokens: ${pins.calibrationTokenCount} (128 x 2048)`
  );
  console.log(`  Eval SHA-256: ${pins.evalSetSha256.substring(0, 16)}...`);
  console.log(
    `  Calibration SHA-256: ${pins.calibrationSetSha256.substring(0, 16)}...`
  );
  console.log(`  Vocab size: ${pins.vocabSize}`);

  // Step 5: Prepare tokenizer for needle probe encode/decode
  console.log('\n[5/6] Preparing tokenizer for needle probe...');
  const tokenizer = new QwenTokenizer(join(calibDir, 'tokenizer.json'));
  const encode = (text: string) => tokenizer.encode(text);
  const decode = (ids: number[]) => tokenizer.decode(ids);
  const newlineTokenId = tokenizer.encode('\n')[0] ?? 10;
  console.log(`  Newline token ID: ${newlineTokenId}`);

  // Step 6: Run full F4 report
  console.log('\n[6/6] Running F4 full evaluation...');
  console.log('  This will take a long time on 72B. Progress below:\n');

  const workerCount = Math.max(1, cpus().length - 1);
  console.log(`  Parallel eval: ${workerCount} workers`);

  const report: F4Report = await runF4FullReport({
    modelId: 'qwen2.5-72b',
    modelSize: '7B+',
    sourceGgufSha256: integrity.ggufSha256,
    evalSetSha256: pins.evalSetSha256,
    calibrationSetSha256: pins.calibrationSetSha256,
    vaultDir: config.vaultDir,
    driverConfig: QWEN2_72B_CONFIG,
    layersNorm,
    layersBias,
    finalNorm,
    evalTokenIds: Array.from(corpus.evalTokenIds),
    referencePpl: config.referencePpl,
    haystackTokenIds: Array.from(corpus.calibrationTokenIds),
    encode,
    decode,
    newlineTokenId,
    maxHotLayers: config.maxHotLayers,
    parallel: true,
    parallelWorkers: workerCount,
    onProgress: (phase, detail) => {
      process.stdout.write(`  [${phase}] ${detail}\r`);
    },
  });

  // Write report
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }
  const timestamp = report.timestamp.replace(/[:.]/g, '-');
  const reportFilename = `F4_EVAL_qwen2.5-72b_${timestamp}.json`;
  const reportPath = join(config.outputDir, reportFilename);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n\n' + '='.repeat(60));
  console.log(`F4 EVALUATION COMPLETE — ${elapsed}s elapsed`);
  console.log('='.repeat(60));
  console.log('');
  console.log(`  Verdict: ${report.verdict}`);
  console.log(`  PPL (compressed): ${report.perplexity.compressed.toFixed(4)}`);
  console.log(`  PPL (reference):  ${report.perplexity.reference.toFixed(4)}`);
  console.log(`  PPL ratio:        ${report.perplexity.ratio.toFixed(4)}`);
  console.log(`  KL mean:          ${report.klDivergence.mean.toFixed(6)}`);
  console.log(`  KL max:           ${report.klDivergence.max.toFixed(6)}`);
  console.log(`  KL p95:           ${report.klDivergence.p95.toFixed(6)}`);
  console.log(
    `  Final-logit KL:   ${report.klDivergence.finalLogit.toFixed(6)}`
  );
  console.log(`  Worst layer:      ${report.klDivergence.worstLayerName}`);
  console.log('');
  console.log('  Needle probe:');
  for (const d of report.needleProbe.depths) {
    const base =
      d.baselineAccuracy != null
        ? ` (baseline: ${(d.baselineAccuracy * 100).toFixed(1)}%)`
        : '';
    const delta = d.delta != null ? ` Δ=${(d.delta * 100).toFixed(1)}pt` : '';
    console.log(
      `    ${d.contextDepth} tokens: ${(d.accuracy * 100).toFixed(1)}%${base}${delta}`
    );
  }
  console.log('');
  console.log(
    `  Tier 0 PPL sanity: ${report.tier0.pplSanity ? 'PASS' : 'FAIL'}`
  );
  console.log(
    `  Tier 0 coherence:  ${report.tier0.coherencePass ? 'PASS' : 'FAIL'}`
  );
  console.log('');

  if (report.failures.length > 0) {
    console.log('  FAILURES:');
    for (const f of report.failures) {
      console.log(`    - ${f}`);
    }
    console.log('');
  }

  console.log(`  Report written: ${reportPath}`);
  console.log('');

  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
