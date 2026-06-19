/**
 * @jest-environment node
 */

import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../profile-store';
import type { AttackerProfile, ProfileMutation } from '../profile';

function baseProfile(key: string): AttackerProfile {
  return {
    key,
    firstSeen: '2026-06-19T00:00:00.000Z',
    lastSeen: '2026-06-19T00:00:00.000Z',
    confidence: 0.5,
    signalCount: 1,
    severityCounts: { info: 1, warn: 0, critical: 0 },
    sources: { 'admin-audit': 1 },
    routes: {},
    fields: { ip: '1.2.3.4' },
    recent: [
      {
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'admin-audit',
        severity: 'info',
        summary: 'first',
      },
    ],
  };
}

describe('ProfileStore', () => {
  let dir: string;
  let store: ProfileStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunt-store-'));
    store = new ProfileStore({ dir });
    store.load();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty', () => {
    expect(store.size()).toBe(0);
    expect(store.list()).toEqual([]);
  });

  it('apply create writes to log and adds to map', () => {
    const profile = baseProfile('ip:1.2.3.4');
    store.apply({ kind: 'create', profile });
    expect(store.size()).toBe(1);
    expect(store.get('ip:1.2.3.4')).toEqual(profile);
    const log = readFileSync(store.paths().log, 'utf8');
    expect(log.trim().split('\n').length).toBe(1);
    expect(store.pendingMutations()).toBe(1);
  });

  it('apply create is idempotent (does not overwrite existing)', () => {
    const a = baseProfile('ip:1.2.3.4');
    const b = { ...baseProfile('ip:1.2.3.4'), signalCount: 99 };
    store.apply({ kind: 'create', profile: a });
    store.apply({ kind: 'create', profile: b });
    expect(store.get('ip:1.2.3.4')!.signalCount).toBe(1);
  });

  it('apply update merges patch and prepends event', () => {
    store.apply({ kind: 'create', profile: baseProfile('ip:1.2.3.4') });
    const event = {
      timestamp: '2026-06-19T00:01:00.000Z',
      source: 'family-anchor',
      severity: 'warn' as const,
      summary: 'second',
    };
    store.apply({
      kind: 'update',
      key: 'ip:1.2.3.4',
      patch: {
        lastSeen: event.timestamp,
        signalCount: 2,
        severityCounts: { info: 1, warn: 1, critical: 0 },
        sources: { 'admin-audit': 1, 'family-anchor': 1 },
      },
      event,
    });
    const p = store.get('ip:1.2.3.4')!;
    expect(p.signalCount).toBe(2);
    expect(p.severityCounts.warn).toBe(1);
    expect(p.sources['family-anchor']).toBe(1);
    expect(p.recent[0]).toEqual(event);
    expect(p.recent[1].summary).toBe('first');
  });

  it('update on missing key is a no-op (does not crash)', () => {
    store.apply({
      kind: 'update',
      key: 'nope',
      patch: { lastSeen: 'x' },
      event: {
        timestamp: 'x',
        source: 's',
        severity: 'info',
        summary: 'm',
      },
    });
    expect(store.size()).toBe(0);
  });

  it('snapshot writes file atomically, truncates log, resets counter', () => {
    store.apply({ kind: 'create', profile: baseProfile('ip:1.2.3.4') });
    store.snapshot();
    expect(existsSync(store.paths().snapshot)).toBe(true);
    expect(readFileSync(store.paths().log, 'utf8')).toBe('');
    expect(store.pendingMutations()).toBe(0);
  });

  it('load reads snapshot then replays log', () => {
    store.apply({ kind: 'create', profile: baseProfile('ip:1.2.3.4') });
    store.snapshot();
    store.apply({
      kind: 'update',
      key: 'ip:1.2.3.4',
      patch: { lastSeen: '2026-06-19T01:00:00.000Z', signalCount: 99 },
      event: {
        timestamp: '2026-06-19T01:00:00.000Z',
        source: 'x',
        severity: 'info',
        summary: 'y',
      },
    });

    const reload = new ProfileStore({ dir });
    reload.load();
    expect(reload.size()).toBe(1);
    expect(reload.get('ip:1.2.3.4')!.signalCount).toBe(99);
  });

  it('replay skips malformed log lines', () => {
    store.apply({ kind: 'create', profile: baseProfile('ip:1.2.3.4') });
    const { log } = store.paths();
    const corrupted = readFileSync(log, 'utf8') + 'not-json\n';
    writeFileSync(log, corrupted);
    const reload = new ProfileStore({ dir });
    expect(() => reload.load()).not.toThrow();
    expect(reload.size()).toBe(1);
  });

  it('load is safe when snapshot file does not exist', () => {
    const fresh = new ProfileStore({ dir: join(dir, 'sub') });
    expect(() => fresh.load()).not.toThrow();
    expect(fresh.size()).toBe(0);
  });

  it('load handles empty snapshot file', () => {
    writeFileSync(store.paths().snapshot, '');
    const reload = new ProfileStore({ dir });
    expect(() => reload.load()).not.toThrow();
    expect(reload.size()).toBe(0);
  });

  it('load handles malformed snapshot JSON', () => {
    writeFileSync(store.paths().snapshot, '{not-json');
    const reload = new ProfileStore({ dir });
    expect(() => reload.load()).not.toThrow();
    expect(reload.size()).toBe(0);
  });

  it('ProfileMutation type passes through union narrowing', () => {
    const m: ProfileMutation = { kind: 'create', profile: baseProfile('k') };
    expect(m.kind).toBe('create');
  });

  describe('seq stamping (Lazarus slice)', () => {
    it('apply stamps monotonic seq starting at 1', () => {
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      store.apply({ kind: 'create', profile: baseProfile('ip:2.2.2.2') });
      const lines = readFileSync(store.paths().log, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as ProfileMutation);
      expect(lines[0].seq).toBe(1);
      expect(lines[1].seq).toBe(2);
    });

    it('persists stamped seq in log payload', () => {
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      const line = readFileSync(store.paths().log, 'utf8').trim();
      const parsed = JSON.parse(line) as ProfileMutation;
      expect(parsed.seq).toBe(1);
    });

    it('exposes nextSeq() and lastAppliedSeq() accessors', () => {
      expect(store.nextSeq()).toBe(0);
      expect(store.lastAppliedSeq()).toBe(0);
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      expect(store.nextSeq()).toBe(1);
      expect(store.lastAppliedSeq()).toBe(1);
      store.apply({ kind: 'create', profile: baseProfile('ip:2.2.2.2') });
      expect(store.nextSeq()).toBe(2);
      expect(store.lastAppliedSeq()).toBe(2);
    });

    it('setCounters restores seq state (snapshot resume path)', () => {
      store.setCounters(42, 41);
      expect(store.nextSeq()).toBe(42);
      expect(store.lastAppliedSeq()).toBe(41);
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      expect(store.nextSeq()).toBe(43);
      expect(store.lastAppliedSeq()).toBe(43);
    });

    it('replay from log advances both counters to log high-water', () => {
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      store.apply({ kind: 'create', profile: baseProfile('ip:2.2.2.2') });
      const reload = new ProfileStore({ dir });
      reload.load();
      expect(reload.lastAppliedSeq()).toBe(2);
      expect(reload.nextSeq()).toBe(2);
    });

    it('load() resets counters before replay (no leak between loads)', () => {
      store.setCounters(99, 99);
      store.load();
      expect(store.nextSeq()).toBe(0);
      expect(store.lastAppliedSeq()).toBe(0);
    });
  });

  describe('schema v1->v2 migration + crash recovery (Lazarus-on-Molly-slice)', () => {
    it('v1 snapshot (no schema field) loads profiles, counters stay 0, next snapshot writes v2', () => {
      // hand-write a v1-shaped snapshot: no schema, no seq counters
      const v1 = {
        writtenAt: '2026-06-19T00:00:00.000Z',
        profiles: [baseProfile('ip:1.1.1.1')],
      };
      writeFileSync(store.paths().snapshot, JSON.stringify(v1));

      const reload = new ProfileStore({ dir });
      reload.load();
      expect(reload.size()).toBe(1);
      expect(reload.get('ip:1.1.1.1')).toBeDefined();
      expect(reload.nextSeq()).toBe(0);
      expect(reload.lastAppliedSeq()).toBe(0);

      // first apply on the upgraded store stamps seq=1
      reload.apply({
        kind: 'update',
        key: 'ip:1.1.1.1',
        patch: { lastSeen: '2026-06-19T00:01:00.000Z' },
        event: {
          timestamp: '2026-06-19T00:01:00.000Z',
          source: 's',
          severity: 'info',
          summary: 'post-upgrade',
        },
      });
      expect(reload.nextSeq()).toBe(1);

      reload.snapshot();
      const raw = readFileSync(store.paths().snapshot, 'utf8');
      const parsed = JSON.parse(raw) as { schema: number; nextSeq: number };
      expect(parsed.schema).toBe(2);
      expect(parsed.nextSeq).toBe(1);
    });

    it('crash recovery: snapshot then post-snapshot writes survive without duplicates in recent[]', () => {
      // apply 3, snapshot (truncates log), then apply 2 more
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      for (let i = 0; i < 2; i++) {
        store.apply({
          kind: 'update',
          key: 'ip:1.1.1.1',
          patch: { lastSeen: `2026-06-19T00:0${i}:00.000Z` },
          event: {
            timestamp: `2026-06-19T00:0${i}:00.000Z`,
            source: 'pre-snap',
            severity: 'info',
            summary: `pre-${i}`,
          },
        });
      }
      store.snapshot();
      for (let i = 0; i < 2; i++) {
        store.apply({
          kind: 'update',
          key: 'ip:1.1.1.1',
          patch: { lastSeen: `2026-06-19T01:0${i}:00.000Z` },
          event: {
            timestamp: `2026-06-19T01:0${i}:00.000Z`,
            source: 'post-snap',
            severity: 'info',
            summary: `post-${i}`,
          },
        });
      }
      // crash sim: don't snapshot again. Reload from disk.
      const reload = new ProfileStore({ dir });
      reload.load();

      // both post-snap events present
      const p = reload.get('ip:1.1.1.1')!;
      const summaries = p.recent.map((r) => r.summary);
      expect(summaries).toContain('post-0');
      expect(summaries).toContain('post-1');
      // no duplicates of any single event
      expect(new Set(summaries).size).toBe(summaries.length);
      // counters advanced to log high-water (seq 4 and 5 were post-snap)
      expect(reload.lastAppliedSeq()).toBe(5);
      expect(reload.nextSeq()).toBe(5);
    });

    it('stale seq <= lastAppliedSeq is skipped (belt-and-suspenders crash scenario)', () => {
      store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
      store.apply({
        kind: 'update',
        key: 'ip:1.1.1.1',
        patch: { lastSeen: '2026-06-19T00:01:00.000Z' },
        event: {
          timestamp: '2026-06-19T00:01:00.000Z',
          source: 's',
          severity: 'info',
          summary: 'real',
        },
      });
      store.snapshot();
      const beforeLen = store.get('ip:1.1.1.1')!.recent.length;

      // simulate a partial truncate crash: an old already-applied entry survived in the log
      const stale: ProfileMutation = {
        kind: 'update',
        seq: 1,
        key: 'ip:1.1.1.1',
        patch: { lastSeen: '2026-06-19T00:00:30.000Z' },
        event: {
          timestamp: '2026-06-19T00:00:30.000Z',
          source: 'stale',
          severity: 'info',
          summary: 'STALE-SHOULD-NOT-APPEAR',
        },
      };
      writeFileSync(store.paths().log, JSON.stringify(stale) + '\n');

      const reload = new ProfileStore({ dir });
      reload.load();
      const p = reload.get('ip:1.1.1.1')!;
      expect(p.recent.map((r) => r.summary)).not.toContain(
        'STALE-SHOULD-NOT-APPEAR'
      );
      expect(p.recent.length).toBe(beforeLen);
      expect(reload.lastAppliedSeq()).toBe(2);
    });
  });
});
