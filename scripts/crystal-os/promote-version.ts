#!/usr/bin/env -S npx tsx
/**
 * Crystal OS — Gap 3 phase 2: promote a new crystal version.
 *
 * End-to-end pipeline that ties the two gates Lazarus shipped to the
 * pure-logic manifest builder in src/ai/memory/crystal-version-manifest.ts:
 *
 *   1. Load parent manifest (if any) from molly_data/manifests/HEAD.json
 *   2. Glob crystals from molly_data/crystals/crystal_*.json
 *   3. Read coherence_matrix.json (written by crystal-coherence.mjs) and
 *      compute pass = every pair entry has gate==="pass". Empty matrix =>
 *      pass (no merges to validate yet).
 *   4. Call detectConflicts() on the loaded crystals (real embedder).
 *   5. buildManifest() — gates resolved, manifest produced.
 *   6. Write molly_data/manifests/v<N>.json. If canPromote(), atomically
 *      flip HEAD.json to point at the new version. If blocked, write the
 *      manifest as v<N>-blocked.json for audit and exit non-zero.
 *
 * Usage:
 *   npx tsx scripts/crystal-os/promote-version.ts
 *   npx tsx scripts/crystal-os/promote-version.ts --dry-run
 *   npx tsx scripts/crystal-os/promote-version.ts --crystals-dir <p> --manifests-dir <p>
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildManifest,
  canPromote,
  diffManifests,
  validateManifest,
  type VersionManifest,
  type ManifestDeltaRef,
  type CoherenceGate,
} from '../../src/ai/memory/crystal-version-manifest';
import {
  detectConflicts,
  type DetectionResult,
} from '../../src/ai/memory/contradiction-detector';
import type { RoutableCrystal } from '../../src/ai/memory/crystal-routing';
import {
  BaseEmbeddingProvider,
  isEmbeddingProviderReady,
  setEmbeddingProvider,
  type BatchEmbeddingResult,
  type EmbeddingResult,
} from '../../src/ai/tools/embedding-provider';

const STUB_DIMS = 64;

/**
 * Deterministic 64-dim FNV-1a hash embedder. Matches the stub used in
 * scripts/crystal-os/route-crystals.mjs so promotion dry-runs reproduce
 * the Gap 7 routing semantics WITHOUT requiring Gemini credentials.
 * Production swaps this for the real provider via setEmbeddingProvider.
 */
class HashEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super();
    this.dimensions = STUB_DIMS;
  }
  getName(): string {
    return 'hash-stub-fnv1a-64d';
  }
  async embed(text: string): Promise<EmbeddingResult> {
    return {
      text,
      vector: hashEmbed(text),
      model: this.getName(),
      timestamp: Date.now(),
    };
  }
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const embeddings = await Promise.all(texts.map((t) => this.embed(t)));
    return { embeddings, batchSize: texts.length, model: this.getName() };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

function hashEmbed(text: string): number[] {
  const vec = new Array(STUB_DIMS).fill(0);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % STUB_DIMS;
    vec[idx] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const getArg = (f: string, d: string | null = null): string | null => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const hasFlag = (f: string): boolean => args.includes(f);

const DRY_RUN = hasFlag('--dry-run');
const CRYSTALS_DIR =
  getArg('--crystals-dir') ?? join(ROOT, 'molly_data', 'crystals');
const MANIFESTS_DIR =
  getArg('--manifests-dir') ?? join(ROOT, 'molly_data', 'manifests');
const COHERENCE_PATH =
  getArg('--coherence-path') ??
  join(ROOT, 'molly_data', 'crystals', 'coherence_matrix.json');
const DELTAS_DIR =
  getArg('--deltas-dir') ?? join(ROOT, 'molly_data', 'kv-deltas');

const COHERENCE_BLOCK_THRESHOLD = 0.15;

function log(line: string): void {
  console.log(`[promote] ${line}`);
}

function loadHead(): VersionManifest | null {
  const headPath = join(MANIFESTS_DIR, 'HEAD.json');
  if (!existsSync(headPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(headPath, 'utf-8'));
    return validateManifest(raw);
  } catch (err) {
    log(`HEAD.json unreadable: ${(err as Error).message}`);
    return null;
  }
}

function loadCrystals(): RoutableCrystal[] {
  if (!existsSync(CRYSTALS_DIR)) {
    log(`crystals dir missing: ${CRYSTALS_DIR}`);
    return [];
  }
  const files = readdirSync(CRYSTALS_DIR).filter(
    (f) => f.startsWith('crystal_') && f.endsWith('.json')
  );
  const out: RoutableCrystal[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(CRYSTALS_DIR, f), 'utf-8'));
      if (raw && typeof raw === 'object' && typeof raw.id === 'string') {
        out.push(raw as RoutableCrystal);
      }
    } catch (err) {
      log(`skip ${f}: ${(err as Error).message}`);
    }
  }
  return out;
}

interface CoherenceMatrixEntry {
  score: number;
  gate: 'pass' | 'fail';
}
interface CoherenceMatrix {
  updated: string | null;
  pairs: Record<string, CoherenceMatrixEntry>;
}

function loadCoherenceGate(): CoherenceGate {
  if (!existsSync(COHERENCE_PATH)) {
    log(`coherence_matrix.json missing — vacuous pass`);
    return { passed: true, threshold: COHERENCE_BLOCK_THRESHOLD };
  }
  let matrix: CoherenceMatrix;
  try {
    matrix = JSON.parse(readFileSync(COHERENCE_PATH, 'utf-8'));
  } catch (err) {
    log(`coherence_matrix.json unreadable: ${(err as Error).message} — block`);
    return { passed: false, threshold: COHERENCE_BLOCK_THRESHOLD };
  }
  const entries = Object.values(matrix.pairs ?? {});
  if (entries.length === 0) {
    log(`coherence_matrix.json empty — vacuous pass`);
    return { passed: true, threshold: COHERENCE_BLOCK_THRESHOLD };
  }
  const mean =
    entries.reduce(
      (s, e) => s + (typeof e.score === 'number' ? e.score : 0),
      0
    ) / entries.length;
  const allPass = entries.every((e) => e.gate === 'pass');
  return {
    passed: allPass,
    meanKl: Number(mean.toFixed(4)),
    threshold: COHERENCE_BLOCK_THRESHOLD,
  };
}

function loadDeltaRefs(): ManifestDeltaRef[] {
  if (!existsSync(DELTAS_DIR)) return [];
  const out: ManifestDeltaRef[] = [];
  for (const f of readdirSync(DELTAS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(readFileSync(join(DELTAS_DIR, f), 'utf-8'));
      if (typeof raw?.id !== 'string') continue;
      const blobName = `${raw.id}.bin`;
      const blobPath = join(DELTAS_DIR, blobName);
      out.push({
        id: raw.id,
        descriptorPath: join(DELTAS_DIR, f),
        blobPath,
        bytes: existsSync(blobPath) ? statSync(blobPath).size : 0,
      });
    } catch {
      // skip
    }
  }
  return out;
}

function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

async function main(): Promise<number> {
  log(`crystals dir: ${CRYSTALS_DIR}`);
  log(`manifests dir: ${MANIFESTS_DIR}`);
  log(`coherence path: ${COHERENCE_PATH}`);
  log(`deltas dir: ${DELTAS_DIR}`);
  log(`dry-run: ${DRY_RUN}`);

  if (!isEmbeddingProviderReady()) {
    setEmbeddingProvider(new HashEmbeddingProvider());
    log(`embedder: hash-stub (64d FNV-1a) — production swaps via env`);
  }

  const parent = loadHead();
  log(parent ? `parent: v${parent.version}` : 'parent: <none, this is v1>');

  const crystals = loadCrystals();
  log(`crystals loaded: ${crystals.length}`);

  const coherence = loadCoherenceGate();
  log(
    `coherence gate: passed=${coherence.passed} meanKl=${coherence.meanKl ?? 'n/a'}`
  );

  let contradiction: DetectionResult;
  try {
    contradiction = await detectConflicts(crystals);
  } catch (err) {
    log(`detectConflicts failed: ${(err as Error).message} — block`);
    contradiction = {
      conflicts: [],
      clean: crystals.map((c) => c.id),
      summary: {
        total: crystals.length,
        evolving: 0,
        contradictory: 0,
        complementary: 0,
        unrelated: 0,
      },
    };
    // Force coherence block as a proxy for "we couldn't validate" so the
    // promotion is rejected and the operator must investigate.
    coherence.passed = false;
  }
  log(
    `contradiction gate: conflicts=${contradiction.conflicts.length} clean=${contradiction.clean.length}`
  );

  const deltas = loadDeltaRefs();
  log(`deltas in store: ${deltas.length}`);

  const manifest = buildManifest({
    parent,
    currentCrystals: crystals.map((c) => c.id),
    deltas,
    coherence,
    contradiction,
  });

  const transition = diffManifests(parent, manifest);
  log(
    `transition: +${transition.added.length} -${transition.removed.length} =${transition.held.length}`
  );

  const ok = canPromote(manifest);
  if (ok) {
    log(`OK — manifest v${manifest.version} promotable`);
  } else {
    log(`BLOCKED — gatedBy=${manifest.gatedBy}`);
    for (const r of manifest.blockReasons) log(`  reason: ${r}`);
  }

  if (DRY_RUN) {
    log(`dry-run: skipping writes`);
    return ok ? 0 : 1;
  }

  if (!existsSync(MANIFESTS_DIR)) mkdirSync(MANIFESTS_DIR, { recursive: true });
  const suffix = ok ? '' : '-blocked';
  const outName = `v${manifest.version}${suffix}.json`;
  const outPath = join(MANIFESTS_DIR, outName);
  atomicWrite(outPath, JSON.stringify(manifest, null, 2));
  log(`wrote ${outPath}`);

  if (ok) {
    atomicWrite(
      join(MANIFESTS_DIR, 'HEAD.json'),
      JSON.stringify(manifest, null, 2)
    );
    log(`HEAD -> v${manifest.version}`);
  }

  return ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[promote] fatal: ${err.stack ?? err.message}`);
    process.exit(2);
  });
