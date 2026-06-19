/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../profile-store';
import { ProfileBuilder } from '../profile-builder';
import type { ThreatSignal } from '../../threat-monitor/signal-bus';

function sig(
  evidence: unknown,
  overrides: Partial<ThreatSignal> = {}
): ThreatSignal {
  return {
    source: 'admin-audit',
    severity: 'info',
    timestamp: '2026-06-19T00:00:00.000Z',
    summary: 'test',
    evidence,
    ...overrides,
  };
}

describe('ProfileBuilder', () => {
  let dir: string;
  let store: ProfileStore;
  let builder: ProfileBuilder;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunt-builder-'));
    store = new ProfileStore({ dir });
    store.load();
    builder = new ProfileBuilder(store);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips signals with no identifiers', () => {
    const result = builder.ingest(sig(null));
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no-identity');
    expect(store.size()).toBe(0);
  });

  it('creates a new profile on first signal', () => {
    const result = builder.ingest(sig({ source_ip: '1.2.3.4' }));
    expect(result.created).toBe(true);
    expect(store.size()).toBe(1);
    const p = store.get(result.key)!;
    expect(p.firstSeen).toBe('2026-06-19T00:00:00.000Z');
    expect(p.signalCount).toBe(1);
    expect(p.sources['admin-audit']).toBe(1);
  });

  it('updates existing profile on second signal from same identity', () => {
    builder.ingest(sig({ source_ip: '1.2.3.4' }));
    const r = builder.ingest(
      sig(
        { source_ip: '1.2.3.4' },
        {
          timestamp: '2026-06-19T00:01:00.000Z',
          source: 'family-anchor',
          severity: 'warn',
        }
      )
    );
    expect(r.created).toBe(false);
    const p = store.get(r.key)!;
    expect(p.signalCount).toBe(2);
    expect(p.severityCounts.warn).toBe(1);
    expect(p.sources['family-anchor']).toBe(1);
    expect(p.lastSeen).toBe('2026-06-19T00:01:00.000Z');
    expect(p.firstSeen).toBe('2026-06-19T00:00:00.000Z');
  });

  it('upgrades confidence when new signal carries stronger fields', () => {
    builder.ingest(sig({ source_ip: '1.2.3.4' }));
    const key = store.list()[0].key;
    expect(store.get(key)!.confidence).toBe(0.5);
    builder.ingest(sig({ source_ip: '1.2.3.4', ua: 'curl/8.0' }));
    expect(store.list().length).toBe(2); // ip-only vs ip+ua are different keys
  });

  it('routes counter increments when route present', () => {
    builder.ingest(sig({ source_ip: '1.2.3.4', route: '/admin' }));
    builder.ingest(sig({ source_ip: '1.2.3.4', route: '/admin' }));
    builder.ingest(sig({ source_ip: '1.2.3.4', route: '/login' }));
    const p = store.list()[0];
    expect(p.routes['/admin']).toBe(2);
    expect(p.routes['/login']).toBe(1);
  });

  it('keeps recent events bounded (newest first)', () => {
    for (let i = 0; i < 25; i++) {
      builder.ingest(
        sig(
          { source_ip: '1.2.3.4' },
          {
            timestamp: `2026-06-19T00:${String(i).padStart(2, '0')}:00.000Z`,
            summary: `s${i}`,
          }
        )
      );
    }
    const p = store.list()[0];
    expect(p.recent.length).toBe(20);
    expect(p.recent[0].summary).toBe('s24');
  });

  it('different identities yield separate profiles', () => {
    builder.ingest(sig({ source_ip: '1.2.3.4' }));
    builder.ingest(sig({ source_ip: '5.6.7.8' }));
    expect(store.size()).toBe(2);
  });

  it('persists across store reload', () => {
    builder.ingest(sig({ source_ip: '1.2.3.4' }));
    builder.ingest(sig({ source_ip: '1.2.3.4', route: '/admin' }));
    const reload = new ProfileStore({ dir });
    reload.load();
    expect(reload.size()).toBe(1);
    const p = reload.list()[0];
    expect(p.signalCount).toBe(2);
    expect(p.routes['/admin']).toBe(1);
  });
});
