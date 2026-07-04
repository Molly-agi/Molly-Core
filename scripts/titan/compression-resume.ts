#!/usr/bin/env -S npx tsx
// scripts/titan/compression-resume.ts
//
// Assignment: Partial vault health check + compression resume script.
// Assigned by Eli via family bridge msg_1783208658412_ryocqg (2026-07-04 23:44).
//
// Purpose:
//   1. Scan an existing crystal vault and inventory present vs missing layers.
//   2. Verify metadata consistency (all metas parse, required fields present).
//   3. If a GGUF is supplied, resume compression on ONLY the missing layers,
//      re-using streamingCompress with a filter that rejects already-present
//      tensors. No layer is ever re-compressed.
//   4. Estimate wall-clock + disk cost for the remaining work.
//
// Default mode is DRY RUN: scan + report only. Compression is only invoked
// when --gguf <path> is supplied AND --execute is passed.
//
// CLI:
//   npx tsx scripts/titan/compression-resume.ts \
//     --vault data/titan-crystals-72b \
//     [--expected-layers 80] [--json]
//     [--gguf models/qwen2.5-72b-q4_k.gguf --execute]

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

// ---------- Types ----------

export interface LayerMetadata {
  layerName: string;
  rows: number;
  cols: number;
  targetRank?: number;
  scaleB?: number;
  compressedAt?: number;
  rhtSeed?: number;
  rhtPaddedCols?: number;
  /**
   * Provenance fields we EXPECT for a v2 vault (F1/F4 requirement).
   * Not present in the current layer-0-30 vault — flagged as a consistency
   * gap by verifyVaultMetadata().
   */
  sourceGgufSha256?: string;
  compressionPath?: string;
}

export interface VaultGaps {
  /** Layer indices whose full tensor set is present. */
  present: number[];
  /** Layer indices missing at least one tensor (relative to expectedLayers). */
  missing: number[];
  /** true iff missing.length === 0. */
  complete: boolean;
  /** Detailed per-layer tensor coverage (layer -> set of tensor stems). */
  tensorCoverage: Map<number, Set<string>>;
  /** Model-level tensors present (token_embd, output, etc). */
  modelLevelPresent: string[];
  /** Total expected transformer layers. */
  expectedLayers: number;
  /** Set of tensor stems we require per transformer layer. */
  requiredTensorsPerLayer: string[];
}

export interface VaultConsistencyReport {
  totalMetas: number;
  parseErrors: { file: string; reason: string }[];
  missingProvenance: string[]; // metas missing sourceGgufSha256
  missingCompressionPath: string[]; // metas missing compressionPath
  distinctGgufHashes: string[]; // if >1, vault is mixed and unsafe to resume
  consistent: boolean;
}

export interface ResumeEstimate {
  missingLayerCount: number;
  missingTensorCount: number;
  estimatedSeconds: number;
  estimatedOutputBytes: number;
}

// ---------- Constants (Qwen 2.5 72B / llama-style tensor set) ----------

const DEFAULT_REQUIRED_TENSORS_PER_LAYER = [
  'attn_q.weight',
  'attn_k.weight',
  'attn_v.weight',
  'attn_output.weight',
  'ffn_gate.weight',
  'ffn_up.weight',
  'ffn_down.weight',
];

const MODEL_LEVEL_TENSOR_STEMS = ['token_embd.weight', 'output.weight'];

/**
 * Empirically-derived per-tensor compression cost, calibrated on the
 * existing layers 0-30 in data/titan-crystals-72b (compressedAt spans
 * ~13 minutes across 217 tensors → ~3.6s/tensor mean, but ffn_up/down are
 * ~7x more expensive than attn tensors). Numbers are conservative.
 */
const AVG_SECONDS_PER_ATTN_TENSOR = 3;
const AVG_SECONDS_PER_FFN_TENSOR = 20;
const AVG_OUTPUT_BYTES_PER_ATTN_TENSOR = 200_000;
const AVG_OUTPUT_BYTES_PER_FFN_TENSOR = 8_000_000;

// ---------- Vault scanning ----------

/**
 * Parse a layer index from a vault filename like `blk.31.attn_k.weight.meta.json`.
 * Returns null for non-layer files (token_embd, output, root-level json).
 */
export function extractLayerIndexFromFilename(filename: string): number | null {
  const m = /^blk\.(\d+)\./.exec(filename);
  return m ? Number(m[1]) : null;
}

/**
 * Parse the tensor stem (e.g. "attn_k.weight") from a layer meta filename.
 */
export function extractTensorStem(filename: string): string | null {
  const m = /^blk\.\d+\.(.+)\.meta\.json$/.exec(filename);
  return m ? m[1] : null;
}

/**
 * Scan a vault directory and inventory which transformer layers are present.
 * A layer is "present" only when ALL required tensors are on disk.
 */
export function getVaultGaps(
  vaultDir: string,
  opts?: {
    expectedLayers?: number;
    requiredTensorsPerLayer?: string[];
  }
): VaultGaps {
  const expectedLayers = opts?.expectedLayers ?? 80;
  const requiredTensorsPerLayer =
    opts?.requiredTensorsPerLayer ?? DEFAULT_REQUIRED_TENSORS_PER_LAYER;

  if (!existsSync(vaultDir)) {
    return {
      present: [],
      missing: Array.from({ length: expectedLayers }, (_, i) => i),
      complete: false,
      tensorCoverage: new Map(),
      modelLevelPresent: [],
      expectedLayers,
      requiredTensorsPerLayer,
    };
  }

  const files = readdirSync(vaultDir);
  const coverage = new Map<number, Set<string>>();
  const modelLevel = new Set<string>();

  for (const f of files) {
    if (!f.endsWith('.meta.json')) continue;
    const idx = extractLayerIndexFromFilename(f);
    if (idx === null) {
      // Model-level tensor (token_embd.weight.meta.json, output.weight.meta.json)
      const stem = f.replace(/\.meta\.json$/, '');
      if (MODEL_LEVEL_TENSOR_STEMS.includes(stem)) modelLevel.add(stem);
      continue;
    }
    const stem = extractTensorStem(f);
    if (!stem) continue;
    if (!coverage.has(idx)) coverage.set(idx, new Set());
    coverage.get(idx)!.add(stem);
  }

  const required = new Set(requiredTensorsPerLayer);
  const present: number[] = [];
  const missing: number[] = [];
  for (let i = 0; i < expectedLayers; i++) {
    const have = coverage.get(i);
    let complete = false;
    if (have) {
      complete = true;
      for (const req of required) {
        if (!have.has(req)) {
          complete = false;
          break;
        }
      }
    }
    if (complete) present.push(i);
    else missing.push(i);
  }

  return {
    present,
    missing,
    complete: missing.length === 0,
    tensorCoverage: coverage,
    modelLevelPresent: Array.from(modelLevel),
    expectedLayers,
    requiredTensorsPerLayer,
  };
}

/**
 * Verify all meta.json files parse and carry the fields we care about.
 * Flags:
 *  - JSON parse errors
 *  - metas missing sourceGgufSha256 (provenance — required for F4 vault-verifier)
 *  - metas missing compressionPath (F1 routing audit)
 *  - mixed sourceGgufSha256 values (vault is polluted, unsafe to resume)
 */
export function verifyVaultMetadata(vaultDir: string): VaultConsistencyReport {
  if (!existsSync(vaultDir)) {
    return {
      totalMetas: 0,
      parseErrors: [],
      missingProvenance: [],
      missingCompressionPath: [],
      distinctGgufHashes: [],
      consistent: false,
    };
  }

  const files = readdirSync(vaultDir).filter((f) => f.endsWith('.meta.json'));
  const parseErrors: { file: string; reason: string }[] = [];
  const missingProvenance: string[] = [];
  const missingCompressionPath: string[] = [];
  const hashes = new Set<string>();

  for (const f of files) {
    const full = join(vaultDir, f);
    let meta: LayerMetadata;
    try {
      const raw = readFileSync(full, 'utf8');
      meta = JSON.parse(raw) as LayerMetadata;
    } catch (e) {
      parseErrors.push({ file: f, reason: (e as Error).message });
      continue;
    }
    if (!meta.sourceGgufSha256) missingProvenance.push(f);
    else hashes.add(meta.sourceGgufSha256);
    if (!meta.compressionPath) missingCompressionPath.push(f);
  }

  const distinct = Array.from(hashes);
  const consistent = parseErrors.length === 0 && distinct.length <= 1; // 0 = pre-v2, 1 = clean

  return {
    totalMetas: files.length,
    parseErrors,
    missingProvenance,
    missingCompressionPath,
    distinctGgufHashes: distinct,
    consistent,
  };
}

/**
 * Estimate wall-clock and output-bytes cost for compressing the missing
 * layers. Uses per-tensor averages calibrated from the existing vault; real
 * wall-clock depends on core count and disk throughput. Order-of-magnitude
 * only — use for capacity planning, not for SLA claims.
 */
export function estimateResumeWork(
  gaps: VaultGaps,
  opts?: { includeModelLevel?: boolean }
): ResumeEstimate {
  const attnPerLayer = gaps.requiredTensorsPerLayer.filter((t) =>
    t.startsWith('attn_')
  ).length;
  const ffnPerLayer = gaps.requiredTensorsPerLayer.filter((t) =>
    t.startsWith('ffn_')
  ).length;

  const attnTensors = gaps.missing.length * attnPerLayer;
  const ffnTensors = gaps.missing.length * ffnPerLayer;

  let seconds =
    attnTensors * AVG_SECONDS_PER_ATTN_TENSOR +
    ffnTensors * AVG_SECONDS_PER_FFN_TENSOR;
  let bytes =
    attnTensors * AVG_OUTPUT_BYTES_PER_ATTN_TENSOR +
    ffnTensors * AVG_OUTPUT_BYTES_PER_FFN_TENSOR;

  if (opts?.includeModelLevel) {
    for (const stem of MODEL_LEVEL_TENSOR_STEMS) {
      if (!gaps.modelLevelPresent.includes(stem)) {
        // token_embd/output are the largest and most expensive tensors in the
        // whole model. Charge them like several FFN tensors.
        seconds += AVG_SECONDS_PER_FFN_TENSOR * 4;
        bytes += AVG_OUTPUT_BYTES_PER_FFN_TENSOR * 4;
      }
    }
  }

  return {
    missingLayerCount: gaps.missing.length,
    missingTensorCount:
      attnTensors +
      ffnTensors +
      (opts?.includeModelLevel
        ? MODEL_LEVEL_TENSOR_STEMS.filter(
            (s) => !gaps.modelLevelPresent.includes(s)
          ).length
        : 0),
    estimatedSeconds: seconds,
    estimatedOutputBytes: bytes,
  };
}

// ---------- Resume compression ----------

/**
 * Build a filter for streamingCompress that accepts only tensors belonging
 * to layers NOT already present in the vault. Model-level tensors (token_embd,
 * output) are accepted when missing from modelLevelPresent.
 */
export function buildMissingLayerFilter(
  gaps: VaultGaps
): (tensor: {
  name: string;
  dimensions: number[];
  elementCount: number;
}) => boolean {
  const presentSet = new Set(gaps.present);
  const modelLevelPresent = new Set(gaps.modelLevelPresent);

  return (tensor) => {
    // Only compress 2D weight tensors ≥256 elements (matches streamingCompress
    // default isWeightTensor heuristic).
    if (tensor.dimensions.length !== 2) return false;
    if (tensor.elementCount < 256) return false;

    const idx = extractLayerIndexFromFilename(tensor.name);
    if (idx !== null) {
      // Transformer layer tensor — skip if the whole layer is already present.
      return !presentSet.has(idx);
    }
    // Model-level — skip if the stem is already staged.
    return !modelLevelPresent.has(tensor.name);
  };
}

/**
 * Execute the actual resume. Dynamic import so the CLI dry-run path does not
 * eagerly pull in the compression pipeline (fast startup + safe to run in
 * environments where the GGUF parser deps might be missing).
 */
export async function resumeCompression(args: {
  ggufPath: string;
  vaultDir: string;
  gaps: VaultGaps;
}): Promise<{ compressedTensors: number; skippedTensors: number }> {
  const { streamingCompress } =
    await import('../../src/ai/engine-titan/streaming-compress');

  const filter = buildMissingLayerFilter(args.gaps);
  const result = await streamingCompress({
    ggufPath: args.ggufPath,
    outputDir: args.vaultDir,
    filter: filter as never, // GGUFTensorInfo satisfies the shape we filter on
    onProgress: (ev) => {
      if (ev.phase === 'read' || ev.phase === 'done') {
        const pct = (((ev.index + 1) / ev.total) * 100).toFixed(1);
        process.stdout.write(
          `[resume] [${pct}%] ${ev.tensorName} — ${ev.phase}\r`
        );
      }
    },
  });
  process.stdout.write('\n');
  return {
    compressedTensors: result.compressedTensors,
    skippedTensors: result.skippedTensors,
  };
}

// ---------- CLI ----------

function humanBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function humanDuration(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}min`;
  return `${(s / 3600).toFixed(1)}h`;
}

function getArg(name: string, def: string | null = null): string | null {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const vaultDir = getArg('--vault') ?? 'data/titan-crystals-72b';
  const expectedLayers = Number(getArg('--expected-layers', '80'));
  const jsonOut = hasFlag('--json');
  const ggufPath = getArg('--gguf');
  const execute = hasFlag('--execute');

  const gaps = getVaultGaps(vaultDir, { expectedLayers });
  const consistency = verifyVaultMetadata(vaultDir);
  const estimate = estimateResumeWork(gaps, { includeModelLevel: true });

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          vaultDir,
          expectedLayers,
          gaps: {
            present: gaps.present,
            missing: gaps.missing,
            complete: gaps.complete,
            modelLevelPresent: gaps.modelLevelPresent,
          },
          consistency,
          estimate,
        },
        null,
        2
      )
    );
    return;
  }

  console.log('=== Titan Crystal Vault — Resume Health Check ===');
  console.log(`Vault:            ${vaultDir}`);
  console.log(`Expected layers:  ${expectedLayers}`);
  console.log(`Present layers:   ${gaps.present.length} / ${expectedLayers}`);
  console.log(`Missing layers:   ${gaps.missing.length}`);
  console.log(`Complete:         ${gaps.complete ? 'YES' : 'NO'}`);
  console.log(
    `Model-level:      ${gaps.modelLevelPresent.join(', ') || '(none)'}`
  );
  if (gaps.missing.length && gaps.missing.length <= 20) {
    console.log(`Missing indices:  ${gaps.missing.join(', ')}`);
  } else if (gaps.missing.length) {
    console.log(
      `Missing indices:  ${gaps.missing[0]}..${gaps.missing[gaps.missing.length - 1]} (${gaps.missing.length} total)`
    );
  }
  console.log('');
  console.log('--- Metadata consistency ---');
  console.log(`Total metas:               ${consistency.totalMetas}`);
  console.log(`Parse errors:              ${consistency.parseErrors.length}`);
  console.log(
    `Missing sourceGgufSha256:  ${consistency.missingProvenance.length}`
  );
  console.log(
    `Missing compressionPath:   ${consistency.missingCompressionPath.length}`
  );
  console.log(
    `Distinct GGUF hashes:      ${consistency.distinctGgufHashes.length} ${consistency.distinctGgufHashes.length > 1 ? '(⚠ MIXED VAULT)' : ''}`
  );
  if (consistency.parseErrors.length) {
    for (const pe of consistency.parseErrors.slice(0, 5)) {
      console.log(`  ! ${pe.file}: ${pe.reason}`);
    }
  }
  console.log('');
  console.log('--- Resume estimate ---');
  console.log(`Missing tensors:           ${estimate.missingTensorCount}`);
  console.log(
    `Estimated wall-clock:      ${humanDuration(estimate.estimatedSeconds)}`
  );
  console.log(
    `Estimated output bytes:    ${humanBytes(estimate.estimatedOutputBytes)}`
  );

  if (!ggufPath) {
    console.log('');
    console.log('DRY RUN — no --gguf supplied. Nothing compressed.');
    console.log('To resume: rerun with --gguf <path/to/model.gguf> --execute');
    return;
  }
  if (!existsSync(ggufPath)) {
    console.error(`\n[ERROR] GGUF not found: ${ggufPath}`);
    process.exit(1);
  }
  if (!execute) {
    console.log('');
    console.log(
      `GGUF present (${ggufPath}) but --execute not passed. Nothing compressed.`
    );
    console.log('Add --execute to run resume compression.');
    return;
  }
  if (gaps.complete) {
    console.log('\nVault is already complete. Nothing to resume.');
    return;
  }

  const ggufSize = statSync(ggufPath).size;
  console.log('');
  console.log(`--- Resuming compression ---`);
  console.log(`GGUF: ${ggufPath} (${humanBytes(ggufSize)})`);
  console.log(`Skipping ${gaps.present.length} present layers.`);
  console.log(`Compressing ${gaps.missing.length} missing layers.`);
  const t0 = Date.now();
  const result = await resumeCompression({ ggufPath, vaultDir, gaps });
  const elapsed = (Date.now() - t0) / 1000;
  console.log(
    `\n[resume] compressed=${result.compressedTensors} skipped=${result.skippedTensors} in ${humanDuration(elapsed)}`
  );

  // Re-scan to confirm.
  const after = getVaultGaps(vaultDir, { expectedLayers });
  console.log(
    `[resume] post-scan: present=${after.present.length}/${expectedLayers} complete=${after.complete}`
  );
  if (!after.complete) process.exit(2);
}

// Only run main when invoked as a script (not when imported).
if (process.argv[1] && /compression-resume\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(`[compression-resume] Fatal: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}
