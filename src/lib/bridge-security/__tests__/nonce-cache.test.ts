/**
 * @fileOverview F2.2 — persisted nonce cache survives server restarts.
 *
 * The nonce cache must be written to disk on every update so that a
 * server restart does not erase replay-protection. An attacker who
 * captures a valid signed hello cannot replay it after a crash.
 */

// @jest-environment node

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { NonceCache } from '../nonce-cache';

describe('bridge security — nonce cache (F2.2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nonce-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('F2.2: fresh nonce is accepted', () => {
    const cache = new NonceCache({
      ttlMs: 60_000,
      persistPath: join(dir, 'nonces.json'),
    });
    expect(cache.check('device1:nonce-abc')).toBe(false);
    cache.add('device1:nonce-abc');
    expect(cache.check('device1:nonce-abc')).toBe(true);
  });

  it('F2.2: replayed nonce is rejected', () => {
    const cache = new NonceCache({
      ttlMs: 60_000,
      persistPath: join(dir, 'nonces.json'),
    });
    cache.add('device1:nonce-xyz');
    expect(cache.check('device1:nonce-xyz')).toBe(true);
  });

  it('F2.2: nonce cache persists to disk', () => {
    const path = join(dir, 'nonces.json');
    const cache1 = new NonceCache({ ttlMs: 60_000, persistPath: path });
    cache1.add('device1:nonce-persist');

    // Second instance loads from same file — sees the nonce
    const cache2 = new NonceCache({ ttlMs: 60_000, persistPath: path });
    expect(cache2.check('device1:nonce-persist')).toBe(true);
  });

  it('F2.2: server restart does not erase replay protection', () => {
    const path = join(dir, 'nonces.json');

    // First server session: accept nonce
    const session1 = new NonceCache({ ttlMs: 60_000, persistPath: path });
    session1.add('device1:nonce-captured');

    // Simulate restart: create new instance that loads from file
    const session2 = new NonceCache({ ttlMs: 60_000, persistPath: path });
    expect(session2.check('device1:nonce-captured')).toBe(true); // still seen
  });

  it('F2.2: expired nonce is pruned and can be reused', () => {
    const path = join(dir, 'nonces.json');
    const cache = new NonceCache({ ttlMs: 1, persistPath: path }); // 1ms TTL
    cache.add('device1:old-nonce');

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 10) {
      /* spin */
    }

    cache.prune();
    expect(cache.check('device1:old-nonce')).toBe(false);
  });

  it('F2.2: different device IDs are tracked independently', () => {
    const cache = new NonceCache({
      ttlMs: 60_000,
      persistPath: join(dir, 'nonces.json'),
    });
    cache.add('device1:same-nonce');
    // device2 with same nonce suffix is not blocked
    expect(cache.check('device2:same-nonce')).toBe(false);
  });

  it('F2.2: works without a persist path (in-memory only)', () => {
    const cache = new NonceCache({ ttlMs: 60_000 });
    cache.add('dev:n1');
    expect(cache.check('dev:n1')).toBe(true);
    expect(cache.check('dev:n2')).toBe(false);
  });
});
