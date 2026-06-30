/**
 * Tests for the crystal version manifest builder (Gap 3 phase 1).
 *
 * Pure-logic tests — no fs, no exec. Synthesizes DetectionResult shapes
 * and validates manifest construction + gate logic.
 */

import {
  buildManifest,
  canPromote,
  diffManifests,
  validateManifest,
  type VersionManifest,
  type ManifestDeltaRef,
} from '@/ai/memory/crystal-version-manifest';
import type {
  DetectionResult,
  CrystalConflict,
} from '@/ai/memory/contradiction-detector';

const FIXED_NOW = (): Date => new Date('2026-06-30T10:00:00.000Z');

function emptyDetection(clean: string[] = []): DetectionResult {
  return {
    conflicts: [],
    clean,
    summary: {
      total: 0,
      evolving: 0,
      contradictory: 0,
      complementary: 0,
      unrelated: 0,
    },
  };
}

function conflict(
  a: string,
  b: string,
  type: CrystalConflict['type'],
  queryGated = false
): CrystalConflict {
  return {
    crystalA: a,
    crystalB: b,
    type,
    similarity: 0.7,
    temporalDistanceDays: 10,
    resolution: { load: [b], suppress: [a], queryGated, reason: 'test' },
  };
}

function passingCoherence() {
  return { passed: true, meanKl: 0.08, threshold: 0.15 };
}

describe('buildManifest', () => {
  it('produces v1 with parentVersion=null when no parent', () => {
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1', 'c2'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(['c1', 'c2']),
      now: FIXED_NOW,
    });
    expect(m.version).toBe(1);
    expect(m.parentVersion).toBeNull();
    expect(m.crystals).toEqual(['c1', 'c2']);
    expect(m.addedSinceParent).toEqual(['c1', 'c2']);
    expect(m.removedSinceParent).toEqual([]);
    expect(m.createdAt).toBe('2026-06-30T10:00:00.000Z');
    expect(m.gatedBy).toBeNull();
    expect(canPromote(m)).toBe(true);
  });

  it('bumps version and computes added/removed against parent', () => {
    const parent: VersionManifest = {
      version: 7,
      parentVersion: 6,
      createdAt: '2026-06-29T00:00:00.000Z',
      crystals: ['a', 'b', 'c'],
      addedSinceParent: [],
      removedSinceParent: [],
      deltas: [],
      gates: {
        coherence: passingCoherence(),
        contradiction: { passed: true, conflictCount: 0, hardConflictCount: 0 },
      },
      gatedBy: null,
      blockReasons: [],
    };
    const m = buildManifest({
      parent,
      currentCrystals: ['a', 'c', 'd'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(['a', 'c', 'd']),
      now: FIXED_NOW,
    });
    expect(m.version).toBe(8);
    expect(m.parentVersion).toBe(7);
    expect(m.addedSinceParent).toEqual(['d']);
    expect(m.removedSinceParent).toEqual(['b']);
  });

  it('blocks on coherence failure with reason in blockReasons', () => {
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1'],
      deltas: [],
      coherence: { passed: false, meanKl: 0.22, threshold: 0.15 },
      contradiction: emptyDetection(['c1']),
      now: FIXED_NOW,
    });
    expect(m.gatedBy).toBe('coherence');
    expect(m.blockReasons.length).toBe(1);
    expect(m.blockReasons[0]).toContain('coherence');
    expect(m.blockReasons[0]).toContain('0.22');
    expect(canPromote(m)).toBe(false);
  });

  it('blocks on hard contradiction (contradictory + !queryGated)', () => {
    const detection: DetectionResult = {
      conflicts: [conflict('c1', 'c2', 'contradictory', false)],
      clean: [],
      summary: {
        total: 2,
        evolving: 0,
        contradictory: 1,
        complementary: 0,
        unrelated: 0,
      },
    };
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1', 'c2'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: detection,
      now: FIXED_NOW,
    });
    expect(m.gatedBy).toBe('contradiction');
    expect(m.gates.contradiction.hardConflictCount).toBe(1);
    expect(m.gates.contradiction.conflictCount).toBe(1);
    expect(canPromote(m)).toBe(false);
  });

  it('allows promotion when contradiction is query-gated only', () => {
    const detection: DetectionResult = {
      conflicts: [conflict('c1', 'c2', 'contradictory', true)],
      clean: [],
      summary: {
        total: 2,
        evolving: 0,
        contradictory: 1,
        complementary: 0,
        unrelated: 0,
      },
    };
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1', 'c2'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: detection,
      now: FIXED_NOW,
    });
    expect(m.gates.contradiction.passed).toBe(true);
    expect(m.gates.contradiction.hardConflictCount).toBe(0);
    expect(m.gates.contradiction.conflictCount).toBe(1);
    expect(canPromote(m)).toBe(true);
  });

  it('allows promotion when only evolving/complementary conflicts exist', () => {
    const detection: DetectionResult = {
      conflicts: [
        conflict('c1', 'c2', 'evolving'),
        conflict('c3', 'c4', 'complementary'),
      ],
      clean: [],
      summary: {
        total: 4,
        evolving: 1,
        contradictory: 0,
        complementary: 1,
        unrelated: 0,
      },
    };
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1', 'c2', 'c3', 'c4'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: detection,
      now: FIXED_NOW,
    });
    expect(m.gates.contradiction.hardConflictCount).toBe(0);
    expect(canPromote(m)).toBe(true);
  });

  it('records both block reasons when both gates fail', () => {
    const detection: DetectionResult = {
      conflicts: [conflict('c1', 'c2', 'contradictory')],
      clean: [],
      summary: {
        total: 2,
        evolving: 0,
        contradictory: 1,
        complementary: 0,
        unrelated: 0,
      },
    };
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1', 'c2'],
      deltas: [],
      coherence: { passed: false, meanKl: 0.5, threshold: 0.15 },
      contradiction: detection,
      now: FIXED_NOW,
    });
    expect(m.gatedBy).toBe('coherence'); // coherence is checked first
    expect(m.blockReasons.length).toBe(2);
  });

  it('preserves delta references verbatim', () => {
    const deltas: ManifestDeltaRef[] = [
      {
        id: 'abc123',
        descriptorPath: '/d/abc123.json',
        blobPath: '/d/abc123.bin',
        bytes: 4096,
      },
    ];
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1'],
      deltas,
      coherence: passingCoherence(),
      contradiction: emptyDetection(['c1']),
      now: FIXED_NOW,
    });
    expect(m.deltas).toEqual(deltas);
    expect(m.deltas).not.toBe(deltas); // defensive copy
  });

  it('honors versionOverride for backfill / replay scenarios', () => {
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(['c1']),
      versionOverride: 42,
      now: FIXED_NOW,
    });
    expect(m.version).toBe(42);
  });
});

describe('diffManifests', () => {
  it('returns added/removed/held against parent', () => {
    const parent: VersionManifest = {
      version: 1,
      parentVersion: null,
      createdAt: 'x',
      crystals: ['a', 'b', 'c'],
      addedSinceParent: [],
      removedSinceParent: [],
      deltas: [],
      gates: {
        coherence: passingCoherence(),
        contradiction: { passed: true, conflictCount: 0, hardConflictCount: 0 },
      },
      gatedBy: null,
      blockReasons: [],
    };
    const child = buildManifest({
      parent,
      currentCrystals: ['a', 'c', 'd', 'e'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(),
      now: FIXED_NOW,
    });
    const d = diffManifests(parent, child);
    expect(d.added.sort()).toEqual(['d', 'e']);
    expect(d.removed).toEqual(['b']);
    expect(d.held.sort()).toEqual(['a', 'c']);
  });

  it('handles null parent as everything-added', () => {
    const child = buildManifest({
      parent: null,
      currentCrystals: ['x', 'y'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(),
      now: FIXED_NOW,
    });
    const d = diffManifests(null, child);
    expect(d.added).toEqual(['x', 'y']);
    expect(d.removed).toEqual([]);
    expect(d.held).toEqual([]);
  });
});

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    const m = buildManifest({
      parent: null,
      currentCrystals: ['c1'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(['c1']),
      now: FIXED_NOW,
    });
    expect(() => validateManifest(JSON.parse(JSON.stringify(m)))).not.toThrow();
  });

  it('rejects missing/wrong-typed fields', () => {
    expect(() => validateManifest(null)).toThrow();
    expect(() => validateManifest('string')).toThrow();
    expect(() => validateManifest({})).toThrow(/version/);
    expect(() =>
      validateManifest({
        version: 1,
        parentVersion: 'bad',
        createdAt: 'x',
        crystals: [],
        deltas: [],
        gates: {},
      })
    ).toThrow(/parentVersion/);
    expect(() =>
      validateManifest({
        version: 1,
        parentVersion: null,
        createdAt: 'x',
        crystals: 'no',
        deltas: [],
        gates: {},
      })
    ).toThrow(/crystals/);
  });
});

describe('canPromote', () => {
  it('matches gatedBy === null', () => {
    const ok = buildManifest({
      parent: null,
      currentCrystals: ['c'],
      deltas: [],
      coherence: passingCoherence(),
      contradiction: emptyDetection(['c']),
      now: FIXED_NOW,
    });
    expect(canPromote(ok)).toBe(true);

    const blocked = buildManifest({
      parent: null,
      currentCrystals: ['c'],
      deltas: [],
      coherence: { passed: false, threshold: 0.15 },
      contradiction: emptyDetection(['c']),
      now: FIXED_NOW,
    });
    expect(canPromote(blocked)).toBe(false);
  });
});
