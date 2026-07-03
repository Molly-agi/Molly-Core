import { describe, it, expect, afterEach } from '@jest/globals';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  logCrystalEvent,
  logPromote,
  logBlock,
  logLoad,
  logUnload,
  logEviction,
  logAnomaly,
  logCoherenceSample,
  type CrystalHealthEvent,
  type PromoteEvent,
  type BlockEvent,
  type LoadEvent,
  type UnloadEvent,
  type EvictionEvent,
  type AnomalyEvent,
  type CoherenceSampleEvent,
} from '../crystal-health-logger';

type Entry = CrystalHealthEvent & { ts: string; session?: string };

const TMP_LOG = join(tmpdir(), `crystal_health_test_${Date.now()}.jsonl`);

function readEntries(): Entry[] {
  if (!existsSync(TMP_LOG)) return [];
  return readFileSync(TMP_LOG, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Entry);
}

afterEach(() => {
  if (existsSync(TMP_LOG)) unlinkSync(TMP_LOG);
});

describe('crystal-health-logger', () => {
  const opts = { logPath: TMP_LOG };

  it('writes a promote event', () => {
    logPromote(
      {
        version: 2,
        parentVersion: 1,
        crystalCount: 17,
        addedCount: 2,
        removedCount: 0,
        coherenceMeanKl: 0.08,
        contradictionCount: 0,
      },
      opts
    );
    const entries = readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe('promote');
    const e = entries[0] as PromoteEvent & { ts: string };
    expect(e.version).toBe(2);
    expect(e.coherenceMeanKl).toBe(0.08);
    expect(entries[0].ts).toMatch(/^\d{4}-/);
  });

  it('writes a block event', () => {
    logBlock(
      {
        gate: 'coherence',
        candidateVersion: 3,
        crystalCount: 18,
        coherenceMeanKl: 0.19,
        coherenceThreshold: 0.15,
        hardConflictCount: 0,
        blockReasons: ['mean KL 0.19 exceeds threshold 0.15'],
      },
      opts
    );
    const entries = readEntries();
    expect(entries[0].event).toBe('block');
    const e = entries[0] as BlockEvent & { ts: string };
    expect(e.gate).toBe('coherence');
    expect(e.blockReasons).toHaveLength(1);
  });

  it('writes a load event', () => {
    logLoad(
      { crystalIds: ['crystal-abc', 'crystal-def'], tier: 'A', source: 'bake' },
      opts
    );
    const entries = readEntries();
    expect(entries[0].event).toBe('load');
    const e = entries[0] as LoadEvent & { ts: string };
    expect(e.tier).toBe('A');
    expect(e.crystalIds).toHaveLength(2);
  });

  it('writes an unload event', () => {
    logUnload({ crystalIds: ['crystal-abc'], reason: 'eviction' }, opts);
    const entries = readEntries();
    expect(entries[0].event).toBe('unload');
    const e = entries[0] as UnloadEvent & { ts: string };
    expect(e.reason).toBe('eviction');
  });

  it('writes an eviction event', () => {
    logEviction(
      {
        crystalId: 'crystal-xyz',
        evictionScore: 0.12,
        cacheType: 'hot',
        reason: 'lru',
      },
      opts
    );
    const entries = readEntries();
    expect(entries[0].event).toBe('eviction');
    const e = entries[0] as EvictionEvent & { ts: string };
    expect(e.evictionScore).toBe(0.12);
  });

  it('writes an anomaly event', () => {
    logAnomaly(
      {
        crystalIds: ['crystal-abc'],
        observedDelta: 0.22,
        threshold: 0.15,
        action: 'fallback-to-identity',
      },
      opts
    );
    const entries = readEntries();
    expect(entries[0].event).toBe('anomaly');
    const e = entries[0] as AnomalyEvent & { ts: string };
    expect(e.action).toBe('fallback-to-identity');
  });

  it('writes a coherence-sample event', () => {
    logCoherenceSample(
      {
        crystalIds: ['crystal-abc'],
        sampleDelta: 0.05,
        threshold: 0.15,
        status: 'ok',
      },
      opts
    );
    const entries = readEntries();
    expect(entries[0].event).toBe('coherence-sample');
    const e = entries[0] as CoherenceSampleEvent & { ts: string };
    expect(e.status).toBe('ok');
  });

  it('appends multiple events in order', () => {
    logPromote(
      {
        version: 1,
        parentVersion: null,
        crystalCount: 5,
        addedCount: 5,
        removedCount: 0,
        coherenceMeanKl: null,
        contradictionCount: 0,
      },
      opts
    );
    logBlock(
      {
        gate: 'contradiction',
        candidateVersion: 2,
        crystalCount: 6,
        hardConflictCount: 1,
        blockReasons: ['hard conflict'],
      },
      opts
    );
    logLoad({ crystalIds: ['c1'], tier: 'B', source: 'session-inject' }, opts);
    const entries = readEntries();
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.event)).toEqual(['promote', 'block', 'load']);
  });

  it('includes sessionId when provided', () => {
    logCrystalEvent(
      { event: 'load', crystalIds: ['c1'], tier: 'C', source: 'on-demand' },
      { logPath: TMP_LOG, sessionId: 'session-test-123' }
    );
    const entries = readEntries();
    expect(entries[0].session).toBe('session-test-123');
  });

  it('each entry has a valid ISO timestamp', () => {
    logLoad({ crystalIds: ['c1'], tier: 'A', source: 'bake' }, opts);
    const entries = readEntries();
    expect(() => new Date(entries[0].ts).toISOString()).not.toThrow();
  });
});
