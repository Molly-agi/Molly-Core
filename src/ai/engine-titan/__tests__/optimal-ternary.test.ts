import { findOptimalTernary } from '../optimal-ternary';

describe('optimal-ternary (E2M-ATQ)', () => {
  it('returns fallback for empty tensor', () => {
    const { scale, threshold } = findOptimalTernary(new Float32Array(0));
    expect(scale).toBe(1);
    expect(threshold).toBe(Infinity);
  });

  it('returns fallback for all-zero tensor', () => {
    const w = new Float32Array(1000);
    const { scale, threshold } = findOptimalTernary(w);
    // All-zero tensor: scale is 0 (nothing to scale), threshold is Infinity (everything is "zero")
    expect(scale).toBe(0);
    expect(threshold).toBe(Infinity);
  });

  it('picks a threshold that separates zero-cluster from magnitude-cluster', () => {
    // 90% near zero, 10% around ±5 — optimal threshold should sit between them
    const w = new Float32Array(1000);
    for (let i = 0; i < 900; i++) w[i] = (i % 2 === 0 ? 1 : -1) * 0.01;
    for (let i = 900; i < 1000; i++) w[i] = (i % 2 === 0 ? 1 : -1) * 5;

    const { scale, threshold } = findOptimalTernary(w);
    expect(threshold).toBeGreaterThan(0.01);
    expect(threshold).toBeLessThan(5);
    expect(scale).toBeGreaterThan(4);
    expect(scale).toBeLessThan(6);
  });

  it('beats the naive 0.5·mean-abs threshold in reconstruction MSE', () => {
    // Heavy-tailed weights: Gaussian body + a few big outliers
    const N = 10000;
    const w = new Float32Array(N);
    let sumAbs = 0;
    for (let i = 0; i < N; i++) {
      // Box-Muller for gaussian
      const u1 = Math.max(1e-10, Math.random());
      const u2 = Math.random();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      w[i] = g;
      sumAbs += g < 0 ? -g : g;
    }
    // Inject outliers
    for (let i = 0; i < 20; i++) w[i * 47] = (i % 2 === 0 ? 1 : -1) * 8;

    const naiveScale = sumAbs / N;
    const naiveThreshold = 0.5 * naiveScale;

    const naiveMse = mseTernary(w, naiveScale, naiveThreshold);

    const { scale, threshold } = findOptimalTernary(w);
    const optimalMse = mseTernary(w, scale, threshold);

    expect(optimalMse).toBeLessThanOrEqual(naiveMse);
  });

  it('is deterministic for the same input', () => {
    const w = new Float32Array(500);
    for (let i = 0; i < w.length; i++) w[i] = Math.sin(i * 0.13) * 2;
    const a = findOptimalTernary(w);
    const b = findOptimalTernary(w);
    expect(a).toEqual(b);
  });

  it('handles NaN/Inf by ignoring them', () => {
    const w = new Float32Array(100);
    for (let i = 0; i < 100; i++) w[i] = i * 0.1 - 5;
    w[3] = NaN;
    w[7] = Infinity;
    w[11] = -Infinity;

    const { scale, threshold } = findOptimalTernary(w);
    expect(isFinite(scale)).toBe(true);
    expect(isFinite(threshold)).toBe(true);
    expect(scale).toBeGreaterThan(0);
  });
});

function mseTernary(w: Float32Array, scale: number, threshold: number): number {
  let mse = 0;
  for (let i = 0; i < w.length; i++) {
    const v = w[i];
    const abs = v < 0 ? -v : v;
    let ternary = 0;
    if (abs > threshold) ternary = v > 0 ? 1 : -1;
    const reconstructed = ternary * scale;
    const err = v - reconstructed;
    mse += err * err;
  }
  return mse / w.length;
}
