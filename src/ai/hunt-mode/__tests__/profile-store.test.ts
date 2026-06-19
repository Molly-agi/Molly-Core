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
});
