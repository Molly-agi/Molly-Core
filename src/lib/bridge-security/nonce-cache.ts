/**
 * @fileOverview F2.2 — Persisted nonce cache (W0.2)
 *
 * The original usedNonces Map is in-memory only. After a server restart
 * the cache is empty, enabling replay of any captured hello message
 * within NONCE_TTL_MS. This module persists consumed nonces to disk so
 * the anti-replay window survives restarts.
 *
 * Storage format: newline-delimited JSON, one NonceRecord per line
 * (append-only writes, rewritten on prune).
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import type { NonceRecord } from './schema';

export class PersistedNonceCache {
  private readonly filePath: string;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, number>(); // key → consumedAt

  constructor(filePath: string, ttlMs: number = 10 * 60 * 1000) {
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    this.load();
  }

  /** Returns true if `key` has already been consumed (replay detected). */
  has(key: string, now: number = Date.now()): boolean {
    const ts = this.cache.get(key);
    if (ts === undefined) return false;
    // Expired entries are treated as absent (allow re-use after TTL).
    return now - ts <= this.ttlMs;
  }

  /**
   * Record a nonce as consumed.
   * Idempotent — calling twice with the same key does not move the
   * consumedAt timestamp.
   */
  consume(key: string, now: number = Date.now()): void {
    if (this.cache.has(key)) return;
    this.cache.set(key, now);
    const record: NonceRecord = { key, consumedAt: now };
    appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8');
  }

  /**
   * Remove expired entries from memory and rewrite the backing file.
   * Call periodically to keep both bounded.
   */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.ttlMs;
    for (const [key, ts] of this.cache.entries()) {
      if (ts <= cutoff) {
        this.cache.delete(key);
      }
    }
    this.rewrite();
  }

  /** Number of live (non-expired) entries. */
  size(now: number = Date.now()): number {
    let count = 0;
    for (const ts of this.cache.values()) {
      if (now - ts <= this.ttlMs) count += 1;
    }
    return count;
  }

  // ── private ────────────────────────────────────────────────────────────────

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const lines = readFileSync(this.filePath, 'utf8').split('\n');
    const now = Date.now();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record: NonceRecord = JSON.parse(trimmed);
        if (
          typeof record.key === 'string' &&
          typeof record.consumedAt === 'number' &&
          now - record.consumedAt <= this.ttlMs
        ) {
          this.cache.set(record.key, record.consumedAt);
        }
      } catch {
        // Malformed line — skip silently.
      }
    }
  }

  private rewrite(): void {
    const now = Date.now();
    const lines: string[] = [];
    for (const [key, consumedAt] of this.cache.entries()) {
      if (now - consumedAt <= this.ttlMs) {
        const record: NonceRecord = { key, consumedAt };
        lines.push(JSON.stringify(record));
      }
    }
    writeFileSync(
      this.filePath,
      lines.join('\n') + (lines.length ? '\n' : ''),
      'utf8'
    );
  }
}
