// src/ai/engine-titan/__tests__/nan-tripwire.test.ts
//
// Tests the NaN/Inf tripwire sentinel: assertFinite, makeTripwire, activationHealth.

import { describe, test, expect } from '@jest/globals';
import {
  assertFinite,
  makeTripwire,
  activationHealth,
  NonFiniteError,
} from '../nan-tripwire';

describe('assertFinite', () => {
  test('clean finite vector passes and returns same array', () => {
    const x = Float32Array.from([1, -2, 3.5, 0, 42]);
    const result = assertFinite('h', 0, x);
    expect(result).toBe(x);
  });

  test('empty vector passes', () => {
    const x = new Float32Array(0);
    expect(() => assertFinite('empty', 0, x)).not.toThrow();
  });

  test('single zero passes', () => {
    const x = Float32Array.from([0]);
    expect(() => assertFinite('zero', 0, x)).not.toThrow();
  });

  test('very small values pass', () => {
    const x = Float32Array.from([1e-38, -1e-38, Number.MIN_VALUE]);
    expect(() => assertFinite('tiny', 0, x)).not.toThrow();
  });

  test('very large finite values pass', () => {
    const x = Float32Array.from([3.4e38, -3.4e38]);
    expect(() => assertFinite('huge', 0, x)).not.toThrow();
  });

  test('NaN throws NonFiniteError with correct location', () => {
    const x = Float32Array.from([1, 2, NaN, 4]);
    try {
      assertFinite('ffn_out', 12, x);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NonFiniteError);
      const err = e as NonFiniteError;
      expect(err.checkpoint).toBe('ffn_out');
      expect(err.layer).toBe(12);
      expect(err.index).toBe(2);
      expect(Number.isNaN(err.value)).toBe(true);
    }
  });

  test('+Infinity throws NonFiniteError', () => {
    const x = Float32Array.from([1, Infinity, 3]);
    expect(() => assertFinite('h_postnorm', 5, x)).toThrow(NonFiniteError);
  });

  test('-Infinity throws NonFiniteError', () => {
    const x = Float32Array.from([-Infinity]);
    try {
      assertFinite('logits', -1, x);
      fail('should have thrown');
    } catch (e) {
      const err = e as NonFiniteError;
      expect(err.layer).toBe(-1);
      expect(err.index).toBe(0);
      expect(err.value).toBe(-Infinity);
    }
  });

  test('reports FIRST non-finite value only', () => {
    const x = Float32Array.from([NaN, Infinity, -Infinity, NaN]);
    try {
      assertFinite('multi', 0, x);
      fail('should have thrown');
    } catch (e) {
      const err = e as NonFiniteError;
      expect(err.index).toBe(0);
    }
  });

  test('NaN at end of large array is caught', () => {
    const x = new Float32Array(10000);
    x.fill(1.0);
    x[9999] = NaN;
    try {
      assertFinite('big', 0, x);
      fail('should have thrown');
    } catch (e) {
      const err = e as NonFiniteError;
      expect(err.index).toBe(9999);
    }
  });

  test('error message includes checkpoint, layer, and index', () => {
    const x = Float32Array.from([NaN]);
    try {
      assertFinite('q_postrope', 42, x);
      fail('should have thrown');
    } catch (e) {
      const err = e as NonFiniteError;
      expect(err.message).toContain('q_postrope');
      expect(err.message).toContain('42');
      expect(err.message).toContain('0');
      expect(err.name).toBe('NonFiniteError');
    }
  });
});

describe('makeTripwire', () => {
  test('disabled tripwire is a no-op on poisoned data', () => {
    const probe = makeTripwire(false);
    const x = Float32Array.from([NaN, Infinity]);
    expect(() => probe('x', 0, x)).not.toThrow();
  });

  test('enabled tripwire throws on NaN', () => {
    const probe = makeTripwire(true);
    const x = Float32Array.from([1, NaN]);
    expect(() => probe('x', 3, x)).toThrow(NonFiniteError);
  });

  test('enabled tripwire passes clean data', () => {
    const probe = makeTripwire(true);
    const x = Float32Array.from([1, 2, 3]);
    expect(() => probe('clean', 0, x)).not.toThrow();
  });
});

describe('activationHealth', () => {
  test('reports healthy for clean vector', () => {
    const x = Float32Array.from([1, -2, 3.5, 0, 42]);
    const h = activationHealth('h_out', 7, x);
    expect(h.healthy).toBe(true);
    expect(h.nan).toBe(0);
    expect(h.inf).toBe(0);
    expect(h.min).toBe(-2);
    expect(h.max).toBe(42);
    expect(h.absMax).toBe(42);
    expect(h.name).toBe('h_out');
    expect(h.layer).toBe(7);
  });

  test('counts NaN without throwing', () => {
    const x = Float32Array.from([1, NaN, 3, NaN, 5]);
    const h = activationHealth('test', 0, x);
    expect(h.healthy).toBe(false);
    expect(h.nan).toBe(2);
    expect(h.inf).toBe(0);
    expect(h.min).toBe(1);
    expect(h.max).toBe(5);
  });

  test('counts Inf separately from NaN', () => {
    const x = Float32Array.from([1, Infinity, NaN, -Infinity]);
    const h = activationHealth('mixed', 0, x);
    expect(h.healthy).toBe(false);
    expect(h.nan).toBe(1);
    expect(h.inf).toBe(2);
    expect(h.min).toBe(1);
    expect(h.max).toBe(1);
  });

  test('absMax tracks absolute value', () => {
    const x = Float32Array.from([-100, 50, 30]);
    const h = activationHealth('neg', 0, x);
    expect(h.absMax).toBe(100);
    expect(h.max).toBe(50);
    expect(h.min).toBe(-100);
  });

  test('empty vector reports healthy', () => {
    const x = new Float32Array(0);
    const h = activationHealth('empty', 0, x);
    expect(h.healthy).toBe(true);
    expect(h.nan).toBe(0);
    expect(h.inf).toBe(0);
  });
});
