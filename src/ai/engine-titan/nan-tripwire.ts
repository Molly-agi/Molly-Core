// Copyright (c) 2026 Molly Labs Inc. Licensed under AGPL-3.0.
/**
 * nan-tripwire.ts  —  catch a poisoned activation at its source
 *
 * One NaN or Inf anywhere in a forward pass silently propagates through every
 * subsequent matmul and comes out as garbage logits — with no clue where it
 * started. Compression makes this a live risk: a tiny-variance hidden state can
 * blow up RMSNorm, an over-compressed tensor can produce Inf. This tripwire
 * scans activations at each checkpoint and throws on the FIRST non-finite value,
 * naming the layer, the checkpoint, and the index. Bug localization in seconds.
 *
 * Zero cost when disabled. Enable during bring-up, disable in production
 * (or leave on — a single linear scan per checkpoint is cheap next to the matmuls).
 *
 *   npx tsx nan-tripwire.ts        # runs the self-test
 */

export class NonFiniteError extends Error {
  constructor(
    public checkpoint: string,
    public layer: number,
    public index: number,
    public value: number
  ) {
    super(
      `non-finite value (${value}) at ${checkpoint}, layer ${layer}, index ${index}`
    );
    this.name = 'NonFiniteError';
  }
}

/**
 * Scan a vector for the first NaN or Inf. Throws NonFiniteError if found.
 * @returns the same array (so you can wrap inline: x = check('h', l, x))
 */
export function assertFinite(
  name: string,
  layer: number,
  x: Float32Array
): Float32Array {
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    // Number.isFinite is false for NaN, +Inf, -Inf — exactly what we want.
    if (!Number.isFinite(v)) throw new NonFiniteError(name, layer, i, v);
  }
  return x;
}

/**
 * Make a probe you can thread through executeTokenPass. When `enabled` is
 * false it's a no-op (zero cost). When true, every call scans the vector.
 *
 *   const probe = makeTripwire(true);
 *   ... after input norm:   probe('h_postnorm', l, h);
 *   ... after RoPE:         probe('q_postrope', l, q); probe('k_postrope', l, k);
 *   ... after attn+proj:    probe('attn_out', l, ao);
 *   ... after residual:     probe('h_postattn', l, h);
 *   ... after SwiGLU:       probe('ffn_out', l, f);
 *   ... after residual:     probe('h_out', l, h);
 *   ... final logits:       probe('logits', -1, logits);
 */
export function makeTripwire(enabled: boolean) {
  if (!enabled) return (_name: string, _layer: number, _x: Float32Array) => {};
  return (name: string, layer: number, x: Float32Array) => {
    assertFinite(name, layer, x);
  };
}

/**
 * Optional richer diagnostic: instead of only "first non-finite", summarize a
 * vector's health (min/max/#nan/#inf) — useful when you want to SEE how close
 * to the edge an activation is getting before it actually breaks.
 */
export function activationHealth(name: string, layer: number, x: Float32Array) {
  let min = Infinity,
    max = -Infinity,
    nan = 0,
    inf = 0,
    absMax = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Number.isNaN(v)) {
      nan++;
      continue;
    }
    if (!Number.isFinite(v)) {
      inf++;
      continue;
    }
    if (v < min) min = v;
    if (v > max) max = v;
    const a = Math.abs(v);
    if (a > absMax) absMax = a;
  }
  return {
    name,
    layer,
    min,
    max,
    absMax,
    nan,
    inf,
    healthy: nan === 0 && inf === 0,
  };
}

// ── self-test (runs when invoked directly) ──────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
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
  console.log('NaN tripwire — self-test\n');

  // clean data passes untouched
  const clean = Float32Array.from([1, -2, 3.5, 0, 42]);
  let threw = false;
  try {
    assertFinite('h', 0, clean);
  } catch {
    threw = true;
  }
  ok('finite vector passes clean', !threw);

  // NaN is caught with correct index
  const withNaN = Float32Array.from([1, 2, NaN, 4]);
  try {
    assertFinite('ffn_out', 12, withNaN);
    ok('NaN caught', false);
  } catch (e) {
    const err = e as NonFiniteError;
    ok(
      'NaN caught with layer+index',
      err.checkpoint === 'ffn_out' && err.layer === 12 && err.index === 2
    );
  }

  // +Inf and -Inf are caught
  const withInf = Float32Array.from([1, Infinity, 3]);
  let infCaught = false;
  try {
    assertFinite('h_postnorm', 5, withInf);
  } catch {
    infCaught = true;
  }
  ok('Inf caught', infCaught);
  const withNegInf = Float32Array.from([-Infinity]);
  let negInfCaught = false;
  try {
    assertFinite('logits', -1, withNegInf);
  } catch {
    negInfCaught = true;
  }
  ok('-Inf caught', negInfCaught);

  // disabled tripwire is a no-op even on poisoned data
  const off = makeTripwire(false);
  let offThrew = false;
  try {
    off('x', 0, withNaN);
  } catch {
    offThrew = true;
  }
  ok('disabled tripwire is a no-op (zero cost)', !offThrew);

  // enabled tripwire throws on poisoned data
  const on = makeTripwire(true);
  let onThrew = false;
  try {
    on('x', 3, withNaN);
  } catch {
    onThrew = true;
  }
  ok('enabled tripwire throws on poison', onThrew);

  // health summary flags trouble without throwing
  const h = activationHealth('h_out', 7, withNaN);
  ok('activationHealth reports nan count', h.nan === 1 && h.healthy === false);
  const h2 = activationHealth('h_out', 7, clean);
  ok(
    'activationHealth reports clean as healthy',
    h2.healthy === true && h2.absMax === 42
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(
    '\nWire probe() into executeTokenPass at each checkpoint. First bad'
  );
  console.log(
    'value throws NonFiniteError naming layer+checkpoint+index — no more'
  );
  console.log('hunting a NaN backwards through 80 layers of garbage logits.');
  process.exit(fail === 0 ? 0 : 1);
}
