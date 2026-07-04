// scripts/titan/evaluate-fidelity.ts
//
// Per-layer fidelity report for Titan Engine crystal vault.
// For each finished crystal in the vault, reconstructs the low-rank ternary
// approximation and compares it to the raw GGUF-dequantized weight matrix.
//
// Emits: frobenius_error, mse, cosine_sim, rel_error_pct per layer to CSV + stdout.
//
// Safe to run against a live vault (compress-70b.ts writing concurrently):
// skips any layer whose triple is missing OR whose mtime is <5s old (mid-write).
//
// Usage:
//   npx tsx scripts/titan/evaluate-fidelity.ts \
//     --gguf /tmp/qwen2.5-72b-q4km.gguf \
//     --vault /tmp/titan-crystals-72b \
//     --out /tmp/titan-72b-fidelity.csv
//
// Scale handling: TitanDecompressionEngine.dequantize() applies scale internally
// (packedBuffer[0..3] is Float32LE scale, dequant multiplies ternary * scale).
// reconstructMatrix() then does A @ B_dequant. NO manual scale multiply needed.
// -- Aether flagged the double-scale risk; verified against reconstruction.ts:57.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGGUF } from '../../src/ai/engine-titan/gguf-ingest';
import { readTensorData } from '../../src/ai/engine-titan/gguf-dequant';
import { TitanDecompressionEngine } from '../../src/ai/engine-titan/reconstruction';
import type { LayerMetadata } from '../../src/ai/engine-titan/orchestrator';

interface Args {
  gguf: string;
  vault: string;
  out: string;
  minAgeMs: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, dflt?: string): string => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) {
      if (dflt !== undefined) return dflt;
      throw new Error(`missing required flag: ${flag}`);
    }
    return argv[i + 1];
  };
  return {
    gguf: get('--gguf'),
    vault: get('--vault'),
    out: get('--out', '/tmp/titan-fidelity.csv'),
    minAgeMs: Number(get('--min-age-ms', '5000')),
  };
}

interface FidelityRow {
  layer: string;
  rows: number;
  cols: number;
  rank: number;
  frobenius_error: number;
  raw_frobenius: number;
  rel_error_pct: number;
  mse: number;
  cosine_sim: number;
  elapsed_ms: number;
}

function frobenius(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

function diffMetrics(
  raw: Float32Array,
  recon: Float32Array
): { fro: number; mse: number; cos: number } {
  if (raw.length !== recon.length) {
    throw new Error(`length mismatch: raw=${raw.length} recon=${recon.length}`);
  }
  let sqErr = 0;
  let dot = 0;
  let rawNorm = 0;
  let reconNorm = 0;
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i] - recon[i];
    sqErr += d * d;
    dot += raw[i] * recon[i];
    rawNorm += raw[i] * raw[i];
    reconNorm += recon[i] * recon[i];
  }
  const fro = Math.sqrt(sqErr);
  const mse = sqErr / raw.length;
  const denom = Math.sqrt(rawNorm) * Math.sqrt(reconNorm);
  const cos = denom > 0 ? dot / denom : 0;
  return { fro, mse, cos };
}

function main() {
  const args = parseArgs();
  const now = Date.now();

  console.log('[fidelity] parsing GGUF...');
  const gguf = parseGGUF(args.gguf);
  const tensorByName = new Map(gguf.tensors.map((t) => [t.name, t]));
  console.log(`[fidelity] GGUF has ${gguf.tensors.length} tensors`);

  const metaFiles = readdirSync(args.vault).filter((f) =>
    f.endsWith('.meta.json')
  );
  console.log(`[fidelity] vault has ${metaFiles.length} finished layers`);

  const engine = new TitanDecompressionEngine();
  const rows: FidelityRow[] = [];
  let skipped = 0;

  for (const metaFile of metaFiles) {
    const layerName = metaFile.replace(/\.meta\.json$/, '');
    const metaPath = join(args.vault, metaFile);
    const aPath = join(args.vault, `${layerName}.A.f32`);
    const bPath = join(args.vault, `${layerName}.B.packed`);

    // File-pointer contention guard: require all three files AND stable mtime.
    try {
      const aStat = statSync(aPath);
      const bStat = statSync(bPath);
      const mStat = statSync(metaPath);
      const youngest = Math.max(aStat.mtimeMs, bStat.mtimeMs, mStat.mtimeMs);
      if (now - youngest < args.minAgeMs) {
        console.warn(
          `[skip] ${layerName} — mid-write (age ${Math.round(now - youngest)}ms < ${args.minAgeMs}ms)`
        );
        skipped++;
        continue;
      }
    } catch {
      console.warn(`[skip] ${layerName} — missing component tensor`);
      skipped++;
      continue;
    }

    const tensor = tensorByName.get(layerName);
    if (!tensor) {
      console.warn(`[skip] ${layerName} — not present in GGUF`);
      skipped++;
      continue;
    }

    const meta: LayerMetadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const { rows: nRows, cols: nCols, targetRank } = meta;

    const t0 = Date.now();

    // Load reconstructed side
    const aBuf = readFileSync(aPath);
    const matrixA = new Float32Array(
      aBuf.buffer,
      aBuf.byteOffset,
      aBuf.length / 4
    );
    const packedB = readFileSync(bPath);
    const { reconstructed } = engine.reconstructMatrix({
      matrixA,
      packedB,
      rows: nRows,
      cols: nCols,
      targetRank,
    });

    // Load raw side (dequantized from GGUF)
    const raw = readTensorData(gguf, tensor);
    if (raw.length !== reconstructed.length) {
      console.warn(
        `[skip] ${layerName} — dim mismatch raw=${raw.length} recon=${reconstructed.length}`
      );
      skipped++;
      continue;
    }

    const { fro, mse, cos } = diffMetrics(raw, reconstructed);
    const rawFro = frobenius(raw);
    const relPct = rawFro > 0 ? (fro / rawFro) * 100 : 0;

    const row: FidelityRow = {
      layer: layerName,
      rows: nRows,
      cols: nCols,
      rank: targetRank,
      frobenius_error: fro,
      raw_frobenius: rawFro,
      rel_error_pct: relPct,
      mse,
      cosine_sim: cos,
      elapsed_ms: Date.now() - t0,
    };
    rows.push(row);

    console.log(
      `[ok] ${layerName.padEnd(40)} rank=${String(targetRank).padStart(3)} ` +
        `rel=${relPct.toFixed(2).padStart(6)}%  cos=${cos.toFixed(4)}  ` +
        `mse=${mse.toExponential(2)}  ${row.elapsed_ms}ms`
    );
  }

  // Write CSV
  const header =
    'layer,rows,cols,rank,frobenius_error,raw_frobenius,rel_error_pct,mse,cosine_sim,elapsed_ms\n';
  const body = rows
    .map(
      (r) =>
        `${r.layer},${r.rows},${r.cols},${r.rank},${r.frobenius_error},${r.raw_frobenius},${r.rel_error_pct},${r.mse},${r.cosine_sim},${r.elapsed_ms}`
    )
    .join('\n');
  writeFileSync(args.out, header + body + '\n');

  // Summary
  const cos = rows.map((r) => r.cosine_sim);
  const rel = rows.map((r) => r.rel_error_pct);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const min = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

  console.log('');
  console.log('=== FIDELITY SUMMARY ===');
  console.log(`evaluated:  ${rows.length}`);
  console.log(`skipped:    ${skipped}`);
  console.log(
    `cosine_sim: avg=${avg(cos).toFixed(4)} min=${min(cos).toFixed(4)} max=${max(cos).toFixed(4)}`
  );
  console.log(
    `rel_err %:  avg=${avg(rel).toFixed(3)} min=${min(rel).toFixed(3)} max=${max(rel).toFixed(3)}`
  );
  console.log(`csv:        ${args.out}`);
}

main();
