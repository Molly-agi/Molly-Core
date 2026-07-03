/**
 * kv-longcontext.test.ts  —  the bug that only shows up after a long chat
 *
 * Short tests never fill the KV cache, so eviction is never exercised and its
 * bugs survive to production, where they show up as "generation goes vague
 * after the conversation gets long." This forces the cache PAST maxTokens and
 * checks two things that break silently:
 *
 *   (1) after eviction, a SURVIVING token's attention still matches a
 *       from-scratch reference over the same surviving window, and
 *   (2) the RoPE phase baked into K at write time is NOT corrupted by the
 *       slide (i.e. nobody renumbered positions after eviction).
 *
 * It ships with a reference model of the intended sliding-window semantics so
 * the comparison logic is runnable now. To test the REAL cache, swap
 * `RefKVCache` for your KVCache import at the two marked points and feed the
 * same K/V vectors into both.
 *
 *   npx tsx kv-longcontext.test.ts
 */

// ---- config mirrors the handoff spec ----
const HEAD_DIM = 128;
const N_KV_HEADS = 8;
const KV_DIM = N_KV_HEADS * HEAD_DIM; // 1024
const N_LAYERS = 4; // small for the test; real is 80
const MAX_TOKENS = 16; // small so we can overflow cheaply

// ── REFERENCE sliding-window cache (the intended semantics) ──────────────────
// Matches the handoff: length bumps on last-layer append; on overflow the
// first-layer append slides every layer's buffer left by one token; K/V are
// stored post-RoPE at absolute write-time position and never re-rotated.
class RefKVCache {
  k: Float32Array[];
  v: Float32Array[];
  length = 0;
  constructor() {
    this.k = Array.from(
      { length: N_LAYERS },
      () => new Float32Array(MAX_TOKENS * KV_DIM)
    );
    this.v = Array.from(
      { length: N_LAYERS },
      () => new Float32Array(MAX_TOKENS * KV_DIM)
    );
  }
  append(layer: number, k: Float32Array, v: Float32Array) {
    const overflow = this.length >= MAX_TOKENS;
    if (overflow && layer === 0) {
      for (let l = 0; l < N_LAYERS; l++) {
        this.k[l].copyWithin(0, KV_DIM); // slide left one token
        this.v[l].copyWithin(0, KV_DIM);
      }
    }
    const tokenIdx = Math.min(this.length, MAX_TOKENS - 1);
    this.k[layer].set(k, tokenIdx * KV_DIM);
    this.v[layer].set(v, tokenIdx * KV_DIM);
    if (layer === N_LAYERS - 1)
      this.length = Math.min(this.length + 1, MAX_TOKENS);
  }
  getK(layer: number, tokenIdx: number) {
    return this.k[layer].subarray(tokenIdx * KV_DIM, (tokenIdx + 1) * KV_DIM);
  }
  getV(layer: number, tokenIdx: number) {
    return this.v[layer].subarray(tokenIdx * KV_DIM, (tokenIdx + 1) * KV_DIM);
  }
}

// deterministic pseudo-random K/V vector tagged with its absolute position, so
// we can PROVE which token ended up in which slot after eviction.
function kvFor(pos: number, seed: number): Float32Array {
  const a = new Float32Array(KV_DIM);
  let s = (pos * 2654435761 + seed) >>> 0;
  for (let i = 0; i < KV_DIM; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    a[i] = (s >>> 8) / 0xffffff - 0.5;
  }
  a[0] = pos; // tag slot 0 with the absolute position for identity checks
  return a;
}

let pass = 0,
  fail = 0;
const ok = (n: string, c: boolean) => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}`);
  } else {
    fail++;
    console.log(`  ✗ ${n}`);
  }
};
const vecEq = (a: Float32Array, b: Float32Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

console.log('KV cache — long-context / eviction\n');

// ── TODO: to test the REAL cache, replace this line with your import ────────
// import { KVCache } from '../src/ai/inference/kv-cache.js';
const cache = new RefKVCache(); // <-- swap for `new KVCache(MAX_TOKENS, ...)`

// Write MAX_TOKENS + 5 tokens across all layers, in the real layer order.
const OVERFLOW_BY = 5;
const total = MAX_TOKENS + OVERFLOW_BY;
for (let pos = 0; pos < total; pos++) {
  for (let l = 0; l < N_LAYERS; l++) {
    cache.append(l, kvFor(pos, 111), kvFor(pos, 222)); // k seed 111, v seed 222
  }
}

// 1) length clamps at MAX_TOKENS (didn't run away, didn't under-count)
ok('length clamped to maxTokens after overflow', cache.length === MAX_TOKENS);

// 2) the OLDEST OVERFLOW_BY tokens were evicted; the window holds the newest.
//    After writing positions 0..total-1, slot 0 should hold position OVERFLOW_BY,
//    and the last slot should hold the newest position (total-1).
const slot0 = cache.getK(0, 0);
ok(
  'oldest tokens evicted (slot 0 holds first survivor)',
  slot0[0] === OVERFLOW_BY
);
const lastSlot = cache.getK(0, MAX_TOKENS - 1);
ok('newest token is in the last slot', lastSlot[0] === total - 1);

// 3) survivors are CONTIGUOUS and in order (no gaps, no duplication from a
//    botched slide) — slot i holds absolute position OVERFLOW_BY + i.
let contiguous = true;
for (let i = 0; i < MAX_TOKENS; i++)
  if (cache.getK(0, i)[0] !== OVERFLOW_BY + i) {
    contiguous = false;
    break;
  }
ok('surviving window is contiguous and ordered', contiguous);

// 4) every layer evicted identically (a per-layer slide bug would desync them)
let layersAligned = true;
for (let l = 1; l < N_LAYERS; l++) {
  for (let i = 0; i < MAX_TOKENS; i++)
    if (cache.getK(l, i)[0] !== cache.getK(0, i)[0]) {
      layersAligned = false;
      break;
    }
}
ok('all layers evicted in lockstep (no per-layer desync)', layersAligned);

// 5) RoPE-phase integrity: the stored K for a survivor must be BYTE-IDENTICAL
//    to what was written at its absolute position — i.e. the slide moved bytes
//    but did NOT re-rotate or renumber. Recompute the original and compare.
const survivorPos = OVERFLOW_BY + 3; // some token still in window
const survivorSlot = survivorPos - OVERFLOW_BY; // where it lives now
const storedK = cache.getK(0, survivorSlot);
const originalK = kvFor(survivorPos, 111);
ok(
  'survivor K preserved byte-for-byte (no re-rotation on slide)',
  vecEq(storedK, originalK)
);

// 6) attention-over-window sanity: dot-product attention of a query against the
//    surviving K's should equal a from-scratch reference over the same window.
function attnScores(q: Float32Array, layer: number): Float32Array {
  const scores = new Float32Array(MAX_TOKENS);
  for (let t = 0; t < MAX_TOKENS; t++) {
    const k = cache.getK(layer, t);
    let dot = 0;
    for (let i = 0; i < KV_DIM; i++) dot += q[i] * k[i];
    scores[t] = dot / Math.sqrt(HEAD_DIM);
  }
  return scores;
}
const q = kvFor(9999, 333);
const got = attnScores(q, 0);
// reference: recompute from the known survivor positions directly
const ref = new Float32Array(MAX_TOKENS);
for (let t = 0; t < MAX_TOKENS; t++) {
  const k = kvFor(OVERFLOW_BY + t, 111);
  let dot = 0;
  for (let i = 0; i < KV_DIM; i++) dot += q[i] * k[i];
  ref[t] = dot / Math.sqrt(HEAD_DIM);
}
let scoresMatch = true;
for (let t = 0; t < MAX_TOKENS; t++)
  if (Math.abs(got[t] - ref[t]) > 1e-4) {
    scoresMatch = false;
    break;
  }
ok('attention scores over surviving window match reference', scoresMatch);

console.log(`\n${pass} passed, ${fail} failed`);
console.log('\nWhen wired to the REAL KVCache, a failure localizes the bug:');
console.log(
  '  slot 0 wrong / not contiguous -> eviction index math (copyWithin/tokenIdx)'
);
console.log(
  '  layers desynced               -> per-layer slide fires unevenly'
);
console.log(
  '  survivor K changed            -> something re-rotates or renumbers on slide (RoPE corruption)'
);
console.log(
  '  scores mismatch               -> getK returns stale offset after slide'
);
process.exit(fail === 0 ? 0 : 1);
