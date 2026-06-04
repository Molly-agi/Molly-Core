/**
 * @fileOverview F2.2 — Persisted nonce cache tests.
 */

import {
  createNonceStore,
  serializeNonces,
  deserializeNonces,
} from '../nonce-store';

describe('bridge-security nonce-store (F2.2)', () => {
  it('F2.2: first use of a nonce returns true', () => {
    const store = createNonceStore(600_000);
    expect(store.consume('nonce-001')).toBe(true);
  });

  it('F2.2: second use of same nonce is rejected (replay)', () => {
    const store = createNonceStore(600_000);
    store.consume('nonce-replay');
    expect(store.consume('nonce-replay')).toBe(false);
  });

  it('F2.2: different nonces are accepted independently', () => {
    const store = createNonceStore(600_000);
    expect(store.consume('nonce-A')).toBe(true);
    expect(store.consume('nonce-B')).toBe(true);
    expect(store.has('nonce-A')).toBe(true);
    expect(store.has('nonce-B')).toBe(true);
  });

  it('F2.2: prune removes expired entries', () => {
    const store = createNonceStore(600_000);
    const oldTime = Date.now() - 700_000; // 700 s ago
    // Simulate an old entry by manually via fromJSON
    store.fromJSON([{ key: 'old-nonce', ts: oldTime }]);
    store.prune(600_000);
    expect(store.has('old-nonce')).toBe(false);
  });

  it('F2.2: prune keeps entries within TTL', () => {
    const store = createNonceStore(600_000);
    store.consume('fresh-nonce');
    store.prune(600_000);
    expect(store.has('fresh-nonce')).toBe(true);
  });

  it('F2.2: serialisation round-trip preserves nonces', () => {
    const store = createNonceStore(600_000);
    store.consume('nonce-X');
    store.consume('nonce-Y');

    const json = serializeNonces(store);

    const store2 = createNonceStore(600_000);
    deserializeNonces(store2, json);
    expect(store2.has('nonce-X')).toBe(true);
    expect(store2.has('nonce-Y')).toBe(true);
    expect(store2.consume('nonce-X')).toBe(false); // replay rejected in restored store
  });

  it('F2.2: deserializeNonces with corrupted JSON starts fresh without throwing', () => {
    const store = createNonceStore(600_000);
    store.consume('nonce-initial');
    expect(() => deserializeNonces(store, 'NOT_VALID_JSON')).not.toThrow();
    // The store is intact — the bad parse is silently ignored
    expect(store.has('nonce-initial')).toBe(true);
  });

  it('F2.2: fromJSON ignores entries with bad shapes', () => {
    const store = createNonceStore(600_000);
    // @ts-expect-error — intentionally bad data for test
    store.fromJSON([
      null,
      undefined,
      { key: 123, ts: 'bad' },
      { key: 'ok', ts: Date.now() },
    ]);
    expect(store.has('ok')).toBe(true);
  });
});
