/**
 * @fileOverview F2.2 — persisted nonce cache (W0.2)
 *
 * Stores used nonces in memory AND on disk so that a server restart
 * does not erase replay-protection. Each nonce entry carries a TTL;
 * expired entries are pruned on load and on explicit prune() calls.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface NonceCacheOptions {
  /** How long (ms) a used nonce blocks replay. Default: 10 min. */
  ttlMs: number;
  /** Path to persist nonce data. If omitted, in-memory only. */
  persistPath?: string;
}

interface NonceEntry {
  usedAt: number;
}

export class NonceCache {
  private readonly ttlMs: number;
  private readonly persistPath: string | undefined;
  private entries: Map<string, NonceEntry>;

  constructor(opts: NonceCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.persistPath = opts.persistPath;
    this.entries = new Map();
    if (this.persistPath) {
      this.load();
    }
  }

  /** Returns true if the nonce has already been seen (replay detected). */
  check(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() - entry.usedAt > this.ttlMs) {
      this.entries.delete(key);
      this.persist();
      return false;
    }
    return true;
  }

  /** Records a nonce as used. Call after verifying the signature. */
  add(key: string): void {
    this.entries.set(key, { usedAt: Date.now() });
    this.persist();
  }

  /** Removes all entries whose TTL has elapsed. */
  prune(): void {
    const now = Date.now();
    for (const [k, v] of this.entries) {
      if (now - v.usedAt > this.ttlMs) {
        this.entries.delete(k);
      }
    }
    this.persist();
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.persistPath, 'utf8'));
      const now = Date.now();
      this.entries = new Map();
      for (const [k, v] of Object.entries(raw as Record<string, NonceEntry>)) {
        if (now - v.usedAt <= this.ttlMs) {
          this.entries.set(k, v);
        }
      }
    } catch {
      // Corrupt file — start fresh; do not crash the server
      this.entries = new Map();
    }
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      const obj: Record<string, NonceEntry> = {};
      for (const [k, v] of this.entries) {
        obj[k] = v;
      }
      writeFileSync(this.persistPath, JSON.stringify(obj), 'utf8');
    } catch {
      // Non-fatal — in-memory protection still active
    }
  }
}
