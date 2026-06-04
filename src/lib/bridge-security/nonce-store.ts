/**
 * @fileOverview Persisted nonce cache for replay-attack prevention (W0.2, F2.2).
 *
 * The original implementation kept `usedNonces` in a plain in-memory Map.
 * A server restart cleared the map, allowing an attacker to replay any
 * previously captured signed `hello` message within the TTL window.
 *
 * This module provides:
 *   • A `NonceStore` interface with consume / prune / serialisation methods.
 *   • `createNonceStore(ttlMs)` — factory that returns an instance.
 *   • `serializeNonces` / `deserializeNonces` — JSON round-trip helpers
 *     so the daemon can persist the store to disk and load it on startup.
 *
 * The daemon must:
 *   1. Call `loadNonces()` during startup (after `loadDeviceSecrets()`).
 *   2. Call `saveNonces()` after each successful `consume()` and after each
 *      `pruneNonces()` run so the on-disk copy stays current.
 */

import type { NonceEntry } from './types';

export type { NonceEntry };

export interface NonceStore {
  /**
   * Attempt to consume a nonce.
   * @returns `true` on first use; `false` if the nonce was already consumed
   *          (replay detected).
   */
  consume(nonceKey: string, now?: number): boolean;

  /** Check whether a nonce key is currently in the store (without consuming). */
  has(nonceKey: string): boolean;

  /** Evict entries older than `ttlMs` milliseconds. */
  prune(ttlMs: number, now?: number): void;

  /** Serialise the current store contents to a plain array. */
  toJSON(): NonceEntry[];

  /** Restore store contents from a previously serialised array. */
  fromJSON(entries: NonceEntry[]): void;
}

/** Create a new in-memory NonceStore backed by a Map. */
export function createNonceStore(_ttlMs: number): NonceStore {
  const store = new Map<string, number>();

  return {
    consume(nonceKey: string, now = Date.now()): boolean {
      if (store.has(nonceKey)) return false; // replay
      store.set(nonceKey, now);
      return true;
    },

    has(nonceKey: string): boolean {
      return store.has(nonceKey);
    },

    prune(ttlMs: number, now = Date.now()): void {
      for (const [key, ts] of store.entries()) {
        if (now - ts > ttlMs) store.delete(key);
      }
    },

    toJSON(): NonceEntry[] {
      return Array.from(store.entries()).map(([key, ts]) => ({ key, ts }));
    },

    fromJSON(entries: NonceEntry[]): void {
      store.clear();
      for (const e of entries) {
        if (
          e &&
          typeof e.key === 'string' &&
          typeof e.ts === 'number' &&
          Number.isFinite(e.ts)
        ) {
          store.set(e.key, e.ts);
        }
      }
    },
  };
}

/**
 * Serialise a NonceStore to a JSON string suitable for `writeFileSync`.
 */
export function serializeNonces(store: NonceStore): string {
  return JSON.stringify(
    { nonces: store.toJSON(), savedAt: new Date().toISOString() },
    null,
    2
  );
}

/**
 * Restore a NonceStore from a previously serialised JSON string.
 * Silently ignores corrupt or missing data — starts fresh on error.
 */
export function deserializeNonces(store: NonceStore, data: string): void {
  try {
    const parsed = JSON.parse(data) as { nonces?: NonceEntry[] };
    const entries = Array.isArray(parsed.nonces) ? parsed.nonces : [];
    store.fromJSON(entries);
  } catch {
    // Corrupted file — start fresh. Non-fatal.
  }
}
