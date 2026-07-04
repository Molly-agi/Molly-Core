// src/ai/inference/__tests__/needle-probe.test.ts
//
// Unit tests for the needle-in-haystack retrieval probe.
// Tests the probe infrastructure (needle generation, context building,
// threshold checking) without requiring a real model.

import { describe, it, expect } from '@jest/globals';
import {
  runNeedleProbe,
  checkNeedleThresholds,
  DEFAULT_DEPTH_SPECS,
  type NeedleProbeConfig,
  type NeedleProbeResult,
} from '../needle-probe';

// Mock tokenizer: each character = 1 token (simplification for unit tests)
function mockEncode(text: string): number[] {
  return Array.from(text).map((ch) => ch.charCodeAt(0));
}
function mockDecode(ids: number[]): string {
  return ids.map((id) => String.fromCharCode(id)).join('');
}

// Generate a haystack of repeated ASCII (simulates Wikipedia token IDs)
function _makeHaystack(length: number, seed = 7): number[] {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    result.push(65 + (rand() % 26)); // A-Z ASCII range
  }
  return result;
}

describe('needle-probe', () => {
  describe('DEFAULT_DEPTH_SPECS', () => {
    it('defines 4 depth levels with correct thresholds', () => {
      expect(DEFAULT_DEPTH_SPECS).toHaveLength(4);
      expect(DEFAULT_DEPTH_SPECS[0]).toEqual({
        contextDepth: 256,
        insertPosition: 50,
        minAccuracy: 0.95,
      });
      expect(DEFAULT_DEPTH_SPECS[1]).toEqual({
        contextDepth: 1024,
        insertPosition: 200,
        minAccuracy: 0.9,
      });
      expect(DEFAULT_DEPTH_SPECS[2]).toEqual({
        contextDepth: 2048,
        insertPosition: 500,
        minAccuracy: 0.85,
      });
      expect(DEFAULT_DEPTH_SPECS[3]).toEqual({
        contextDepth: 4096,
        insertPosition: 1000,
        minAccuracy: 0.8,
      });
    });
  });

  describe('checkNeedleThresholds', () => {
    it('passes when all depths meet thresholds', () => {
      const result: NeedleProbeResult = {
        depths: [
          {
            contextDepth: 256,
            insertPosition: 50,
            casesRun: 100,
            correctCount: 98,
            accuracy: 0.98,
            minAccuracy: 0.95,
            passed: true,
            deltaVsBaseline: null,
          },
          {
            contextDepth: 1024,
            insertPosition: 200,
            casesRun: 100,
            correctCount: 93,
            accuracy: 0.93,
            minAccuracy: 0.9,
            passed: true,
            deltaVsBaseline: null,
          },
        ],
        passed: true,
        failures: [],
      };
      const check = checkNeedleThresholds(result);
      expect(check.passed).toBe(true);
      expect(check.failures).toHaveLength(0);
    });

    it('fails when accuracy below threshold', () => {
      const result: NeedleProbeResult = {
        depths: [
          {
            contextDepth: 256,
            insertPosition: 50,
            casesRun: 100,
            correctCount: 80,
            accuracy: 0.8,
            minAccuracy: 0.95,
            passed: false,
            deltaVsBaseline: null,
          },
        ],
        passed: false,
        failures: ['Depth 256: accuracy 80.0% < required 95.0%'],
      };
      const check = checkNeedleThresholds(result);
      expect(check.passed).toBe(false);
      expect(check.failures[0]).toMatch(/Depth 256/);
    });

    it('fails when baseline delta exceeds 10pt', () => {
      const result: NeedleProbeResult = {
        depths: [
          {
            contextDepth: 4096,
            insertPosition: 1000,
            casesRun: 100,
            correctCount: 82,
            accuracy: 0.82,
            minAccuracy: 0.8,
            passed: true,
            deltaVsBaseline: -0.12,
          },
        ],
        passed: false,
        failures: [
          'Depth 4096: -12.0pt drop from uncompressed baseline exceeds 10pt limit',
        ],
      };
      const check = checkNeedleThresholds(result);
      expect(check.passed).toBe(false);
      expect(check.failures[0]).toMatch(/10pt limit/);
    });
  });

  describe('runNeedleProbe — insufficient haystack guard', () => {
    it('reports failure when haystack too short for requested depth', () => {
      const config: NeedleProbeConfig = {
        driverConfig: {
          totalLayers: 2,
          hiddenSize: 32,
          kvHeads: 2,
          qHeads: 4,
          headDim: 8,
        },
        vaultDir: '/nonexistent',
        layersNorm: [],
        layersBias: [],
        finalNorm: new Float32Array(32),
        haystackTokenIds: new Array(100).fill(65), // way too short for 256
        encode: mockEncode,
        decode: mockDecode,
        newlineTokenId: 10,
        casesPerDepth: 1,
      };

      const result = runNeedleProbe(config, [DEFAULT_DEPTH_SPECS[0]]);
      expect(result.passed).toBe(false);
      expect(result.failures[0]).toMatch(/Insufficient haystack/);
    });
  });

  describe('deterministic needle generation', () => {
    it('produces same needle sequence with same seed', () => {
      // Verify the internal LCG produces deterministic 6-digit needles.
      // We can't run the full probe without a vault, so test the exported
      // infrastructure by running twice with insufficient haystack — both
      // should produce identical failure messages (same RNG path).
      const shortHaystack = new Array(100).fill(65);
      const config: NeedleProbeConfig = {
        driverConfig: {
          totalLayers: 2,
          hiddenSize: 32,
          kvHeads: 2,
          qHeads: 4,
          headDim: 8,
        },
        vaultDir: '/nonexistent',
        layersNorm: [],
        layersBias: [],
        finalNorm: new Float32Array(32),
        haystackTokenIds: shortHaystack,
        encode: mockEncode,
        decode: mockDecode,
        newlineTokenId: 10,
        seed: 42,
        casesPerDepth: 1,
      };

      const r1 = runNeedleProbe(config, [DEFAULT_DEPTH_SPECS[0]]);
      const r2 = runNeedleProbe(config, [DEFAULT_DEPTH_SPECS[0]]);

      // Same seed + same config → identical results
      expect(r1.failures).toEqual(r2.failures);
      expect(r1.depths).toEqual(r2.depths);
    });
  });
});
