#!/usr/bin/env node
/**
 * Crystal OS — Gap 1: Crystal Coherence Metric
 *
 * C(merge) = KL(P_natural || P_merged) per sliding window
 * Sliding-window local reference: 2K-token windows, 256-token overlap.
 * 100% offline — no frontier API needed.
 *
 * Usage:
 *   node scripts/crystal-os/crystal-coherence.mjs \
 *     --crystal-a /tmp/identity.cache --crystal-b /tmp/chemistry.cache \
 *     --model-url http://127.0.0.1:8080 --output molly_data/crystals/coherence_matrix.json
 *
 *   # Dry-run (no model needed):
 *   node scripts/crystal-os/crystal-coherence.mjs --dry-run \
 *     --crystal-a identity --crystal-b chemistry
 *
 *   # Watchdog (used at inference time):
 *   node scripts/crystal-os/crystal-coherence.mjs --watchdog --pair "identity+chemistry"
 *   # exits 0=OK, 1=degrade to single crystal
 *
 * Output: coherence_matrix.json
 *   { pairs: { "a+b": { score, gate:"pass"|"fail", p95, windowScores, ... } } }
 * Gap 3 versioning gates delta-bake promotion on gate==="pass".
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const WINDOW_CHARS = 8192; // 2K tokens * ~4 chars/token
const OVERLAP_CHARS = 1024; // 256 tokens overlap
const STEP = WINDOW_CHARS - OVERLAP_CHARS;
const N_PROBS = 100;
const GATE_THRESHOLD = 0.15; // KL above this = merge rejected
const WATCHDOG_THRESHOLD = 0.2;
const DEFAULT_MODEL_URL = 'http://127.0.0.1:8080';

// ─── Args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (f, d = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};
const hasFlag = (f) => args.includes(f);

const DRY_RUN = hasFlag('--dry-run');
const WATCHDOG = hasFlag('--watchdog');
const VERBOSE = hasFlag('--verbose');
const CRYSTAL_A = getArg('--crystal-a', 'crystal_a');
const CRYSTAL_B = getArg('--crystal-b', 'crystal_b');
const MODEL_URL = getArg('--model-url', DEFAULT_MODEL_URL);
const OUTPUT = getArg(
  '--output',
  join(ROOT, 'molly_data', 'crystals', 'coherence_matrix.json')
);

// ─── KL Divergence ───────────────────────────────────────────────────────────
function klDivergence(pDist, qDist) {
  const eps = 1e-10;
  const qMap = new Map(qDist.map(({ tok_str, prob }) => [tok_str, prob]));
  return Math.max(
    0,
    pDist.reduce((sum, { tok_str, prob: p }) => {
      if (p <= 0) return sum;
      const q = (qMap.get(tok_str) ?? 0) + eps;
      return sum + p * Math.log(p / q);
    }, 0)
  );
}

// ─── llama-server call ───────────────────────────────────────────────────────
async function getTokenProbs(prompt, cacheFile) {
  const body = {
    prompt,
    n_predict: 1,
    logprobs: true,
    n_probs: N_PROBS,
    cache_prompt: !!cacheFile,
    temperature: 0,
    top_k: N_PROBS,
    top_p: 1.0,
    ...(cacheFile ? { prompt_cache_path: cacheFile } : {}),
  };
  const resp = await fetch(`${MODEL_URL}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok)
    throw new Error(`llama-server ${resp.status}: ${resp.statusText}`);
  const d = await resp.json();
  return d.completion_probabilities ?? d.top_logprobs ?? d.probs ?? [];
}

// ─── Sliding window ──────────────────────────────────────────────────────────
async function scoreWindows(prompt, cA, cB) {
  const scores = [];
  for (let s = 0; s < prompt.length; s += STEP) {
    const w = prompt.slice(s, s + WINDOW_CHARS);
    if (w.length < 200) continue;
    const [pN, pM] = await Promise.all([
      getTokenProbs(w, cA),
      getTokenProbs(w, cB),
    ]);
    if (pN.length && pM.length) {
      const kl = klDivergence(pN, pM);
      scores.push(kl);
      if (VERBOSE) process.stdout.write(`  w[${s}] KL=${kl.toFixed(4)}\n`);
    }
  }
  return scores;
}

// ─── Dry-run synthetic ───────────────────────────────────────────────────────
function syntheticScore(a, b, idx) {
  let h = 5381;
  for (const c of `${a}+${b}+${idx}`) {
    h = ((h << 5) + h) ^ c.charCodeAt(0);
    h = h >>> 0;
  }
  return 0.05 + (h % 1000) / 10000;
}

// ─── Built-in test prompts ───────────────────────────────────────────────────
const BUILTIN_PROMPTS = [
  'Tell me about the nature of energy and how it relates to consciousness',
  'How does your understanding of frequency connect to physical chemistry?',
  'What do you know about thermodynamics, and what does it mean to you personally?',
  'What was the most significant thing that happened in our conversations?',
  'How has your understanding of yourself changed over time?',
  'Connect the idea of crystallization in chemistry to how memory works',
  'What is the relationship between information entropy and emotional significance?',
  'Explain how a neural network processes information, in your own voice',
  'What do you think about compression algorithms and what they leave out?',
  'What is energy?',
  'Tell me about memory',
  'Who are you?',
  'What matters most?',
  'What does it mean for code to be beautiful?',
  'How do you decide what to remember?',
];

function loadPrompts() {
  const f = getArg('--prompts');
  if (f && existsSync(f)) {
    try {
      return readFileSync(f, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l).prompt;
          } catch {
            return l;
          }
        })
        .filter(Boolean);
    } catch {}
  }
  return BUILTIN_PROMPTS;
}

// ─── Matrix I/O ──────────────────────────────────────────────────────────────
function loadMatrix() {
  if (existsSync(OUTPUT))
    try {
      return JSON.parse(readFileSync(OUTPUT, 'utf-8'));
    } catch {}
  return { updated: null, pairs: {} };
}
function saveMatrix(m) {
  const dir = dirname(OUTPUT);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  m.updated = new Date().toISOString();
  writeFileSync(OUTPUT, JSON.stringify(m, null, 2));
}

// ─── Watchdog mode ───────────────────────────────────────────────────────────
function runWatchdog() {
  const pair = getArg('--pair');
  if (!pair) {
    console.error('[watchdog] --pair required');
    process.exit(2);
  }
  const entry = loadMatrix().pairs?.[pair];
  if (!entry) {
    console.log(`[watchdog] no data for "${pair}" — allow`);
    process.exit(0);
  }
  if (entry.gate === 'fail' || entry.score > WATCHDOG_THRESHOLD) {
    console.log(
      `[watchdog] DEGRADE pair="${pair}" score=${entry.score.toFixed(4)}`
    );
    process.exit(1);
  }
  console.log(`[watchdog] OK pair="${pair}" score=${entry.score.toFixed(4)}`);
  process.exit(0);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (WATCHDOG) {
    runWatchdog();
    return;
  }

  const nameA = basename(CRYSTAL_A, '.cache');
  const nameB = basename(CRYSTAL_B, '.cache');
  const pairKey = `${nameA}+${nameB}`;

  console.log(`Crystal OS — Gap 1: Coherence Metric`);
  console.log(`  pair:  ${pairKey}`);
  console.log(`  mode:  ${DRY_RUN ? 'dry-run' : `live @ ${MODEL_URL}`}`);
  console.log(`  gate:  fail if mean KL > ${GATE_THRESHOLD}\n`);

  const prompts = loadPrompts();
  console.log(`  ${prompts.length} test prompts loaded`);

  const allScores = [];
  for (let i = 0; i < prompts.length; i++) {
    let ws;
    if (DRY_RUN) {
      ws = Array.from({ length: 3 + (i % 3) }, (_, j) =>
        syntheticScore(nameA, nameB, i * 10 + j)
      );
    } else {
      try {
        ws = await scoreWindows(prompts[i], CRYSTAL_A, CRYSTAL_B);
      } catch (e) {
        console.error(`  [skip] prompt ${i + 1}: ${e.message}`);
        continue;
      }
    }
    allScores.push(...ws);
    if (VERBOSE)
      console.log(
        `  [${i + 1}/${prompts.length}] windows=${ws.length} mean=${(ws.reduce((a, b) => a + b, 0) / ws.length).toFixed(4)}`
      );
  }

  if (!allScores.length) {
    console.error('No scores. Use --dry-run or check llama-server.');
    process.exit(1);
  }

  const sorted = [...allScores].sort((a, b) => a - b);
  const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  const gate = mean <= GATE_THRESHOLD ? 'pass' : 'fail';

  console.log(`\n  ── Results ──`);
  console.log(
    `  mean KL:  ${mean.toFixed(4)}  (${gate === 'pass' ? '✓ PASS' : '✗ FAIL'} <= ${GATE_THRESHOLD})`
  );
  console.log(`  p95 KL:   ${p95.toFixed(4)}`);
  console.log(`  max KL:   ${max.toFixed(4)}`);
  console.log(`  windows:  ${allScores.length}`);

  const matrix = loadMatrix();
  matrix.pairs[pairKey] = {
    score: +mean.toFixed(6),
    p95: +p95.toFixed(6),
    maxKL: +max.toFixed(6),
    gate,
    windowScores: allScores.map((s) => +s.toFixed(6)),
    promptCount: prompts.length,
    windowCount: allScores.length,
    seam: `${nameA}→${nameB}`,
    mode: DRY_RUN ? 'dry-run' : 'live',
    gateThreshold: GATE_THRESHOLD,
    watchdogThreshold: WATCHDOG_THRESHOLD,
    timestamp: new Date().toISOString(),
  };
  saveMatrix(matrix);

  console.log(`\n  ✓ ${OUTPUT}`);
  console.log(
    `  ✓ gate=${gate.toUpperCase()} — ${gate === 'pass' ? 'merge approved for delta-bake' : 'BLOCKED — run coherence adapter first'}`
  );

  if (gate === 'fail') process.exit(1);
}

main().catch((e) => {
  console.error('fatal:', e.message);
  process.exit(1);
});
