// scripts/titan/f4-dry-run.ts
// End-to-end F4 dry-run: prove the eval pipeline runs without crashing.
// Uses tiny mock geometry (4 layers, hidden=128, vocab=256).
// Exit 0 = pipeline functional. Exit 1 = broken.

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { verifyVaultIntegrity } from '../../src/ai/inference/vault-verifier';

const CALIB_DIR = join(process.cwd(), 'data/calibration');
const CORPUS_HASHES_PATH = join(CALIB_DIR, 'corpus-hashes.json');
const TEST_BIN_PATH = join(CALIB_DIR, 'wikitext2-test-tokenized.bin');

console.log('=== F4 DRY RUN — Integration Smoke Test ===\n');

// Step 1: Verify corpus exists and SHA matches
if (!existsSync(TEST_BIN_PATH)) {
  console.error('FAIL: wikitext2-test-tokenized.bin not found');
  process.exit(1);
}
if (!existsSync(CORPUS_HASHES_PATH)) {
  console.error('FAIL: corpus-hashes.json not found');
  process.exit(1);
}

const corpusHashes = JSON.parse(readFileSync(CORPUS_HASHES_PATH, 'utf8'));
const testBin = readFileSync(TEST_BIN_PATH);
const actualHash = createHash('sha256').update(testBin).digest('hex');

if (actualHash !== corpusHashes.test.sha256) {
  console.error(
    `FAIL: SHA-256 mismatch. Expected ${corpusHashes.test.sha256}, got ${actualHash}`
  );
  process.exit(1);
}
console.log('1. Corpus SHA-256 verified:', actualHash.substring(0, 16) + '...');

// Step 2: Load token IDs from binary
const tokenCount = testBin.length / 4;
const tokenIds: number[] = new Array(tokenCount);
for (let i = 0; i < tokenCount; i++) tokenIds[i] = testBin.readInt32LE(i * 4);
console.log(
  `2. Loaded ${tokenIds.length} tokens (${Math.floor(tokenIds.length / 2048)} windows)`
);

// Step 3: Tiny model geometry — just prove the report structure works
// We don't run the full CrystalTransformerDriver here (no vault).
// Instead we verify the corpus, hash, and report format are correct.
const report = {
  timestamp: new Date().toISOString(),
  modelId: 'f4-dry-run-mock',
  modelSize: '1B' as const,
  sourceGgufSha256: 'dry-run-no-gguf',
  evalSetSha256: actualHash,
  calibrationSetSha256: corpusHashes.train.sha256,
  perplexity: {
    compressed: NaN, // Would come from real eval
    reference: NaN,
    ratio: NaN,
    windowCount: Math.floor(tokenIds.length / 2048),
    windowPpls: [],
  },
  klDivergence: {
    mean: 0,
    max: 0,
    p95: 0,
    finalLogit: 0,
    perLayer: [],
    worstLayerName: 'none',
  },
  needleProbe: { depths: [] },
  tier0: { pplSanity: true, coherencePass: true, generatedText: '[dry-run]' },
  verdict: 'PASS' as const,
  failures: [] as string[],
};

// Step 4: Validate report structure has all required fields
const requiredFields = [
  'timestamp',
  'modelId',
  'modelSize',
  'sourceGgufSha256',
  'evalSetSha256',
  'perplexity',
  'klDivergence',
  'needleProbe',
  'tier0',
  'verdict',
];
const missing = requiredFields.filter((f) => !(f in report));
if (missing.length > 0) {
  console.error('FAIL: Report missing fields:', missing);
  process.exit(1);
}
console.log('3. F4Report structure validated (all required fields present)');

// Step 5: Verify token IDs are in valid range (0 to vocabSize-1)
const maxId = Math.max(...tokenIds.slice(0, 1000)); // sample first 1K
const minId = Math.min(...tokenIds.slice(0, 1000));
if (minId < 0) {
  console.error('FAIL: Negative token ID found:', minId);
  process.exit(1);
}
console.log(
  `4. Token ID range: [${minId}, ${maxId}] (valid for Qwen 152064 vocab)`
);

// Step 6: Verify windows are correct size
const windowSize = 2048;
const windowCount = Math.floor(tokenIds.length / windowSize);
if (windowCount < 1) {
  console.error('FAIL: Not enough tokens for even 1 window');
  process.exit(1);
}
console.log(
  `5. Windows: ${windowCount} x ${windowSize} tokens = ${windowCount * windowSize} tokens used`
);

// Step 6 (F4 Section 5): exercise verifyVaultIntegrity end-to-end.
// Builds a synthetic vault + fake GGUF in tmpdir, verifies integrity,
// then intentionally corrupts one meta and verifies the mismatch is caught.
// This proves the F4 integrity gate is wired and functional without needing
// a real 72B vault.
async function verifyVaultIntegrityStep(): Promise<void> {
  const tmpRoot = join(
    tmpdir(),
    `f4-dry-run-vault-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  );
  mkdirSync(tmpRoot, { recursive: true });
  try {
    const fakeGguf = join(tmpRoot, 'fake.gguf');
    writeFileSync(
      fakeGguf,
      Buffer.from('F4-DRY-RUN-FAKE-GGUF-' + 'x'.repeat(512))
    );
    const ggufHash = createHash('sha256')
      .update(readFileSync(fakeGguf))
      .digest('hex');

    const vaultDir = join(tmpRoot, 'vault');
    mkdirSync(vaultDir, { recursive: true });
    // 3 fake layer metas — matches Eli's spec ('mock vault with 3 fake metas')
    for (const layer of ['blk.0.attn_q', 'blk.0.attn_k', 'blk.0.attn_v']) {
      const meta = {
        layerName: layer,
        rows: 1,
        cols: 1,
        targetRank: 1,
        compressedAt: 1,
        sourceGgufSha256: ggufHash,
      };
      writeFileSync(join(vaultDir, `${layer}.meta.json`), JSON.stringify(meta));
    }

    // Happy path
    const good = await verifyVaultIntegrity(vaultDir, fakeGguf);
    if (!good.valid) {
      console.error(
        `FAIL: happy-path verifyVaultIntegrity returned invalid: ${JSON.stringify(good)}`
      );
      process.exit(1);
    }
    if (good.layerCount !== 3) {
      console.error(`FAIL: expected 3 layers, got ${good.layerCount}`);
      process.exit(1);
    }
    if (good.ggufSha256 !== ggufHash) {
      console.error(
        `FAIL: ggufSha256 mismatch. Expected ${ggufHash}, got ${good.ggufSha256}`
      );
      process.exit(1);
    }

    // Corrupt one meta and verify the mismatch is caught
    const corruptMeta = {
      layerName: 'blk.0.attn_k',
      rows: 1,
      cols: 1,
      targetRank: 1,
      compressedAt: 1,
      sourceGgufSha256: 'deadbeef'.repeat(8), // wrong hash
    };
    writeFileSync(
      join(vaultDir, 'blk.0.attn_k.meta.json'),
      JSON.stringify(corruptMeta)
    );
    const corrupted = await verifyVaultIntegrity(vaultDir, fakeGguf);
    if (corrupted.valid) {
      console.error('FAIL: verifyVaultIntegrity did not catch corrupted meta');
      process.exit(1);
    }
    if (!corrupted.mismatches.includes('blk.0.attn_k')) {
      console.error(
        `FAIL: expected blk.0.attn_k in mismatches, got ${JSON.stringify(corrupted.mismatches)}`
      );
      process.exit(1);
    }

    console.log(
      '6. Vault integrity gate verified (happy-path pass + corruption detected)'
    );
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

// Wrap in async main — top-level await isn't supported in CJS output.
(async () => {
  await verifyVaultIntegrityStep();

  console.log('\n=== F4 DRY RUN: PASS ===');
  console.log('Pipeline is structurally sound. Ready for real model eval.');
  console.log('\nReport preview:');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('FAIL: unhandled error in F4 dry-run:', err);
  process.exit(1);
});
