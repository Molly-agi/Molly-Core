/**
 * @fileOverview F2.2 — PersistedNonceCache tests
 *
 * Key invariant: a nonce consumed before a "restart" (new instance
 * from the same file) must still be rejected.
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PersistedNonceCache } from '../nonce-cache';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'nonce-test-'));
}

describe('PersistedNonceCache (F2.2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = tempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('F2.2: a fresh cache does not contain any nonce', () => {
    const cache = new PersistedNonceCache(join(dir, 'nonces.ndjson'), 60_000);
    expect(cache.has('device-1:nonce-abc')).toBe(false);
  });

  it('F2.2: consuming a nonce marks it as present', () => {
    const cache = new PersistedNonceCache(join(dir, 'nonces.ndjson'), 60_000);
    cache.consume('device-1:nonce-xyz');
    expect(cache.has('device-1:nonce-xyz')).toBe(true);
  });

  it('F2.2: replayed nonce is rejected after restart (new instance, same file)', () => {
    const filePath = join(dir, 'nonces.ndjson');
    const now = Date.now();
    const cache1 = new PersistedNonceCache(filePath, 60_000);
    cache1.consume('device-2:nonce-123', now);

    // Simulate restart by creating a new instance pointing at the same file.
    const cache2 = new PersistedNonceCache(filePath, 60_000);
    expect(cache2.has('device-2:nonce-123', now + 1000)).toBe(true);
  });

  it('F2.2: expired nonce is not flagged as used', () => {
    const ttlMs = 1_000;
    const filePath = join(dir, 'nonces.ndjson');
    const cache = new PersistedNonceCache(filePath, ttlMs);
    const past = Date.now() - ttlMs - 1;
    cache.consume('device-3:nonce-old', past);
    // After TTL the nonce is gone
    expect(cache.has('device-3:nonce-old', Date.now())).toBe(false);
  });

  it('F2.2: prune removes expired entries from file', () => {
    const ttlMs = 1_000;
    const filePath = join(dir, 'nonces.ndjson');
    const cache = new PersistedNonceCache(filePath, ttlMs);
    const past = Date.now() - ttlMs - 1;
    cache.consume('device-4:nonce-expired', past);
    cache.consume('device-4:nonce-fresh', Date.now());
    cache.prune();

    // A fresh instance should not see the expired nonce.
    const cache2 = new PersistedNonceCache(filePath, ttlMs);
    expect(cache2.has('device-4:nonce-expired')).toBe(false);
    expect(cache2.size()).toBeGreaterThan(0);
  });

  it('F2.2: size counts only live entries', () => {
    const ttlMs = 5_000;
    const cache = new PersistedNonceCache(join(dir, 'nonces.ndjson'), ttlMs);
    const now = Date.now();
    cache.consume('d:n1', now);
    cache.consume('d:n2', now);
    cache.consume('d:n3', now - ttlMs - 1); // expired
    expect(cache.size(now)).toBe(2);
  });

  it('F2.2: consume is idempotent', () => {
    const cache = new PersistedNonceCache(join(dir, 'nonces.ndjson'), 60_000);
    const now = Date.now();
    cache.consume('d:dup', now);
    cache.consume('d:dup', now + 100); // second call — must not move timestamp
    expect(cache.has('d:dup', now + 100)).toBe(true);
  });
});
